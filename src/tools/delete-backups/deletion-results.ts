import { Logger } from "@/utils/logger";
import { formatFileSize } from "./backup-scanning";
import type { DeletionResult } from "./types";

export function displayDeletionResults(
  result: DeletionResult,
  totalSizeToDelete: number
): void {
  if (result.deletedCount > 0) {
    Logger.success(
      `Successfully deleted ${result.deletedCount} backup file(s)!`,
      {
        spaceBefore: true,
      }
    );
    Logger.muted(
      `Freed up ${formatFileSize(totalSizeToDelete)} of disk space`,
      { indent: 1 }
    );
  }

  if (result.failedCount > 0) {
    Logger.error(`[!] Failed to delete ${result.failedCount} file(s)`);
  }
}
