import { outro, select, spinner } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { getConnectedDevices } from "@/utils/adb";

const execAsync = promisify(exec);

interface RobloxInstance {
  packageName: string;
  deviceId: string;
}

interface ProcessInfo {
  pid: string;
  packageName: string;
  deviceId: string;
  deviceModel?: string;
  ramUsageMB: number;
  cpuPercent: number;
  isRunning: boolean;
}

interface DeviceResourceSummary {
  deviceId: string;
  deviceModel?: string;
  totalRamMB: number;
  availableRamMB: number;
  totalCpuPercent: number;
  cpuCores: number;
  robloxInstances: ProcessInfo[];
}

async function detectRobloxInstances(
  deviceId: string
): Promise<RobloxInstance[]> {
  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "pm list packages | grep com.roblox"`
    );

    const packages = stdout
      .split("\n")
      .map((line) => line.replace("package:", "").trim())
      .filter((pkg) => pkg.startsWith("com.roblox") && pkg.length > 0);

    return packages.map((packageName) => ({ packageName, deviceId }));
  } catch (error) {
    return [];
  }
}

async function getProcessInfo(
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

async function getDeviceResourceSummary(
  deviceId: string,
  deviceModel?: string
): Promise<DeviceResourceSummary> {
  try {
    const memInfoCommand = `adb -s ${deviceId} shell "cat /proc/meminfo | head -n 3"`;
    const { stdout: memInfo } = await execAsync(memInfoCommand);

    let cpuCores = 0;
    try {
      const coresCommand = `adb -s ${deviceId} shell "cat /proc/cpuinfo | grep processor | wc -l"`;
      const { stdout: coresOutput } = await execAsync(coresCommand);
      cpuCores = parseInt(coresOutput.trim()) || 0;
    } catch (error) {}

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

    let totalCpuPercent = 0;
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
      totalRamMB,
      availableRamMB,
      totalCpuPercent,
      cpuCores,
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

function displayResourceSummary(summaries: DeviceResourceSummary[]): void {
  console.log();
  console.log(colors.cyan("[#] " + colors.bold("System Resource Monitor")));
  console.log();

  if (summaries.length === 0) {
    console.log(colors.yellow("[-] No devices found"));
    return;
  }

  let totalInstances = 0;
  let totalRamUsage = 0;
  let totalCpuUsage = 0;

  for (const summary of summaries) {
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

    console.log(colors.cyan(`[-] ${deviceName}`));
    console.log(colors.white(`   System Resources:`));
    console.log(
      `     RAM: ${colors.yellow(`${usedRam}MB`)} / ${
        summary.totalRamMB
      }MB (${colors.yellow(`${ramUsagePercent}%`)})`
    );
    console.log(
      `     CPU: ${colors.yellow(
        `${summary.totalCpuPercent}%`
      )} total system usage${
        summary.cpuCores > 0 ? ` (${summary.cpuCores} cores)` : ""
      }`
    );
    console.log();

    if (summary.robloxInstances.length === 0) {
      console.log(colors.gray(`   No Roblox instances running`));
    } else {
      console.log(
        colors.white(`   Roblox Instances (${summary.robloxInstances.length}):`)
      );

      summary.robloxInstances.forEach((instance) => {
        const appName =
          instance.packageName === "com.roblox.client"
            ? "client"
            : instance.packageName.replace("com.roblox.", "");

        const ramColor =
          instance.ramUsageMB > 1500
            ? colors.red
            : instance.ramUsageMB > 1000
              ? colors.yellow
              : colors.green;
        const cpuColor =
          instance.cpuPercent > 50
            ? colors.red
            : instance.cpuPercent > 25
              ? colors.yellow
              : colors.green;

        const statusIcon = instance.isRunning ? "[+]" : "[X]";

        console.log(`     ${statusIcon} ${colors.white(appName)}`);
        console.log(
          `       RAM: ${ramColor(
            `${instance.ramUsageMB}MB`
          )} | CPU: ${cpuColor(`${instance.cpuPercent}%`)} | PID: ${
            instance.pid
          }`
        );
      });
    }

    if (summary.robloxInstances.length > 0) {
      console.log();
      console.log(colors.white(`   Roblox Totals:`));
      console.log(
        `     RAM: ${colors.cyan(`${robloxRam}MB`)} | CPU: ${colors.cyan(
          `${Math.round(robloxCpu * 10) / 10}%`
        )}`
      );
    }

    console.log();
    totalInstances += summary.robloxInstances.length;
    totalRamUsage += robloxRam;
    totalCpuUsage += robloxCpu;
  }

  console.log(colors.cyan(colors.bold("Overall Summary:")));
  console.log(
    `   Total Roblox Instances: ${colors.bold(totalInstances.toString())}`
  );
  console.log(
    `   Total Roblox RAM Usage: ${colors.bold(`${totalRamUsage}MB`)}`
  );
  console.log(
    `   Total Roblox CPU Usage: ${colors.bold(
      `${Math.round(totalCpuUsage * 10) / 10}%`
    )}`
  );
  console.log();
}

export async function systemResourceMonitor(): Promise<void> {
  console.log();
  console.log(colors.cyan("[#] " + colors.bold("System Resource Monitor")));
  console.log(
    colors.gray("   Monitor RAM and CPU usage for all Roblox instances")
  );
  console.log();

  const deviceSpinner = spinner();
  deviceSpinner.start(colors.gray("Scanning for connected devices..."));

  const devices = await getConnectedDevices();
  deviceSpinner.stop(colors.green("[+] Device scan complete"));

  if (devices.length === 0) {
    outro(colors.red("[X] No devices found. Connect devices and try again."));
    return;
  }

  const readyDevices = devices.filter((device) => device.status === "device");

  if (readyDevices.length === 0) {
    outro(
      colors.red("[X] No authorized devices found. Check device permissions.")
    );
    return;
  }

  const monitorMode = await select({
    message: "Select monitoring mode:",
    options: [
      {
        value: "once",
        label: "[#] Single scan (check resources once)",
      },
      {
        value: "continuous",
        label: "[~] Continuous monitoring (refresh every 10 seconds)",
      },
    ],
  });

  if (!monitorMode || typeof monitorMode === "symbol") {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const scanResources = async () => {
    const resourceSpinner = spinner();
    resourceSpinner.start(colors.gray("Gathering resource information..."));

    const summaries: DeviceResourceSummary[] = [];

    for (const device of readyDevices) {
      const summary = await getDeviceResourceSummary(device.id, device.model);
      summaries.push(summary);
    }

    resourceSpinner.stop(colors.green("[+] Resource scan complete"));

    if (monitorMode === "continuous") {
      console.clear();
    }

    displayResourceSummary(summaries);

    return summaries;
  };

  if (monitorMode === "once") {
    await scanResources();
  } else {
    console.log(colors.green("[~] Starting continuous monitoring..."));
    console.log(
      colors.gray("   Updates every 10 seconds - Press Ctrl+C to stop")
    );
    console.log();

    try {
      while (true) {
        await scanResources();
        console.log(
          colors.gray(`[~] Next update in 10 seconds... (Press Ctrl+C to stop)`)
        );
        console.log();
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("SIGINT")) {
        console.log();
        outro(colors.yellow("[!] Continuous monitoring stopped"));
      } else {
        console.log();
        outro(colors.red(`[X] Monitoring error: ${error}`));
      }
    }
  }
}
