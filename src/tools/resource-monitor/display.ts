import colors from "picocolors";
import { Logger } from "@/utils/logger";
import {
  RAM_WARNING_THRESHOLD,
  RAM_CRITICAL_THRESHOLD,
  CPU_WARNING_THRESHOLD,
  CPU_CRITICAL_THRESHOLD,
} from "./constants";
import type { DeviceResourceSummary, OverallSummary } from "./types";

export function displayResourceSummary(
  summaries: DeviceResourceSummary[]
): void {
  Logger.title("[#] System Resource Monitor");

  if (summaries.length === 0) {
    Logger.warning("[-] No devices found");
    return;
  }

  const overall = calculateOverallSummary(summaries);

  for (const summary of summaries) {
    displayDeviceSummary(summary);
  }

  displayOverallSummary(overall);
}

function displayDeviceSummary(summary: DeviceResourceSummary): void {
  const deviceName = summary.deviceModel
    ? `${summary.deviceId} (${summary.deviceModel})`
    : summary.deviceId;

  const robloxRam = summary.robloxInstances.reduce(
    (sum, inst) => sum + inst.ramUsageMB,
    0
  );
  const robloxCpu = summary.robloxInstances.reduce(
    (sum, inst) => sum + inst.cpuPercent,
    0
  );
  const usedRam = summary.totalRamMB - summary.availableRamMB;
  const ramUsagePercent =
    summary.totalRamMB > 0
      ? Math.round((usedRam / summary.totalRamMB) * 100)
      : 0;

  Logger.info(`[-] ${deviceName}`);

  Logger.normal(`System Resources:`, { indent: 1 });
  Logger.muted(
    `RAM: ${colors.yellow(`${usedRam}MB`)} / ${summary.totalRamMB}MB (${colors.yellow(`${ramUsagePercent}%`)})`,
    { indent: 2 }
  );
  Logger.muted(
    `CPU: ${colors.yellow(`${summary.totalCpuPercent}%`)} total system usage${
      summary.cpuCores > 0 ? ` (${summary.cpuCores} cores)` : ""
    }`,
    { indent: 2 }
  );

  if (summary.robloxInstances.length === 0) {
    Logger.muted(`No Roblox instances running`, {
      indent: 1,
      spaceBefore: true,
    });
  } else {
    Logger.normal(`Roblox Instances (${summary.robloxInstances.length}):`, {
      indent: 1,
      spaceBefore: true,
    });

    summary.robloxInstances.forEach((instance) => {
      displayInstanceInfo(instance);
    });

    Logger.normal(`Roblox Totals:`, { indent: 1, spaceBefore: true });
    Logger.muted(
      `RAM: ${colors.cyan(`${robloxRam}MB`)} | CPU: ${colors.cyan(`${Math.round(robloxCpu * 10) / 10}%`)}`,
      { indent: 2 }
    );
  }

  Logger.space();
}

function displayInstanceInfo(instance: any): void {
  const appName =
    instance.packageName === "com.roblox.client"
      ? "client"
      : instance.packageName.replace("com.roblox.", "");

  const ramColor = getRamColor(instance.ramUsageMB);
  const cpuColor = getCpuColor(instance.cpuPercent);
  const statusIcon = instance.isRunning ? "[+]" : "[X]";

  Logger.muted(`${statusIcon} ${colors.white(appName)}`, { indent: 2 });
  Logger.muted(
    `RAM: ${ramColor(`${instance.ramUsageMB}MB`)} | CPU: ${cpuColor(`${instance.cpuPercent}%`)} | PID: ${instance.pid}`,
    { indent: 3 }
  );
}

function displayOverallSummary(overall: OverallSummary): void {
  Logger.title("Overall Summary:");
  Logger.muted(
    `Total Roblox Instances: ${colors.bold(overall.totalInstances.toString())}`,
    { indent: 1 }
  );
  Logger.muted(
    `Total Roblox RAM Usage: ${colors.bold(`${overall.totalRamUsage}MB`)}`,
    { indent: 1 }
  );
  Logger.muted(
    `Total Roblox CPU Usage: ${colors.bold(`${Math.round(overall.totalCpuUsage * 10) / 10}%`)}`,
    { indent: 1 }
  );
  Logger.space();
}

function calculateOverallSummary(
  summaries: DeviceResourceSummary[]
): OverallSummary {
  let totalInstances = 0;
  let totalRamUsage = 0;
  let totalCpuUsage = 0;

  for (const summary of summaries) {
    const robloxRam = summary.robloxInstances.reduce(
      (sum, inst) => sum + inst.ramUsageMB,
      0
    );
    const robloxCpu = summary.robloxInstances.reduce(
      (sum, inst) => sum + inst.cpuPercent,
      0
    );

    totalInstances += summary.robloxInstances.length;
    totalRamUsage += robloxRam;
    totalCpuUsage += robloxCpu;
  }

  return { totalInstances, totalRamUsage, totalCpuUsage };
}

function getRamColor(ramUsageMB: number): (text: string) => string {
  if (ramUsageMB > RAM_CRITICAL_THRESHOLD) return colors.red;
  if (ramUsageMB > RAM_WARNING_THRESHOLD) return colors.yellow;
  return colors.green;
}

function getCpuColor(cpuPercent: number): (text: string) => string {
  if (cpuPercent > CPU_CRITICAL_THRESHOLD) return colors.red;
  if (cpuPercent > CPU_WARNING_THRESHOLD) return colors.yellow;
  return colors.green;
}
