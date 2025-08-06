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

export async function getConnectedDevices(): Promise<AdbDevice[]> {
  try {
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
