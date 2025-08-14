import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";
import { Logger } from "@/utils/logger";
import { getAllRobloxInstancesWithUsers } from "./roblox-detection";
import { printInstancesWithUsers } from "./instance-display";
import {
  getCloseMode,
  selectSpecificInstance,
  getInstancesToClose,
} from "./instance-selection";
import { executeCloseProcess } from "./close-process";
import { displayCloseResults } from "./results-display";
import type { InstanceWithUser, CloseResult } from "./types";

export class CloseRobloxTool extends BaseTool {
  constructor() {
    super({
      id: "close-roblox",
      label: "Close Roblox Processes (Close All, Specific Users / Instances)",
      description: "Force stop Roblox applications on connected devices",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[!] ${this.label}`);
    Logger.muted(this.description, {
      indent: 1,
    });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const devices = await this.getConnectedDevices();
      if (!devices.success) return devices;

      const instances = await this.detectRobloxInstances(devices.data!);
      if (!instances.success) return instances;

      const selection = await this.getInstanceSelection(instances.data!);
      if (!selection.success) return selection;

      const confirmed = await this.confirmCloseOperation(
        selection.data!.length
      );
      if (!confirmed.success) return confirmed;

      return await this.executeCloseOperation(selection.data!);
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
    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray("Scanning for connected devices..."));

    const devices = await getConnectedDevices();
    deviceSpinner.stop(colors.green("[+] Device scan complete"));

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

  private async detectRobloxInstances(
    devices: any[]
  ): Promise<ToolResult & { data?: InstanceWithUser[] }> {
    try {
      const allInstances = await getAllRobloxInstancesWithUsers(devices);
      printInstancesWithUsers(allInstances);

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
        data: allInstances,
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

  private async getInstanceSelection(
    allInstances: InstanceWithUser[]
  ): Promise<ToolResult & { data?: InstanceWithUser[] }> {
    const runningInstances = allInstances.filter((i) => i.isRunning);

    const closeMode = await getCloseMode(runningInstances.length);
    if (!closeMode) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no close mode selected",
      };
    }

    let instancesToClose: InstanceWithUser[] = [];

    if (closeMode === "by-instance") {
      const selectedInstance = await selectSpecificInstance(allInstances);
      if (!selectedInstance) {
        outro(colors.yellow("[!] Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no instance selected",
        };
      }
      instancesToClose = [selectedInstance];
    } else {
      instancesToClose = getInstancesToClose(closeMode, allInstances);
    }

    if (instancesToClose.length === 0) {
      outro(colors.yellow("[X] No instances selected to close."));
      return {
        success: false,
        message: "No instances selected to close",
      };
    }

    return {
      success: true,
      message: `Selected ${instancesToClose.length} instances to close`,
      data: instancesToClose,
    };
  }

  private async confirmCloseOperation(
    instanceCount: number
  ): Promise<ToolResult> {
    const shouldProceed = await confirm({
      message: `Force stop ${colors.bold(
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
      message: "Close operation confirmed",
    };
  }

  private async executeCloseOperation(
    instancesToClose: InstanceWithUser[]
  ): Promise<ToolResult> {
    try {
      const results = await executeCloseProcess(instancesToClose);

      displayCloseResults(results);

      const successfulCloses = results.filter((result) => result.isSuccess);
      const totalInstances = instancesToClose.length;

      if (successfulCloses.length === totalInstances) {
        outro(
          colors.green(
            `Successfully closed all selected instances! (${successfulCloses.length}/${totalInstances})`
          )
        );
        return {
          success: true,
          message: `Successfully closed all ${totalInstances} instance(s)`,
          data: { successfulCloses: successfulCloses.length, totalInstances },
        };
      } else if (successfulCloses.length > 0) {
        outro(
          colors.yellow(
            `[!] Some instances failed to close. (${successfulCloses.length}/${totalInstances} successful)`
          )
        );
        return {
          success: true,
          message: `${successfulCloses.length}/${totalInstances} instance(s) closed successfully`,
          data: { successfulCloses: successfulCloses.length, totalInstances },
        };
      } else {
        outro(
          colors.red(`[X] Failed to close any instances. (0/${totalInstances})`)
        );
        return {
          success: false,
          message: `Failed to close any instances (0/${totalInstances})`,
          data: { successfulCloses: 0, totalInstances },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Close operation failed: ${errorMessage}`));
      return {
        success: false,
        message: `Close operation failed: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new CloseRobloxTool());
