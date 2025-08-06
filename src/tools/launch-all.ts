import { text, spinner, outro, confirm } from "@clack/prompts";
import colors from "picocolors";
import {
  getLDPlayerInstances,
  getLDPlayerPath,
  isInstanceRunning,
  launchInstance,
  printInstancesList,
  type LDPlayerInstance,
} from "@/utils/ld";
import { Logger } from "@/utils/logger";

interface LaunchResult {
  instance: LDPlayerInstance;
  success: boolean;
  error?: string;
}

async function launchSingleInstance(
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

export async function launchAllEmulators(): Promise<void> {
  Logger.title("[^] Launch All Emulators");
  Logger.muted("Boot up all stopped LDPlayer instances", { indent: 1 });

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

  const stoppedInstances = instances.filter(
    (instance) => instance.status === "Stopped"
  );
  const runningInstances = instances.filter(
    (instance) => instance.status === "Running"
  );

  if (stoppedInstances.length === 0) {
    Logger.success("All instances are already running!", { spaceBefore: true });
    outro(
      colors.cyan(
        `[*] ${runningInstances.length}/${instances.length} instances running`
      )
    );
    return;
  }

  Logger.warning(
    `[!] Found ${colors.bold(
      stoppedInstances.length.toString()
    )} stopped instance(s)`,
    { spaceBefore: true }
  );
  Logger.success(
    `[+] Found ${colors.bold(
      runningInstances.length.toString()
    )} running instance(s)`
  );

  const delayBetweenLaunches = await text({
    message: "Delay between each launch (in seconds):",
    placeholder: "3",
    validate: (value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 60)
        return "Enter a number between 0 and 60 seconds";
      return undefined;
    },
  });

  if (!delayBetweenLaunches || typeof delayBetweenLaunches === "symbol") {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const delayMs = parseFloat(String(delayBetweenLaunches)) * 1000;

  const shouldProceed = await confirm({
    message: `Launch ${colors.bold(
      stoppedInstances.length.toString()
    )} stopped instance(s) with ${colors.bold(
      delayBetweenLaunches.toString()
    )}s delay between each?`,
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.success("[^] Starting sequential launch operation...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const results: LaunchResult[] = [];

  for (let i = 0; i < stoppedInstances.length; i++) {
    const instance = stoppedInstances[i];

    if (!instance) {
      Logger.error(`[X] Invalid instance at index ${i}`, { indent: 1 });
      continue;
    }

    Logger.info(`[#] Progress: ${i + 1}/${stoppedInstances.length}`);

    const result = await launchSingleInstance(ldPath, instance);
    results.push(result);

    if (i < stoppedInstances.length - 1 && delayMs > 0) {
      Logger.muted(
        `[~] Waiting ${delayBetweenLaunches}s before next launch...`,
        { indent: 1 }
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      Logger.space();
    }
  }

  Logger.title("[^] Launch Results:");

  const successfulLaunches = results.filter((result) => result.success);
  const failedLaunches = results.filter((result) => !result.success);

  if (successfulLaunches.length > 0) {
    Logger.success("[+] Successfully launched:");
    for (const result of successfulLaunches) {
      Logger.success(`• ${result.instance.name}`, { indent: 1 });
    }
  }

  if (failedLaunches.length > 0) {
    Logger.error("[X] Failed to launch:", { spaceBefore: true });
    for (const result of failedLaunches) {
      Logger.error(`• ${result.instance.name}: ${result.error}`, { indent: 1 });
    }
  }

  if (failedLaunches.length === 0) {
    outro(
      colors.green(
        `All instances launched successfully! (${successfulLaunches.length}/${stoppedInstances.length})`
      )
    );
  } else if (successfulLaunches.length > 0) {
    outro(
      colors.yellow(
        `[!] Some launches failed. (${successfulLaunches.length}/${stoppedInstances.length} successful)`
      )
    );
  } else {
    outro(
      colors.red(
        `[X] All launches failed. (0/${stoppedInstances.length} instances)`
      )
    );
  }
}
