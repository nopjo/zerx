import { exec } from "child_process";
import { promisify } from "util";
import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { LDPlayerInstance } from "@/utils/emu/ld";
import type { CloneResult } from "./types";

const execAsync = promisify(exec);

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

export async function createSingleClone(
  ldPath: string,
  sourceInstance: LDPlayerInstance,
  cloneName: string,
  backupPath: string,
  cloneIndex: number,
  totalClones: number
): Promise<CloneResult> {
  const cloneStepSpinner = spinner();
  cloneStepSpinner.start(
    colors.gray(`Creating clone ${cloneIndex}/${totalClones}: ${cloneName}...`)
  );

  try {
    const tempName = `temp_clone_${Date.now()}_${cloneIndex}`;

    await execLDCommand(
      ldPath,
      `copy --name "${tempName}" --from ${sourceInstance.index}`
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const { stdout } = await execLDCommand(ldPath, "list2");
    const lines = stdout.split("\n").filter((line) => line.trim());

    let newInstanceIndex: number | null = null;
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length >= 2 && parts[1]?.trim() === tempName && parts[0]) {
        newInstanceIndex = parseInt(parts[0]);
        break;
      }
    }

    if (newInstanceIndex === null) {
      throw new Error(`Failed to find newly created instance "${tempName}"`);
    }

    cloneStepSpinner.message(
      colors.gray(`Restoring backup to ${cloneName}...`)
    );
    await execLDCommand(
      ldPath,
      `restore --index ${newInstanceIndex} --file "${backupPath}"`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    cloneStepSpinner.message(
      colors.gray(`Renaming instance to ${cloneName}...`)
    );
    await execLDCommand(
      ldPath,
      `rename --index ${newInstanceIndex} --title "${cloneName}"`
    );

    cloneStepSpinner.stop(
      colors.green(`[+] Clone ${cloneIndex} created: ${cloneName}`)
    );

    return {
      cloneName,
      success: true,
    };
  } catch (error) {
    cloneStepSpinner.stop(
      colors.red(`[X] Failed to create clone ${cloneIndex}`)
    );
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    Logger.error(`Error: ${errorMessage}`, { indent: 1 });

    return {
      cloneName,
      success: false,
      error: errorMessage,
    };
  }
}

export async function executeCloneProcess(
  ldPath: string,
  sourceInstance: LDPlayerInstance,
  newInstanceName: string,
  cloneCount: number
): Promise<CloneResult[]> {
  const backupSpinner = spinner();
  backupSpinner.start(
    colors.gray("Preparing source instance and creating backup...")
  );

  try {
    const { stdout: statusCheck } = await execLDCommand(
      ldPath,
      `isrunning --index ${sourceInstance.index}`
    );
    if (statusCheck.trim().toLowerCase() === "running") {
      await execLDCommand(ldPath, `quit --index ${sourceInstance.index}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .split(".")[0];
    const backupPath = `${process.cwd()}\\ldplayer_backups\\${sourceInstance.name}_backup_${timestamp}.ldbk`;

    await execLDCommand(
      ldPath,
      `backup --index ${sourceInstance.index} --file "${backupPath}"`
    );
    backupSpinner.stop(colors.green("[+] Backup created"));

    const results: CloneResult[] = [];

    for (let i = 1; i <= cloneCount; i++) {
      const cloneName =
        cloneCount === 1 ? newInstanceName : `${newInstanceName}-${i}`;

      const result = await createSingleClone(
        ldPath,
        sourceInstance,
        cloneName,
        backupPath,
        i,
        cloneCount
      );

      results.push(result);
    }

    return results;
  } catch (error) {
    backupSpinner.stop(colors.red("[X] Backup creation failed"));
    throw error;
  }
}
