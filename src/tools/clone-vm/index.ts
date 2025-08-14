import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getLDPlayerPath } from "@/utils/ld";
import { Logger } from "@/utils/logger";
import {
  loadInstances,
  displayInstances,
  getCloneConfiguration,
} from "./instance-management";
import {
  ensureBackupDirectory,
  generateBackupPath,
  prepareSourceInstance,
  createInstanceBackup,
} from "./backup-management";
import { executeCloneProcess } from "./clone-process";
import type { CloneConfiguration, CloneResult } from "./types";

export class CloneVMTool extends BaseTool {
  constructor() {
    super({
      id: "clone-vm",
      label: "Clone Virtual Machine (Same HWID For Key Systems)",
      description: "Create VM backups and restore them to new instances",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[-] ${this.label}`);
    Logger.muted(this.description, {
      indent: 1,
    });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const ldPath = await this.getLDPlayerPath();
      if (!ldPath.success) return ldPath;

      const instances = await this.loadAndDisplayInstances(ldPath.data!);
      if (!instances.success) return instances;

      const config = await this.getConfiguration(instances.data!);
      if (!config.success) return config;

      const confirmed = await this.confirmCloneOperation(config.data!);
      if (!confirmed.success) return confirmed;

      return await this.executeCloneOperation(ldPath.data!, config.data!);
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

  private async getLDPlayerPath(): Promise<ToolResult & { data?: string }> {
    Logger.muted("[>] Please specify your LDPlayer installation path...");
    const ldPath = await getLDPlayerPath();

    if (!ldPath) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no LDPlayer path specified",
      };
    }

    Logger.success(`[+] Using LDPlayer at: ${ldPath}`);
    return {
      success: true,
      message: "LDPlayer path confirmed",
      data: ldPath,
    };
  }

  private async loadAndDisplayInstances(
    ldPath: string
  ): Promise<ToolResult & { data?: any[] }> {
    const loadingSpinner = spinner();
    loadingSpinner.start(colors.gray("Loading LDPlayer instances..."));

    try {
      const instances = await loadInstances(ldPath);
      loadingSpinner.stop(colors.green("[+] Instances loaded"));

      if (instances.length === 0) {
        outro(
          colors.red(
            "[X] No LDPlayer instances found. Create some instances first."
          )
        );
        return {
          success: false,
          message: "No LDPlayer instances found",
        };
      }

      displayInstances(instances);

      return {
        success: true,
        message: `Loaded ${instances.length} instances`,
        data: instances,
      };
    } catch (error) {
      loadingSpinner.stop(colors.red("[X] Failed to load instances"));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Error: ${errorMessage}`));
      return {
        success: false,
        message: `Failed to load instances: ${errorMessage}`,
      };
    }
  }

  private async getConfiguration(
    instances: any[]
  ): Promise<ToolResult & { data?: CloneConfiguration }> {
    try {
      const config = await getCloneConfiguration(instances);

      if (!config) {
        outro(colors.yellow("[!] Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no configuration provided",
        };
      }

      return {
        success: true,
        message: "Configuration collected",
        data: config,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Error: ${errorMessage}`));
      return {
        success: false,
        message: `Configuration error: ${errorMessage}`,
      };
    }
  }

  private async confirmCloneOperation(
    config: CloneConfiguration
  ): Promise<ToolResult> {
    const shouldProceed = await confirm({
      message: `Create ${colors.bold(
        config.cloneCount.toString()
      )} clone(s) of ${colors.bold(config.sourceInstance.name)}?`,
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
      message: "Clone operation confirmed",
    };
  }

  private async executeCloneOperation(
    ldPath: string,
    config: CloneConfiguration
  ): Promise<ToolResult> {
    Logger.success("[^] Starting clone operation...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    try {
      const backupDir = ensureBackupDirectory();
      const backupPath = generateBackupPath(
        backupDir,
        config.sourceInstance.name
      );

      await prepareSourceInstance(ldPath, config.sourceInstance);

      await createInstanceBackup(ldPath, config.sourceInstance, backupPath);

      const results = await executeCloneProcess(
        ldPath,
        config.sourceInstance,
        config.newInstanceName,
        config.cloneCount,
        backupPath
      );

      this.displayResults(results, backupPath);

      const successfulClones = results.filter((r) => r.success);
      const totalClones = results.length;

      if (successfulClones.length === totalClones) {
        outro(
          colors.cyan(
            "[*] Clone operation finished - All clones created successfully!"
          )
        );
        return {
          success: true,
          message: `All ${totalClones} clone(s) created successfully`,
          data: { successfulClones: successfulClones.length, totalClones },
        };
      } else if (successfulClones.length > 0) {
        outro(
          colors.cyan(
            `[*] Clone operation finished - ${successfulClones.length}/${totalClones} clones created`
          )
        );
        return {
          success: true,
          message: `${successfulClones.length}/${totalClones} clone(s) created successfully`,
          data: { successfulClones: successfulClones.length, totalClones },
        };
      } else {
        outro(
          colors.red("[*] Clone operation finished - No clones were created")
        );
        return {
          success: false,
          message: "No clones were created",
          data: { successfulClones: 0, totalClones },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Logger.error("Clone operation failed", { spaceBefore: true });
      Logger.error(`Error: ${errorMessage}`, { indent: 1 });
      outro(colors.red("[*] Clone operation finished with errors"));

      return {
        success: false,
        message: `Clone operation failed: ${errorMessage}`,
      };
    }
  }

  private displayResults(results: CloneResult[], backupPath: string): void {
    Logger.success("Clone operation completed!", { spaceBefore: true });
    Logger.muted(`Backup saved: ${backupPath}`, { indent: 1 });

    const successfulClones = results.filter((r) => r.success);
    const failedClones = results.filter((r) => !r.success);

    if (successfulClones.length > 0) {
      Logger.info("Successfully created clones:", { indent: 1 });
      successfulClones.forEach((result) => {
        Logger.success(`• ${result.cloneName}`, { indent: 2 });
      });
    }

    if (failedClones.length > 0) {
      Logger.warning("Failed to create clones:", { indent: 1 });
      failedClones.forEach((result) => {
        Logger.error(`• ${result.cloneName}: ${result.error}`, { indent: 2 });
      });
    }
  }
}

ToolRegistry.register(new CloneVMTool());
