import { text } from "@clack/prompts";
import { existsSync } from "fs";
import colors from "picocolors";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";
import { updateConfig, getConfigValue } from "./config";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

export interface LDPlayerInstance {
  index: number;
  name: string;
  status: string;
}

export async function getLDPlayerPath(): Promise<string | null> {
  const savedPath = getConfigValue("ldPlayerPath");

  if (savedPath && existsSync(savedPath)) {
    return savedPath;
  }

  const ldPath = await text({
    message: "Enter the full path to your LDPlayer directory:",
    placeholder: "D:\\LDPlayer\\LDPlayer9",
    validate: (value) => {
      if (!value) return "Path is required";
      const consolePath = path.join(value, "ldconsole.exe");
      if (!existsSync(consolePath))
        return "ldconsole.exe not found in this directory";
      return undefined;
    },
  });

  if (!ldPath || typeof ldPath === "symbol") return null;

  const fullConsolePath = path.join(ldPath, "ldconsole.exe");

  updateConfig("ldPlayerPath", fullConsolePath);

  Logger.success("[+] LDPlayer path saved to config.json");

  return fullConsolePath;
}

export function printInstancesList(instances: LDPlayerInstance[]): void {
  Logger.title("[-] Available LDPlayer Instances:");

  if (instances.length === 0) {
    Logger.warning("[!] No instances found");
    Logger.muted("Create some LDPlayer instances first.", { indent: 1 });
    return;
  }

  instances.forEach((instance) => {
    const statusColor =
      instance.status === "Running" ? colors.green : colors.gray;

    Logger.muted(
      `${instance.index}. ${colors.white(instance.name)} - ${statusColor(colors.bold(instance.status))}`,
      { indent: 1 }
    );
  });

  Logger.muted(
    `Total: ${colors.white(instances.length.toString())} instance(s)`,
    { indent: 1, spaceBefore: true }
  );
}

async function execLDCommand(
  ldPath: string,
  command: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    const fullCommand = `"${ldPath}" ${command}`;
    return await execAsync(fullCommand);
  } catch (error: any) {
    if (error.stderr && error.stderr.trim()) {
      throw new Error(`LDConsole command failed: ${error.stderr}`);
    } else if (
      error.message &&
      !error.message.includes("Command failed with exit code 0")
    ) {
      throw new Error(`LDConsole command failed: ${error.message}`);
    }

    return { stdout: error.stdout || "", stderr: error.stderr || "" };
  }
}

export async function isInstanceRunning(
  ldPath: string,
  instanceIndex: number
): Promise<boolean> {
  try {
    const { stdout } = await execLDCommand(
      ldPath,
      `isrunning --index ${instanceIndex}`
    );
    return stdout.trim().toLowerCase() === "running";
  } catch {
    return false;
  }
}

export async function getLDPlayerInstances(
  ldPath: string
): Promise<LDPlayerInstance[]> {
  try {
    const { stdout } = await execLDCommand(ldPath, "list2");
    const instances: LDPlayerInstance[] = [];

    const lines = stdout.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2] !== undefined) {
        const indexStr = parts[0];
        const nameStr = parts[1];
        const pidStr = parts[2];

        const index = parseInt(indexStr);
        const name = nameStr.trim();

        const status = pidStr && pidStr !== "0" ? "Running" : "Stopped";

        if (!isNaN(index) && name) {
          instances.push({
            index: index,
            name: name,
            status: status,
          });
        }
      }
    }

    return instances;
  } catch (error) {
    Logger.warning(
      "[!] Could not parse instance list, trying alternative method...",
      { indent: 1 }
    );
    return [];
  }
}

export async function stopInstance(
  ldPath: string,
  instanceIndex: number
): Promise<void> {
  await execLDCommand(ldPath, `quit --index ${instanceIndex}`);
}

export async function stopAllInstances(ldPath: string): Promise<void> {
  await execLDCommand(ldPath, "quitall");
}

export async function createBackup(
  ldPath: string,
  instanceIndex: number,
  backupPath: string
): Promise<void> {
  const command = `backup --index ${instanceIndex} --file "${backupPath}"`;
  await execLDCommand(ldPath, command);
}

export async function createCopy(
  ldPath: string,
  sourceIndex: number,
  newName: string
): Promise<void> {
  try {
    const command = `copy --name "${newName}" --from ${sourceIndex}`;
    await execLDCommand(ldPath, command);
  } catch (error: any) {
    if (
      error.message.includes("don't exist") ||
      error.message.includes("already exists")
    ) {
      throw error;
    }
  }
}

export async function restoreBackup(
  ldPath: string,
  instanceIndex: number,
  backupPath: string
): Promise<void> {
  const command = `restore --index ${instanceIndex} --file "${backupPath}"`;
  await execLDCommand(ldPath, command);
}

export async function renameInstance(
  ldPath: string,
  instanceIndex: number,
  newTitle: string
): Promise<void> {
  const command = `rename --index ${instanceIndex} --title "${newTitle}"`;
  await execLDCommand(ldPath, command);
}

export async function launchInstance(
  ldPath: string,
  instanceIndex: number
): Promise<void> {
  await execLDCommand(ldPath, `launch --index ${instanceIndex}`);
}

export async function rebootAllLDPlayerInstances(): Promise<void> {
  try {
    Logger.warning("[~] Starting LDPlayer reboot process...");

    const ldPath = await getLDPlayerPath();
    if (!ldPath) {
      Logger.error("[X] LDPlayer path not configured");
      return;
    }

    const instances = await getLDPlayerInstances(ldPath);
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
      await execAsync(`"${ldPath}" quit --index ${instance.index}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    Logger.muted("[~] Waiting for instances to stop...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    for (const instance of runningInstances) {
      Logger.muted(`[^] Starting ${instance.name}...`, { indent: 1 });
      await execAsync(`"${ldPath}" launch --index ${instance.index}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    Logger.success("[+] LDPlayer reboot complete!");
    Logger.muted("[~] Waiting for instances to fully start...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  } catch (error) {
    Logger.error(`[X] Reboot failed: ${error}`);
  }
}
