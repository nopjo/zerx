import colors from "picocolors";
import { Logger } from "@/utils/logger";
import { calculateTotalSize } from "./backup-scanning";
import type { BackupFile } from "./types";

export function displayBackupFiles(backupFiles: BackupFile[]): void {
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
}
