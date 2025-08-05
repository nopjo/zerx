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

export async function closeAllEmulators(): Promise<void> {
  console.log();
  console.log(colors.cyan("[!] " + colors.bold("Close All Emulators")));
  console.log(colors.gray("   Shut down all running LDPlayer instances"));
  console.log();

  console.log(
    colors.gray("[>] Please specify your LDPlayer installation path...")
  );
  const ldPath = await getLDPlayerPath();

  if (!ldPath) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  console.log(colors.green(`[+] Using LDPlayer at: ${ldPath}`));

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
    console.log();
    console.log(colors.green("All instances are already stopped!"));
    outro(
      colors.cyan(
        `[*] ${stoppedInstances.length}/${instances.length} instances stopped`
      )
    );
    return;
  }

  console.log();
  console.log(
    colors.yellow(
      `[!] Found ${colors.bold(
        runningInstances.length.toString()
      )} running instance(s)`
    )
  );
  console.log(
    colors.green(
      `[+] Found ${colors.bold(
        stoppedInstances.length.toString()
      )} stopped instance(s)`
    )
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

  console.log();
  console.log(colors.yellow("[!] Starting shutdown operation..."));
  console.log();

  const shutdownSpinner = spinner();

  try {
    shutdownSpinner.start(
      colors.gray("Shutting down all instances (fast method)...")
    );

    await stopAllInstances(ldPath);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    shutdownSpinner.stop(colors.green("[+] Shutdown command sent"));

    console.log(colors.gray("[@] Verifying shutdown status..."));

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

    console.log();
    console.log(colors.cyan("[!] " + colors.bold("Shutdown Results:")));
    console.log();

    if (successfullyStopped.length > 0) {
      console.log(colors.green("[+] Successfully stopped:"));
      for (const result of successfullyStopped) {
        console.log(colors.green(`   • ${result.instance.name}`));
      }
    }

    if (stillRunning.length > 0) {
      console.log();
      console.log(
        colors.yellow("[!] Still running (attempting individual shutdown):")
      );

      const individualShutdownPromises = stillRunning.map(async (result) => {
        try {
          console.log(
            colors.gray(
              `   [!] Stopping: ${colors.white(result.instance.name)}...`
            )
          );

          await stopInstance(ldPath, result.instance.index);
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const isStillRunning = await isInstanceRunning(
            ldPath,
            result.instance.index
          );

          if (!isStillRunning) {
            console.log(
              colors.green(
                `   [+] ${colors.white(
                  result.instance.name
                )} stopped successfully`
              )
            );
            return { instance: result.instance, success: true };
          } else {
            console.log(
              colors.red(
                `   [X] ${colors.white(result.instance.name)} failed to stop`
              )
            );
            return { instance: result.instance, success: false };
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          console.log(
            colors.red(
              `   [X] ${colors.white(result.instance.name)} failed: ${errorMsg}`
            )
          );
          return { instance: result.instance, success: false, error: errorMsg };
        }
      });

      const individualResults = await Promise.all(individualShutdownPromises);
      const finalFailures = individualResults.filter(
        (result) => !result.success
      );

      if (finalFailures.length > 0) {
        console.log();
        console.log(colors.red("[X] Failed to stop:"));
        for (const result of finalFailures) {
          console.log(
            colors.red(
              `   • ${result.instance.name}${
                result.error ? `: ${result.error}` : ""
              }`
            )
          );
        }
      }
    }

    console.log();

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
    console.log();
    console.log(colors.red("[X] Shutdown operation failed"));
    console.log(
      colors.red(
        `   Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    outro(colors.red("[X] Please try closing instances manually"));
  }
}
