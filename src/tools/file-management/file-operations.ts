import { exec } from "child_process";
import { promisify } from "util";
import { text, select, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import path from "path";
import { existsSync } from "fs";
import { Logger } from "@/utils/logger";
import type { FileSystemItem, AdbDevice, OperationResult } from "./types";

const execAsync = promisify(exec);

export async function listDirectoryContents(
  deviceId: string,
  directoryPath: string
): Promise<FileSystemItem[]> {
  try {
    Logger.muted(`Checking: ${directoryPath}`);

    const escapedPath = directoryPath.replace(/'/g, "'\"'\"'");

    const commands = [
      `ls -la "${directoryPath}"`,
      `ls "${directoryPath}"`,
      `ls -1 "${directoryPath}"`,
      `ls -la '${escapedPath}'`,
      `ls '${escapedPath}'`,
      `ls -1 '${escapedPath}'`,
    ];

    for (const command of commands) {
      try {
        const { stdout, stderr } = await execAsync(
          `adb -s ${deviceId} shell "${command}"`
        );

        if (
          stdout.trim() &&
          !stderr.includes("Permission denied") &&
          !stderr.includes("No such file")
        ) {
          return parseDirectoryOutput(stdout, directoryPath, deviceId);
        }
      } catch (error) {
        continue;
      }
    }

    Logger.warning(`Directory not found: ${directoryPath}`);
    return [];
  } catch (error) {
    Logger.error(`Failed to access directory: ${error}`);
    return [];
  }
}

export async function parseDirectoryOutput(
  output: string,
  directoryPath: string,
  deviceId: string
): Promise<FileSystemItem[]> {
  const normalizedOutput = output.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedOutput.split("\n").filter((line) => line.trim());
  const items: FileSystemItem[] = [];

  const isDetailedListing = lines.some(
    (line) => line.startsWith("total ") || line.match(/^[drwx-]{10}/)
  );

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (
      !trimmedLine ||
      trimmedLine === "." ||
      trimmedLine === ".." ||
      trimmedLine.startsWith("total ")
    ) {
      continue;
    }

    let name: string;
    let isDirectory: boolean;

    if (isDetailedListing) {
      const parts = trimmedLine.split(/\s+/);

      if (parts.length < 8) {
        continue;
      }

      const permissions = parts[0];
      if (!permissions) {
        continue;
      }

      name = parts.slice(7).join(" ");
      isDirectory = permissions.startsWith("d");
    } else {
      name = trimmedLine;
      const itemPath = path.posix.join(directoryPath, name);

      try {
        const escapedPath = itemPath.replace(/'/g, "'\"'\"'");
        const { stdout: testOutput } = await execAsync(
          `adb -s ${deviceId} shell "test -d '${escapedPath}' && echo 'DIR' || echo 'FILE'"`
        );
        isDirectory = testOutput.trim() === "DIR";
      } catch {
        try {
          const { stdout: testOutput } = await execAsync(
            `adb -s ${deviceId} shell "test -d \"${itemPath}\" && echo 'DIR' || echo 'FILE'"`
          );
          isDirectory = testOutput.trim() === "DIR";
        } catch {
          isDirectory = false;
        }
      }
    }

    if (name && name !== "." && name !== "..") {
      items.push({
        name,
        path: path.posix.join(directoryPath, name),
        isDirectory,
      });
    }
  }

  return items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function verifyDirectoryExists(
  deviceId: string,
  dirPath: string
): Promise<boolean> {
  const escapedPath = dirPath.replace(/'/g, "'\"'\"'");

  const methods = [
    `test -d "${dirPath}" && echo 'EXISTS'`,
    `ls -d "${dirPath}" 2>/dev/null && echo 'EXISTS'`,
    `cd "${dirPath}" 2>/dev/null && echo 'EXISTS'`,
    `test -d '${escapedPath}' && echo 'EXISTS'`,
    `ls -d '${escapedPath}' 2>/dev/null && echo 'EXISTS'`,
    `cd '${escapedPath}' 2>/dev/null && echo 'EXISTS'`,
  ];

  for (const method of methods) {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "${method}"`
      );
      if (stdout.trim() === "EXISTS") {
        return true;
      }
    } catch (error) {
      continue;
    }
  }

  return false;
}

export async function createDirectoryOnDevice(
  deviceId: string,
  dirPath: string
): Promise<void> {
  const alreadyExists = await verifyDirectoryExists(deviceId, dirPath);
  if (alreadyExists) {
    return;
  }

  const escapedPath = dirPath.replace(/'/g, "'\"'\"'");

  const commands = [
    `mkdir -p "${dirPath}"`,
    `mkdir -p '${escapedPath}'`,
    `mkdir -p '${dirPath}'`,
  ];

  for (const command of commands) {
    try {
      await execAsync(`adb -s ${deviceId} shell "${command}"`);
      const verified = await verifyDirectoryExists(deviceId, dirPath);
      if (verified) {
        return;
      }
    } catch (error) {
      continue;
    }
  }

  const pathParts = dirPath.split("/").filter((part) => part);
  let currentPath = "";

  for (const part of pathParts) {
    currentPath += "/" + part;

    const partExists = await verifyDirectoryExists(deviceId, currentPath);
    if (partExists) {
      continue;
    }

    try {
      const escapedCurrentPath = currentPath.replace(/'/g, "'\"'\"'");
      await execAsync(
        `adb -s ${deviceId} shell "mkdir '${escapedCurrentPath}'"`
      );
    } catch (error) {}
  }
}

export async function viewFileContent(
  deviceId: string,
  filePath: string
): Promise<void> {
  Logger.info(`Viewing: ${colors.white(path.posix.basename(filePath))}`, {
    spaceBefore: true,
  });
  Logger.path("Path", filePath);

  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "cat '${filePath}'"`
    );

    if (stdout.trim()) {
      Logger.separator();
      console.log(stdout);
      Logger.separator();
    } else {
      Logger.warning("File appears to be empty");
    }
  } catch (error) {
    Logger.error(`Failed to read file: ${error}`);
  }

  Logger.space();
  await text({
    message: "Press Enter to continue...",
    placeholder: "",
  });
}

