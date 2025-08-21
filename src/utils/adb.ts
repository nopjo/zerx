import { exec } from "child_process";
import { promisify } from "util";
import colors from "picocolors";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

export interface AdbDevice {
  id: string;
  status: string;
  model?: string;
}

async function getRunningEmulatorPorts(): Promise<number[]> {
  try {
    const { stdout } = await execAsync("netstat -an");
    const lines = stdout.split("\n");

    const emulatorPorts: number[] = [];

    for (const line of lines) {
      const match = line.match(/TCP\s+\S*:(\d{4})\s+\S+\s+LISTENING/);
      if (match && match[1]) {
        const port = parseInt(match[1]);

        if (port % 2 === 1 && port >= 5555 && port <= 5700) {
          emulatorPorts.push(port);
        }
      }
    }

    return emulatorPorts.sort((a, b) => a - b);
  } catch (error) {
    Logger.warning("[!] Could not scan for emulator ports");
    return [];
  }
}

async function testDeviceConnection(port: number): Promise<AdbDevice | null> {
  const deviceId = `localhost:${port}`;

  try {
    await execAsync(`adb connect ${deviceId}`, { timeout: 3000 });

    const { stdout: statusOutput } = await execAsync(
      `adb -s ${deviceId} shell echo "test"`,
      { timeout: 2000 }
    );

    if (!statusOutput.includes("test")) {
      return null;
    }

    let model: string | undefined;
    try {
      const { stdout: modelOutput } = await execAsync(
        `adb -s ${deviceId} shell getprop ro.product.model`,
        { timeout: 2000 }
      );
      model = modelOutput.trim() || undefined;
    } catch {}

    return {
      id: deviceId,
      status: "device",
      model,
    };
  } catch (error) {
    return null;
  }
}

async function connectToAllEmulators(): Promise<void> {
  const runningPorts = await getRunningEmulatorPorts();

  if (runningPorts.length === 0) {
    Logger.muted("No emulator ports detected");
    return;
  }

  Logger.muted(
    `Found ${runningPorts.length} potential emulator ports: ${runningPorts.join(", ")}`
  );

  const batchSize = 5;
  const results: (number | null)[] = [];

  for (let i = 0; i < runningPorts.length; i += batchSize) {
    const batch = runningPorts.slice(i, i + batchSize);

    const batchPromises = batch.map(async (port) => {
      try {
        await execAsync(`adb connect localhost:${port}`, { timeout: 3000 });
        Logger.muted(`✓ Connected to localhost:${port}`);
        return port;
      } catch {
        Logger.muted(`✗ Failed to connect to localhost:${port}`);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  const successfulConnections = results.filter((port) => port !== null);

  if (successfulConnections.length > 0) {
    Logger.muted(
      `Successfully connected to ${successfulConnections.length}/${runningPorts.length} emulators`
    );
  }
}

export async function getConnectedDevices(): Promise<AdbDevice[]> {
  try {
    await connectToAllEmulators();

    const runningPorts = await getRunningEmulatorPorts();

    if (runningPorts.length === 0) {
      Logger.muted("No emulator ports found");
      return [];
    }

    Logger.muted(`Testing ${runningPorts.length} emulator connections...`);

    const devicePromises = runningPorts.map((port) =>
      testDeviceConnection(port)
    );
    const deviceResults = await Promise.all(devicePromises);

    const connectedDevices = deviceResults.filter(
      (device): device is AdbDevice => device !== null
    );

    Logger.muted(
      `${connectedDevices.length}/${runningPorts.length} devices are responsive`
    );

    return connectedDevices;
  } catch (error) {
    Logger.error("[X] Error getting ADB devices:");
    console.error(error);
    return [];
  }
}

export function printConnectedDevices(devices: AdbDevice[]): void {
  Logger.title("[-] Connected Devices:");

  if (devices.length === 0) {
    Logger.warning("[!] No responsive devices found");
    Logger.muted("Make sure you have emulators running and ADB is working.", {
      indent: 1,
    });
    return;
  }

  devices.forEach((device, index) => {
    const portMatch = device.id.match(/localhost:(\d+)/);
    const port = portMatch ? portMatch[1] : device.id;

    const deviceInfo = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    const statusColor = device.status === "device" ? colors.green : colors.red;

    Logger.muted(
      `${index + 1}. ${colors.white(deviceInfo)} - ${statusColor(colors.bold(device.status))}`,
      { indent: 1 }
    );
  });

  Logger.muted(
    `Total: ${colors.white(devices.length.toString())} responsive device(s)`,
    {
      indent: 1,
      spaceBefore: true,
    }
  );
}
