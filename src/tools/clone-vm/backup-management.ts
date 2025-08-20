import path from "path";
import { existsSync, mkdirSync } from "fs";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import {
  createBackup,
  isInstanceRunning,
  stopInstance,
  type LDPlayerInstance,
} from "@/utils/emu/ld";

export function ensureBackupDirectory(): string {
  const backupDir = path.join(process.cwd(), "ldplayer_backups");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

export function generateBackupPath(
  backupDir: string,
  instanceName: string
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split(".")[0];

  return path.join(backupDir, `${instanceName}_backup_${timestamp}.ldbk`);
}

export async function prepareSourceInstance(
  ldPath: string,
  sourceInstance: LDPlayerInstance
): Promise<void> {
  const cloneSpinner = spinner();
  cloneSpinner.start(colors.gray("Checking source instance status..."));

  const isRunning = await isInstanceRunning(ldPath, sourceInstance.index);
  if (isRunning) {
    cloneSpinner.message(colors.yellow("Stopping source instance..."));
    await stopInstance(ldPath, sourceInstance.index);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  cloneSpinner.stop(colors.green("[+] Source instance prepared"));
}

export async function createInstanceBackup(
  ldPath: string,
  sourceInstance: LDPlayerInstance,
  backupPath: string
): Promise<void> {
  const backupSpinner = spinner();
  backupSpinner.start(colors.gray("Creating backup..."));

  try {
    await createBackup(ldPath, sourceInstance.index, backupPath);
    backupSpinner.stop(colors.green("[+] Backup created"));
  } catch (error) {
    backupSpinner.stop(colors.red("[X] Backup creation failed"));
    throw error;
  }
}
