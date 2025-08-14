import { select } from "@clack/prompts";
import { calculateTotalSize } from "./backup-scanning";
import type { BackupFile, DeleteChoice } from "./types";

export async function getDeleteChoice(
  backupFiles: BackupFile[]
): Promise<DeleteChoice | null> {
  const deleteOptions = [
    {
      value: "all",
      label: `[X] Delete ALL backup files (${
        backupFiles.length
      } files, ${calculateTotalSize(backupFiles)})`,
    },
    {
      value: "select",
      label: "[#] Select specific files to delete",
    },
    {
      value: "cancel",
      label: "[!] Cancel - don't delete anything",
    },
  ];

  const deleteChoice = await select({
    message: "What would you like to delete?",
    options: deleteOptions,
  });

  if (!deleteChoice || typeof deleteChoice === "symbol") {
    return null;
  }

  return deleteChoice as DeleteChoice;
}

export async function selectSpecificFile(
  backupFiles: BackupFile[]
): Promise<BackupFile | null> {
  const fileOptions = backupFiles.map((backup, index) => ({
    value: index.toString(),
    label: `${backup.name} (${backup.size})`,
  }));

  const selectedFile = await select({
    message: "Select a file to delete:",
    options: fileOptions,
  });

  if (!selectedFile || typeof selectedFile === "symbol") {
    return null;
  }

  const fileIndex = parseInt(String(selectedFile));
  const selectedBackup = backupFiles[fileIndex];

  return selectedBackup || null;
}

export function getFilesToDelete(
  choice: DeleteChoice,
  backupFiles: BackupFile[],
  selectedFile?: BackupFile
): BackupFile[] {
  switch (choice) {
    case "all":
      return backupFiles;
    case "select":
      return selectedFile ? [selectedFile] : [];
    case "cancel":
    default:
      return [];
  }
}
