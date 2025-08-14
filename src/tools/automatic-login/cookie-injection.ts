import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

export async function injectCookieToClone(
  deviceId: string,
  packageName: string,
  cookie: string
): Promise<boolean> {
  try {
    Logger.muted(`[>] Starting injection for ${packageName} on ${deviceId}`, {
      indent: 1,
    });

    const cookiePath = `/data/data/${packageName}/app_webview/Default/Cookies`;

    try {
      await execAsync(
        `adb -s ${deviceId} shell "su -c 'test -f ${cookiePath}'"`
      );
      Logger.muted(`[+] Cookie database found for ${packageName}`, {
        indent: 1,
      });
    } catch (error) {
      Logger.warning(
        `[!] Cookie database not found for ${packageName}, skipping...`,
        { indent: 1 }
      );
      return false;
    }

    Logger.muted(`[>] Stopping ${packageName}...`, { indent: 1 });
    await execAsync(`adb -s ${deviceId} shell "am force-stop ${packageName}"`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    Logger.muted(`[+] ${packageName} stopped`, { indent: 1 });

    const buffer = Buffer.from(cookie);
    const base64Cookie = buffer.toString("base64");

    const packageSuffix = packageName.replace(/\./g, "_");
    const uniqueScriptName = `update_cookie_${packageSuffix}.sh`;
    const uniqueCookieName = `cookie_${packageSuffix}.b64`;

    const scriptPath = path.join(process.cwd(), "scripts", "update_cookie.sh");

    Logger.muted(
      `[>] Pushing update script to device (${uniqueScriptName})...`,
      { indent: 1 }
    );
    await execAsync(
      `adb -s ${deviceId} push "${scriptPath}" /data/local/tmp/${uniqueScriptName}`
    );
    await execAsync(
      `adb -s ${deviceId} shell "chmod 755 /data/local/tmp/${uniqueScriptName}"`
    );

    Logger.muted(
      `[>] Writing base64 cookie to device (${uniqueCookieName})...`,
      { indent: 1 }
    );
    await execAsync(
      `adb -s ${deviceId} shell "echo '${base64Cookie}' > /data/local/tmp/${uniqueCookieName}"`
    );

    Logger.muted(`[>] Running cookie update script with unique files...`, {
      indent: 1,
    });
    const scriptCommand = `adb -s ${deviceId} shell "su -c '/data/local/tmp/${uniqueScriptName} ${cookiePath} /data/local/tmp/${uniqueCookieName}'"`;

    const { stdout: scriptResult } = await execAsync(scriptCommand);
    Logger.muted(`[#] Script output: ${scriptResult.trim()}`, { indent: 1 });

    await execAsync(
      `adb -s ${deviceId} shell "rm -f /data/local/tmp/${uniqueScriptName}"`
    );
    await execAsync(
      `adb -s ${deviceId} shell "rm -f /data/local/tmp/${uniqueCookieName}"`
    );

    Logger.success(`[+] Cookie updated for ${packageName}`, { indent: 1 });
    return true;
  } catch (error) {
    Logger.error(`[X] Injection failed for ${packageName}: ${error}`, {
      indent: 1,
    });
    return false;
  }
}
