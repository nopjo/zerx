import { outro, confirm, spinner, select } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { getLDPlayerPath } from "@/utils/ld";
import { getLDPlayerInstances, type LDPlayerInstance } from "@/utils/ld";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

interface OptimizeResult {
  instanceName: string;
  instanceIndex: number;
  isSuccess: boolean;
  error?: string;
  wasRunning: boolean;
}

const coreOptions = [
  { value: 1, label: "1 Core - Ultra Light" },
  { value: 2, label: "2 Cores - Light" },
  { value: 3, label: "3 Cores - Moderate" },
  { value: 4, label: "4 Cores - Balanced" },
  { value: 6, label: "6 Cores - High Performance" },
  { value: 8, label: "8 Cores - Maximum Performance" },
];

const ramOptions = [
  {
    value: 1536,
    label:
      "1536 MB (1.5 GB) - Testing Only (Not recommended for multiple Roblox)",
  },
  { value: 2048, label: "2048 MB (2 GB) - Light (1 Roblox instances max)" },
  { value: 3072, label: "3072 MB (3 GB) - Basic (2 Roblox instances)" },
  { value: 4096, label: "4096 MB (4 GB) - Recommended (2-3 Roblox instances)" },
  {
    value: 6144,
    label: "6144 MB (6 GB) - High Performance (3-4 Roblox instances)",
  },
  { value: 8192, label: "8192 MB (8 GB) - Maximum (5+ Roblox instances)" },
];

const resolutionOptions = [
  {
    value: "320,180,60",
    label: "320x180 @ 60 DPI - Ultra Performance (Recommended)",
  },
  { value: "400,240,60", label: "400x240 @ 60 DPI - High Performance" },
  { value: "480,270,70", label: "480x270 @ 70 DPI - Balanced" },
  { value: "540,300,80", label: "540x300 @ 80 DPI - Good Quality" },
  { value: "640,360,90", label: "640x360 @ 90 DPI - High Quality" },
  { value: "720,405,100", label: "720x405 @ 100 DPI - Premium" },
  { value: "800,450,100", label: "800x450 @ 100 DPI - Ultra Quality" },
  { value: "960,540,110", label: "960x540 @ 110 DPI - Maximum Quality" },
  { value: "1280,720,120", label: "1280x720 @ 120 DPI - Full HD" },
];

