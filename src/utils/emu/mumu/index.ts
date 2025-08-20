import { text } from "@clack/prompts";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";
import { updateConfig, getConfigValue } from "@/utils/config";
import { Logger } from "@/utils/logger";
import type { OptimizeConfiguration } from "@/tools/optimize-devices/types";

const execAsync = promisify(exec);

export interface MuMuInstance {
  index: number;
  name: string;
  status: string;
  isProcessStarted: boolean;
  isAndroidStarted: boolean;
}

export async function getMuMuPath(): Promise<string | null> {
  const savedPath = getConfigValue("mumuPath");

  if (savedPath && existsSync(savedPath)) {
    return savedPath;
  }

  const mumuPath = await text({
    message: "Enter the path to your MuMu Player installation directory:",
    placeholder: "C:\\Program Files\\Netease\\MuMuPlayer",
    validate: (value) => {
      if (!value) return "Path is required";
      if (!existsSync(value)) return "Directory not found at this path";

      const managerPath = path.join(value, "nx_main", "MuMuManager.exe");
      if (!existsSync(managerPath))
        return "MuMuManager.exe not found in nx_main subdirectory";
      return undefined;
    },
  });

  if (!mumuPath || typeof mumuPath === "symbol") return null;

  const fullManagerPath = path.join(mumuPath, "nx_main", "MuMuManager.exe");
  updateConfig("mumuPath", fullManagerPath);

  return fullManagerPath;
}

export async function getMuMuInstances(): Promise<MuMuInstance[]> {
  const managerPath = await getMuMuPath();
  if (!managerPath) {
    throw new Error("MuMu Player path not configured");
  }

  try {
    const { stdout } = await execAsync(`"${managerPath}" info --vmindex all`);
    const rawData = stdout.trim();

    const jsonData = JSON.parse(rawData);

    if (jsonData.index !== undefined) {
      return [
        {
          index: parseInt(jsonData.index),
          name: jsonData.name || "Unknown",
          status: jsonData.is_process_started ? "Running" : "Stopped",
          isProcessStarted: jsonData.is_process_started || false,
          isAndroidStarted: jsonData.is_android_started || false,
        },
      ];
    }

    const instances: MuMuInstance[] = [];
    for (const [key, value] of Object.entries(jsonData)) {
      const instanceData = value as any;
      if (
        instanceData &&
        typeof instanceData === "object" &&
        instanceData.index !== undefined
      ) {
        instances.push({
          index: parseInt(instanceData.index),
          name: instanceData.name || "Unknown",
          status: instanceData.is_process_started ? "Running" : "Stopped",
          isProcessStarted: instanceData.is_process_started || false,
          isAndroidStarted: instanceData.is_android_started || false,
        });
      }
    }

    return instances.sort((a, b) => a.index - b.index);
  } catch (error) {
    console.error("Error getting MuMu instances:", error);
    throw new Error(`Failed to get MuMu instances: ${error}`);
  }
}

export async function launchMuMuInstance(instanceIndex: number): Promise<void> {
  const managerPath = await getMuMuPath();
  if (!managerPath) {
    throw new Error("MuMu Player path not configured");
  }

  const command = `"${managerPath}" control --vmindex ${instanceIndex} launch`;
  await execAsync(command);
}

export async function stopMuMuInstance(instanceIndex: number): Promise<void> {
  const managerPath = await getMuMuPath();
  if (!managerPath) {
    throw new Error("MuMu Player path not configured");
  }

  const command = `"${managerPath}" control --vmindex ${instanceIndex} shutdown`;
  await execAsync(command);
}

