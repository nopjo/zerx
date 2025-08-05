import { text } from "@clack/prompts";
import { existsSync } from "fs";
import colors from "picocolors";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";
import { updateConfig, getConfigValue } from "./config";

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

  console.log(colors.green("[+] LDPlayer path saved to config.json"));

  return fullConsolePath;
}

export function printInstancesList(instances: LDPlayerInstance[]): void {
  console.log();
  console.log(
    colors.cyan("[-] " + colors.bold("Available LDPlayer Instances:"))
  );
  console.log();

  if (instances.length === 0) {
    console.log(colors.yellow("[!] No instances found"));
    console.log(colors.gray("   Create some LDPlayer instances first."));
    return;
  }

  instances.forEach((instance) => {
    const statusColor =
      instance.status === "Running" ? colors.green : colors.gray;

    console.log(
      colors.gray(`   ${instance.index}. `) +
        colors.white(instance.name) +
        " - " +
        statusColor(colors.bold(instance.status))
    );
  });

  console.log();
  console.log(
    colors.gray(
      `   Total: ${colors.white(instances.length.toString())} instance(s)`
    )
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
    console.log(
      colors.yellow(
        "   [!] Could not parse instance list, trying alternative method..."
      )
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
    console.log(colors.yellow("[~] Starting LDPlayer reboot process..."));

    const ldPath = await getLDPlayerPath();
    if (!ldPath) {
      console.log(colors.red("[X] LDPlayer path not configured"));
      return;
    }

    const instances = await getLDPlayerInstances(ldPath);
    const runningInstances = instances.filter((i) => i.status === "Running");

    if (runningInstances.length === 0) {
      console.log(colors.gray("[-] No running instances to reboot"));
      return;
    }

    console.log(
      colors.cyan(
        `[~] Rebooting ${runningInstances.length} running instances...`
      )
    );

    for (const instance of runningInstances) {
      console.log(colors.gray(`   [!] Stopping ${instance.name}...`));
      await execAsync(`"${ldPath}" quit --index ${instance.index}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(colors.gray("[~] Waiting for instances to stop..."));
    await new Promise((resolve) => setTimeout(resolve, 5000));

    for (const instance of runningInstances) {
      console.log(colors.gray(`   [^] Starting ${instance.name}...`));
      await execAsync(`"${ldPath}" launch --index ${instance.index}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(colors.green("[+] LDPlayer reboot complete!"));
    console.log(colors.gray("[~] Waiting for instances to fully start..."));
    await new Promise((resolve) => setTimeout(resolve, 10000));
  } catch (error) {
    console.log(colors.red(`[X] Reboot failed: ${error}`));
  }
}
