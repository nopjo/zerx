import { outro, select, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getConnectedDevices } from "@/utils/adb";
import { Logger } from "@/utils/logger";
import { runSingleScan, runContinuousMonitoring } from "./monitoring-modes";

export class ResourceMonitorTool extends BaseTool {
  constructor() {
    super({
      id: "resource-monitor",
      label: "System Resource Monitor (RAM/CPU Usage Per Roblox Instance)",
      description: "Monitor RAM and CPU usage for all Roblox instances",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[#] ${this.label}`);
    Logger.muted(this.description, { indent: 1 });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const devices = await this.getConnectedDevices();
      if (!devices.success) return devices;

      const mode = await this.selectMonitoringMode();
      if (!mode.success) return mode;

      return await this.runMonitoring(mode.data!, devices.data!);
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

  private async getConnectedDevices(): Promise<
    ToolResult & { data?: Array<{ id: string; model?: string }> }
  > {
    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray("Scanning for connected devices..."));

    try {
      const devices = await getConnectedDevices();
      deviceSpinner.stop(colors.green("[+] Device scan complete"));

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

      return {
        success: true,
        message: `Found ${readyDevices.length} ready devices`,
        data: readyDevices.map((device) => ({
          id: device.id,
          model: device.model,
        })),
      };
    } catch (error) {
      deviceSpinner.stop(colors.red("[X] Failed to scan devices"));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to scan devices: ${errorMessage}`,
      };
    }
  }

  private async selectMonitoringMode(): Promise<
    ToolResult & { data?: "once" | "continuous" }
  > {
    const monitorMode = await select({
      message: "Select monitoring mode:",
      options: [
        {
          value: "once",
          label: "[#] Single scan (check resources once)",
        },
        {
          value: "continuous",
          label: "[~] Continuous monitoring (refresh every 10 seconds)",
        },
      ],
    });

    if (!monitorMode || typeof monitorMode === "symbol") {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled",
      };
    }

    return {
      success: true,
      message: `Selected ${monitorMode} monitoring mode`,
      data: monitorMode as "once" | "continuous",
    };
  }

  private async runMonitoring(
    mode: "once" | "continuous",
    devices: Array<{ id: string; model?: string }>
  ): Promise<ToolResult> {
    try {
      if (mode === "once") {
        await runSingleScan(devices);
        return {
          success: true,
          message: "Single resource scan completed successfully",
        };
      } else {
        await runContinuousMonitoring(devices);
        return {
          success: true,
          message: "Continuous monitoring completed",
        };
      }
    } catch (error) {
      if (error instanceof Error && error.message === "MONITORING_STOPPED") {
        outro(colors.yellow("[!] Continuous monitoring stopped"));
        return {
          success: true,
          message: "Monitoring stopped by user",
        };
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        outro(colors.red(`[X] Monitoring error: ${errorMessage}`));
        return {
          success: false,
          message: `Monitoring error: ${errorMessage}`,
        };
      }
    }
  }
}

ToolRegistry.register(new ResourceMonitorTool());