export async function optimizeMuMuInstance(
  instanceIndex: number,
  config: OptimizeConfiguration
): Promise<void> {
  const managerPath = await getMuMuPath();
  if (!managerPath) {
    throw new Error("MuMu Player path not configured");
  }

  const [width, height, dpi] = config.resolution.split(",").map(Number);

  const ramInGB = (config.ram / 1024).toFixed(6);

  const settingsCommands = [
    `--key vm_cpu --value ${config.cores}`,
    `--key vm_mem --value ${ramInGB}`,
    `--key resolution_width --value ${width}.000000`,
    `--key resolution_height --value ${height}.000000`,
    `--key resolution_dpi --value ${dpi}.000000`,
    `--key resolution_mode --value custom`,
  ];

  const command = `"${managerPath}" setting --vmindex ${instanceIndex} ${settingsCommands.join(" ")}`;
  await execAsync(command);
}

export async function rebootAllMuMuInstances(): Promise<void> {
  try {
    Logger.warning("[~] Starting MuMu Player reboot process...");

    const managerPath = await getMuMuPath();
    if (!managerPath) {
      Logger.error("[X] MuMu Player path not configured");
      return;
    }

    const instances = await getMuMuInstances();
    const runningInstances = instances.filter((i) => i.status === "Running");

    if (runningInstances.length === 0) {
      Logger.muted("[-] No running instances to reboot");
      return;
    }

    Logger.info(
      `[~] Rebooting ${runningInstances.length} running instances...`
    );

    for (const instance of runningInstances) {
      Logger.muted(`[!] Stopping ${instance.name}...`, { indent: 1 });
      await stopMuMuInstance(instance.index);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    Logger.muted("[~] Waiting for instances to stop...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    for (const instance of runningInstances) {
      Logger.muted(`[^] Starting ${instance.name}...`, { indent: 1 });
      await launchMuMuInstance(instance.index);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    Logger.success("[+] MuMu Player reboot complete!");
    Logger.muted("[~] Waiting for instances to fully start...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  } catch (error) {
    Logger.error(`[X] Reboot failed: ${error}`);
  }
}

export async function createMuMuBackup(
  instanceIndex: number,
  backupDir: string
): Promise<string> {
  const managerPath = await getMuMuPath();
  if (!managerPath) {
    throw new Error("MuMu Player path not configured");
  }

  const instances = await getMuMuInstances();
  const instance = instances.find((i) => i.index === instanceIndex);
  const backupName = `${instance?.name || "Unknown"}_backup_${Date.now()}`;

  const command = `"${managerPath}" export --vmindex ${instanceIndex} --dir "${backupDir}" --name "${backupName}"`;
  await execAsync(command);

  return path.join(backupDir, `${backupName}.mumudata`);
}

export async function importMuMuBackup(
  backupFilePath: string,
  count: number = 1
): Promise<void> {
  const managerPath = await getMuMuPath();
  if (!managerPath) {
    throw new Error("MuMu Player path not configured");
  }

  const command = `"${managerPath}" import --path "${backupFilePath}" --number ${count}`;
  await execAsync(command);
}

export async function renameMuMuInstance(
  instanceIndex: number,
  newName: string
): Promise<void> {
  const managerPath = await getMuMuPath();
  if (!managerPath) {
    throw new Error("MuMu Player path not configured");
  }

  const command = `"${managerPath}" rename --vmindex ${instanceIndex} --name "${newName}"`;
  await execAsync(command);
}

export async function isMuMuInstanceRunning(
  instanceIndex: number
): Promise<boolean> {
  try {
    const instances = await getMuMuInstances();
    const instance = instances.find((i) => i.index === instanceIndex);
    return instance ? instance.isProcessStarted : false;
  } catch (error) {
    return false;
  }
}

export function printMuMuInstancesList(instances: MuMuInstance[]): void {
  console.log("Available MuMu Player Instances:");
  if (instances.length === 0) {
    console.log("  No instances found");
    return;
  }

  instances.forEach((instance) => {
    const androidStatus = instance.isAndroidStarted ? " (Android Ready)" : "";
    console.log(
      `  ${instance.index}. ${instance.name} - ${instance.status}${androidStatus}`
    );
  });

  console.log(`Total: ${instances.length} instance(s)`);
}
