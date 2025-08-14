import { exec } from "child_process";
import { promisify } from "util";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { LDPlayerInstance } from "@/utils/ld";
import type { OptimizeResult, OptimizeConfiguration } from "./types";

const execAsync = promisify(exec);

export async function optimizeInstance(
  ldPath: string,
  instance: LDPlayerInstance,
  config: OptimizeConfiguration
): Promise<OptimizeResult> {
  const result: OptimizeResult = {
    instanceName: instance.name,
    instanceIndex: instance.index,
    isSuccess: false,
    wasRunning: instance.status === "Running",
  };

  try {
    if (instance.status === "Running") {
      Logger.muted(`[>] Stopping ${instance.name}...`, { indent: 1 });
      await execAsync(`"${ldPath}" quit --index ${instance.index}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    Logger.muted(`[>] Optimizing ${instance.name}...`, { indent: 1 });
    await execAsync(
      `"${ldPath}" modify --index ${instance.index} --resolution ${config.resolution} --cpu ${config.cores} --memory ${config.ram}`
    );

    Logger.muted(`[+] ${instance.name} optimized`, { indent: 1 });
    result.isSuccess = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    Logger.error(`[X] Failed to optimize ${instance.name}: ${result.error}`, {
      indent: 1,
    });
    return result;
  }
}

export async function optimizeAllInstances(
  ldPath: string,
  instances: LDPlayerInstance[],
  config: OptimizeConfiguration
): Promise<OptimizeResult[]> {
  Logger.success("[^] Starting optimization process...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const optimizeSpinner = spinner();
  optimizeSpinner.start(colors.gray("Optimizing instances..."));

  const results: OptimizeResult[] = [];

  for (const instance of instances) {
    optimizeSpinner.message(colors.gray(`Optimizing ${instance.name}...`));
    const result = await optimizeInstance(ldPath, instance, config);
    results.push(result);
  }

  optimizeSpinner.stop();
  return results;
}

export async function restartPreviouslyRunningInstances(
  ldPath: string,
  previouslyRunning: OptimizeResult[]
): Promise<void> {
  const restartSpinner = spinner();
  restartSpinner.start(colors.gray("Restarting instances..."));

  for (const result of previouslyRunning) {
    try {
      restartSpinner.message(colors.gray(`Starting ${result.instanceName}...`));
      await execAsync(`"${ldPath}" launch --index ${result.instanceIndex}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      Logger.warning(`[!] Failed to restart ${result.instanceName}: ${error}`);
    }
  }

  restartSpinner.stop(colors.green("[+] Restart complete"));
}
