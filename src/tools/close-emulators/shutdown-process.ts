import { spinner } from "@clack/prompts";
import colors from "picocolors";
import {
  stopAllInstances,
  stopInstance,
  isInstanceRunning,
  type LDPlayerInstance,
} from "@/utils/emu/ld";
import { Logger } from "@/utils/logger";
import type { ShutdownResult } from "./types";

export async function performBulkShutdown(
  ldPath: string,
  runningInstances: LDPlayerInstance[]
): Promise<ShutdownResult[]> {
  const shutdownSpinner = spinner();

  try {
    shutdownSpinner.start(
      colors.gray("Shutting down all instances (fast method)...")
    );

    await stopAllInstances(ldPath);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    shutdownSpinner.stop(colors.green("[+] Shutdown command sent"));

    Logger.muted("[@] Verifying shutdown status...");

    return await verifyShutdownResults(ldPath, runningInstances);
  } catch (error) {
    shutdownSpinner.stop(colors.red("[X] Bulk shutdown failed"));
    throw error;
  }
}

export async function verifyShutdownResults(
  ldPath: string,
  instances: LDPlayerInstance[]
): Promise<ShutdownResult[]> {
  const verificationPromises = instances.map(async (instance) => {
    try {
      const isStillRunning = await isInstanceRunning(ldPath, instance.index);
      return {
        instance,
        success: !isStillRunning,
        isStillRunning,
      };
    } catch (error) {
      return {
        instance,
        success: true,
        isStillRunning: false,
      };
    }
  });

  return await Promise.all(verificationPromises);
}

export async function performIndividualShutdown(
  ldPath: string,
  failedInstances: ShutdownResult[]
): Promise<ShutdownResult[]> {
  Logger.warning("[!] Still running (attempting individual shutdown):", {
    spaceBefore: true,
  });

  const individualShutdownPromises = failedInstances.map(async (result) => {
    try {
      Logger.muted(`[!] Stopping: ${colors.white(result.instance.name)}...`, {
        indent: 1,
      });

      await stopInstance(ldPath, result.instance.index);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const isStillRunning = await isInstanceRunning(
        ldPath,
        result.instance.index
      );

      if (!isStillRunning) {
        Logger.success(
          `[+] ${colors.white(result.instance.name)} stopped successfully`,
          { indent: 1 }
        );
        return { instance: result.instance, success: true };
      } else {
        Logger.error(
          `[X] ${colors.white(result.instance.name)} failed to stop`,
          { indent: 1 }
        );
        return { instance: result.instance, success: false };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      Logger.error(
        `[X] ${colors.white(result.instance.name)} failed: ${errorMsg}`,
        { indent: 1 }
      );
      return { instance: result.instance, success: false, error: errorMsg };
    }
  });

  return await Promise.all(individualShutdownPromises);
}

export async function getFinalShutdownStatus(
  ldPath: string,
  instances: LDPlayerInstance[]
): Promise<number> {
  const finalStillRunning = await Promise.all(
    instances.map(async (instance) => {
      try {
        const isStillRunning = await isInstanceRunning(ldPath, instance.index);
        return isStillRunning ? instance : null;
      } catch {
        return null;
      }
    })
  );

  return finalStillRunning.filter(Boolean).length;
}
