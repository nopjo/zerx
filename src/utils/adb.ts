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
      // Look for LISTENING ports in emulator range
      const match = line.match(/TCP\s+\S*:(\d{4})\s+\S+\s+LISTENING/);
      if (match && match[1]) {
        const port = parseInt(match[1]);
        // Check if it's an ADB port (odd numbers 5555-5700)
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

async function connectToExtendedEmulators(): Promise<void> {
  const runningPorts = await getRunningEmulatorPorts();

  if (runningPorts.length === 0) {
    return;
  }

  Logger.muted(
    `Found ${runningPorts.length} potential emulator ports: ${runningPorts.join(", ")}`
  );

  // Get currently connected devices to avoid duplicate connections
  const currentDevices = new Set<string>();
  try {
    const { stdout } = await execAsync("adb devices");
    const lines = stdout.split("\n").slice(1);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("*")) {
        const deviceId = trimmed.split(/\s+/)[0];
        if (deviceId) {
          currentDevices.add(deviceId);
        }
      }
    }
  } catch {
    // Ignore errors getting current devices
  }

  // Try to connect to any ports that aren't already connected
  const connectPromises = runningPorts
    .filter((port) => {
      const deviceId = `emulator-${port - 1}`; // Console port
      const localhostId = `localhost:${port}`;
      return !currentDevices.has(deviceId) && !currentDevices.has(localhostId);
    })
    .map(async (port) => {
      try {
        await execAsync(`adb connect localhost:${port}`, { timeout: 5000 });
        return port;
      } catch {
        // Ignore connection failures
        return null;
      }
    });

  const results = await Promise.all(connectPromises);
  const connectedPorts = results.filter((port) => port !== null);

  if (connectedPorts.length > 0) {
    Logger.muted(
      `Successfully connected to ${connectedPorts.length} additional emulators`
    );
  }
}

export async function getConnectedDevices(): Promise<AdbDevice[]> {
  try {
    await connectToExtendedEmulators();
    const { stdout } = await execAsync("adb devices -l");
    const lines = stdout.split("\n").slice(1);

    const devices: AdbDevice[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("*")) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const device: AdbDevice = {
            id: parts[0]!,
            status: parts[1]!,
          };

          const modelMatch = trimmed.match(/model:([^\s]+)/);
          if (modelMatch) {
            device.model = modelMatch[1];
          }

          devices.push(device);
        }
      }
    }

    return devices;
  } catch (error) {
    Logger.error("[X] Error getting ADB devices:");
    console.error(error);
    return [];
  }
}

export function printConnectedDevices(devices: AdbDevice[]): void {
  Logger.title("[-] Connected Devices:");

  if (devices.length === 0) {
    Logger.warning("[!] No devices found");
    Logger.muted("Make sure you have some devices running.", { indent: 1 });
    return;
  }

  devices.forEach((device, index) => {
    const statusColor =
      device.status === "device"
        ? colors.green
        : device.status === "unauthorized"
          ? colors.yellow
          : colors.red;

    const deviceInfo = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    Logger.muted(
      `${index + 1}. ${colors.white(deviceInfo)} - ${statusColor(colors.bold(device.status))}`,
      { indent: 1 }
    );
  });

  Logger.muted(`Total: ${colors.white(devices.length.toString())} device(s)`, {
    indent: 1,
    spaceBefore: true,
  });
}
