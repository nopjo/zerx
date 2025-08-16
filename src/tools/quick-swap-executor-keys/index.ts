import { outro, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import {
  getConnectedDevices,
  printConnectedDevices,
  type AdbDevice,
} from "@/utils/adb";
import { Logger } from "@/utils/logger";
import {
  getDevicesWithKey,
  replaceKeysOnDevices,
  backupCurrentKeys,
} from "./key-operations";
import {
  selectExecutor,
  showCurrentKeyContent,
  getNewKeyContent,
  confirmKeyReplacement,
  askForBackup,
  askToContinue,
  askToTryAnother,
  displayDeviceStatuses,
} from "./key-ui";

export class QuickSwapExecutorKeysTool extends BaseTool {
  constructor() {
    super({
      id: "quick-swap-executor-keys",
      label:
        "Quick Swap Executor Keys (Copy new key across all devices quickly)",
      description: "Quickly replace executor key files across all devices",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(this.label);
    Logger.muted(this.description, {
      indent: 1,
    });
  }

  override async execute(): Promise<ToolResult> {
    try {
      while (true) {
        const devicesResult = await this.getConnectedDevices();
        if (!devicesResult.success) return devicesResult;

        const devices = devicesResult.data!;
        if (devices.length === 0) {
          outro(colors.red("No devices connected"));
          return {
            success: false,
            message: "No devices connected",
          };
        }

        const executorResult = await selectExecutor();
        if (!executorResult.success) {
          if (executorResult.message === "cancelled") {
            outro(colors.yellow("Cancelled"));
            return {
              success: true,
              message: "Operation cancelled by user",
            };
          }
          return {
            success: false,
            message: executorResult.message,
          };
        }

        const executor = executorResult.data!;

        const deviceStatuses = await getDevicesWithKey(devices, executor);
        const devicesWithKey = deviceStatuses.filter((status) => status.hasKey);

        displayDeviceStatuses(deviceStatuses);

        if (devicesWithKey.length === 0) {
          Logger.error(`No devices found with ${executor.name} key file`);

          const tryAnother = await askToTryAnother();
          if (!tryAnother) {
            outro(colors.yellow("Cancelled"));
            return {
              success: true,
              message: "No devices found with executor key",
            };
          }
          continue;
        }

        await showCurrentKeyContent(deviceStatuses, executor);

        const shouldBackup = await askForBackup();
        if (shouldBackup) {
          await backupCurrentKeys(deviceStatuses, executor);
        }

        const newKeyResult = await getNewKeyContent();
        if (!newKeyResult.success) {
          const tryAnother = await askToTryAnother();
          if (!tryAnother) {
            outro(colors.yellow("Cancelled"));
            return {
              success: true,
              message: "Operation cancelled by user",
            };
          }
          continue;
        }

        const confirmed = await confirmKeyReplacement(
          executor,
          devicesWithKey.length,
          newKeyResult.data!
        );

        if (!confirmed) {
          Logger.warning("Key replacement cancelled");

          const tryAnother = await askToTryAnother();
          if (!tryAnother) {
            outro(colors.yellow("Cancelled"));
            return {
              success: true,
              message: "Operation cancelled by user",
            };
          }
          continue;
        }

        const replaceResult = await replaceKeysOnDevices(
          deviceStatuses,
          executor,
          newKeyResult.data!
        );

        Logger.operationResult(
          replaceResult.success,
          replaceResult.failed,
          "key replacement"
        );

        const continueSwapping = await askToContinue();
        if (!continueSwapping) {
          outro(colors.green("Key swapping complete"));
          return {
            success: true,
            message: "Key swapping completed successfully",
            data: replaceResult,
          };
        }
      }
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
    ToolResult & { data?: AdbDevice[] }
  > {
    const deviceSpinner = spinner();
    deviceSpinner.start(colors.gray("Scanning devices..."));

    try {
      const devices = await getConnectedDevices();
      const readyDevices = devices.filter(
        (device) => device.status === "device"
      );

      deviceSpinner.stop();
      printConnectedDevices(devices);

      return {
        success: true,
        message: `Found ${readyDevices.length} ready devices`,
        data: readyDevices,
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
}

ToolRegistry.register(new QuickSwapExecutorKeysTool());
