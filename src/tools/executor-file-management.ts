import { select, outro, confirm, text, spinner } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import path from "path";
import {
  getConnectedDevices,
  printConnectedDevices,
  type AdbDevice,
} from "@/utils/adb";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

interface ExecutorInfo {
  name: string;
  path: string;
  description: string;
}

interface FileSystemItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

const EXECUTORS: ExecutorInfo[] = [
  {
    name: "Delta",
    path: "/storage/emulated/0/Delta",
    description: "Delta (https://deltaexploits.gg)",
  },
  {
    name: "Krnl",
    path: "/storage/emulated/0/krnl",
    description: "Krnl (https://krnl.cat/)",
  },
  {
    name: "CodeX",
    path: "/storage/emulated/0/Codex",
    description: "CodeX (https://codex.lol/)",
  },
  {
    name: "Cryptic",
    path: "/storage/emulated/0/Cryptic",
    description: "CodeX (https://getcryptic.net/)",
  },
  {
    name: "VegaX",
    path: "/storage/emulated/0/VegaX",
    description: "VegaX (https://vegax.gg/)",
  },
];

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\"'\"'")}'`;
}

async function checkExecutorExists(
  deviceId: string,
  executorPath: string
): Promise<boolean> {
  try {
    const methods = [
      `ls -d ${escapeShellArg(executorPath)} 2>/dev/null && echo 'EXISTS'`,

      `test -d ${escapeShellArg(executorPath)} && echo 'EXISTS'`,

      `cd ${escapeShellArg(executorPath)} 2>/dev/null && echo 'EXISTS'`,

      `find ${escapeShellArg(executorPath)} -maxdepth 0 -type d 2>/dev/null | head -1`,
    ];

    for (const method of methods) {
      try {
        const { stdout, stderr } = await execAsync(
          `adb -s ${deviceId} shell "${method}"`
        );

        if (
          stdout.trim() === "EXISTS" ||
          stdout.trim() === executorPath ||
          stdout.trim().endsWith(executorPath)
        ) {
          Logger.success(`Found ${executorPath} using method: ${method}`);
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    try {
      const parentPath = path.posix.dirname(executorPath);
      const folderName = path.posix.basename(executorPath);

      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "ls ${escapeShellArg(parentPath)} 2>/dev/null"`
      );

      const folders = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);
      Logger.muted(`Found folders in ${parentPath}: ${folders.join(", ")}`);

      const exists = folders.some((folder) => folder === folderName);
      if (exists) {
        Logger.success(`Found ${folderName} in parent directory listing`);
        return true;
      }
    } catch (error) {
      Logger.warning(`Parent directory check failed: ${error}`);
    }

    return false;
  } catch (error) {
    Logger.error(`Error checking executor existence: ${error}`);
    return false;
  }
}

async function getDevicesWithExecutor(
  devices: AdbDevice[],
  executorPath: string
): Promise<AdbDevice[]> {
  const devicesWithExecutor: AdbDevice[] = [];

  for (const device of devices) {
    const hasExecutor = await checkExecutorExists(device.id, executorPath);
    if (hasExecutor) {
      devicesWithExecutor.push(device);
    }
  }

  return devicesWithExecutor;
}

function getFileIcon(fileName: string, isDirectory: boolean): string {
  if (isDirectory) {
    return "📁";
  }

  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".lua":
    case ".luau":
      return "🌙";
    case ".txt":
      return "📄";
    case ".js":
    case ".ts":
      return "🟨";
    case ".json":
      return "🔧";
    case ".xml":
      return "📰";
    case ".zip":
    case ".rar":
    case ".7z":
      return "🗜️";
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
      return "🖼️";
    case ".mp4":
    case ".avi":
    case ".mov":
      return "🎬";
    case ".mp3":
    case ".wav":
    case ".ogg":
      return "🎵";
    case ".apk":
      return "📱";
    case ".so":
      return "⚡";
    case ".dll":
      return "🔗";
    case ".exe":
      return "💻";
    case ".log":
      return "📋";
    case ".cfg":
    case ".ini":
    case ".conf":
      return "⚙️";
    default:
      return "📋";
  }
}

async function listDirectoryContents(
  deviceId: string,
  directoryPath: string
): Promise<FileSystemItem[]> {
  try {
    Logger.muted(`Checking: ${directoryPath}`);

    const commands = [
      `ls -1 ${escapeShellArg(directoryPath)} 2>/dev/null`,
      `ls ${escapeShellArg(directoryPath)} 2>/dev/null`,
      `find ${escapeShellArg(directoryPath)} -maxdepth 1 -type f -o -type d 2>/dev/null | grep -v '^${directoryPath}$'`,
    ];

    for (const command of commands) {
      try {
        const { stdout, stderr } = await execAsync(
          `adb -s ${deviceId} shell "${command}"`
        );

        if (stdout.trim() && !stderr.includes("Permission denied")) {
          return parseDirectoryOutput(stdout, directoryPath, deviceId);
        }
      } catch (error) {
        Logger.warning(`Command failed: ${command}`);
        continue;
      }
    }

    Logger.warning(`Attempting to create directory: ${directoryPath}`);
    try {
      await execAsync(
        `adb -s ${deviceId} shell "mkdir -p ${escapeShellArg(directoryPath)}"`
      );
      Logger.success(`Directory created successfully`);
      return [];
    } catch (createError) {
      Logger.error(`Failed to create directory: ${createError}`);
    }

    return [];
  } catch (error) {
    Logger.error(`Failed to access directory: ${error}`);
    return [];
  }
}

async function parseDirectoryOutput(
  output: string,
  directoryPath: string,
  deviceId: string
): Promise<FileSystemItem[]> {
  const lines = output.split("\n").filter((line) => line.trim());
  const items: FileSystemItem[] = [];

  for (const line of lines) {
    const name = line.trim();
    if (!name || name === "." || name === "..") continue;

    const itemPath = path.posix.join(directoryPath, name);
    let isDirectory = false;

    try {
      const { stdout: lsOutput } = await execAsync(
        `adb -s ${deviceId} shell "ls -d ${escapeShellArg(itemPath)}/ 2>/dev/null"`
      );
      if (lsOutput.trim() && lsOutput.includes("/")) {
        isDirectory = true;
      }
    } catch {}

    if (!isDirectory) {
      try {
        const { stdout: cdOutput } = await execAsync(
          `adb -s ${deviceId} shell "cd ${escapeShellArg(itemPath)} 2>/dev/null && echo 'DIR'" 2>/dev/null`
        );
        if (cdOutput.trim() === "DIR") {
          isDirectory = true;
        }
      } catch {}
    }

    if (!isDirectory) {
      try {
        const { stdout: fileOutput } = await execAsync(
          `adb -s ${deviceId} shell "file ${escapeShellArg(itemPath)} 2>/dev/null"`
        );
        if (fileOutput.includes("directory")) {
          isDirectory = true;
        }
      } catch {}
    }

    items.push({
      name,
      path: itemPath,
      isDirectory,
    });
  }

  return items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

function displayDirectoryContents(
  items: FileSystemItem[],
  currentPath: string
): void {
  Logger.currentDirectory(currentPath);

  if (items.length === 0) {
    Logger.emptyDirectory();
    return;
  }

  items.forEach((item, index) => {
    const icon = getFileIcon(item.name, item.isDirectory);
    const type = item.isDirectory
      ? colors.blue("[DIR]")
      : colors.green("[FILE]");
    Logger.fileItem(index + 1, icon, item.name, type);
  });

  Logger.totalItems(items.length);
}

async function viewFileContent(
  deviceId: string,
  filePath: string
): Promise<void> {
  Logger.info(`Viewing: ${colors.white(path.posix.basename(filePath))}`, {
    spaceBefore: true,
  });
  Logger.path("Path", filePath);

  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell cat ${escapeShellArg(filePath)}`
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

async function deleteFileOrDirectory(
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

  if (!confirmed) {
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
        await execAsync(
          `adb -s ${device.id} shell "rm -rf ${escapeShellArg(itemPath)}"`
        );
      } else {
        await execAsync(
          `adb -s ${device.id} shell "rm ${escapeShellArg(itemPath)}"`
        );
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

async function copyFromLocalToCurrentPath(
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

  if (!confirmed) {
    Logger.warning("Copy cancelled");
    return;
  }

  await copyLocalToDevices(cleanPath, targetDevices, targetPath);
}

async function browseAndManageFiles(
  deviceId: string,
  executorPath: string,
  allDevices: AdbDevice[]
): Promise<{ path: string; isDirectory: boolean } | null> {
  let currentPath = executorPath;

  while (true) {
    const loadingSpinner = spinner();
    loadingSpinner.start(colors.gray("Loading directory..."));

    const items = await listDirectoryContents(deviceId, currentPath);
    loadingSpinner.stop();

    displayDirectoryContents(items, currentPath);

    const options = [];

    if (currentPath !== executorPath) {
      options.push({ value: "back", label: "Go back" });
    }

    const directories = items.filter((item) => item.isDirectory);
    if (directories.length > 0) {
      options.push({
        value: "navigate",
        label: `Enter directory (${directories.length} available)`,
      });
    }

    const files = items.filter((item) => !item.isDirectory);
    if (files.length > 0) {
      options.push({
        value: "select-file",
        label: `Select file to copy to other devices`,
      });
      options.push({ value: "view-file", label: `View file content` });
      options.push({ value: "delete-file", label: `Delete file` });
    }

    if (directories.length > 0) {
      options.push({
        value: "delete-directory",
        label: `Delete directory`,
      });
    }

    options.push({
      value: "copy-from-local",
      label: "Copy file from local machine",
    });

    options.push({
      value: "copy-directory",
      label: "Copy entire current directory to other devices",
    });

    if (items.length > 0) {
      options.push({
        value: "copy-contents",
        label: "Copy all contents to other devices",
      });
    }

    options.push({ value: "refresh", label: "Refresh" });
    options.push({ value: "cancel", label: "Exit file management" });

    const choice = await select({
      message: "Choose an action:",
      options,
    });

    if (!choice || typeof choice === "symbol" || choice === "cancel") {
      return null;
    }

    switch (choice) {
      case "back":
        currentPath = path.posix.dirname(currentPath);
        break;

      case "refresh":
        continue;

      case "navigate":
        const dirOptions = directories.map((dir, i) => ({
          value: i.toString(),
          label: `${getFileIcon(dir.name, true)} ${dir.name}`,
        }));

        const dirChoice = await select({
          message: "Select directory:",
          options: [...dirOptions, { value: "cancel", label: "Cancel" }],
        });

        if (
          dirChoice &&
          typeof dirChoice !== "symbol" &&
          dirChoice !== "cancel"
        ) {
          const selectedDir = directories[parseInt(dirChoice)];
          if (selectedDir) {
            currentPath = selectedDir.path;
          }
        }
        break;

      case "select-file":
        const fileOptions = files.map((file, i) => ({
          value: i.toString(),
          label: `${getFileIcon(file.name, false)} ${file.name}`,
        }));

        const fileChoice = await select({
          message: "Select file to copy to other devices:",
          options: [...fileOptions, { value: "cancel", label: "Cancel" }],
        });

        if (
          fileChoice &&
          typeof fileChoice !== "symbol" &&
          fileChoice !== "cancel"
        ) {
          const selectedFile = files[parseInt(fileChoice)];
          if (selectedFile) {
            return { path: selectedFile.path, isDirectory: false };
          }
        }
        break;

      case "view-file":
        const viewFileOptions = files.map((file, i) => ({
          value: i.toString(),
          label: `${getFileIcon(file.name, false)} ${file.name}`,
        }));

        const viewChoice = await select({
          message: "Select file to view:",
          options: [...viewFileOptions, { value: "cancel", label: "Cancel" }],
        });

        if (
          viewChoice &&
          typeof viewChoice !== "symbol" &&
          viewChoice !== "cancel"
        ) {
          const selectedFile = files[parseInt(viewChoice)];
          if (selectedFile) {
            await viewFileContent(deviceId, selectedFile.path);
          }
        }
        break;

      case "delete-file":
        const deleteFileOptions = files.map((file, i) => ({
          value: i.toString(),
          label: `${getFileIcon(file.name, false)} ${file.name}`,
        }));

        const deleteFileChoice = await select({
          message: "Select file to delete:",
          options: [...deleteFileOptions, { value: "cancel", label: "Cancel" }],
        });

        if (
          deleteFileChoice &&
          typeof deleteFileChoice !== "symbol" &&
          deleteFileChoice !== "cancel"
        ) {
          const selectedFile = files[parseInt(deleteFileChoice)];
          if (selectedFile) {
            const deleted = await deleteFileOrDirectory(
              selectedFile.path,
              false,
              allDevices,
              deviceId
            );
            if (deleted) {
              continue;
            }
          }
        }
        break;

      case "delete-directory":
        const deleteDirOptions = directories.map((dir, i) => ({
          value: i.toString(),
          label: `${getFileIcon(dir.name, true)} ${dir.name}`,
        }));

        const deleteDirChoice = await select({
          message: "Select directory to delete:",
          options: [...deleteDirOptions, { value: "cancel", label: "Cancel" }],
        });

        if (
          deleteDirChoice &&
          typeof deleteDirChoice !== "symbol" &&
          deleteDirChoice !== "cancel"
        ) {
          const selectedDir = directories[parseInt(deleteDirChoice)];
          if (selectedDir) {
            const deleted = await deleteFileOrDirectory(
              selectedDir.path,
              true,
              allDevices,
              deviceId
            );
            if (deleted) {
              continue;
            }
          }
        }
        break;

      case "copy-from-local":
        await copyFromLocalToCurrentPath(deviceId, currentPath, allDevices);
        continue;

      case "copy-directory":
        return { path: currentPath, isDirectory: true };

      case "copy-contents":
        return { path: currentPath + "/*", isDirectory: true };
    }
  }
}

async function copyDirectoryContents(
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
          `adb -s ${sourceDeviceId} pull ${escapeShellArg(sourceItemPath)} "${localTemp}"`
        );

        const parentDir = path.posix.dirname(targetItemPath);
        await createDirectoryOnDevice(targetDeviceId, parentDir);

        await execAsync(
          `adb -s ${targetDeviceId} push "${localTemp}" ${escapeShellArg(targetItemPath)}`
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

async function createDirectoryOnDevice(
  deviceId: string,
  dirPath: string
): Promise<void> {
  const commands = [
    `mkdir -p ${escapeShellArg(dirPath)}`,
    `mkdir ${escapeShellArg(dirPath)}`,
    `busybox mkdir -p ${escapeShellArg(dirPath)}`,
    `test -d ${escapeShellArg(dirPath)} || mkdir ${escapeShellArg(dirPath)}`,
  ];

  for (const command of commands) {
    try {
      await execAsync(`adb -s ${deviceId} shell "${command}" 2>/dev/null`);
      return;
    } catch (error) {
      continue;
    }
  }

  const pathParts = dirPath.split("/").filter((part) => part);
  let currentPath = "";

  for (const part of pathParts) {
    currentPath += "/" + part;
    try {
      await execAsync(
        `adb -s ${deviceId} shell "test -d ${escapeShellArg(currentPath)} || mkdir ${escapeShellArg(currentPath)}" 2>/dev/null`
      );
    } catch (error) {}
  }
}

async function copyDirectoryRecursive(
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
          `adb -s ${sourceDeviceId} pull ${escapeShellArg(sourceItemPath)} "${localTemp}"`
        );

        const parentDir = path.posix.dirname(targetItemPath);
        await createDirectoryOnDevice(targetDeviceId, parentDir);

        await execAsync(
          `adb -s ${targetDeviceId} push "${localTemp}" ${escapeShellArg(targetItemPath)}`
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

async function copyToDevices(
  sourceDeviceId: string,
  sourcePath: string,
  targetDevices: AdbDevice[],
  isDirectory: boolean
): Promise<void> {
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
          `adb -s ${sourceDeviceId} pull ${escapeShellArg(sourcePath)} "${localTemp}"`
        );

        await execAsync(
          `adb -s ${device.id} push "${localTemp}" ${escapeShellArg(sourcePath)}`
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

  Logger.operationResult(success, failed, "copy operation");
}

async function copyLocalToDevices(
  localPath: string,
  targetDevices: AdbDevice[],
  targetPath: string
): Promise<void> {
  Logger.success("Copying from local machine...", { spaceBefore: true });

  let success = 0;
  let failed = 0;

  for (const device of targetDevices) {
    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray(`Copying to ${device.id}...`));

    try {
      const targetDir = path.posix.dirname(targetPath);
      await createDirectoryOnDevice(device.id, targetDir);
      await execAsync(
        `adb -s ${device.id} push "${localPath}" ${escapeShellArg(targetPath)}`
      );

      deviceSpinner.stop(colors.green(`${device.id}`));
      success++;
    } catch (error) {
      deviceSpinner.stop(colors.red(`${device.id}`));
      Logger.error(`Error: ${error}`, { indent: 1 });
      failed++;
    }
  }

  Logger.operationResult(success, failed, "copy operation");
}

export async function executorFileManagement(): Promise<void> {
  Logger.title("Executor File Management");
  Logger.muted("Complete file system management across all devices", {
    indent: 1,
  });

  while (true) {
    const executorChoice = await select({
      message: "Select an executor:",
      options: EXECUTORS.map((executor) => ({
        value: executor.name.toLowerCase(),
        label: `${executor.name} - ${executor.description}`,
      })),
    });

    if (!executorChoice || typeof executorChoice === "symbol") {
      outro(colors.yellow("Cancelled"));
      return;
    }

    const executor = EXECUTORS.find(
      (e) => e.name.toLowerCase() === executorChoice
    );
    if (!executor) {
      outro(colors.red("Executor not found"));
      return;
    }

    Logger.success(`Selected: ${executor.name}`);

    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray("Scanning devices..."));

    const devices = await getConnectedDevices();
    const readyDevices = devices.filter((device) => device.status === "device");

    deviceSpinner.stop();
    printConnectedDevices(devices);

    if (readyDevices.length === 0) {
      outro(colors.red("No devices found"));
      return;
    }

    Logger.info(`Checking for ${executor.name} on devices...`, {
      spaceBefore: true,
    });

    const checkSpinner = spinner();
    checkSpinner.start(colors.gray("Checking executor folders..."));

    const devicesWithExecutor = await getDevicesWithExecutor(
      readyDevices,
      executor.path
    );

    checkSpinner.stop();

    if (devicesWithExecutor.length === 0) {
      Logger.error(
        `No devices found with ${executor.name} folder at ${executor.path}`,
        { spaceBefore: true }
      );
      Logger.warning("Devices checked:");
      readyDevices.forEach((device) => {
        Logger.deviceMissing(device.id, device.model);
      });
      Logger.info(
        "Tip: Make sure the executor is installed on at least one device",
        { spaceBefore: true }
      );

      const tryAgain = await confirm({
        message: "Try another executor?",
      });

      if (!tryAgain) {
        outro(colors.yellow("Cancelled"));
        return;
      }

      continue;
    }

    Logger.success(
      `Found ${executor.name} on ${devicesWithExecutor.length} device(s):`,
      { spaceBefore: true }
    );
    devicesWithExecutor.forEach((device) => {
      Logger.deviceFound(device.id, device.model);
    });

    const devicesWithoutExecutor = readyDevices.filter(
      (device) =>
        !devicesWithExecutor.some((withExec) => withExec.id === device.id)
    );

    if (devicesWithoutExecutor.length > 0) {
      Logger.warning(`Devices without ${executor.name}:`, {
        spaceBefore: true,
      });
      devicesWithoutExecutor.forEach((device) => {
        Logger.deviceMissing(device.id, device.model);
      });
    }

    const sourceChoice = await select({
      message: "Select device to browse and manage:",
      options: devicesWithExecutor.map((device, i) => ({
        value: i.toString(),
        label: device.model ? `${device.id} (${device.model})` : `${device.id}`,
      })),
    });

    if (!sourceChoice || typeof sourceChoice === "symbol") {
      const tryAgain = await confirm({
        message: "Try another executor?",
      });

      if (!tryAgain) {
        outro(colors.yellow("Cancelled"));
        return;
      }

      continue;
    }

    const sourceDevice = devicesWithExecutor[parseInt(sourceChoice)];
    if (!sourceDevice) {
      outro(colors.red("Invalid device selection"));
      return;
    }

    Logger.success(`Managing files on: ${sourceDevice.id}`);
    Logger.muted(
      `You can copy files to all ${readyDevices.length} connected devices from here`
    );

    while (true) {
      const selection = await browseAndManageFiles(
        sourceDevice.id,
        executor.path,
        readyDevices
      );

      if (!selection) {
        Logger.warning("Exiting file management");
        break;
      }

      Logger.success(`Selected: ${selection.path}`);

      const targetCount = readyDevices.length - 1;
      if (targetCount === 0) {
        Logger.warning("Only one device connected - nothing to copy to");
        continue;
      }

      const shouldProceed = await confirm({
        message: `Copy from ${colors.bold(sourceDevice.id)} to ${colors.bold(
          targetCount.toString()
        )} other device(s)?`,
      });

      if (!shouldProceed) {
        Logger.warning("Copy cancelled, returning to file management");
        continue;
      }

      await copyToDevices(
        sourceDevice.id,
        selection.path,
        readyDevices,
        selection.isDirectory
      );

      const continueManaging = await confirm({
        message: "Continue managing files?",
      });

      if (!continueManaging) {
        break;
      }
    }

    const selectAnotherExecutor = await confirm({
      message: "Select another executor?",
    });

    if (!selectAnotherExecutor) {
      outro(colors.green("File management complete"));
      return;
    }
  }
}
