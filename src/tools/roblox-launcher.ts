import { text, spinner, outro, confirm, select } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { getConnectedDevices } from "@/utils/adb";
import {
  checkRobloxPresenceById,
  searchRobloxUserByUsername,
  validateRobloxCookie,
} from "@/utils/roblox";
import { rebootAllLDPlayerInstances } from "@/utils/ld";
import {
  loadConfig,
  saveConfig,
  type GameConfig,
  type GameTemplate,
} from "@/utils/config";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

const LAUNCHER_CONFIG_KEY = "robloxLauncher";
const COOKIE_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 mins
const PRESENCE_CACHE_DURATION_MS = 2 * 60 * 1000; // 2 mins
const DEFAULT_DEVICE_TIMEOUT = 15; // seconds
const DEFAULT_PRESENCE_CHECK_INTERVAL = 5; // minutes

interface RobloxInstance {
  packageName: string;
  deviceId: string;
}

interface DeviceStatus {
  deviceId: string;
  deviceModel?: string;
  instances: InstanceStatus[];
  isResponsive: boolean;
}

interface InstanceStatus {
  packageName: string;
  deviceId: string;
  isRobloxRunning: boolean;
  username?: string;
  assignedGame?: GameConfig;
  isInGame?: boolean;
  lastPresenceCheck?: number;
}

interface UsernameGameAssignment {
  username: string;
  gameConfig: GameConfig;
}

interface InstanceCacheEntry {
  deviceId: string;
  packageName: string;
  username?: string;
  lastCookieCheck?: number;
}

interface SimplifiedRobloxLauncherConfig {
  usernameAssignments: UsernameGameAssignment[];
  instanceCache: InstanceCacheEntry[];
  keepAliveInterval: number;
  autoRebootInterval: number;
  presenceCheckInterval: number;
  deviceTimeoutSeconds: number;
  defaultGame?: GameConfig;
  gameTemplates: GameTemplate[];
}

function getRobloxLauncherConfig(): SimplifiedRobloxLauncherConfig {
  const config = loadConfig();
  const launcherConfig = (config as any)[LAUNCHER_CONFIG_KEY] as
    | SimplifiedRobloxLauncherConfig
    | undefined;

  return {
    usernameAssignments: launcherConfig?.usernameAssignments || [],
    instanceCache: launcherConfig?.instanceCache || [],
    keepAliveInterval: launcherConfig?.keepAliveInterval || 30,
    autoRebootInterval: launcherConfig?.autoRebootInterval || 0,
    presenceCheckInterval:
      launcherConfig?.presenceCheckInterval || DEFAULT_PRESENCE_CHECK_INTERVAL,
    deviceTimeoutSeconds:
      launcherConfig?.deviceTimeoutSeconds || DEFAULT_DEVICE_TIMEOUT,
    defaultGame: launcherConfig?.defaultGame || undefined,
    gameTemplates: launcherConfig?.gameTemplates || [],
  };
}

function saveRobloxLauncherConfig(
  launcherConfig: SimplifiedRobloxLauncherConfig
): void {
  const config = loadConfig();
  config[LAUNCHER_CONFIG_KEY] = launcherConfig;
  saveConfig(config);
}

async function checkRobloxPresence(
  username: string,
  deviceId?: string,
  packageName?: string
): Promise<boolean> {
  try {
    if (deviceId && packageName) {
      try {
        const cookiePath = `/data/data/${packageName}/app_webview/Default/Cookies`;
        const sqlQuery = `SELECT value FROM cookies WHERE host_key = '.roblox.com' AND name = '.ROBLOSECURITY';`;
        const command = `adb -s ${deviceId} shell "su -c \\"sqlite3 ${cookiePath} \\\\\\"${sqlQuery}\\\\\\"\\"`;
        const { stdout } = await execAsync(command);
        const cookie = stdout
          .trim()
          .replace(/[\r\n\t]/g, "")
          .replace(/^["']|["']$/g, "");

        if (cookie && cookie.length > 0) {
          const validation = await validateRobloxCookie(cookie);
          if (validation.isValid && validation.userInfo?.userId) {
            return await checkRobloxPresenceById(validation.userInfo.userId);
          }
        }
      } catch (error) {
        Logger.muted(
          "[!] Cookie-based presence check failed, falling back to username lookup",
          { indent: 1 }
        );
      }
    }

    const exactUser = await searchRobloxUserByUsername(username);

    if (!exactUser) {
      Logger.muted(`[!] Exact user match not found for ${username}`, {
        indent: 1,
      });
      return false;
    }

    return await checkRobloxPresenceById(exactUser.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.muted(`[!] Presence check failed for ${username}: ${errorMessage}`, {
      indent: 1,
    });
    return false;
  }
}

async function isDeviceResponsive(
  deviceId: string,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutSeconds * 1000
    );

    const { stdout } = await execAsync(
      `adb -s ${deviceId} shell "echo responsive"`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);
    return stdout.trim() === "responsive";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      Logger.warning(
        `[!] Device ${deviceId} timeout after ${timeoutSeconds}s`,
        { indent: 1 }
      );
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.warning(`[!] Device ${deviceId} error: ${errorMessage}`, {
        indent: 1,
      });
    }
    return false;
  }
}

