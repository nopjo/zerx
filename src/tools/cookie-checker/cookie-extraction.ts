import { exec } from "child_process";
import { promisify } from "util";
import { validateRobloxCookie } from "@/utils/roblox";
import type { CookieResult } from "./types";

const execAsync = promisify(exec);

export async function extractCookieFromInstance(
  deviceId: string,
  packageName: string
): Promise<string | null> {
  try {
    const cookiePath = `/data/data/${packageName}/app_webview/Default/Cookies`;

    const checkCommand = `adb -s ${deviceId} shell "su -c 'ls -la ${cookiePath}'"`;
    try {
      await execAsync(checkCommand);
    } catch (error) {
      return null;
    }

    const sqlQuery = `SELECT value FROM cookies WHERE host_key = '.roblox.com' AND name = '.ROBLOSECURITY';`;
    const command = `adb -s ${deviceId} shell "su -c \\"sqlite3 ${cookiePath} \\\\\\"${sqlQuery}\\\\\\"\\"`;

    const { stdout, stderr } = await execAsync(command);

    if (
      stderr &&
      (stderr.includes("no such table") ||
        stderr.includes("no such file") ||
        stderr.includes("unable to open database"))
    ) {
      return null;
    }

    let cookie = stdout.trim();

    cookie = cookie.replace(/[\r\n\t]/g, "");
    cookie = cookie.replace(/^["']|["']$/g, "");

    return cookie.length > 0 ? cookie : null;
  } catch (error) {
    try {
      const cookiePath = `/data/data/${packageName}/app_webview/Default/Cookies`;
      const sqlQuery = `SELECT value FROM cookies WHERE host_key = '.roblox.com' AND name = '.ROBLOSECURITY';`;

      const altCommand = `adb -s ${deviceId} shell "echo \\"${sqlQuery}\\" | su -c \\"sqlite3 ${cookiePath}\\""`;
      const { stdout } = await execAsync(altCommand);

      let cookie = stdout.trim();
      cookie = cookie.replace(/[\r\n\t]/g, "");
      cookie = cookie.replace(/^["']|["']$/g, "");

      return cookie.length > 0 ? cookie : null;
    } catch (altError) {
      return null;
    }
  }
}

export async function checkCookieFromInstance(
  deviceId: string,
  deviceModel: string | undefined,
  packageName: string
): Promise<CookieResult> {
  const result: CookieResult = {
    deviceId,
    deviceModel,
    packageName,
    isValid: false,
  };

  try {
    const cookie = await extractCookieFromInstance(deviceId, packageName);

    if (!cookie) {
      result.error = "No ROBLOSECURITY cookie found";
      return result;
    }

    result.cookie = cookie;

    const validation = await validateRobloxCookie(cookie);
    result.isValid = validation.isValid;
    result.userInfo = validation.userInfo;
    result.error = validation.error;

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}