export async function deleteFileOrDirectory(
  itemPath: string,
  isDirectory: boolean,
  allDevices: AdbDevice[],
  currentDeviceId: string
): Promise<boolean> {
  const itemName = path.posix.basename(itemPath);
  const itemType = isDirectory ? "directory" : "file";

  Logger.warning(`Delete ${itemType}: ${colors.white(itemName)}`, {
    spaceBefore: true,
  });
  Logger.path("Path", itemPath);

  const deleteScope = await select({
    message: `Delete ${itemType} from:`,
    options: [
      { value: "current", label: `Current device only` },
      {
        value: "all",
        label: `All connected devices (${allDevices.length} devices)`,
      },
    ],
  });

  if (!deleteScope || typeof deleteScope === "symbol") {
    Logger.warning("Delete cancelled");
    return false;
  }

  const confirmed = await confirm({
    message: colors.red(
      `Are you sure you want to delete this ${itemType}? This cannot be undone!`
    ),
  });

  if (confirmed !== true) {
    Logger.muted("Delete cancelled");
    return false;
  }

  const targetDevices =
    deleteScope === "current"
      ? allDevices.filter((device) => device.id === currentDeviceId)
      : allDevices;

  let success = 0;
  let failed = 0;

  Logger.success(
    `Deleting ${itemType} from ${targetDevices.length} device(s)...`,
    { spaceBefore: true }
  );

  for (const device of targetDevices) {
    if (!device || !device.id) {
      failed++;
      continue;
    }

    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray(`Deleting from ${device.id}...`));

    try {
      if (isDirectory) {
        await execAsync(`adb -s ${device.id} shell "rm -rf '${itemPath}'"`);
      } else {
        await execAsync(`adb -s ${device.id} shell "rm '${itemPath}'"`);
      }

      deviceSpinner.stop(colors.green(`${device.id}`));
      success++;
    } catch (error) {
      deviceSpinner.stop(colors.yellow(`${device.id} (may not exist)`));
      failed++;
    }
  }

  Logger.operationResult(success, failed, "deletion");

  return success > 0;
}

