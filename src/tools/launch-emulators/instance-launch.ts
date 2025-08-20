import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type {
  EmulatorInstance,
  EmulatorService,
} from "@/utils/emu/abstraction";

export interface LaunchResult {
  instance: EmulatorInstance;
  success: boolean;
  error?: string;
}

export async function launchSingleInstance(
  emulatorService: EmulatorService,
  instance: EmulatorInstance
): Promise<LaunchResult> {
  try {
    Logger.muted(`[^] Launching: ${colors.white(instance.name)}...`, {
      indent: 1,
    });

    await emulatorService.launchInstance(instance.index);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const isRunning = await emulatorService.isInstanceRunning(instance.index);

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
  emulatorService: EmulatorService,
  instances: EmulatorInstance[],
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

    const result = await launchSingleInstance(emulatorService, instance);
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
