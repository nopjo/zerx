import colors from "picocolors";
import {
  launchInstance,
  isInstanceRunning,
  type LDPlayerInstance,
} from "@/utils/ld";
import { Logger } from "@/utils/logger";
import type { LaunchResult } from "./types";

export async function launchSingleInstance(
  ldPath: string,
  instance: LDPlayerInstance
): Promise<LaunchResult> {
  try {
    Logger.muted(`[^] Launching: ${colors.white(instance.name)}...`, {
      indent: 1,
    });

    await launchInstance(ldPath, instance.index);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const isRunning = await isInstanceRunning(ldPath, instance.index);

    if (isRunning) {
      Logger.success(
        `[+] ${colors.white(instance.name)} launched successfully`,
        { indent: 1 }
      );
      return { instance, success: true };
    } else {
      Logger.warning(
        `[!] ${colors.white(instance.name)} launch status unclear`,
        { indent: 1 }
      );
      return { instance, success: true };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    Logger.error(
      `[X] ${colors.white(instance.name)} failed to launch: ${errorMsg}`,
      { indent: 1 }
    );
    return { instance, success: false, error: errorMsg };
  }
}

export async function launchInstancesSequentially(
  ldPath: string,
  instances: LDPlayerInstance[],
  delayMs: number
): Promise<LaunchResult[]> {
  const results: LaunchResult[] = [];

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];

    if (!instance) {
      Logger.error(`[X] Invalid instance at index ${i}`, { indent: 1 });
      continue;
    }

    Logger.info(`[#] Progress: ${i + 1}/${instances.length}`);

    const result = await launchSingleInstance(ldPath, instance);
    results.push(result);

    if (i < instances.length - 1 && delayMs > 0) {
      const delaySeconds = delayMs / 1000;
      Logger.muted(`[~] Waiting ${delaySeconds}s before next launch...`, {
        indent: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      Logger.space();
    }
  }

  return results;
}
