import { Logger } from "@/utils/logger";
import type { CloseResult } from "./types";

export function displayCloseResults(results: CloseResult[]): void {
  Logger.title("[!] Close Results:");

  const resultsByDevice = new Map<string, CloseResult[]>();
  results.forEach((result) => {
    const deviceKey = result.deviceModel
      ? `${result.deviceId} (${result.deviceModel})`
      : result.deviceId;
    if (!resultsByDevice.has(deviceKey)) {
      resultsByDevice.set(deviceKey, []);
    }
    resultsByDevice.get(deviceKey)!.push(result);
  });

  for (const [deviceName, deviceResults] of resultsByDevice) {
    Logger.info(`[-] ${deviceName}:`);

    deviceResults.forEach((result) => {
      const appName =
        result.packageName === "com.roblox.client"
          ? "client"
          : result.packageName.replace("com.roblox.", "");
      const userInfo = result.username ? ` (@${result.username})` : "";

      if (result.isSuccess) {
        Logger.success(
          `[+] ${appName}${userInfo} - Process closed successfully`,
          { indent: 1 }
        );
      } else {
        Logger.error(
          `[X] ${appName}${userInfo} - ${result.error || "Failed to close"}`,
          { indent: 1 }
        );
      }
    });
    Logger.space();
  }
}
