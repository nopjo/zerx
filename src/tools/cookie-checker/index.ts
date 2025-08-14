import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";
import { Logger } from "@/utils/logger";
import {
  getAllRobloxInstances,
  printInstanceDetectionResults,
} from "./instance-detection";
import { checkCookieFromInstance } from "./cookie-extraction";
import {
  getCheckType,
  selectSpecificDevice,
  selectSpecificInstance,
  getInstancesToCheck,
} from "./check-selection";
import { saveCookies } from "./cookie-saving";
import { displayCookieResults } from "./results-display";
import type { RobloxInstance } from "./types";

export class CookieCheckerTool extends BaseTool {
  constructor() {
    super({
      id: "cookie-checker",
      label: "Roblox Cookie Checker (Checks All Cookies For Every Device Open)",
      description:
        "Extract and validate Roblox cookies from all instances on connected devices",
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
      const devices = await this.getConnectedDevices();
      if (!devices.success) return devices;

      const instances = await this.detectInstances(devices.data!);
      if (!instances.success) return instances;

      const selection = await this.getCheckSelection(instances.data!);
      if (!selection.success) return selection;

      const confirmed = await this.confirmCheckOperation(
        selection.data!.length
      );
      if (!confirmed.success) return confirmed;

      return await this.executeCheckOperation(selection.data!, devices.data!);
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

  private async getConnectedDevices(): Promise<ToolResult & { data?: any[] }> {
    const s = spinner();
    s.start(colors.gray("Scanning for connected devices..."));

    const devices = await getConnectedDevices();
    s.stop(colors.green("[+] Device scan complete"));

    printConnectedDevices(devices);

    if (devices.length === 0) {
      outro(colors.red("[X] No devices found. Connect devices and try again."));
      return {
        success: false,
        message: "No devices found",
      };
    }

    const readyDevices = devices.filter((device) => device.status === "device");

    if (readyDevices.length === 0) {
      outro(
        colors.red("[X] No authorized devices found. Check device permissions.")
      );
      return {
        success: false,
        message: "No authorized devices found",
      };
    }

    return {
      success: true,
      message: `Found ${readyDevices.length} ready devices`,
      data: readyDevices,
    };
  }

  private async detectInstances(devices: any[]): Promise<
    ToolResult & {
      data?: {
        deviceInstanceMap: Map<string, RobloxInstance[]>;
        allInstances: Array<{ instance: RobloxInstance; deviceModel?: string }>;
      };
    }
  > {
    try {
      const deviceInstanceMap = await getAllRobloxInstances(devices);
      printInstanceDetectionResults(deviceInstanceMap, devices);

      const allInstances: Array<{
        instance: RobloxInstance;
        deviceModel?: string;
      }> = [];

      for (const device of devices) {
        const instances = deviceInstanceMap.get(device.id) || [];
        instances.forEach((instance) => {
          allInstances.push({ instance, deviceModel: device.model });
        });
      }

      if (allInstances.length === 0) {
        outro(colors.red("[X] No Roblox instances found on any device."));
        return {
          success: false,
          message: "No Roblox instances found",
        };
      }

      return {
        success: true,
        message: `Found ${allInstances.length} Roblox instances`,
        data: { deviceInstanceMap, allInstances },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Error detecting instances: ${errorMessage}`));
      return {
        success: false,
        message: `Failed to detect instances: ${errorMessage}`,
      };
    }
  }

  private async getCheckSelection(instanceData: {
    deviceInstanceMap: Map<string, RobloxInstance[]>;
    allInstances: Array<{ instance: RobloxInstance; deviceModel?: string }>;
  }): Promise<
    ToolResult & {
      data?: Array<{ instance: RobloxInstance; deviceModel?: string }>;
    }
  > {
    const { deviceInstanceMap, allInstances } = instanceData;

    const checkType = await getCheckType(
      allInstances.length,
      deviceInstanceMap.size
    );
    if (!checkType) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no check type selected",
      };
    }

    let instancesToCheck = allInstances;

    if (checkType === "check-device") {
      const readyDevices = Array.from(deviceInstanceMap.keys()).map(
        (deviceId) => ({
          id: deviceId,
          model: allInstances.find(
            (item) => item.instance.deviceId === deviceId
          )?.deviceModel,
        })
      );

      const selectedDeviceId = await selectSpecificDevice(
        readyDevices,
        deviceInstanceMap
      );
      if (!selectedDeviceId) {
        outro(colors.yellow("[!] Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no device selected",
        };
      }

      instancesToCheck = getInstancesToCheck(
        checkType,
        allInstances,
        selectedDeviceId
      );
    } else if (checkType === "check-single") {
      const selectedInstance = await selectSpecificInstance(allInstances);
      if (!selectedInstance) {
        outro(colors.yellow("[!] Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no instance selected",
        };
      }

      instancesToCheck = getInstancesToCheck(
        checkType,
        allInstances,
        undefined,
        selectedInstance
      );
    }

    if (instancesToCheck.length === 0) {
      outro(colors.red("[X] No instances selected to check."));
      return {
        success: false,
        message: "No instances selected to check",
      };
    }

    return {
      success: true,
      message: `Selected ${instancesToCheck.length} instances to check`,
      data: instancesToCheck,
    };
  }

  private async confirmCheckOperation(
    instanceCount: number
  ): Promise<ToolResult> {
    const shouldProceed = await confirm({
      message: `Check cookies on ${colors.bold(
        instanceCount.toString()
      )} Roblox instance(s)?`,
    });

    if (!shouldProceed) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled by user",
      };
    }

    return {
      success: true,
      message: "Cookie check operation confirmed",
    };
  }

  private async executeCheckOperation(
    instancesToCheck: Array<{ instance: RobloxInstance; deviceModel?: string }>,
    readyDevices: any[]
  ): Promise<ToolResult> {
    Logger.success("[^] Starting cookie extraction and validation...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    const checkSpinner = spinner();
    checkSpinner.start(
      colors.gray("Extracting and validating cookies from all instances...")
    );

    try {
      const checkPromises = instancesToCheck.map(({ instance, deviceModel }) =>
        checkCookieFromInstance(
          instance.deviceId,
          deviceModel,
          instance.packageName
        )
      );

      const results = await Promise.all(checkPromises);
      checkSpinner.stop();

      displayCookieResults(results, readyDevices);

      const allValidCookieStrings = results
        .filter((result) => result.isValid && result.cookie)
        .map((result) => result.cookie!);

      let savedFile: string | null = null;
      if (allValidCookieStrings.length > 0) {
        savedFile = saveCookies(allValidCookieStrings, "check");
      }

      const validCookies = results.filter((result) => result.isValid);
      const totalInstances = instancesToCheck.length;

      if (validCookies.length === totalInstances) {
        outro(
          colors.green(
            `All cookies validated successfully! (${validCookies.length}/${totalInstances} instances)`
          )
        );
        return {
          success: true,
          message: `All ${totalInstances} cookie(s) validated successfully`,
          data: {
            validCookies: validCookies.length,
            totalInstances,
            savedFile,
          },
        };
      } else if (validCookies.length > 0) {
        outro(
          colors.yellow(
            `[!] Some cookies were invalid. (${validCookies.length}/${totalInstances} valid)`
          )
        );
        return {
          success: true,
          message: `${validCookies.length}/${totalInstances} cookie(s) were valid`,
          data: {
            validCookies: validCookies.length,
            totalInstances,
            savedFile,
          },
        };
      } else {
        outro(
          colors.red(
            `[X] No valid cookies found. (0/${totalInstances} instances)`
          )
        );
        return {
          success: false,
          message: `No valid cookies found (0/${totalInstances} instances)`,
          data: { validCookies: 0, totalInstances, savedFile },
        };
      }
    } catch (error) {
      checkSpinner.stop(colors.red("[X] Cookie check failed"));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Cookie check operation failed: ${errorMessage}`));
      return {
        success: false,
        message: `Cookie check operation failed: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new CookieCheckerTool());
