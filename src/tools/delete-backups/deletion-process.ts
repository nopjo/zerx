import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { unlinkSync } from "fs";
import { Logger } from "@/utils/logger";
import type { BackupFile, DeletionResult } from "./types";

export async function deleteBackupFile(filePath: string): Promise<void> {
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

export async function executeFileDeletion(
  filesToDelete: BackupFile[]
): Promise<DeletionResult> {
  Logger.error("[X] Starting deletion...", { spaceBefore: true });

  let deletedCount = 0;
  let failedCount = 0;
  let totalSizeDeleted = 0;

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

  return {
    deletedCount,
    failedCount,
    totalSizeDeleted,
  };
}