async function rebootDevice(deviceId: string): Promise<boolean> {
  try {
    Logger.warning(`[~] Rebooting unresponsive device ${deviceId}...`);

    await execAsync(`adb -s ${deviceId} reboot`);

    Logger.muted(`[~] Waiting for device ${deviceId} to come back online...`, {
      indent: 1,
    });

    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const devices = await getConnectedDevices();
      const device = devices.find(
        (d) => d.id === deviceId && d.status === "device"
      );
      if (device) {
        Logger.success(`[+] Device ${deviceId} is back online`, { indent: 1 });
        return true;
      }
    }

    Logger.error(`[X] Device ${deviceId} failed to come back online`, {
      indent: 1,
    });
    return false;
  } catch (error) {
    Logger.error(`[X] Failed to reboot device ${deviceId}: ${error}`, {
      indent: 1,
    });
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

    return packages.map((packageName) => ({ packageName, deviceId }));
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

  for (const device of devices) {
    const instances = await detectRobloxInstances(device.id);
    deviceInstanceMap.set(device.id, instances);
  }

  return deviceInstanceMap;
}

async function isRobloxRunning(
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

async function getUsernameFromInstance(
  deviceId: string,
  packageName: string
): Promise<string | null> {
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

async function launchRobloxGame(
  deviceId: string,
  packageName: string,
  gameConfig: GameConfig
): Promise<boolean> {
  try {
    const launchUrl =
      gameConfig.privateServerLink ||
      (gameConfig.gameId ? `roblox://placeId=${gameConfig.gameId}` : null);

    if (!launchUrl) return false;

    Logger.muted(
      `[>] Launching: ${
        gameConfig.gameName || "Game"
      } on ${packageName.replace("com.roblox.", "")}`,
      { indent: 1 }
    );

    await execAsync(
      `adb -s ${deviceId} shell "am start -a android.intent.action.VIEW -d '${launchUrl}' -p ${packageName} -f 0x10000000"`
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    return true;
  } catch (error) {
    Logger.error(`[X] Launch failed: ${error}`, { indent: 1 });
    return false;
  }
}

function getGameForUsername(
  username: string,
  launcherConfig: SimplifiedRobloxLauncherConfig
): GameConfig | undefined {
  const assignment = launcherConfig.usernameAssignments.find(
    (a) => a.username === username
  );
  return assignment ? assignment.gameConfig : launcherConfig.defaultGame;
}

async function getDeviceStatuses(): Promise<DeviceStatus[]> {
  const devices = await getConnectedDevices();
  const readyDevices = devices.filter((device) => device.status === "device");
  const deviceInstanceMap = await getAllRobloxInstances(readyDevices);
  const launcherConfig = getRobloxLauncherConfig();
  const statuses: DeviceStatus[] = [];
  let configChanged = false;

  for (const device of readyDevices) {
    const isResponsive = await isDeviceResponsive(
      device.id,
      launcherConfig.deviceTimeoutSeconds
    );

    const instances = deviceInstanceMap.get(device.id) || [];
    const instanceStatuses: InstanceStatus[] = [];

    if (isResponsive) {
      for (const instance of instances) {
        let cacheEntry = launcherConfig.instanceCache.find(
          (entry) =>
            entry.deviceId === device.id &&
            entry.packageName === instance.packageName
        );

        let username = cacheEntry?.username;
        const now = Date.now();

        const shouldCheckCookie =
          !cacheEntry?.lastCookieCheck ||
          !username ||
          now - cacheEntry.lastCookieCheck > COOKIE_CACHE_DURATION_MS;

        if (shouldCheckCookie) {
          Logger.muted(
            `[@] Checking cookies for ${instance.packageName} on ${device.id}...`,
            { indent: 1 }
          );
          const instanceUsername = await getUsernameFromInstance(
            device.id,
            instance.packageName
          );

          if (instanceUsername) {
            username = instanceUsername;
            if (cacheEntry) {
              cacheEntry.username = username;
              cacheEntry.lastCookieCheck = now;
            } else {
              cacheEntry = {
                deviceId: device.id,
                packageName: instance.packageName,
                username: username,
                lastCookieCheck: now,
              };
              launcherConfig.instanceCache.push(cacheEntry);
            }
            configChanged = true;
          } else if (cacheEntry) {
            cacheEntry.lastCookieCheck = now;
            configChanged = true;
          }
        } else if (cacheEntry && cacheEntry.lastCookieCheck) {
          const cacheAgeMinutes = Math.floor(
            (now - cacheEntry.lastCookieCheck) / (60 * 1000)
          );
          Logger.muted(
            `[+] Using cached username for ${instance.packageName} on ${device.id} (${cacheAgeMinutes}m old)`,
            { indent: 1 }
          );
        }

        const assignedGame = username
          ? getGameForUsername(username, launcherConfig)
          : undefined;

        const instanceStatus: InstanceStatus = {
          packageName: instance.packageName,
          deviceId: device.id,
          isRobloxRunning: await isRobloxRunning(
            device.id,
            instance.packageName
          ),
          username: username || undefined,
          assignedGame,
        };

        instanceStatuses.push(instanceStatus);
      }
    } else {
      for (const instance of instances) {
        const cacheEntry = launcherConfig.instanceCache.find(
          (entry) =>
            entry.deviceId === device.id &&
            entry.packageName === instance.packageName
        );

        const instanceStatus: InstanceStatus = {
          packageName: instance.packageName,
          deviceId: device.id,
          isRobloxRunning: false,
          username: cacheEntry?.username || undefined,
          assignedGame: cacheEntry?.username
            ? getGameForUsername(cacheEntry.username, launcherConfig)
            : undefined,
        };

        instanceStatuses.push(instanceStatus);
      }
    }

    const deviceStatus: DeviceStatus = {
      deviceId: device.id,
      deviceModel: device.model,
      instances: instanceStatuses,
      isResponsive,
    };

    statuses.push(deviceStatus);
  }

  if (configChanged) {
    saveRobloxLauncherConfig(launcherConfig);
  }

  return statuses;
}

function displayDeviceStatuses(statuses: DeviceStatus[]): void {
  Logger.title("[>] Device & Instance Status");

  if (statuses.length === 0) {
    Logger.warning("[-] No devices found");
    return;
  }

  let totalInstances = 0;

  for (const status of statuses) {
    const deviceName = status.deviceModel
      ? `${status.deviceId} (${status.deviceModel})`
      : status.deviceId;

    const responsiveStatus = status.isResponsive
      ? colors.green("[+] Responsive")
      : colors.red("[X] Unresponsive");

    Logger.info(
      `[-] ${deviceName}: ${status.instances.length} instance(s) - ${responsiveStatus}`
    );

    for (const instance of status.instances) {
      const appName =
        instance.packageName === "com.roblox.client"
          ? "client"
          : instance.packageName.replace("com.roblox.", "");
      const robloxStatus = instance.isRobloxRunning
        ? colors.green("[+] Running")
        : colors.red("[X] Stopped");
      const username = instance.username
        ? colors.blue(`@${instance.username}`)
        : colors.gray("No user");
      const gameInfo = instance.assignedGame
        ? instance.assignedGame.gameName ||
          instance.assignedGame.gameId ||
          "Private Server"
        : colors.gray("No game assigned");

      const presenceInfo =
        instance.isInGame !== undefined
          ? instance.isInGame
            ? colors.green("[+] In Game")
            : colors.yellow("[X] Not In Game")
          : "";

      Logger.normal(`└── ${colors.white(appName)}`, { indent: 1 });
      Logger.muted(`Roblox: ${robloxStatus}`, { indent: 2 });
      Logger.muted(`User: ${username}`, { indent: 2 });
      Logger.muted(`Game: ${colors.cyan(gameInfo)}`, { indent: 2 });
      if (presenceInfo) {
        Logger.muted(`Presence: ${presenceInfo}`, { indent: 2 });
      }
      Logger.space();
      totalInstances++;
    }
  }

  Logger.info(
    `Total instances across all devices: ${colors.bold(
      totalInstances.toString()
    )}`
  );
}

async function getGameConfig(gameType: string): Promise<GameConfig | null> {
  if (gameType === "gameId") {
    const gameId = await text({
      message: "Enter Game ID:",
      placeholder: "123456789",
      validate: (value) =>
        !value
          ? "Game ID is required"
          : !/^\d+$/.test(value)
            ? "Game ID must be numbers only"
            : undefined,
    });
    if (!gameId || typeof gameId === "symbol") return null;

    const gameName = await text({
      message: "Enter game name (optional):",
      placeholder: "Game",
    });
    return {
      gameId: gameId.toString(),
      gameName: typeof gameName === "string" ? gameName : undefined,
    };
  } else {
    const privateServerLink = await text({
      message: "Enter Private Server Link:",
      placeholder:
        "https://www.roblox.com/games/123456789/Game?privateServerLinkCode=...",
      validate: (value) =>
        !value
          ? "Private server link is required"
          : !value.includes("privateServerLinkCode")
            ? "Invalid private server link"
            : undefined,
    });
    if (!privateServerLink || typeof privateServerLink === "symbol")
      return null;

    const gameName = await text({
      message: "Enter game name (optional):",
      placeholder: "Private Server Game",
    });
    return {
      privateServerLink: privateServerLink.toString(),
      gameName: typeof gameName === "string" ? gameName : undefined,
    };
  }
}

async function assignGameToUsername(): Promise<void> {
  while (true) {
    const statuses = await getDeviceStatuses();

    const allUsernames = new Set<string>();
    statuses.forEach((device) => {
      device.instances.forEach((instance) => {
        if (instance.username) {
          allUsernames.add(instance.username);
        }
      });
    });

    if (allUsernames.size === 0) {
      Logger.error("[X] No logged-in users found");
      return;
    }

    const launcherConfig = getRobloxLauncherConfig();

    const usernameOptions = Array.from(allUsernames).map((username) => {
      const existingAssignment = launcherConfig.usernameAssignments.find(
        (a) => a.username === username
      );
      let gameInfo = "";
      if (existingAssignment) {
        gameInfo = existingAssignment.gameConfig.privateServerLink
          ? ` - [*] ${
              existingAssignment.gameConfig.gameName || "Private Server"
            }`
          : ` - [>] ${
              existingAssignment.gameConfig.gameName ||
              existingAssignment.gameConfig.gameId
            }`;
      } else {
        gameInfo = " - [-] No game assigned";
      }
      return {
        value: username,
        label: `@${username}${gameInfo}`,
      };
    });

    usernameOptions.push({ value: "back", label: "[<] Back to main menu" });

    const selectedUsername = await select({
      message: "Select username to assign game:",
      options: usernameOptions,
    });

    if (
      !selectedUsername ||
      typeof selectedUsername === "symbol" ||
      selectedUsername === "back"
    ) {
      return;
    }

    const gameType = await select({
      message: "What type of game link?",
      options: [
        { value: "template", label: "[#] Use Saved Template" },
        { value: "gameId", label: "[>] Game ID (e.g., 123456789)" },
        { value: "privateServer", label: "[*] Private Server Link" },
        { value: "remove", label: "[X] Remove game assignment" },
        { value: "cancel", label: "[!] Cancel - back to username selection" },
      ],
    });

    if (!gameType || typeof gameType === "symbol" || gameType === "cancel")
      continue;

    if (gameType === "remove") {
      launcherConfig.usernameAssignments =
        launcherConfig.usernameAssignments.filter(
          (a) => a.username !== selectedUsername
        );
      saveRobloxLauncherConfig(launcherConfig);
      Logger.success(`[+] Game assignment removed for @${selectedUsername}!`);
      Logger.space();
      continue;
    }

    let gameConfig: GameConfig = {};

    if (gameType === "template") {
      if (launcherConfig.gameTemplates.length === 0) {
        Logger.warning("[!] No saved game templates found");
        Logger.muted("Create templates using 'Manage Game Templates' first", {
          indent: 1,
        });
        continue;
      }

      const templateOptions = launcherConfig.gameTemplates.map((template) => ({
        value: template.id,
        label: `${template.name} - ${
          template.gameConfig.privateServerLink
            ? "[*] Private Server"
            : "[>] Game ID"
        }`,
      }));
      templateOptions.push({
        value: "cancel",
        label: "[!] Cancel - back to game type selection",
      });

      const selectedTemplate = await select({
        message: "Select a game template:",
        options: templateOptions,
      });
      if (
        !selectedTemplate ||
        typeof selectedTemplate === "symbol" ||
        selectedTemplate === "cancel"
      )
        continue;

      const template = launcherConfig.gameTemplates.find(
        (t) => t.id === selectedTemplate
      );
      if (template) {
        gameConfig = { ...template.gameConfig };
      } else {
        Logger.error("[X] Template not found");
        continue;
      }
    } else {
      const config = await getGameConfig(gameType);
      if (!config) continue;
      gameConfig = config;
    }

    const existingIndex = launcherConfig.usernameAssignments.findIndex(
      (a) => a.username === selectedUsername
    );
    const assignment: UsernameGameAssignment = {
      username: selectedUsername,
      gameConfig,
    };

    if (existingIndex >= 0) {
      launcherConfig.usernameAssignments[existingIndex] = assignment;
    } else {
      launcherConfig.usernameAssignments.push(assignment);
    }

    saveRobloxLauncherConfig(launcherConfig);
    Logger.success(`[+] Game assignment saved for @${selectedUsername}!`);
    Logger.space();

    const assignAnother = await confirm({
      message: "Assign game to another username?",
    });
    if (!assignAnother) break;
    Logger.space();
  }
}

async function launchAssignedGames(): Promise<void> {
  const statuses = await getDeviceStatuses();
  const instancesWithGames = statuses.flatMap((device) =>
    device.instances.filter(
      (instance) => instance.assignedGame && instance.username
    )
  );

  if (instancesWithGames.length === 0) {
    Logger.warning("[!] No instances have assigned games");
    return;
  }

  const shouldLaunch = await confirm({
    message: `Launch games on ${instancesWithGames.length} instance(s)?`,
  });
  if (!shouldLaunch) return;

  Logger.success("[^] Launching games...", {
    spaceBefore: true,
    spaceAfter: true,
  });

  for (const instance of instancesWithGames) {
    const deviceStatus = statuses.find((d) => d.deviceId === instance.deviceId);
    const deviceName = deviceStatus?.deviceModel
      ? `${instance.deviceId} (${deviceStatus.deviceModel})`
      : instance.deviceId;
    const appName =
      instance.packageName === "com.roblox.client"
        ? "client"
        : instance.packageName.replace("com.roblox.", "");

    Logger.info(`[-] ${deviceName} - ${appName} (@${instance.username})`);

    if (instance.assignedGame) {
      const success = await launchRobloxGame(
        instance.deviceId,
        instance.packageName,
        instance.assignedGame
      );
      Logger.normal(
        success
          ? colors.green(`   [+] Successfully launched`)
          : colors.red(`   [X] Launch failed`),
        { indent: 1 }
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  Logger.success("Launch sequence complete!", { spaceBefore: true });
}

async function createGameTemplate(): Promise<void> {
  Logger.info("[+] Create New Game Template", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const templateName = await text({
    message: "Enter template name:",
    placeholder: "Template Name",
    validate: (value) => {
      if (!value) return "Template name is required";
      const launcherConfig = getRobloxLauncherConfig();
      return launcherConfig.gameTemplates.some((t) => t.name === value)
        ? "Template name already exists"
        : undefined;
    },
  });

  if (!templateName || typeof templateName === "symbol") return;

  const gameType = await select({
    message: "What type of game?",
    options: [
      { value: "gameId", label: "[>] Game ID" },
      { value: "privateServer", label: "[*] Private Server Link" },
    ],
  });

  if (!gameType || typeof gameType === "symbol") return;

  const gameConfig = await getGameConfig(gameType);
  if (!gameConfig) return;

  const launcherConfig = getRobloxLauncherConfig();
  const template: GameTemplate = {
    id: Date.now().toString(),
    name: templateName.toString(),
    gameConfig,
    createdAt: Date.now(),
  };

  launcherConfig.gameTemplates.push(template);
  saveRobloxLauncherConfig(launcherConfig);
  Logger.success(`[+] Template "${templateName}" created successfully!`);
}

async function manageGameTemplates(): Promise<void> {
  while (true) {
    const launcherConfig = getRobloxLauncherConfig();

    Logger.title("[#] Manage Game Templates");
    Logger.muted("Create and manage reusable game configurations", {
      indent: 1,
    });

    if (launcherConfig.gameTemplates.length > 0) {
      Logger.info("[#] Saved Templates:");
      launcherConfig.gameTemplates.forEach((template, index) => {
        const gameType = template.gameConfig.privateServerLink
          ? "[*] Private Server"
          : "[>] Game ID";
        const gameInfo = template.gameConfig.privateServerLink
          ? template.gameConfig.privateServerLink.substring(0, 50) + "..."
          : template.gameConfig.gameId;
        Logger.normal(`${index + 1}. ${template.name}`, { indent: 1 });
        Logger.muted(`Type: ${gameType}`, { indent: 2 });
        Logger.muted(`Info: ${gameInfo}`, { indent: 2 });
        Logger.space();
      });
    } else {
      Logger.warning("[#] No templates saved yet", {
        spaceBefore: true,
        spaceAfter: true,
      });
    }

    const action = await select({
      message: "What would you like to do?",
      options: [
        { value: "create", label: "[+] Create New Template" },
        ...(launcherConfig.gameTemplates.length > 0
          ? [
              { value: "delete", label: "[X] Delete Template" },
              { value: "edit", label: "[>] Edit Template" },
            ]
          : []),
        { value: "back", label: "[<] Back to main menu" },
      ],
    });

    if (!action || typeof action === "symbol" || action === "back") return;

    if (action === "create") {
      await createGameTemplate();
    } else if (action === "delete") {
      const templateOptions = launcherConfig.gameTemplates.map((template) => ({
        value: template.id,
        label: `${template.name} - ${
          template.gameConfig.privateServerLink
            ? "[*] Private Server"
            : "[>] Game ID"
        }`,
      }));

      const selectedTemplate = await select({
        message: "Select template to delete:",
        options: templateOptions,
      });
      if (!selectedTemplate || typeof selectedTemplate === "symbol") continue;

      const template = launcherConfig.gameTemplates.find(
        (t) => t.id === selectedTemplate
      );
      if (!template) continue;

      const confirmDelete = await confirm({
        message: `Delete template "${template.name}"?`,
      });
      if (!confirmDelete) continue;

      launcherConfig.gameTemplates = launcherConfig.gameTemplates.filter(
        (t) => t.id !== selectedTemplate
      );
      saveRobloxLauncherConfig(launcherConfig);
      Logger.success(`[+] Template "${template.name}" deleted successfully!`);
    } else if (action === "edit") {
      const templateOptions = launcherConfig.gameTemplates.map((template) => ({
        value: template.id,
        label: `${template.name} - ${
          template.gameConfig.privateServerLink
            ? "[*] Private Server"
            : "[>] Game ID"
        }`,
      }));

      const selectedTemplate = await select({
        message: "Select template to edit:",
        options: templateOptions,
      });
      if (!selectedTemplate || typeof selectedTemplate === "symbol") continue;

      const templateIndex = launcherConfig.gameTemplates.findIndex(
        (t) => t.id === selectedTemplate
      );
      if (templateIndex === -1) continue;

      const template = launcherConfig.gameTemplates[templateIndex];
      if (!template) continue;

      const newName = await text({
        message: "Enter new template name:",
        placeholder: template.name,
        validate: (value) => {
          if (!value) return "Template name is required";
          return value !== template.name &&
            launcherConfig.gameTemplates.some((t) => t.name === value)
            ? "Template name already exists"
            : undefined;
        },
      });

      if (!newName || typeof newName === "symbol") continue;

      template.name = newName.toString();
      saveRobloxLauncherConfig(launcherConfig);
      Logger.success(`[+] Template renamed to "${newName}" successfully!`);
    }
  }
}

async function setDefaultGame(): Promise<void> {
  Logger.info("[>] Set Default Game", { spaceBefore: true });
  Logger.muted(
    "This game will be used for users without specific assignments",
    { indent: 1 }
  );

  const gameType = await select({
    message: "What type of default game?",
    options: [
      { value: "gameId", label: "[>] Game ID" },
      { value: "privateServer", label: "[*] Private Server Link" },
      { value: "remove", label: "[X] Remove default game" },
    ],
  });

  if (!gameType || typeof gameType === "symbol") return;

  const launcherConfig = getRobloxLauncherConfig();

  if (gameType === "remove") {
    launcherConfig.defaultGame = undefined;
    saveRobloxLauncherConfig(launcherConfig);
    Logger.success("[+] Default game removed");
    return;
  }

  const gameConfig = await getGameConfig(gameType);
  if (!gameConfig) return;

  launcherConfig.defaultGame = gameConfig;
  saveRobloxLauncherConfig(launcherConfig);
  Logger.success("[+] Default game saved!");
}

async function configureAdvancedSettings(): Promise<void> {
  const launcherConfig = getRobloxLauncherConfig();

  Logger.title("[>] Advanced Settings");

  const deviceTimeoutText = await text({
    message: "Device timeout (seconds):",
    placeholder: launcherConfig.deviceTimeoutSeconds.toString(),
    validate: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 5 || num > 60
        ? "Enter a number between 5 and 60 seconds"
        : undefined;
    },
  });

  if (!deviceTimeoutText || typeof deviceTimeoutText === "symbol") return;

  const presenceCheckText = await text({
    message: "Presence check interval (minutes):",
    placeholder: launcherConfig.presenceCheckInterval.toString(),
    validate: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 1 || num > 30
        ? "Enter a number between 1 and 30 minutes"
        : undefined;
    },
  });

  if (!presenceCheckText || typeof presenceCheckText === "symbol") return;

  launcherConfig.deviceTimeoutSeconds = parseInt(deviceTimeoutText);
  launcherConfig.presenceCheckInterval = parseInt(presenceCheckText);
  saveRobloxLauncherConfig(launcherConfig);

  Logger.success("[+] Advanced settings saved!");
}

async function checkPresenceForInstances(
  instances: InstanceStatus[]
): Promise<InstanceStatus[]> {
  const now = Date.now();
  const updatedInstances = [...instances];

  for (let i = 0; i < updatedInstances.length; i++) {
    const instance = updatedInstances[i];
    if (!instance || !instance.username) continue;

    const shouldCheckPresence =
      !instance.lastPresenceCheck ||
      now - instance.lastPresenceCheck > PRESENCE_CACHE_DURATION_MS;

    if (shouldCheckPresence) {
      Logger.muted(`[*] Checking presence for @${instance.username}...`, {
        indent: 1,
      });

      const isInGame = await checkRobloxPresence(
        instance.username,
        instance.deviceId,
        instance.packageName
      );
      updatedInstances[i] = {
        ...instance,
        isInGame,
        lastPresenceCheck: now,
      };
    }
  }

  return updatedInstances;
}

async function keepAliveMode(): Promise<void> {
  const launcherConfig = getRobloxLauncherConfig();

  Logger.title("[~] Keep Alive Mode Configuration");
  Logger.muted(
    "Set up automatic monitoring with crash detection and presence checking",
    { indent: 1 }
  );

  const intervalText = await text({
    message: "Check interval (seconds):",
    placeholder: launcherConfig.keepAliveInterval.toString(),
    validate: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 10 || num > 300
        ? "Enter a number between 10 and 300 seconds"
        : undefined;
    },
  });

  if (!intervalText || typeof intervalText === "symbol") return;

  const enableAutoReboot = await confirm({
    message:
      "Enable auto-reboot of LDPlayer instances every 3 hours? (Prevents memory issues)",
  });

  let autoRebootHours = 0;
  if (enableAutoReboot) {
    const rebootIntervalText = await text({
      message: "Auto-reboot interval (hours):",
      placeholder: "3",
      validate: (value) => {
        const num = parseInt(value);
        return isNaN(num) || num < 1 || num > 24
          ? "Enter a number between 1 and 24 hours"
          : undefined;
      },
    });

    if (!rebootIntervalText || typeof rebootIntervalText === "symbol") return;
    autoRebootHours = parseInt(rebootIntervalText);
  }

  const enablePresenceCheck = await confirm({
    message:
      "Enable Roblox presence checking? (Detects if players are actually in-game)",
  });

  const interval = parseInt(intervalText) * 1000;
  launcherConfig.keepAliveInterval = interval / 1000;
  launcherConfig.autoRebootInterval = autoRebootHours;
  saveRobloxLauncherConfig(launcherConfig);

  Logger.success("[~] Keep Alive Mode Started", { spaceBefore: true });
  Logger.muted(`Checking every ${interval / 1000} seconds...`, { indent: 1 });
  if (autoRebootHours > 0) {
    Logger.muted(`Auto-rebooting LDPlayer every ${autoRebootHours} hours`, {
      indent: 1,
    });
  }
  if (enablePresenceCheck) {
    Logger.muted(
      `Presence checking every ${launcherConfig.presenceCheckInterval} minutes`,
      { indent: 1 }
    );
  }
  Logger.muted("Press Ctrl+C to stop", { indent: 1 });
  Logger.space();

  let lastRebootTime = Date.now();
  let lastPresenceCheck = Date.now();
  const rebootIntervalMs = autoRebootHours * 60 * 60 * 1000;
  const presenceIntervalMs = launcherConfig.presenceCheckInterval * 60 * 1000;

  try {
    while (true) {
      const now = Date.now();

      if (autoRebootHours > 0 && now - lastRebootTime >= rebootIntervalMs) {
        Logger.warning(
          `[~] ${autoRebootHours} hours passed - Starting auto-reboot...`
        );
        await rebootAllLDPlayerInstances();
        lastRebootTime = now;

        Logger.info("[>] Re-launching assigned games after reboot...");
        const statuses = await getDeviceStatuses();
        const instancesWithGames = statuses.flatMap((device) =>
          device.instances.filter(
            (instance) => instance.assignedGame && instance.username
          )
        );

        for (const instance of instancesWithGames) {
          if (instance.assignedGame) {
            const deviceStatus = statuses.find(
              (d) => d.deviceId === instance.deviceId
            );
            const deviceName = deviceStatus?.deviceModel
              ? `${instance.deviceId} (${deviceStatus.deviceModel})`
              : instance.deviceId;
            const appName =
              instance.packageName === "com.roblox.client"
                ? "client"
                : instance.packageName.replace("com.roblox.", "");

            Logger.muted(
              `[>] Launching game on ${deviceName} - ${appName} (@${instance.username})...`,
              { indent: 1 }
            );
            await launchRobloxGame(
              instance.deviceId,
              instance.packageName,
              instance.assignedGame
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
        Logger.success("[+] Post-reboot game launches complete!");
        Logger.space();
      }

      let statuses = await getDeviceStatuses();

      for (const deviceStatus of statuses) {
        if (!deviceStatus.isResponsive) {
          Logger.error(
            `[X] Device ${deviceStatus.deviceId} is unresponsive, attempting reboot...`
          );
          const rebootSuccess = await rebootDevice(deviceStatus.deviceId);
          if (rebootSuccess) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            const updatedStatuses = await getDeviceStatuses();
            const updatedDevice = updatedStatuses.find(
              (d) => d.deviceId === deviceStatus.deviceId
            );
            if (updatedDevice) {
              const index = statuses.findIndex(
                (d) => d.deviceId === deviceStatus.deviceId
              );
              if (index !== -1) {
                statuses[index] = updatedDevice;
              }
            }
          }
        }
      }

      const instancesWithGames = statuses.flatMap((device) =>
        device.instances.filter(
          (instance) =>
            instance.assignedGame && instance.username && device.isResponsive
        )
      );

      if (instancesWithGames.length === 0) {
        Logger.warning(
          "[!] No instances with assigned games or all devices unresponsive, waiting..."
        );
        await new Promise((resolve) => setTimeout(resolve, interval));
        continue;
      }

      let updatedInstancesWithGames = instancesWithGames;
      if (
        enablePresenceCheck &&
        now - lastPresenceCheck >= presenceIntervalMs
      ) {
        Logger.info("[*] Running presence checks...");
        updatedInstancesWithGames =
          await checkPresenceForInstances(instancesWithGames);
        lastPresenceCheck = now;
      }

      const timestamp = new Date().toLocaleTimeString();
      let nextRebootInfo = "";
      if (autoRebootHours > 0) {
        const timeUntilReboot = rebootIntervalMs - (now - lastRebootTime);
        const hoursUntilReboot = Math.floor(timeUntilReboot / (60 * 60 * 1000));
        const minutesUntilReboot = Math.floor(
          (timeUntilReboot % (60 * 60 * 1000)) / (60 * 1000)
        );
        nextRebootInfo = colors.gray(
          ` (Next reboot: ${hoursUntilReboot}h ${minutesUntilReboot}m)`
        );
      }

      Logger.warning(
        `[~] ${timestamp} - Checking ${updatedInstancesWithGames.length} instances...${nextRebootInfo}`
      );

      for (const instance of updatedInstancesWithGames) {
        const deviceStatus = statuses.find(
          (d) => d.deviceId === instance.deviceId
        );
        const deviceName = deviceStatus?.deviceModel
          ? `${instance.deviceId} (${deviceStatus.deviceModel})`
          : instance.deviceId;
        const appName =
          instance.packageName === "com.roblox.client"
            ? "client"
            : instance.packageName.replace("com.roblox.", "");

        const shouldRelaunch =
          !instance.isRobloxRunning ||
          (enablePresenceCheck && instance.isInGame === false);

        if (shouldRelaunch && instance.assignedGame) {
          const reason = !instance.isRobloxRunning ? "stopped" : "not in game";

          Logger.error(
            `[X] ${deviceName} - ${appName} (@${instance.username}) ${reason}, relaunching...`,
            { indent: 1 }
          );
          const success = await launchRobloxGame(
            instance.deviceId,
            instance.packageName,
            instance.assignedGame
          );
          Logger.normal(
            success
              ? colors.green(
                  `   [+] ${deviceName} - ${appName} (@${instance.username}) relaunched`
                )
              : colors.red(
                  `   [X] ${deviceName} - ${appName} (@${instance.username}) relaunch failed`
                ),
            { indent: 1 }
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          const statusInfo =
            enablePresenceCheck && instance.isInGame !== undefined
              ? instance.isInGame
                ? " (in game)"
                : " (not in game)"
              : "";
          Logger.success(
            `[+] ${deviceName} - ${appName} (@${instance.username}) running${statusInfo}`,
            { indent: 1 }
          );
        }
      }

      Logger.muted(`Next check in ${interval / 1000} seconds...`, {
        indent: 1,
      });
      Logger.space();
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("SIGINT")) {
      Logger.warning("[!] Keep alive mode stopped", { spaceBefore: true });
    } else {
      Logger.error(`[X] Keep alive error: ${error}`, { spaceBefore: true });
    }
  }
}

export async function robloxLauncher(): Promise<void> {
  Logger.title("[>] Roblox Auto Launcher");
  Logger.muted(
    "Launch games automatically with username-based assignments, crash detection, and presence monitoring",
    { indent: 1 }
  );

  const loadingSpinner = spinner();
  loadingSpinner.start(colors.gray("Loading device and instance statuses..."));
  const statuses = await getDeviceStatuses();
  loadingSpinner.stop();

  displayDeviceStatuses(statuses);

  const action = await select({
    message: "What would you like to do?",
    options: [
      { value: "launch", label: "[^] Launch Assigned Games" },
      { value: "assign", label: "[#] Assign Game to Username" },
      { value: "templates", label: "[#] Manage Game Templates" },
      { value: "default", label: "[>] Set Default Game" },
      { value: "advanced", label: "[>] Advanced Settings" },
      { value: "keepalive", label: "[~] Keep Alive Mode" },
      { value: "refresh", label: "[~] Refresh Status" },
    ],
  });

  if (!action || typeof action === "symbol") {
    outro(colors.yellow("[!] Cancelled"));
    return;
  }

  switch (action) {
    case "launch":
      await launchAssignedGames();
      break;
    case "assign":
      await assignGameToUsername();
      break;
    case "templates":
      await manageGameTemplates();
      break;
    case "default":
      await setDefaultGame();
      break;
    case "advanced":
      await configureAdvancedSettings();
      break;
    case "keepalive":
      await keepAliveMode();
      break;
    case "refresh":
      await robloxLauncher();
      return;
  }

  outro(colors.cyan("[*] Operation complete"));
}
