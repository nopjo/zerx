import { spinner } from "@clack/prompts";
import colors from "picocolors";
import {
  createCopy,
  getLDPlayerInstances,
  restoreBackup,
  renameInstance,
  type LDPlayerInstance,
} from "@/utils/ld";
import { Logger } from "@/utils/logger";
import type { CloneResult } from "./types";

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
    await createCopy(ldPath, sourceInstance.index, tempName);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const updatedInstances = await getLDPlayerInstances(ldPath);
    const newInstance = updatedInstances.find((inst) => inst.name === tempName);

    if (!newInstance) {
      throw new Error(
        `Failed to create instance "${tempName}" - instance not found after copy`
      );
    }

    cloneStepSpinner.message(
      colors.gray(`Restoring backup to ${cloneName}...`)
    );
    await restoreBackup(ldPath, newInstance.index, backupPath);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    cloneStepSpinner.message(
      colors.gray(`Renaming instance to ${cloneName}...`)
    );
    await renameInstance(ldPath, newInstance.index, cloneName);

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
  cloneCount: number,
  backupPath: string
): Promise<CloneResult[]> {
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
}
