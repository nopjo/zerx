import { text, spinner, outro, confirm, select } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";
import { validateRobloxCookie, type RobloxUserInfo } from "@/utils/roblox";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

interface RobloxClone {
  packageName: string;
  deviceId: string;
  cloneIndex: number;
}

interface LoginResult {
  deviceId: string;
  deviceModel?: string;
  packageName: string;
  cookie: string;
  isSuccess: boolean;
  userInfo?: RobloxUserInfo;
  error?: string;
}

async function detectRobloxClones(deviceId: string): Promise<RobloxClone[]> {
  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "pm list packages | grep com.roblox"`
    );

    const packages = stdout
      .split("\n")
      .map((line) => line.replace("package:", "").trim())
      .filter((pkg) => pkg.startsWith("com.roblox") && pkg.length > 0);

    const clones: RobloxClone[] = packages.map((packageName, index) => ({
      packageName,
      deviceId,
      cloneIndex: index,
    }));

    return clones;
  } catch (error) {
    Logger.muted(`[!] Could not detect clones on ${deviceId}: ${error}`, {
      indent: 1,
    });
    return [];
  }
}

async function getAllRobloxClones(
  devices: any[]
): Promise<Map<string, RobloxClone[]>> {
  const deviceCloneMap = new Map<string, RobloxClone[]>();

  const detectionSpinner = spinner();
  detectionSpinner.start(colors.gray("Detecting Roblox clones on devices..."));

  for (const device of devices) {
    const clones = await detectRobloxClones(device.id);
    deviceCloneMap.set(device.id, clones);
  }

  detectionSpinner.stop(colors.green("[+] Clone detection complete"));

  return deviceCloneMap;
}

function printCloneDetectionResults(
  deviceCloneMap: Map<string, RobloxClone[]>,
  devices: any[]
): void {
  Logger.title("[-] Roblox Clone Detection Results:");

  let totalClones = 0;

  for (const device of devices) {
    const clones = deviceCloneMap.get(device.id) || [];
    const deviceName = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    if (clones.length > 0) {
      Logger.success(
        `[-] ${deviceName}: ${clones.length} Roblox app(s) found`,
        { indent: 1 }
      );
      clones.forEach((clone) => {
        Logger.muted(`└── ${clone.packageName}`, { indent: 2 });
      });
      totalClones += clones.length;
    } else {
      Logger.warning(`[-] ${deviceName}: No Roblox apps found`, { indent: 1 });
    }
  }

  Logger.info(
    `Total Roblox instances across all devices: ${colors.bold(
      totalClones.toString()
    )}`,
    { spaceBefore: true }
  );
}

async function getCookieFilePath(): Promise<string | null> {
  const cookieFilePath = await text({
    message: "Enter the path to your cookies file:",
    placeholder: "path/to/cookies.txt",
    validate: (value) => {
      if (!value) return "Path is required";

      const cleanPath = value.replace(/^["']|["']$/g, "");

      if (!existsSync(cleanPath)) return "File not found at this path";
      if (!cleanPath.toLowerCase().endsWith(".txt"))
        return "File must be a .txt file";
      return undefined;
    },
  });

  if (!cookieFilePath || typeof cookieFilePath === "symbol") return null;

  return cookieFilePath.replace(/^["']|["']$/g, "");
}

function loadCookiesFromFile(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf8");
    const cookies = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return cookies;
  } catch (error) {
    throw new Error(
      `Failed to read cookie file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function injectCookieToClone(
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

async function loginToClone(
  deviceId: string,
  deviceModel: string | undefined,
  packageName: string,
  cookie: string
): Promise<LoginResult> {
  const result: LoginResult = {
    deviceId,
    deviceModel,
    packageName,
    cookie,
    isSuccess: false,
  };

  try {
    const validation = await validateRobloxCookie(cookie);
    if (!validation.isValid) {
      result.error = validation.error || "Invalid cookie";
      return result;
    }

    result.userInfo = validation.userInfo;

    const injectSuccess = await injectCookieToClone(
      deviceId,
      packageName,
      cookie
    );
    if (!injectSuccess) {
      result.error = "Failed to inject cookie";
      return result;
    }

    result.isSuccess = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

export async function automaticLogin(): Promise<void> {
  Logger.title("[*] Automatic Login - Roblox");
  Logger.muted("Automatically login to Roblox using saved cookies", {
    indent: 1,
  });

  Logger.muted("[@] Please specify your cookies file path...");
  const cookieFilePath = await getCookieFilePath();

  if (!cookieFilePath) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.success(`[+] Using cookies file: ${cookieFilePath}`);

  const loadSpinner = spinner();
  loadSpinner.start(colors.gray("Loading cookies from file..."));

  let cookies: string[] = [];
  try {
    cookies = loadCookiesFromFile(cookieFilePath);

    if (cookies.length === 0) {
      loadSpinner.stop(colors.yellow("[!] No cookies found in file"));
      outro(colors.yellow("[@] Cookies file is empty"));
      return;
    }
  } catch (error) {
    loadSpinner.stop(colors.red("[X] Failed to load cookies"));
    outro(
      colors.red(
        `[X] Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    return;
  }

  loadSpinner.stop(colors.green(`[+] Loaded ${cookies.length} cookies`));

  const deviceSpinner = spinner();
  deviceSpinner.start(colors.gray("Scanning for connected devices..."));

  const devices = await getConnectedDevices();
  deviceSpinner.stop(colors.green("[+] Device scan complete"));

  printConnectedDevices(devices);

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

  const deviceCloneMap = await getAllRobloxClones(readyDevices);
  printCloneDetectionResults(deviceCloneMap, readyDevices);

  const allClones: Array<{ clone: RobloxClone; deviceModel?: string }> = [];

  for (const device of readyDevices) {
    const clones = deviceCloneMap.get(device.id) || [];
    clones.forEach((clone) => {
      allClones.push({ clone, deviceModel: device.model });
    });
  }

  if (allClones.length === 0) {
    outro(colors.red("[X] No Roblox apps found on any device."));
    return;
  }

  const loginMode = await select({
    message: "How would you like to assign cookies to Roblox instances?",
    options: [
      {
        value: "sequential",
        label:
          "[-] Sequential (Cookie 1 → Instance 1, Cookie 2 → Instance 2, etc.)",
      },
      {
        value: "first-cookie",
        label: "[*] Same cookie to all instances",
      },
      {
        value: "per-device",
        label:
          "[~] One cookie per device (same cookie for all clones on same device)",
      },
    ],
  });

  if (!loginMode || typeof loginMode === "symbol") {
    outro(colors.yellow("Operation cancelled"));
    return;
  }

  const instanceCount = allClones.length;
  const cookieCount =
    loginMode === "first-cookie"
      ? 1
      : loginMode === "per-device"
        ? readyDevices.length
        : Math.min(cookies.length, instanceCount);

  const shouldProceed = await confirm({
    message: `Login to ${colors.bold(
      instanceCount.toString()
    )} Roblox instance(s) across ${colors.bold(
      readyDevices.length.toString()
    )} device(s) using ${colors.bold(cookieCount.toString())} cookie(s)?`,
  });

  if (!shouldProceed) {
    outro(colors.yellow("Operation cancelled"));
    return;
  }

  Logger.success("[^] Starting automatic login process...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const loginSpinner = spinner();
  loginSpinner.start(colors.gray("Logging in to all Roblox instances..."));

  const loginTasks: Promise<LoginResult>[] = [];

  if (cookies.length === 0) {
    outro(colors.red("[X] No cookies available for login"));
    return;
  }

  const deviceGroups = new Map<
    string,
    Array<{ clone: RobloxClone; deviceModel?: string }>
  >();
  allClones.forEach((item) => {
    const deviceId = item.clone.deviceId;
    if (!deviceGroups.has(deviceId)) {
      deviceGroups.set(deviceId, []);
    }
    deviceGroups.get(deviceId)!.push(item);
  });

  for (let i = 0; i < allClones.length; i++) {
    const cloneItem = allClones[i];
    if (!cloneItem) continue;

    const { clone, deviceModel } = cloneItem;
    if (!clone) continue;

    let cookieToUse: string;

    switch (loginMode) {
      case "sequential":
        const sequentialCookie = cookies[i];
        const fallbackCookie = cookies[0];
        if (!sequentialCookie && !fallbackCookie) continue;
        cookieToUse = sequentialCookie ?? fallbackCookie!;
        break;

      case "first-cookie":
        const firstCookie = cookies[0];
        if (!firstCookie) continue;
        cookieToUse = firstCookie;
        break;

      case "per-device":
        let deviceIndex = 0;
        for (const [deviceId, _] of deviceGroups) {
          if (deviceId === clone.deviceId) break;
          deviceIndex++;
        }
        const deviceCookie = cookies[deviceIndex] || cookies[0];
        if (!deviceCookie) continue;
        cookieToUse = deviceCookie;
        break;

      default:
        continue;
    }

    loginTasks.push(
      loginToClone(clone.deviceId, deviceModel, clone.packageName, cookieToUse)
    );
  }

  if (loginTasks.length === 0) {
    outro(colors.red("[X] No valid login tasks created"));
    return;
  }

  const results = await Promise.all(loginTasks);
  loginSpinner.stop();

  Logger.title("[*] Login Results by Device:");

  const successfulLogins = results.filter((result) => result.isSuccess);

  const resultsByDevice = new Map<string, LoginResult[]>();
  results.forEach((result) => {
    if (!resultsByDevice.has(result.deviceId)) {
      resultsByDevice.set(result.deviceId, []);
    }
    resultsByDevice.get(result.deviceId)!.push(result);
  });

  for (const device of readyDevices) {
    const deviceResults = resultsByDevice.get(device.id) || [];
    const deviceName = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    Logger.info(`[-] ${deviceName}:`);

    if (deviceResults.length === 0) {
      Logger.muted("No Roblox instances found", { indent: 1 });
    } else {
      deviceResults.forEach((result) => {
        const appName = result.packageName.replace("com.roblox.", "");

        if (result.isSuccess && result.userInfo) {
          Logger.success(`[+] ${appName} - Successfully logged in`, {
            indent: 1,
          });
          Logger.muted(`Username: ${result.userInfo.userName}`, { indent: 2 });
          Logger.muted(`User ID: ${result.userInfo.userId}`, { indent: 2 });
        } else {
          Logger.error(`[X] ${appName} - ${result.error || "Login failed"}`, {
            indent: 1,
          });
        }
      });
    }
    Logger.space();
  }

  if (successfulLogins.length === allClones.length) {
    outro(
      colors.green(
        `All logins completed successfully! (${successfulLogins.length}/${allClones.length} instances)`
      )
    );
  } else if (successfulLogins.length > 0) {
    outro(
      colors.yellow(
        `[!] Some logins failed. (${successfulLogins.length}/${allClones.length} successful)`
      )
    );
  } else {
    outro(
      colors.red(`[X] All logins failed. (0/${allClones.length} instances)`)
    );
  }
}
