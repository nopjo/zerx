import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface SystemResources {
  totalRamMB: number;
  availableRamMB: number;
  totalCpuPercent: number;
  cpuCores: number;
}

export async function getSystemResources(
  deviceId: string
): Promise<SystemResources> {
  const memoryInfo = await getMemoryInfo(deviceId);
  const cpuInfo = await getCpuInfo(deviceId);

  return {
    ...memoryInfo,
    ...cpuInfo,
  };
}

async function getMemoryInfo(
  deviceId: string
): Promise<Pick<SystemResources, "totalRamMB" | "availableRamMB">> {
  try {
    const memInfoCommand = `adb -s ${deviceId} shell "cat /proc/meminfo | head -n 3"`;
    const { stdout: memInfo } = await execAsync(memInfoCommand);

    let totalRamMB = 0;
    let availableRamMB = 0;

    const memLines = memInfo.split("\n");
    for (const line of memLines) {
      if (line.includes("MemTotal:")) {
        totalRamMB = Math.round(parseInt(line.match(/\d+/)?.[0] || "0") / 1024);
      } else if (line.includes("MemAvailable:")) {
        availableRamMB = Math.round(
          parseInt(line.match(/\d+/)?.[0] || "0") / 1024
        );
      }
    }

    return { totalRamMB, availableRamMB };
  } catch (error) {
    return { totalRamMB: 0, availableRamMB: 0 };
  }
}

async function getCpuInfo(
  deviceId: string
): Promise<Pick<SystemResources, "totalCpuPercent" | "cpuCores">> {
  let cpuCores = 0;
  let totalCpuPercent = 0;

  try {
    const coresCommand = `adb -s ${deviceId} shell "cat /proc/cpuinfo | grep processor | wc -l"`;
    const { stdout: coresOutput } = await execAsync(coresCommand);
    cpuCores = parseInt(coresOutput.trim()) || 0;
  } catch (error) {}

  try {
    const dumpsysCommand = `adb -s ${deviceId} shell "dumpsys cpuinfo | head -n 10"`;
    const { stdout: dumpsysOutput } = await execAsync(dumpsysCommand);

    const totalMatch = dumpsysOutput.match(/Total:\s*(\d+(?:\.\d+)?)%/i);
    if (totalMatch && totalMatch[1]) {
      totalCpuPercent = parseFloat(totalMatch[1]);
    } else {
      const lines = dumpsysOutput.split("\n");
      let cpuSum = 0;
      for (const line of lines) {
        const cpuMatch = line.match(/(\d+(?:\.\d+)?)%/);
        if (cpuMatch && cpuMatch[1]) {
          cpuSum += parseFloat(cpuMatch[1]);
        }
      }
      if (cpuSum > 0 && cpuSum <= 100) {
        totalCpuPercent = Math.round(cpuSum * 10) / 10;
      }
    }
  } catch (error) {}

  return { totalCpuPercent, cpuCores };
}
