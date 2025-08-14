import { select, text } from "@clack/prompts";
import colors from "picocolors";
import { getLDPlayerInstances, type LDPlayerInstance } from "@/utils/ld";
import { Logger } from "@/utils/logger";
import type { CloneConfiguration } from "./types";

export async function loadInstances(
  ldPath: string
): Promise<LDPlayerInstance[]> {
  try {
    const instances = await getLDPlayerInstances(ldPath);
    return instances;
  } catch (error) {
    throw new Error(
      `Failed to load instances: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export function displayInstances(instances: LDPlayerInstance[]): void {
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
}

export async function getCloneConfiguration(
  instances: LDPlayerInstance[]
): Promise<CloneConfiguration | null> {
  const instanceOptions = instances.map((instance) => ({
    value: instance.name,
    label: `${instance.name} [${instance.status}]`,
  }));

  const sourceInstance = await select({
    message: "Select the VM to clone:",
    options: instanceOptions,
  });

  if (!sourceInstance || typeof sourceInstance === "symbol") {
    return null;
  }

  const sourceInstanceName = String(sourceInstance);
  const sourceInstanceObj = instances.find(
    (i) => i.name === sourceInstanceName
  );

  if (!sourceInstanceObj) {
    throw new Error("Source instance not found");
  }

  const newInstanceName = await text({
    message: "Enter name for the new cloned VM:",
    placeholder: "MyClonedVM",
    validate: (value) => {
      if (!value) return "Name is required";
      if (instances.some((i) => i.name === value)) return "Name already exists";
      return undefined;
    },
  });

  if (!newInstanceName || typeof newInstanceName === "symbol") {
    return null;
  }

  const cloneCount = await text({
    message: "How many clones do you want to create?",
    placeholder: "1",
    validate: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 1 || num > 100)
        return "Enter a number between 1 and 100";
      return undefined;
    },
  });

  if (!cloneCount || typeof cloneCount === "symbol") {
    return null;
  }

  return {
    sourceInstance: sourceInstanceObj,
    newInstanceName: String(newInstanceName),
    cloneCount: parseInt(String(cloneCount)),
  };
}
