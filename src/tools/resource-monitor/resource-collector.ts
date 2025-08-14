import { detectRobloxInstances } from "./detection";
import { getProcessInfo } from "./process-info";
import { getSystemResources } from "./system-info";
import type { DeviceResourceSummary, ProcessInfo } from "./types";

export async function getDeviceResourceSummary(
  deviceId: string,
  deviceModel?: string
): Promise<DeviceResourceSummary> {
  try {
    const systemResources = await getSystemResources(deviceId);
    const instances = await detectRobloxInstances(deviceId);
    const robloxInstances: ProcessInfo[] = [];

    for (const instance of instances) {
      const processInfo = await getProcessInfo(deviceId, instance.packageName);
      if (processInfo) {
        processInfo.deviceModel = deviceModel;
        robloxInstances.push(processInfo);
      }
    }

    return {
      deviceId,
      deviceModel,
      ...systemResources,
      robloxInstances,
    };
  } catch (error) {
    return {
      deviceId,
      deviceModel,
      totalRamMB: 0,
      availableRamMB: 0,
      totalCpuPercent: 0,
      cpuCores: 0,
      robloxInstances: [],
    };
  }
}

export async function collectAllDeviceResources(
  devices: Array<{ id: string; model?: string }>
): Promise<DeviceResourceSummary[]> {
  const summaries: DeviceResourceSummary[] = [];

  for (const device of devices) {
    const summary = await getDeviceResourceSummary(device.id, device.model);
    summaries.push(summary);
  }

  return summaries;
}
