import { select } from "@/utils/prompts";
import type { InstanceWithUser, CloseMode } from "./types";

export async function getCloseMode(
  runningInstanceCount: number
): Promise<CloseMode | null> {
  const closeMode = await select({
    message: "How would you like to close Roblox instances?",
    options: [
      {
        value: "all-running",
        label: `[X] Close All (${runningInstanceCount} running)`,
      },
      {
        value: "by-instance",
        label: "[-] Select Specific Users / Instances to Close",
      },
    ],
  });

  if (!closeMode || typeof closeMode === "symbol") {
    return null;
  }

  return closeMode as CloseMode;
}

export async function selectSpecificInstance(
  instances: InstanceWithUser[]
): Promise<InstanceWithUser | null> {
  const instanceOptions = instances.map((instance, index) => {
    const deviceName = instance.deviceModel
      ? `${instance.deviceId} (${instance.deviceModel})`
      : instance.deviceId;
    const appName =
      instance.packageName === "com.roblox.client"
        ? "client"
        : instance.packageName.replace("com.roblox.", "");
    const userInfo = instance.username ? `@${instance.username}` : "No user";
    const statusIcon = instance.isRunning ? "[+]" : "[-]";

    return {
      value: index,
      label: `${statusIcon} ${deviceName} - ${appName} - ${userInfo}`,
    };
  });

  const selectedInstance = await select({
    message: "Select instance to close:",
    options: instanceOptions,
  });

  if (selectedInstance === undefined || typeof selectedInstance === "symbol") {
    return null;
  }

  const selectedInstanceData = instances[selectedInstance as number];
  return selectedInstanceData || null;
}

export function getInstancesToClose(
  mode: CloseMode,
  allInstances: InstanceWithUser[],
  selectedInstance?: InstanceWithUser
): InstanceWithUser[] {
  switch (mode) {
    case "all-running":
      return allInstances.filter((i) => i.isRunning);
    case "by-instance":
      return selectedInstance ? [selectedInstance] : [];
    default:
      return [];
  }
}
