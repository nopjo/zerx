import { outro, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";
import { Logger } from "@/utils/logger";
import { getCookieFilePath, loadCookiesFromFile } from "./cookie-management";
import {
  getAllRobloxClones,
  printCloneDetectionResults,
} from "./clone-detection";
import { loginToClone } from "./login-process";
import type { RobloxClone, LoginResult, LoginMode } from "./types";
import { select } from "@/utils/prompts";

export class AutomaticLoginTool extends BaseTool {
  constructor() {
    super({
      id: "automatic-login",
      label: "Automatic Login (With Cookie List)",
      description: "Automatically login to Roblox using saved cookies",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[*] ${this.label}`);
    Logger.muted(this.description, {
      indent: 1,
    });
  }

  override async execute(): Promise<ToolResult> {
    try {
      Logger.muted("[@] Please specify your cookies file path...");
      const cookieFilePath = await getCookieFilePath();

      if (!cookieFilePath) {
        outro(colors.yellow("[!] Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no cookie file specified",
        };
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
          return {
            success: false,
            message: "Cookies file is empty",
          };
        }
      } catch (error) {
        loadSpinner.stop(colors.red("[X] Failed to load cookies"));
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        outro(colors.red(`[X] Error: ${errorMessage}`));
        return {
          success: false,
          message: `Failed to load cookies: ${errorMessage}`,
        };
      }

      loadSpinner.stop(colors.green(`[+] Loaded ${cookies.length} cookies`));

      const deviceSpinner = spinner();
      deviceSpinner.start(colors.gray("Scanning for connected devices..."));

      const devices = await getConnectedDevices();
      deviceSpinner.stop(colors.green("[+] Device scan complete"));

      printConnectedDevices(devices);

      if (devices.length === 0) {
        outro(
          colors.red("[X] No devices found. Connect devices and try again.")
        );
        return {
          success: false,
          message: "No devices found",
        };
      }

      const readyDevices = devices.filter(
        (device) => device.status === "device"
      );

      if (readyDevices.length === 0) {
        outro(
          colors.red(
            "[X] No authorized devices found. Check device permissions."
          )
        );
        return {
          success: false,
          message: "No authorized devices found",
        };
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
        return {
          success: false,
          message: "No Roblox apps found",
        };
      }

      const loginMode = (await select({
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
      })) as LoginMode;

      if (!loginMode || typeof loginMode === "symbol") {
        outro(colors.yellow("Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no login mode selected",
        };
      }

      const loginResult = await this.executeLoginProcess(
        allClones,
        cookies,
        loginMode,
        readyDevices
      );

      return loginResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Unexpected error: ${errorMessage}`));
      return {
        success: false,
        message: `Unexpected error: ${errorMessage}`,
      };
    }
  }

  private async executeLoginProcess(
    allClones: Array<{ clone: RobloxClone; deviceModel?: string }>,
    cookies: string[],
    loginMode: LoginMode,
    readyDevices: any[]
  ): Promise<ToolResult> {
    Logger.success("[^] Starting automatic login process...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    const loginSpinner = spinner();
    loginSpinner.start(colors.gray("Logging in to all Roblox instances..."));

    const loginTasks: Promise<LoginResult>[] = [];

    if (cookies.length === 0) {
      outro(colors.red("[X] No cookies available for login"));
      return {
        success: false,
        message: "No cookies available for login",
      };
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
        loginToClone(
          clone.deviceId,
          deviceModel,
          clone.packageName,
          cookieToUse
        )
      );
    }

    if (loginTasks.length === 0) {
      outro(colors.red("[X] No valid login tasks created"));
      return {
        success: false,
        message: "No valid login tasks created",
      };
    }

    const results = await Promise.all(loginTasks);
    loginSpinner.stop();

    this.displayResults(results, readyDevices, allClones);

    const successfulLogins = results.filter((result) => result.isSuccess);

    if (successfulLogins.length === allClones.length) {
      outro(
        colors.green(
          `All logins completed successfully! (${successfulLogins.length}/${allClones.length} instances)`
        )
      );
      return {
        success: true,
        message: `All logins completed successfully! (${successfulLogins.length}/${allClones.length} instances)`,
        data: {
          successfulLogins: successfulLogins.length,
          totalLogins: allClones.length,
        },
      };
    } else if (successfulLogins.length > 0) {
      outro(
        colors.yellow(
          `[!] Some logins failed. (${successfulLogins.length}/${allClones.length} successful)`
        )
      );
      return {
        success: true,
        message: `Some logins failed. (${successfulLogins.length}/${allClones.length} successful)`,
        data: {
          successfulLogins: successfulLogins.length,
          totalLogins: allClones.length,
        },
      };
    } else {
      outro(
        colors.red(`[X] All logins failed. (0/${allClones.length} instances)`)
      );
      return {
        success: false,
        message: `All logins failed. (0/${allClones.length} instances)`,
        data: { successfulLogins: 0, totalLogins: allClones.length },
      };
    }
  }

  private displayResults(
    results: LoginResult[],
    readyDevices: any[],
    allClones: Array<{ clone: RobloxClone; deviceModel?: string }>
  ): void {
    Logger.title("[*] Login Results by Device:");

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
            Logger.muted(`Username: ${result.userInfo.userName}`, {
              indent: 2,
            });
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
  }
}

ToolRegistry.register(new AutomaticLoginTool());
