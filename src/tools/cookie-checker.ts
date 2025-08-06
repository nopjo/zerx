import { text, spinner, outro, confirm, select } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync } from "fs";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";
import { validateRobloxCookie, type RobloxUserInfo } from "@/utils/roblox";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

interface RobloxInstance {
  packageName: string;
  deviceId: string;
}

interface CookieResult {
  deviceId: string;
  deviceModel?: string;
  packageName: string;
  cookie?: string;
  isValid: boolean;
  userInfo?: RobloxUserInfo;
  error?: string;
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

    const instances: RobloxInstance[] = packages.map((packageName) => ({
      packageName,
      deviceId,
    }));

    return instances;
  } catch (error) {
    Logger.muted(
      `[!] Could not detect Roblox instances on ${deviceId}: ${error}`,
      { indent: 1 }
    );

    return [{ packageName: "com.roblox.client", deviceId }];
  }
}

async function getAllRobloxInstances(
  devices: any[]
): Promise<Map<string, RobloxInstance[]>> {
  const deviceInstanceMap = new Map<string, RobloxInstance[]>();

  const detectionSpinner = spinner();
  detectionSpinner.start(
    colors.gray("Detecting Roblox instances on devices...")
  );

  for (const device of devices) {
    const instances = await detectRobloxInstances(device.id);
    deviceInstanceMap.set(device.id, instances);
  }

  detectionSpinner.stop(colors.green("[+] Instance detection complete"));

  return deviceInstanceMap;
}

function printInstanceDetectionResults(
  deviceInstanceMap: Map<string, RobloxInstance[]>,
  devices: any[]
): void {
  Logger.title("[-] Roblox Instance Detection Results:");

  let totalInstances = 0;

  for (const device of devices) {
    const instances = deviceInstanceMap.get(device.id) || [];
    const deviceName = device.model
      ? `${device.id} (${device.model})`
      : device.id;

    if (instances.length > 0) {
      Logger.success(
        `[-] ${deviceName}: ${instances.length} Roblox instance(s) found`,
        { indent: 1 }
      );
      instances.forEach((instance) => {
        const appName =
          instance.packageName === "com.roblox.client"
            ? "client"
            : instance.packageName.replace("com.roblox.", "");
        Logger.muted(`└── ${appName}`, { indent: 2 });
      });
      totalInstances += instances.length;
    } else {
      Logger.warning(`[-] ${deviceName}: No Roblox instances found`, {
        indent: 1,
      });
    }
  }

  Logger.info(
    `[#] Total Roblox instances across all devices: ${colors.bold(
      totalInstances.toString()
    )}`,
    { spaceBefore: true }
  );
}

