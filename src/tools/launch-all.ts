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
    console.log(
      colors.gray(`   [^] Launching: ${colors.white(instance.name)}...`)
    );

    await launchInstance(ldPath, instance.index);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const isRunning = await isInstanceRunning(ldPath, instance.index);

    if (isRunning) {
      console.log(
        colors.green(
          `   [+] ${colors.white(instance.name)} launched successfully`
        )
      );
      return { instance, success: true };
    } else {
      console.log(
        colors.yellow(
          `   [!] ${colors.white(instance.name)} launch status unclear`
        )
      );
      return { instance, success: true };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.log(
      colors.red(
        `   [X] ${colors.white(instance.name)} failed to launch: ${errorMsg}`
      )
    );
    return { instance, success: false, error: errorMsg };
  }
}

export async function launchAllEmulators(): Promise<void> {
  console.log();
  console.log(colors.cyan("[^] " + colors.bold("Launch All Emulators")));
  console.log(colors.gray("   Boot up all stopped LDPlayer instances"));
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

  const stoppedInstances = instances.filter(
    (instance) => instance.status === "Stopped"
  );
  const runningInstances = instances.filter(
    (instance) => instance.status === "Running"
  );

  if (stoppedInstances.length === 0) {
    console.log();
    console.log(colors.green("All instances are already running!"));
    outro(
      colors.cyan(
        `[*] ${runningInstances.length}/${instances.length} instances running`
      )
    );
    return;
  }

  console.log();
  console.log(
    colors.yellow(
      `[!] Found ${colors.bold(
        stoppedInstances.length.toString()
      )} stopped instance(s)`
    )
  );
  console.log(
    colors.green(
      `[+] Found ${colors.bold(
        runningInstances.length.toString()
      )} running instance(s)`
    )
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

  console.log();
  console.log(colors.green("[^] Starting sequential launch operation..."));
  console.log();

  const results: LaunchResult[] = [];

  for (let i = 0; i < stoppedInstances.length; i++) {
    const instance = stoppedInstances[i];

    if (!instance) {
      console.log(colors.red(`   [X] Invalid instance at index ${i}`));
      continue;
    }

    console.log(
      colors.cyan(`[#] Progress: ${i + 1}/${stoppedInstances.length}`)
    );

    const result = await launchSingleInstance(ldPath, instance);
    results.push(result);

    if (i < stoppedInstances.length - 1 && delayMs > 0) {
      console.log(
        colors.gray(
          `   [~] Waiting ${delayBetweenLaunches}s before next launch...`
        )
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      console.log();
    }
  }

  console.log();
  console.log(colors.cyan("[^] " + colors.bold("Launch Results:")));
  console.log();

  const successfulLaunches = results.filter((result) => result.success);
  const failedLaunches = results.filter((result) => !result.success);

  if (successfulLaunches.length > 0) {
    console.log(colors.green("[+] Successfully launched:"));
    for (const result of successfulLaunches) {
      console.log(colors.green(`   • ${result.instance.name}`));
    }
  }

  if (failedLaunches.length > 0) {
    console.log();
    console.log(colors.red("[X] Failed to launch:"));
    for (const result of failedLaunches) {
      console.log(colors.red(`   • ${result.instance.name}: ${result.error}`));
    }
  }

  console.log();

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
