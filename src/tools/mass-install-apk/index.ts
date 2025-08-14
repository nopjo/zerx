import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";
import { Logger } from "@/utils/logger";
import { getApkPath } from "./apk-validation";
import { installApkToAllDevices } from "./apk-installation";
import { displayInstallResults } from "./install-results";
import type { AdbDevice } from "./types";

export class MassInstallTool extends BaseTool {
  constructor() {
    super({
      id: "mass-install-apk",
      label: "Mass APK Installer (Helpful For When Updating Roblox)",
      description: "Install an APK across devices",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[-] ${this.label}`);
    Logger.muted(this.description, { indent: 1 });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const apkPath = await this.getValidatedApkPath();
      if (!apkPath.success) return apkPath;

      const devices = await this.getConnectedDevices();
      if (!devices.success) return devices;

      const confirmed = await this.confirmInstallation(
        apkPath.data!,
        devices.data!
      );
      if (!confirmed.success) return confirmed;

      return await this.executeInstallation(apkPath.data!, devices.data!);
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

  private async getValidatedApkPath(): Promise<ToolResult & { data?: string }> {
    const apkPath = await getApkPath();

    if (!apkPath) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no APK file specified",
      };
    }

    return {
      success: true,
      message: `APK file validated: ${apkPath}`,
      data: apkPath,
    };
  }

  private async getConnectedDevices(): Promise<
    ToolResult & { data?: AdbDevice[] }
  > {
    const s = spinner();
    s.start(colors.gray("Scanning for connected devices..."));

    try {
      const devices = await getConnectedDevices();
      s.stop(colors.green("[+] Device scan complete"));

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

      return {
        success: true,
        message: `Found ${readyDevices.length} ready devices`,
        data: readyDevices,
      };
    } catch (error) {
      s.stop(colors.red("[X] Failed to scan devices"));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to scan devices: ${errorMessage}`,
      };
    }
  }

  private async confirmInstallation(
    apkPath: string,
    devices: AdbDevice[]
  ): Promise<ToolResult> {
    const shouldInstall = await confirm({
      message: `Install ${colors.cyan(apkPath)} to ${colors.bold(
        devices.length.toString()
      )} device(s)?`,
    });

    if (shouldInstall !== true) {
      outro(colors.yellow("[!] Installation cancelled"));
      return {
        success: false,
        message: "Installation cancelled by user",
      };
    }

    return {
      success: true,
      message: "Installation confirmed",
    };
  }

  private async executeInstallation(
    apkPath: string,
    devices: AdbDevice[]
  ): Promise<ToolResult> {
    try {
      const results = await installApkToAllDevices(apkPath, devices);
      const summary = displayInstallResults(results, devices);

      if (summary.successful === summary.total) {
        outro(
          colors.green(
            `Mass APK installation completed successfully! (${summary.successful}/${summary.total} devices)`
          )
        );
        return {
          success: true,
          message: `Installation completed successfully on all ${summary.total} device(s)`,
          data: summary,
        };
      } else if (summary.successful > 0) {
        outro(
          colors.yellow(
            `[!] Installation completed with some failures. (${summary.successful}/${summary.total} devices successful)`
          )
        );
        return {
          success: true,
          message: `Installation completed on ${summary.successful}/${summary.total} device(s)`,
          data: summary,
        };
      } else {
        outro(
          colors.red(
            `[X] All installations failed. (0/${summary.total} devices successful)`
          )
        );
        return {
          success: false,
          message: `All installations failed (0/${summary.total} devices)`,
          data: summary,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Installation failed: ${errorMessage}`));
      return {
        success: false,
        message: `Installation failed: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new MassInstallTool());
