import path from "path";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { FileSystemItem } from "./types";

export function getFileIcon(fileName: string, isDirectory: boolean): string {
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
    case ".apk":
      return "📱";
    case ".cfg":
    case ".ini":
    case ".conf":
      return "⚙️";
    default:
      return "📋";
  }
}

export function displayDirectoryContents(
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
