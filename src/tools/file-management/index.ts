import { select, confirm, outro, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import {
  getConnectedDevices,
  printConnectedDevices,
  type AdbDevice,
} from "@/utils/adb";
import { Logger } from "@/utils/logger";
import { EXECUTORS, getExecutorByName } from "./executor-config";
import { getDevicesWithExecutor } from "./executor-detection";
import { browseAndManageFiles } from "./file-browser";
import { copyToDevices } from "./file-operations";
import type { ExecutorInfo, FileSelection } from "./types";

export class FileManagementTool extends BaseTool {
  constructor() {
    super({
      id: "file-management",
      label:
        "Executor File Management (Navigate through entire Executor Workspace, AutoExec, Scripts etc.)",
      description: "Complete file system management across all devices",
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
        const executor = await this.selectExecutor();
        if (!executor.success) {
          if (executor.message === "cancelled") {
            outro(colors.yellow("Cancelled"));
            return {
              success: true,
              message: "Operation cancelled by user",
            };
          }
          return executor;
        }

        const devices = await this.getDevicesAndCheckExecutor(executor.data!);
        if (!devices.success) return devices;

        if (devices.data!.devicesWithExecutor.length === 0) {
          const tryAgain = await this.handleNoExecutorFound(
            executor.data!,
            devices.data!.readyDevices
          );
          if (!tryAgain) {
            outro(colors.yellow("Cancelled"));
            return {
              success: true,
              message: "No devices found with executor",
            };
          }
          continue;
        }

        const sourceDevice = await this.selectSourceDevice(
          devices.data!.devicesWithExecutor,
          devices.data!.readyDevices
        );
        if (!sourceDevice.success) {
          const tryAgain = await confirm({ message: "Try another executor?" });
          if (tryAgain !== true) {
            outro(colors.yellow("Cancelled"));
            return {
              success: true,
              message: "Operation cancelled by user",
            };
          }
          continue;
        }

        const managementResult = await this.manageFiles(
          sourceDevice.data!,
          executor.data!,
          devices.data!.readyDevices
        );

        const selectAnother = await confirm({
          message: "Select another executor?",
        });
        if (selectAnother !== true) {
          outro(colors.green("File management complete"));
          return {
            success: true,
            message: "File management completed successfully",
            data: managementResult,
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

  private async selectExecutor(): Promise<
    ToolResult & { data?: ExecutorInfo }
  > {
    const executorChoice = await select({
      message: "Select an executor:",
      options: EXECUTORS.map((executor) => ({
        value: executor.name.toLowerCase(),
        label: `${executor.name} - ${executor.description}`,
      })),
    });

    if (!executorChoice || typeof executorChoice === "symbol") {
      return {
        success: false,
        message: "cancelled",
      };
    }

    const executor = getExecutorByName(executorChoice as string);
    if (!executor) {
      return {
        success: false,
        message: "Executor not found",
      };
    }

    Logger.success(`Selected: ${executor.name}`);
    return {
      success: true,
      message: `Selected executor: ${executor.name}`,
      data: executor,
    };
  }

  private async getDevicesAndCheckExecutor(executor: ExecutorInfo): Promise<
    ToolResult & {
      data?: { readyDevices: AdbDevice[]; devicesWithExecutor: AdbDevice[] };
    }
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

      if (readyDevices.length === 0) {
        return {
          success: false,
          message: "No devices found",
        };
      }

      Logger.info(`Checking for ${executor.name} on devices...`, {
        spaceBefore: true,
      });

      const checkSpinner = spinner();
      checkSpinner.start(colors.gray("Checking executor folders..."));

      const devicesWithExecutor = await getDevicesWithExecutor(
        readyDevices,
        executor.path
      );
      checkSpinner.stop();

      return {
        success: true,
        message: `Found ${devicesWithExecutor.length} devices with executor`,
        data: { readyDevices, devicesWithExecutor },
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

  private async handleNoExecutorFound(
    executor: ExecutorInfo,
    readyDevices: AdbDevice[]
  ): Promise<boolean> {
    Logger.error(
      `No devices found with ${executor.name} folder at ${executor.path}`,
      { spaceBefore: true }
    );
    Logger.warning("Devices checked:");
    readyDevices.forEach((device) => {
      Logger.deviceMissing(device.id, device.model);
    });
    Logger.info(
      "Tip: Make sure the executor is installed on at least one device",
      { spaceBefore: true }
    );

    const result = await confirm({ message: "Try another executor?" });
    return result === true;
  }

  private async selectSourceDevice(
    devicesWithExecutor: AdbDevice[],
    readyDevices: AdbDevice[]
  ): Promise<ToolResult & { data?: AdbDevice }> {
    Logger.success(
      `Found executor on ${devicesWithExecutor.length} device(s):`,
      { spaceBefore: true }
    );
    devicesWithExecutor.forEach((device) => {
      Logger.deviceFound(device.id, device.model);
    });

    const devicesWithoutExecutor = readyDevices.filter(
      (device) =>
        !devicesWithExecutor.some((withExec) => withExec.id === device.id)
    );

    if (devicesWithoutExecutor.length > 0) {
      Logger.warning(`Devices without executor:`, {
        spaceBefore: true,
      });
      devicesWithoutExecutor.forEach((device) => {
        Logger.deviceMissing(device.id, device.model);
      });
    }

    const sourceChoice = await select({
      message: "Select device to browse and manage:",
      options: devicesWithExecutor.map((device, i) => ({
        value: i.toString(),
        label: device.model ? `${device.id} (${device.model})` : `${device.id}`,
      })),
    });

    if (!sourceChoice || typeof sourceChoice === "symbol") {
      return {
        success: false,
        message: "No device selected",
      };
    }

    const sourceDevice = devicesWithExecutor[parseInt(sourceChoice as string)];
    if (!sourceDevice) {
      return {
        success: false,
        message: "Invalid device selection",
      };
    }

    Logger.success(`Managing files on: ${sourceDevice.id}`);

    return {
      success: true,
      message: `Selected source device: ${sourceDevice.id}`,
      data: sourceDevice,
    };
  }

  private async manageFiles(
    sourceDevice: AdbDevice,
    executor: ExecutorInfo,
    allDevices: AdbDevice[]
  ): Promise<any> {
    Logger.muted(
      `You can copy files to all ${allDevices.length} connected devices from here`
    );

    let operationsPerformed = 0;

    while (true) {
      const selection = await browseAndManageFiles(
        sourceDevice.id,
        executor.path,
        allDevices
      );

      if (!selection) {
        Logger.warning("Exiting file management");
        break;
      }

      Logger.success(`Selected: ${selection.path}`);

      const targetCount = allDevices.length - 1;
      if (targetCount === 0) {
        Logger.warning("Only one device connected - nothing to copy to");
        continue;
      }

      const shouldProceed = await confirm({
        message: `Copy from ${colors.bold(sourceDevice.id)} to ${colors.bold(
          targetCount.toString()
        )} other device(s)?`,
      });

      if (shouldProceed !== true) {
        Logger.warning("Copy cancelled, returning to file management");
        continue;
      }

      const result = await copyToDevices(
        sourceDevice.id,
        selection.path,
        allDevices,
        selection.isDirectory
      );

      Logger.operationResult(result.success, result.failed, result.operation);
      operationsPerformed++;

      const continueManaging = await confirm({
        message: "Continue managing files?",
      });

      if (continueManaging !== true) {
        break;
      }
    }

    return {
      operationsPerformed,
      sourceDevice: sourceDevice.id,
      executor: executor.name,
    };
  }
}

ToolRegistry.register(new FileManagementTool());
