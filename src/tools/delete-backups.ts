import { spinner, outro, confirm, select } from "@clack/prompts";
import colors from "picocolors";
import path from "path";
import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { Logger } from "@/utils/logger";

interface BackupFile {
  name: string;
  path: string;
  size: string;
  created: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

async function getBackupFiles(): Promise<BackupFile[]> {
  const backupDir = path.join(process.cwd(), "ldplayer_backups");

  if (!existsSync(backupDir)) {
    return [];
  }

  const files = readdirSync(backupDir);
  const backupFiles: BackupFile[] = [];

  for (const file of files) {
    if (file.endsWith(".ldbk") || file.endsWith(".vmdk")) {
      const filePath = path.join(backupDir, file);
      const stats = statSync(filePath);

      backupFiles.push({
        name: file,
        path: filePath,
        size: formatFileSize(stats.size),
        created: formatDate(stats.birthtime),
      });
    }
  }

  backupFiles.sort((a, b) => {
    const statsA = statSync(a.path);
    const statsB = statSync(b.path);
    return statsB.birthtime.getTime() - statsA.birthtime.getTime();
  });

  return backupFiles;
}

function calculateTotalSize(backupFiles: BackupFile[]): string {
  let totalBytes = 0;

  for (const backup of backupFiles) {
    const stats = statSync(backup.path);
    totalBytes += stats.size;
  }

  return formatFileSize(totalBytes);
}

async function deleteBackupFile(filePath: string): Promise<void> {
  try {
    unlinkSync(filePath);
  } catch (error) {
    throw new Error(
      `Failed to delete file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function deleteLDPlayerBackups(): Promise<void> {
  Logger.title("[X] Delete LDPlayer Backups");
  Logger.muted("Clean up backup files to free disk space", { indent: 1 });

  const loadingSpinner = spinner();
  loadingSpinner.start(colors.gray("Scanning for backup files..."));

  let backupFiles: BackupFile[] = [];
  try {
    backupFiles = await getBackupFiles();
  } catch (error) {
    loadingSpinner.stop(colors.red("[X] Failed to scan backup files"));
    outro(
      colors.red(
        `[X] Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    return;
  }

  loadingSpinner.stop(colors.green("[+] Backup files loaded"));

  if (backupFiles.length === 0) {
    outro(
      colors.yellow("[@] No backup files found in ldplayer_backups folder.")
    );
    return;
  }

  Logger.info("[#] Found Backup Files:", { spaceBefore: true });
  Logger.muted(
    `Total: ${backupFiles.length} files (${calculateTotalSize(backupFiles)})`,
    { indent: 1 }
  );

  for (let i = 0; i < backupFiles.length; i++) {
    const backup = backupFiles[i];
    if (backup) {
      Logger.normal(
        `${colors.cyan((i + 1).toString())}. ${colors.white(backup.name)}`,
        { indent: 1, spaceBefore: true }
      );
      Logger.muted(`Size: ${backup.size} | Created: ${backup.created}`, {
        indent: 2,
      });
    }
  }
  Logger.space();

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

  if (
    !deleteChoice ||
    typeof deleteChoice === "symbol" ||
    deleteChoice === "cancel"
  ) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  let filesToDelete: BackupFile[] = [];

  if (deleteChoice === "all") {
    filesToDelete = backupFiles;
  } else if (deleteChoice === "select") {
    const fileOptions = backupFiles.map((backup, index) => ({
      value: index.toString(),
      label: `${backup.name} (${backup.size})`,
    }));

    const selectedFile = await select({
      message: "Select a file to delete:",
      options: fileOptions,
    });

    if (!selectedFile || typeof selectedFile === "symbol") {
      outro(colors.yellow("[!] Operation cancelled"));
      return;
    }

    const fileIndex = parseInt(String(selectedFile));
    const selectedBackup = backupFiles[fileIndex];

    if (!selectedBackup) {
      outro(colors.red("[X] Invalid file selection"));
      return;
    }

    filesToDelete = [selectedBackup];
  }

  const totalSizeToDelete = filesToDelete.reduce((total, backup) => {
    const stats = statSync(backup.path);
    return total + stats.size;
  }, 0);

  const confirmMessage =
    filesToDelete.length === 1 && filesToDelete[0]
      ? `Delete "${filesToDelete[0].name}" (${filesToDelete[0].size})?`
      : `Delete ${colors.bold(
          filesToDelete.length.toString()
        )} backup files (${formatFileSize(totalSizeToDelete)})?`;

  const shouldProceed = await confirm({
    message: confirmMessage,
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Deletion cancelled"));
    return;
  }

  Logger.error("[X] Starting deletion...", { spaceBefore: true });

  let deletedCount = 0;
  let failedCount = 0;

  for (const backup of filesToDelete) {
    const deleteSpinner = spinner();
    deleteSpinner.start(colors.gray(`Deleting ${backup.name}...`));

    try {
      await deleteBackupFile(backup.path);
      deleteSpinner.stop(colors.green(`[+] Deleted: ${backup.name}`));
      deletedCount++;
    } catch (error) {
      deleteSpinner.stop(colors.red(`[X] Failed to delete: ${backup.name}`));
      Logger.error(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        { indent: 1 }
      );
      failedCount++;
    }
  }

  if (deletedCount > 0) {
    Logger.success(`Successfully deleted ${deletedCount} backup file(s)!`, {
      spaceBefore: true,
    });
    Logger.muted(
      `Freed up ${formatFileSize(totalSizeToDelete)} of disk space`,
      { indent: 1 }
    );
  }

  if (failedCount > 0) {
    Logger.error(`[!] Failed to delete ${failedCount} file(s)`);
  }

  outro(colors.cyan("[*] Cleanup completed"));
}