async function extractCookieFromInstance(
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

async function checkCookieFromInstance(
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

function saveCookies(cookies: string[], checkType: string): void {
  const uniqueCookies = [...new Set(cookies)];

  if (uniqueCookies.length === 0) {
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .split(".")[0];
  const filename = `output/cookies_${timestamp}.txt`;

  const fs = require("fs");
  if (!fs.existsSync("output")) {
    fs.mkdirSync("output");
  }

  const content = uniqueCookies.join("\n") + "\n";

  writeFileSync(filename, content);
  Logger.success(
    `[@] ${uniqueCookies.length} unique cookies saved to ${filename}`,
    { indent: 1 }
  );
}

export async function checkRobloxCookies(): Promise<void> {
  Logger.title("[*] Roblox Cookie Checker");
  Logger.muted(
    "Extract and validate Roblox cookies from all instances on connected devices",
    { indent: 1 }
  );

  const s = spinner();
  s.start(colors.gray("Scanning for connected devices..."));

  const devices = await getConnectedDevices();
  s.stop(colors.green("[+] Device scan complete"));

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

  const deviceInstanceMap = await getAllRobloxInstances(readyDevices);
  printInstanceDetectionResults(deviceInstanceMap, readyDevices);

  const allInstances: Array<{
    instance: RobloxInstance;
    deviceModel?: string;
  }> = [];

  for (const device of readyDevices) {
    const instances = deviceInstanceMap.get(device.id) || [];
    instances.forEach((instance) => {
      allInstances.push({ instance, deviceModel: device.model });
    });
  }

  if (allInstances.length === 0) {
    outro(colors.red("[X] No Roblox instances found on any device."));
    return;
  }

  const checkType = await select({
    message: "What would you like to do?",
    options: [
      {
        value: "check-all",
        label: `[@] Check all instances (${allInstances.length} instances across ${readyDevices.length} devices)`,
      },
      {
        value: "check-device",
        label: "[-] Check all instances on specific device",
      },
      {
        value: "check-single",
        label: "[#] Check single instance",
      },
    ],
  });

  if (!checkType) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  let instancesToCheck = allInstances;

  if (checkType === "check-device") {
    const deviceOptions = readyDevices.map((device) => ({
      value: device.id,
      label: device.model
        ? `${device.id} (${device.model}) - ${
            deviceInstanceMap.get(device.id)?.length || 0
          } instances`
        : `${device.id} - ${
            deviceInstanceMap.get(device.id)?.length || 0
          } instances`,
    }));

    const selectedDevice = await select({
      message: "Select device to check:",
      options: deviceOptions,
    });

    if (!selectedDevice) {
      outro(colors.yellow("[!] Operation cancelled"));
      return;
    }

    instancesToCheck = allInstances.filter(
      (item) => item.instance.deviceId === selectedDevice
    );
  } else if (checkType === "check-single") {
    const instanceOptions = allInstances.map((item, index) => {
      const deviceName = item.deviceModel
        ? `${item.instance.deviceId} (${item.deviceModel})`
        : item.instance.deviceId;
      const appName =
        item.instance.packageName === "com.roblox.client"
          ? "client"
          : item.instance.packageName.replace("com.roblox.", "");
      return {
        value: index,
        label: `${deviceName} - ${appName}`,
      };
    });

    const selectedIndex = await select({
      message: "Select instance to check:",
      options: instanceOptions,
    });

    if (selectedIndex === undefined) {
      outro(colors.yellow("[!] Operation cancelled"));
      return;
    }

    const selectedInstance = allInstances[selectedIndex as number];
    if (!selectedInstance) {
      outro(colors.red("[X] Invalid instance selection"));
      return;
    }
    instancesToCheck = [selectedInstance];
  }

  const shouldProceed = await confirm({
    message: `Check cookies on ${colors.bold(
      instancesToCheck.length.toString()
    )} Roblox instance(s)?`,
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.success("[^] Starting cookie extraction and validation...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const checkSpinner = spinner();
  checkSpinner.start(
    colors.gray("Extracting and validating cookies from all instances...")
  );

  const checkPromises = instancesToCheck.map(({ instance, deviceModel }) =>
    checkCookieFromInstance(
      instance.deviceId,
      deviceModel,
      instance.packageName
    )
  );

  const results = await Promise.all(checkPromises);
  checkSpinner.stop();

  Logger.title("[*] Cookie Check Results by Device:");

  const validCookies = results.filter((result) => result.isValid);
  const allValidCookieStrings = results
    .filter((result) => result.isValid && result.cookie)
    .map((result) => result.cookie!);

  const resultsByDevice = new Map<string, CookieResult[]>();
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

    if (deviceResults.length === 0) {
      continue;
    }

    Logger.info(`[-] ${deviceName}:`);

    deviceResults.forEach((result) => {
      const appName =
        result.packageName === "com.roblox.client"
          ? "client"
          : result.packageName.replace("com.roblox.", "");

      if (result.isValid && result.userInfo) {
        Logger.success(`[+] ${appName} - Valid cookie found`, { indent: 1 });
        Logger.muted(`Username: ${result.userInfo.userName}`, { indent: 2 });
        Logger.muted(`User ID: ${result.userInfo.userId}`, { indent: 2 });
      } else {
        Logger.error(`[X] ${appName} - ${result.error || "No valid cookie"}`, {
          indent: 1,
        });
      }
    });
    Logger.space();
  }

  if (allValidCookieStrings.length > 0) {
    saveCookies(allValidCookieStrings, String(checkType));
  }

  if (validCookies.length === instancesToCheck.length) {
    outro(
      colors.green(
        `All cookies validated successfully! (${validCookies.length}/${instancesToCheck.length} instances)`
      )
    );
  } else if (validCookies.length > 0) {
    outro(
      colors.yellow(
        `[!] Some cookies were invalid. (${validCookies.length}/${instancesToCheck.length} valid)`
      )
    );
  } else {
    outro(
      colors.red(
        `[X] No valid cookies found. (0/${instancesToCheck.length} instances)`
      )
    );
  }
}
