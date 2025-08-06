import { spinner, outro, confirm } from "@clack/prompts";
import colors from "picocolors";
import {
  getLDPlayerInstances,
  getLDPlayerPath,
  isInstanceRunning,
  printInstancesList,
  stopAllInstances,
  stopInstance,
  type LDPlayerInstance,
} from "@/utils/ld";
import { Logger } from "@/utils/logger";

export async function closeAllEmulators(): Promise<void> {
  Logger.title("[!] Close All Emulators");
  Logger.muted("Shut down all running LDPlayer instances", { indent: 1 });

  Logger.muted("[>] Please specify your LDPlayer installation path...");
  const ldPath = await getLDPlayerPath();

  if (!ldPath) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.success(`[+] Using LDPlayer at: ${ldPath}`);

  const loadingSpinner = spinner();
  loadingSpinner.start(colors.gray("Loading LDPlayer instances..."));

  let instances: LDPlayerInstance[] = [];
  try {
    instances = await getLDPlayerInstances(ldPath);
  } catch (error) {
    loadingSpinner.stop(colors.red("[X] Failed to load instances"));
    outro(
      colors.red(
        `[X] Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    return;
  }

  loadingSpinner.stop(colors.green("[+] Instances loaded"));

  if (instances.length === 0) {
    outro(
      colors.red(
        "[X] No LDPlayer instances found. Create some instances first."
      )
    );
    return;
  }

  printInstancesList(instances);

  const runningInstances = instances.filter(
    (instance) => instance.status === "Running"
  );
  const stoppedInstances = instances.filter(
    (instance) => instance.status === "Stopped"
  );

  if (runningInstances.length === 0) {
    Logger.success("All instances are already stopped!", { spaceBefore: true });
    outro(
      colors.cyan(
        `[*] ${stoppedInstances.length}/${instances.length} instances stopped`
      )
    );
    return;
  }

  Logger.warning(
    `[!] Found ${colors.bold(
      runningInstances.length.toString()
    )} running instance(s)`,
    { spaceBefore: true }
  );
  Logger.success(
    `[+] Found ${colors.bold(
      stoppedInstances.length.toString()
    )} stopped instance(s)`
  );

  const shouldProceed = await confirm({
    message: `Close ${colors.bold(
      runningInstances.length.toString()
    )} running instance(s)?`,
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.warning("[!] Starting shutdown operation...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const shutdownSpinner = spinner();

  try {
    shutdownSpinner.start(
      colors.gray("Shutting down all instances (fast method)...")
    );

    await stopAllInstances(ldPath);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    shutdownSpinner.stop(colors.green("[+] Shutdown command sent"));

    Logger.muted("[@] Verifying shutdown status...");

    const verificationPromises = runningInstances.map(async (instance) => {
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

    const verificationResults = await Promise.all(verificationPromises);

    const stillRunning = verificationResults.filter(
      (result) => result.isStillRunning
    );
    const successfullyStopped = verificationResults.filter(
      (result) => !result.isStillRunning
    );

    Logger.title("[!] Shutdown Results:");

    if (successfullyStopped.length > 0) {
      Logger.success("[+] Successfully stopped:");
      for (const result of successfullyStopped) {
        Logger.success(`• ${result.instance.name}`, { indent: 1 });
      }
    }

    if (stillRunning.length > 0) {
      Logger.warning("[!] Still running (attempting individual shutdown):", {
        spaceBefore: true,
      });

      const individualShutdownPromises = stillRunning.map(async (result) => {
        try {
          Logger.muted(
            `[!] Stopping: ${colors.white(result.instance.name)}...`,
            { indent: 1 }
          );

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
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          Logger.error(
            `[X] ${colors.white(result.instance.name)} failed: ${errorMsg}`,
            { indent: 1 }
          );
          return { instance: result.instance, success: false, error: errorMsg };
        }
      });

      const individualResults = await Promise.all(individualShutdownPromises);
      const finalFailures = individualResults.filter(
        (result) => !result.success
      );

      if (finalFailures.length > 0) {
        Logger.error("[X] Failed to stop:", { spaceBefore: true });
        for (const result of finalFailures) {
          Logger.error(
            `• ${result.instance.name}${
              result.error ? `: ${result.error}` : ""
            }`,
            { indent: 1 }
          );
        }
      }
    }

    Logger.space();

    const totalSuccessful =
      successfullyStopped.length +
      (stillRunning.length > 0
        ? stillRunning.filter(async (result) => {
            try {
              return !(await isInstanceRunning(ldPath, result.instance.index));
            } catch {
              return true;
            }
          }).length
        : 0);

    if (stillRunning.length === 0) {
      outro(
        colors.green(
          `All instances stopped successfully! (${runningInstances.length}/${runningInstances.length})`
        )
      );
    } else {
      const finalStillRunning = await Promise.all(
        stillRunning.map(async (result) => {
          try {
            const isStillRunning = await isInstanceRunning(
              ldPath,
              result.instance.index
            );
            return isStillRunning ? result : null;
          } catch {
            return null;
          }
        })
      );

      const actuallyStillRunning = finalStillRunning.filter(Boolean).length;

      if (actuallyStillRunning === 0) {
        outro(
          colors.green(
            `All instances stopped successfully! (${runningInstances.length}/${runningInstances.length})`
          )
        );
      } else {
        outro(
          colors.yellow(
            `[!] Some instances may still be running. (${
              runningInstances.length - actuallyStillRunning
            }/${runningInstances.length} stopped)`
          )
        );
      }
    }
  } catch (error) {
    shutdownSpinner.stop(colors.red("[X] Shutdown failed"));
    Logger.error("Shutdown operation failed", { spaceBefore: true });
    Logger.error(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { indent: 1 }
    );
    outro(colors.red("[X] Please try closing instances manually"));
  }
}