async function getCustomConfiguration() {
  Logger.info("[>] Device Optimization Configuration", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const cores = await select({
    message: "Select CPU cores:",
    options: coreOptions,
  });

  if (!cores || typeof cores === "symbol") {
    return null;
  }

  const ram = await select({
    message: "Select RAM allocation:",
    options: ramOptions,
  });

  if (!ram || typeof ram === "symbol") {
    return null;
  }

  const resolution = await select({
    message: "Select resolution:",
    options: resolutionOptions,
  });

  if (!resolution || typeof resolution === "symbol") {
    return null;
  }

  return {
    cores: Number(cores),
    ram: Number(ram),
    resolution: String(resolution),
  };
}

async function optimizeInstance(
  ldPath: string,
  instance: LDPlayerInstance,
  config: { cores: number; ram: number; resolution: string }
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

export async function optimizeDevices(): Promise<void> {
  Logger.title("[*] Optimize Devices");
  Logger.muted(
    "Configure CPU, RAM, and resolution settings for your instances",
    { indent: 1 }
  );

  Logger.muted("[>] Getting your LDPlayer installation path...");
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

  Logger.info("[#] Available LDPlayer Instances:", { spaceBefore: true });
  for (const instance of instances) {
    const statusColor =
      instance.status === "Running" ? colors.green : colors.gray;
    Logger.normal(
      `${colors.cyan(instance.index.toString())}. ${colors.white(
        instance.name
      )} ${statusColor(`[${instance.status}]`)}`,
      { indent: 1 }
    );
  }
  Logger.space();

  const config = await getCustomConfiguration();
  if (!config) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.warning("[>] Selected Configuration:", { spaceBefore: true });
  Logger.muted(`CPU Cores: ${config.cores}`, { indent: 1 });
  Logger.muted(`RAM: ${config.ram} MB`, { indent: 1 });
  Logger.muted(
    `Resolution: ${config.resolution.replace(/,/g, "x").replace(/x(\d+)$/, " @ $1 DPI")}`,
    { indent: 1 }
  );

  Logger.warning("[!] Important Notes:", { spaceBefore: true });
  Logger.muted("• Each Roblox instance uses ~0.7 CPU cores and ~1GB RAM", {
    indent: 1,
  });
  Logger.muted("• 4GB+ RAM recommended for running 3+ Roblox instances", {
    indent: 1,
  });
  Logger.muted("• Performance is highly game dependent", { indent: 1 });
  Logger.muted("• Complex games require more resources", { indent: 1 });
  Logger.muted("• Monitor system resources during use", { indent: 1 });

  const runningInstances = instances.filter((i) => i.status === "Running");
  if (runningInstances.length > 0) {
    Logger.warning("[!] Running Instances Notice:", { spaceBefore: true });
    Logger.muted(
      `${runningInstances.length} instance(s) are currently running`,
      { indent: 1 }
    );
    Logger.muted("These will be temporarily stopped to apply settings", {
      indent: 1,
    });
  }

  const optimizeMode = await select({
    message: "Which instances should be optimized?",
    options: [
      {
        value: "all",
        label: `[*] Optimize all instances (${instances.length} instances)`,
      },
      {
        value: "running-only",
        label: `[+] Only currently running instances (${runningInstances.length} instances)`,
      },
      {
        value: "stopped-only",
        label: `[-] Only stopped instances (${
          instances.length - runningInstances.length
        } instances)`,
      },
    ],
  });

  if (!optimizeMode || typeof optimizeMode === "symbol") {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  let instancesToOptimize: LDPlayerInstance[] = [];

  switch (optimizeMode) {
    case "all":
      instancesToOptimize = instances;
      break;
    case "running-only":
      instancesToOptimize = runningInstances;
      break;
    case "stopped-only":
      instancesToOptimize = instances.filter((i) => i.status !== "Running");
      break;
  }

  if (instancesToOptimize.length === 0) {
    outro(
      colors.yellow("[@] No instances to optimize with the selected filter")
    );
    return;
  }

  const shouldProceed = await confirm({
    message: `Apply configuration (${config.cores} cores, ${config.ram}MB RAM, ${config.resolution.replace(/,/g, "x").replace(/x(\d+)$/, " @ $1 DPI")}) to ${colors.bold(
      instancesToOptimize.length.toString()
    )} LDPlayer instance(s)?`,
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.success("[^] Starting optimization process...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const optimizeSpinner = spinner();
  optimizeSpinner.start(colors.gray("Optimizing instances..."));

  const results: OptimizeResult[] = [];

  for (const instance of instancesToOptimize) {
    optimizeSpinner.message(colors.gray(`Optimizing ${instance.name}...`));
    const result = await optimizeInstance(ldPath, instance, config);
    results.push(result);
  }

  optimizeSpinner.stop();

  Logger.title("[*] Optimization Results:");

  const successfulOptimizations = results.filter((result) => result.isSuccess);

  for (const result of results) {
    if (result.isSuccess) {
      const runningNote = result.wasRunning ? " (was restarted)" : "";
      Logger.success(
        `[+] ${result.instanceName} - Optimized with custom settings${runningNote}`,
        { indent: 1 }
      );
    } else {
      Logger.error(
        `[X] ${result.instanceName} - ${result.error || "Optimization failed"}`,
        { indent: 1 }
      );
    }
  }

  const previouslyRunning = results.filter((r) => r.wasRunning && r.isSuccess);
  if (previouslyRunning.length > 0) {
    const shouldRestart = await confirm({
      message: `Restart the ${previouslyRunning.length} instance(s) that were previously running?`,
    });

    if (shouldRestart) {
      const restartSpinner = spinner();
      restartSpinner.start(colors.gray("Restarting instances..."));

      for (const result of previouslyRunning) {
        try {
          restartSpinner.message(
            colors.gray(`Starting ${result.instanceName}...`)
          );
          await execAsync(`"${ldPath}" launch --index ${result.instanceIndex}`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          Logger.warning(
            `[!] Failed to restart ${result.instanceName}: ${error}`
          );
        }
      }

      restartSpinner.stop(colors.green("[+] Restart complete"));
    }
  }

  if (successfulOptimizations.length === instancesToOptimize.length) {
    outro(
      colors.green(
        `✅ All instances optimized successfully! (${successfulOptimizations.length}/${instancesToOptimize.length} instances)`
      )
    );
  } else if (successfulOptimizations.length > 0) {
    outro(
      colors.yellow(
        `[!] Some optimizations failed. (${successfulOptimizations.length}/${instancesToOptimize.length} successful)`
      )
    );
  } else {
    outro(
      colors.red(
        `[X] All optimization failed. (0/${instancesToOptimize.length} instances)`
      )
    );
  }
}
