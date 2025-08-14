import path from "path";
import { existsSync, readdirSync, statSync } from "fs";
import type { BackupFile } from "./types";

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

export async function getBackupFiles(): Promise<BackupFile[]> {
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

export function calculateTotalSize(backupFiles: BackupFile[]): string {
  let totalBytes = 0;

  for (const backup of backupFiles) {
    const stats = statSync(backup.path);
    totalBytes += stats.size;
  }

  return formatFileSize(totalBytes);
}

export function calculateTotalSizeBytes(backupFiles: BackupFile[]): number {
  let totalBytes = 0;

  for (const backup of backupFiles) {
    const stats = statSync(backup.path);
    totalBytes += stats.size;
  }

  return totalBytes;
}
