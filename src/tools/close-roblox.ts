import { outro, confirm, spinner, select } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";
import { validateRobloxCookie } from "@/utils/roblox";

const execAsync = promisify(exec);

interface RobloxInstance {
  packageName: string;
  deviceId: string;
  isRunning: boolean;
}

interface InstanceWithUser {
  packageName: string;
  deviceId: string;
  deviceModel?: string;
  username?: string;
  isRunning: boolean;
}

interface CloseResult {
  deviceId: string;
  deviceModel?: string;
  packageName: string;
  username?: string;
  isSuccess: boolean;
  error?: string;
}

async function isAppRunning(
  deviceId: string,
  packageName: string
): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "ps | grep ${packageName}"`
    );
    return stdout.includes(packageName);
  } catch {
    return false;
  }
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

    const instances: RobloxInstance[] = [];

    for (const packageName of packages) {
      const isRunning = await isAppRunning(deviceId, packageName);
      instances.push({
        packageName,
        deviceId,
        isRunning,
      });
    }

    return instances;
  } catch (error) {
    console.log(
      colors.gray(
        `    [!] Could not detect Roblox instances on ${deviceId}: ${error}`
      )
    );

    const isRunning = await isAppRunning(deviceId, "com.roblox.client");
    return [{ packageName: "com.roblox.client", deviceId, isRunning }];
  }
}

async function getUsernameFromInstance(
  deviceId: string,
  packageName: string,
  isRunning: boolean
): Promise<string | null> {
  if (!isRunning) {
    return null;
  }

  try {
    const cookiePath = `/data/data/${packageName}/app_webview/Default/Cookies`;
    const sqlQuery = `SELECT value FROM cookies WHERE host_key = '.roblox.com' AND name = '.ROBLOSECURITY';`;
    const command = `adb -s ${deviceId} shell "su -c \\"sqlite3 ${cookiePath} \\\\\\"${sqlQuery}\\\\\\"\\"`;
    const { stdout } = await execAsync(command);
    const cookie = stdout
      .trim()
      .replace(/[\r\n\t]/g, "")
      .replace(/^["']|["']$/g, "");

    if (cookie.length > 0) {
      const validation = await validateRobloxCookie(cookie);
      return validation.isValid ? validation.userInfo?.userName || null : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function getAllRobloxInstancesWithUsers(
  devices: any[]
): Promise<InstanceWithUser[]> {
  const allInstances: InstanceWithUser[] = [];

  const detectionSpinner = spinner();
  detectionSpinner.start(
    colors.gray("Detecting Roblox instances and checking users...")
  );

  for (const device of devices) {
    const instances = await detectRobloxInstances(device.id);

    for (const instance of instances) {
      console.log(
        colors.gray(
          `   [@] Checking ${instance.packageName} on ${device.id}... ${
            instance.isRunning
              ? colors.green("(RUNNING)")
              : colors.gray("(NOT RUNNING)")
          }`
        )
      );

      const username = await getUsernameFromInstance(
        device.id,
        instance.packageName,
        instance.isRunning
      );

      allInstances.push({
        packageName: instance.packageName,
        deviceId: device.id,
        deviceModel: device.model,
        username: username || undefined,
        isRunning: instance.isRunning,
      });
    }
  }

  detectionSpinner.stop(
    colors.green("[+] Instance and user detection complete")
  );
  return allInstances;
}

function printInstancesWithUsers(instances: InstanceWithUser[]): void {
  console.log();
  console.log(colors.cyan("[-] " + colors.bold("Roblox Instances:")));
  console.log();

  const deviceGroups = new Map<string, InstanceWithUser[]>();
  instances.forEach((instance) => {
    const deviceKey = `${instance.deviceId}${
      instance.deviceModel ? ` (${instance.deviceModel})` : ""
    }`;
    if (!deviceGroups.has(deviceKey)) {
      deviceGroups.set(deviceKey, []);
    }
    deviceGroups.get(deviceKey)!.push(instance);
  });

  for (const [deviceName, deviceInstances] of deviceGroups) {
    const runningCount = deviceInstances.filter((i) => i.isRunning).length;
    console.log(
      colors.green(
        `   [-] ${deviceName}: ${deviceInstances.length} instance(s) - ${runningCount} running`
      )
    );

    deviceInstances.forEach((instance) => {
      const appName =
        instance.packageName === "com.roblox.client"
          ? "client"
          : instance.packageName.replace("com.roblox.", "");

      const statusIcon = instance.isRunning ? "[+]" : "[-]";
      const userInfo = instance.username
        ? colors.blue(`@${instance.username}`)
        : colors.gray(instance.isRunning ? "Running (no user)" : "Not running");

      console.log(
        colors.gray(`      └── ${statusIcon} ${appName} - ${userInfo}`)
      );
    });
  }

  const totalRunning = instances.filter((i) => i.isRunning).length;
  console.log();
  console.log(
    colors.cyan(
      `Total instances: ${instances.length} (${totalRunning} running)`
    )
  );
}

async function closeRobloxInstance(
  deviceId: string,
  deviceModel: string | undefined,
  packageName: string,
  username?: string
): Promise<CloseResult> {
  const result: CloseResult = {
    deviceId,
    deviceModel,
    packageName,
    username,
    isSuccess: false,
  };

  try {
    await execAsync(`adb -s ${deviceId} shell "am force-stop ${packageName}"`);

    try {
      await execAsync(`adb -s ${deviceId} shell "pkill -f ${packageName}"`);
    } catch {}

    result.isSuccess = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

export async function closeAllRobloxProcesses(): Promise<void> {
  console.log();
  console.log(colors.cyan("[!] " + colors.bold("Close Roblox Processes")));
  console.log(
    colors.gray("   Force stop Roblox applications on connected devices")
  );
  console.log();

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

  const allInstances = await getAllRobloxInstancesWithUsers(readyDevices);
  printInstancesWithUsers(allInstances);

  if (allInstances.length === 0) {
    outro(colors.red("[X] No Roblox instances found on any device."));
    return;
  }

  const runningInstances = allInstances.filter((i) => i.isRunning);
  const loggedInRunningInstances = runningInstances.filter((i) => i.username);

  const closeMode = await select({
    message: "How would you like to close Roblox instances?",
    options: [
      {
        value: "all-running",
        label: `[X] Close All (${runningInstances.length} running)`,
      },
      {
        value: "by-instance",
        label: "[-] Select Specific Users / Instances to Close",
      },
    ],
  });

  if (!closeMode || typeof closeMode === "symbol") {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  let instancesToClose: InstanceWithUser[] = [];

  switch (closeMode) {
    case "all-running":
      instancesToClose = runningInstances;
      break;

    case "by-instance":
      const instanceOptions = allInstances.map((instance, index) => {
        const deviceName = instance.deviceModel
          ? `${instance.deviceId} (${instance.deviceModel})`
          : instance.deviceId;
        const appName =
          instance.packageName === "com.roblox.client"
            ? "client"
            : instance.packageName.replace("com.roblox.", "");
        const userInfo = instance.username
          ? `@${instance.username}`
          : "No user";
        const statusIcon = instance.isRunning ? "[+]" : "[-]";

        return {
          value: index,
          label: `${statusIcon} ${deviceName} - ${appName} - ${userInfo}`,
        };
      });

      const selectedInstance = await select({
        message: "Select instance to close:",
        options: instanceOptions,
      });

      if (
        selectedInstance === undefined ||
        typeof selectedInstance === "symbol"
      ) {
        outro(colors.yellow("[!] Operation cancelled"));
        return;
      }

      const selectedInstanceData = allInstances[selectedInstance as number];
      if (!selectedInstanceData) {
        outro(colors.red("[X] Invalid instance selection"));
        return;
      }

      instancesToClose = [selectedInstanceData];
      break;
  }

  if (instancesToClose.length === 0) {
    outro(colors.yellow("[X] No instances selected to close."));
    return;
  }

  const shouldProceed = await confirm({
    message: `Force stop ${colors.bold(
      instancesToClose.length.toString()
    )} Roblox instance(s)?`,
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  console.log();
  console.log(colors.green("[^] Starting Roblox termination process..."));
  console.log();

  const closeSpinner = spinner();
  closeSpinner.start(colors.gray("Closing selected Roblox instances..."));

  const closeTasks: Promise<CloseResult>[] = instancesToClose.map((instance) =>
    closeRobloxInstance(
      instance.deviceId,
      instance.deviceModel,
      instance.packageName,
      instance.username
    )
  );

  const results = await Promise.all(closeTasks);
  closeSpinner.stop();

  console.log();
  console.log(colors.cyan("[!] " + colors.bold("Close Results:")));
  console.log();

  const successfulCloses = results.filter((result) => result.isSuccess);

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
    console.log(colors.cyan(`[-] ${deviceName}:`));

    deviceResults.forEach((result) => {
      const appName =
        result.packageName === "com.roblox.client"
          ? "client"
          : result.packageName.replace("com.roblox.", "");
      const userInfo = result.username ? ` (@${result.username})` : "";

      if (result.isSuccess) {
        console.log(
          colors.green(
            `   [+] ${appName}${userInfo} - Process closed successfully`
          )
        );
      } else {
        console.log(
          colors.red(
            `   [X] ${appName}${userInfo} - ${
              result.error || "Failed to close"
            }`
          )
        );
      }
    });
    console.log();
  }

  if (successfulCloses.length === instancesToClose.length) {
    outro(
      colors.green(
        `Successfully closed all selected instances! (${successfulCloses.length}/${instancesToClose.length})`
      )
    );
  } else if (successfulCloses.length > 0) {
    outro(
      colors.yellow(
        `[!] Some instances failed to close. (${successfulCloses.length}/${instancesToClose.length} successful)`
      )
    );
  } else {
    outro(
      colors.red(
        `[X] Failed to close any instances. (0/${instancesToClose.length})`
      )
    );
  }
}
