import { select, spinner } from "@clack/prompts";
import colors from "picocolors";
import path from "path";
import {
  listDirectoryContents,
  viewFileContent,
  deleteFileOrDirectory,
  copyFromLocalToCurrentPath,
} from "./file-operations";
import { displayDirectoryContents, getFileIcon } from "./file-display";
import type {
  FileSystemItem,
  FileSelection,
  FileAction,
  AdbDevice,
} from "./types";

export async function browseAndManageFiles(
  deviceId: string,
  executorPath: string,
  allDevices: AdbDevice[]
): Promise<FileSelection | null> {
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

    const action = choice as FileAction;

    switch (action) {
      case "back":
        currentPath = path.posix.dirname(currentPath);
        break;

      case "refresh":
        continue;

      case "navigate":
        const selectedDir = await selectDirectory(directories);
        if (selectedDir) {
          currentPath = selectedDir.path;
        }
        break;

      case "select-file":
        const selectedFile = await selectFile(
          files,
          "Select file to copy to other devices:"
        );
        if (selectedFile) {
          return { path: selectedFile.path, isDirectory: false };
        }
        break;

      case "view-file":
        const fileToView = await selectFile(files, "Select file to view:");
        if (fileToView) {
          await viewFileContent(deviceId, fileToView.path);
        }
        break;

      case "delete-file":
        const fileToDelete = await selectFile(files, "Select file to delete:");
        if (fileToDelete) {
          const deleted = await deleteFileOrDirectory(
            fileToDelete.path,
            false,
            allDevices,
            deviceId
          );
          if (deleted) {
            continue;
          }
        }
        break;

      case "delete-directory":
        const dirToDelete = await selectDirectory(
          directories,
          "Select directory to delete:"
        );
        if (dirToDelete) {
          const deleted = await deleteFileOrDirectory(
            dirToDelete.path,
            true,
            allDevices,
            deviceId
          );
          if (deleted) {
            continue;
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

async function selectDirectory(
  directories: FileSystemItem[],
  message: string = "Select directory:"
): Promise<FileSystemItem | null> {
  const dirOptions = directories.map((dir, i) => ({
    value: i.toString(),
    label: `${getFileIcon(dir.name, true)} ${dir.name}`,
  }));

  const dirChoice = await select({
    message,
    options: [...dirOptions, { value: "cancel", label: "Cancel" }],
  });

  if (dirChoice && typeof dirChoice !== "symbol" && dirChoice !== "cancel") {
    return directories[parseInt(dirChoice)] || null;
  }
  return null;
}

async function selectFile(
  files: FileSystemItem[],
  message: string
): Promise<FileSystemItem | null> {
  const fileOptions = files.map((file, i) => ({
    value: i.toString(),
    label: `${getFileIcon(file.name, false)} ${file.name}`,
  }));

  const fileChoice = await select({
    message,
    options: [...fileOptions, { value: "cancel", label: "Cancel" }],
  });

  if (fileChoice && typeof fileChoice !== "symbol" && fileChoice !== "cancel") {
    return files[parseInt(fileChoice)] || null;
  }
  return null;
}
