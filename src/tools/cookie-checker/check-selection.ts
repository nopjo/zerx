import { select } from "@/utils/prompts";
import type { RobloxInstance, CheckType } from "./types";

export async function getCheckType(
  totalInstances: number,
  totalDevices: number
): Promise<CheckType | null> {
  const checkType = await select({
    message: "What would you like to do?",
    options: [
      {
        value: "check-all",
        label: `[@] Check all instances (${totalInstances} instances across ${totalDevices} devices)`,
      },
      {
        value: "check-device",
        label: "[-] Check all instances on specific device",
      },
      {
        value: "check-single",
        label: "[#] Check single instance",
      },
    ],
  });

  if (!checkType || typeof checkType === "symbol") {
    return null;
  }

  return checkType as CheckType;
}

export async function selectSpecificDevice(
  readyDevices: any[],
  deviceInstanceMap: Map<string, RobloxInstance[]>
): Promise<string | null> {
  const deviceOptions = readyDevices.map((device) => ({
    value: device.id,
    label: device.model
      ? `${device.id} (${device.model}) - ${
          deviceInstanceMap.get(device.id)?.length || 0
        } instances`
      : `${device.id} - ${
          deviceInstanceMap.get(device.id)?.length || 0
        } instances`,
  }));

  const selectedDevice = await select({
    message: "Select device to check:",
    options: deviceOptions,
  });

  if (!selectedDevice || typeof selectedDevice === "symbol") {
    return null;
  }

  return selectedDevice as string;
}

export async function selectSpecificInstance(
  allInstances: Array<{ instance: RobloxInstance; deviceModel?: string }>
): Promise<{ instance: RobloxInstance; deviceModel?: string } | null> {
  const instanceOptions = allInstances.map((item, index) => {
    const deviceName = item.deviceModel
      ? `${item.instance.deviceId} (${item.deviceModel})`
      : item.instance.deviceId;
    const appName =
      item.instance.packageName === "com.roblox.client"
        ? "client"
        : item.instance.packageName.replace("com.roblox.", "");
    return {
      value: index,
      label: `${deviceName} - ${appName}`,
    };
  });

  const selectedIndex = await select({
    message: "Select instance to check:",
    options: instanceOptions,
  });

  if (selectedIndex === undefined || typeof selectedIndex === "symbol") {
    return null;
  }

  const selectedInstance = allInstances[selectedIndex as number];
  return selectedInstance || null;
}

export function getInstancesToCheck(
  checkType: CheckType,
  allInstances: Array<{ instance: RobloxInstance; deviceModel?: string }>,
  selectedDeviceId?: string,
  selectedInstance?: { instance: RobloxInstance; deviceModel?: string }
): Array<{ instance: RobloxInstance; deviceModel?: string }> {
  switch (checkType) {
    case "check-all":
      return allInstances;
    case "check-device":
      return selectedDeviceId
        ? allInstances.filter(
            (item) => item.instance.deviceId === selectedDeviceId
          )
        : [];
    case "check-single":
      return selectedInstance ? [selectedInstance] : [];
    default:
      return [];
  }
}
