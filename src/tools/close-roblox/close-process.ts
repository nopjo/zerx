import { exec } from "child_process";
import { promisify } from "util";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { InstanceWithUser, CloseResult } from "./types";

const execAsync = promisify(exec);

export async function closeRobloxInstance(
  deviceId: string,
  deviceModel: string | undefined,
  packageName: string,
  username?: string
): Promise<CloseResult> {
  const result: CloseResult = {
    deviceId,
    deviceModel,
    packageName,
    username,
    isSuccess: false,
  };

  try {
    await execAsync(`adb -s ${deviceId} shell "am force-stop ${packageName}"`);

    try {
      await execAsync(`adb -s ${deviceId} shell "pkill -f ${packageName}"`);
    } catch {}

    result.isSuccess = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

export async function executeCloseProcess(
  instancesToClose: InstanceWithUser[]
): Promise<CloseResult[]> {
  Logger.success("[^] Starting Roblox termination process...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const closeSpinner = spinner();
  closeSpinner.start(colors.gray("Closing selected Roblox instances..."));

  const closeTasks: Promise<CloseResult>[] = instancesToClose.map((instance) =>
    closeRobloxInstance(
      instance.deviceId,
      instance.deviceModel,
      instance.packageName,
      instance.username
    )
  );

  const results = await Promise.all(closeTasks);
  closeSpinner.stop();

  return results;
}
