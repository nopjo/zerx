import { exec } from "child_process";
import { promisify } from "util";
import type { ProcessInfo } from "./types";

const execAsync = promisify(exec);

export async function getProcessInfo(
  deviceId: string,
  packageName: string
): Promise<ProcessInfo | null> {
  try {
    const psCommand = `adb -s ${deviceId} shell "ps -A -o PID,PCPU,RSS,NAME | grep ${packageName}"`;
    const { stdout: psOutput } = await execAsync(psCommand);

    if (!psOutput.trim()) {
      return {
        pid: "N/A",
        packageName,
        deviceId,
        ramUsageMB: 0,
        cpuPercent: 0,
        isRunning: false,
      };
    }

    const lines = psOutput.trim().split("\n");
    let totalRam = 0;
    let totalCpu = 0;
    let mainPid = "N/A";

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const pid = parts[0];
        const cpu = parseFloat(parts[1] || "0") || 0;
        const rss = parseInt(parts[2] || "0") || 0;

        totalCpu += cpu;
        totalRam += rss;
        if (mainPid === "N/A" && pid) mainPid = pid;
      }
    }

    return {
      pid: mainPid,
      packageName,
      deviceId,
      ramUsageMB: Math.round(totalRam / 1024),
      cpuPercent: Math.round(totalCpu * 10) / 10,
      isRunning: true,
    };
  } catch (error) {
    return null;
  }
}