export async function copyFromLocalToCurrentPath(
  deviceId: string,
  currentPath: string,
  allDevices: AdbDevice[]
): Promise<void> {
  Logger.info("Copy from Local Machine", { spaceBefore: true });

  const localPath = await text({
    message: "Enter local file path:",
    placeholder: "C:\\path\\to\\file.lua",
    validate: (value) => {
      if (!value) return "Path required";
      const cleanPath = value.replace(/^["']|["']$/g, "");
      if (!existsSync(cleanPath)) return "File not found";
      return undefined;
    },
  });

  if (!localPath || typeof localPath === "symbol") {
    Logger.warning("Copy cancelled");
    return;
  }

  const cleanPath = localPath.replace(/^["']|["']$/g, "");
  const fileName = path.basename(cleanPath);
  const targetPath = path.posix.join(currentPath, fileName);

  Logger.success(`Local: ${cleanPath}`);
  Logger.muted(`Target: ${targetPath}`);

  const copyScope = await select({
    message: "Copy to:",
    options: [
      { value: "current", label: `Current device only (${deviceId})` },
      {
        value: "all",
        label: `All connected devices (${allDevices.length} devices)`,
      },
    ],
  });

  if (!copyScope || typeof copyScope === "symbol") {
    Logger.warning("Copy cancelled");
    return;
  }

  const targetDevices =
    copyScope === "current"
      ? allDevices.filter((d) => d.id === deviceId)
      : allDevices;

  const confirmed = await confirm({
    message: `Copy "${fileName}" to ${targetDevices.length} device(s)?`,
  });

  if (confirmed !== true) {
    Logger.warning("Copy cancelled");
    return;
  }

  const result = await copyLocalToDevicesFixed(
    cleanPath,
    targetDevices,
    targetPath
  );
  Logger.operationResult(result.success, result.failed, result.operation);
}

export async function copyLocalToDevicesFixed(
  localPath: string,
  targetDevices: AdbDevice[],
  targetPath: string
): Promise<OperationResult> {
  Logger.success("Copying from local machine...", { spaceBefore: true });

  let success = 0;
  let failed = 0;

  for (const device of targetDevices) {
    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray(`Copying to ${device.id}...`));

    try {
      const targetDir = path.posix.dirname(targetPath);

      await createDirectoryOnDevice(device.id, targetDir);

      const pushMethods = [
        () =>
          execAsync(`adb -s ${device.id} push "${localPath}" "${targetPath}"`),

        () =>
          execAsync(`adb -s ${device.id} push "${localPath}" ${targetPath}`),

        async () => {
          const fileName = path.posix.basename(targetPath);
          const tempPath = `/data/local/tmp/${fileName}`;
          await execAsync(
            `adb -s ${device.id} push "${localPath}" "${tempPath}"`
          );
          await execAsync(
            `adb -s ${device.id} shell "cp '${tempPath}' '${targetPath}' && rm '${tempPath}'"`
          );
        },
      ];

      let pushSuccess = false;
      for (const pushMethod of pushMethods) {
        try {
          await pushMethod();
          pushSuccess = true;
          break;
        } catch (error) {
          const errorStr = String(error);
          if (
            errorStr.includes("file pushed") ||
            errorStr.includes("1 file pushed")
          ) {
            pushSuccess = true;
            break;
          }
          continue;
        }
      }

      if (!pushSuccess) {
        throw new Error("All push methods failed");
      }

      try {
        const { stdout } = await execAsync(
          `adb -s ${device.id} shell "ls -la '${targetPath}'"`
        );
        if (stdout.trim()) {
          deviceSpinner.stop(colors.green(`${device.id} ✓`));
          success++;
        } else {
          throw new Error("File not found after push");
        }
      } catch (verifyError) {
        deviceSpinner.stop(
          colors.yellow(`${device.id} (pushed, verification unclear)`)
        );
        success++;
      }
    } catch (error) {
      deviceSpinner.stop(colors.red(`${device.id} ✗`));
      Logger.error(`Error: ${error}`, { indent: 1 });
      failed++;
    }
  }

  return { success, failed, operation: "copy from local" };
}

export async function copyToDevices(
  sourceDeviceId: string,
  sourcePath: string,
  targetDevices: AdbDevice[],
  isDirectory: boolean
): Promise<OperationResult> {
  Logger.success("Starting copy operation...", { spaceBefore: true });
  Logger.muted(`Source: ${sourcePath}`);

  let success = 0;
  let failed = 0;

  for (const device of targetDevices) {
    if (device.id === sourceDeviceId) continue;

    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray(`Copying to ${device.id}...`));

    try {
      if (isDirectory) {
        if (sourcePath.endsWith("/*")) {
          const actualPath = sourcePath.slice(0, -2);
          await copyDirectoryContents(
            sourceDeviceId,
            actualPath,
            device.id,
            actualPath
          );
        } else {
          await copyDirectoryRecursive(
            sourceDeviceId,
            sourcePath,
            device.id,
            sourcePath
          );
        }
      } else {
        const targetDir = path.posix.dirname(sourcePath);
        await createDirectoryOnDevice(device.id, targetDir);

        const localTemp = `./temp_${Date.now()}_${path.posix
          .basename(sourcePath)
          .replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await execAsync(
          `adb -s ${sourceDeviceId} pull "${sourcePath}" "${localTemp}"`
        );

        await execAsync(
          `adb -s ${device.id} push "${localTemp}" "${sourcePath}"`
        );

        await execAsync(
          `rm -f "${localTemp}" 2>/dev/null || del /Q "${localTemp}" 2>nul`
        );
      }

      deviceSpinner.stop(colors.green(`${device.id}`));
      success++;
    } catch (error) {
      deviceSpinner.stop(colors.red(`${device.id}`));
      Logger.error(`Error: ${error}`, { indent: 1 });
      failed++;
    }
  }

  return { success, failed, operation: "copy between devices" };
}

export async function copyDirectoryContents(
  sourceDeviceId: string,
  sourcePath: string,
  targetDeviceId: string,
  targetPath: string
): Promise<void> {
  const items = await listDirectoryContents(sourceDeviceId, sourcePath);

  await createDirectoryOnDevice(targetDeviceId, targetPath);

  for (const item of items) {
    const sourceItemPath = item.path;
    const targetItemPath = path.posix.join(targetPath, item.name);

    if (item.isDirectory) {
      await copyDirectoryRecursive(
        sourceDeviceId,
        sourceItemPath,
        targetDeviceId,
        targetItemPath
      );
    } else {
      const localTemp = `./temp_${Date.now()}_${item.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;
      try {
        await execAsync(
          `adb -s ${sourceDeviceId} pull "${sourceItemPath}" "${localTemp}"`
        );

        const parentDir = path.posix.dirname(targetItemPath);
        await createDirectoryOnDevice(targetDeviceId, parentDir);

        await execAsync(
          `adb -s ${targetDeviceId} push "${localTemp}" "${targetItemPath}"`
        );
        await execAsync(
          `rm -f "${localTemp}" 2>/dev/null || del /Q "${localTemp}" 2>nul`
        );
      } catch (error) {
        Logger.warning(`Failed to copy ${item.name}: ${error}`);
      }
    }
  }
}

export async function copyDirectoryRecursive(
  sourceDeviceId: string,
  sourcePath: string,
  targetDeviceId: string,
  targetPath: string
): Promise<void> {
  await createDirectoryOnDevice(targetDeviceId, targetPath);

  const items = await listDirectoryContents(sourceDeviceId, sourcePath);

  for (const item of items) {
    const sourceItemPath = item.path;
    const targetItemPath = path.posix.join(targetPath, item.name);

    if (item.isDirectory) {
      await copyDirectoryRecursive(
        sourceDeviceId,
        sourceItemPath,
        targetDeviceId,
        targetItemPath
      );
    } else {
      const localTemp = `./temp_${Date.now()}_${item.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;
      try {
        await execAsync(
          `adb -s ${sourceDeviceId} pull "${sourceItemPath}" "${localTemp}"`
        );

        const parentDir = path.posix.dirname(targetItemPath);
        await createDirectoryOnDevice(targetDeviceId, parentDir);

        await execAsync(
          `adb -s ${targetDeviceId} push "${localTemp}" "${targetItemPath}"`
        );
        await execAsync(
          `rm -f "${localTemp}" 2>/dev/null || del /Q "${localTemp}" 2>nul`
        );
      } catch (error) {
        Logger.warning(`Failed to copy ${item.name}: ${error}`);
      }
    }
  }
}
