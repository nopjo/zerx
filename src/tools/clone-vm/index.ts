import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import {
  BaseTool,
  type ToolResult,
  type ToolRunContext,
  ToolRegistry,
} from "@/types/tool";
import {
  getEmulatorService,
  type EmulatorInstance,
} from "@/utils/emu/abstraction";
import { Logger } from "@/utils/logger";
import { select } from "@/utils/prompts";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { importMuMuBackup } from "@/utils/emu/mumu";

export interface CloneConfiguration {
  sourceInstance: EmulatorInstance;
  newInstanceName: string;
  cloneCount: number;
}

export interface CloneResult {
  cloneName: string;
  success: boolean;
  error?: string;
}

export class CloneVMTool extends BaseTool {
  constructor() {
    super({
      id: "clone-vm",
      label: "Clone Virtual Machine (Same HWID For Key Systems)",
      description: "Create VM backups and restore them to new instances",
    });
  }

  protected override async beforeExecute(
    context?: ToolRunContext
  ): Promise<void> {
    const emulatorName =
      context?.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";
    Logger.title(`[-] ${this.label}`);
    Logger.muted(
      `Create ${emulatorName} VM backups and restore them to new instances`,
      { indent: 1 }
    );
  }

  override async execute(context?: ToolRunContext): Promise<ToolResult> {
    if (!context?.emulatorType) {
      return { success: false, message: "Emulator type not specified" };
    }

    try {
      const emulatorService = getEmulatorService(context.emulatorType);
      const emulatorName =
        context.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";

      const emulatorPath = await emulatorService.getPath();
      if (!emulatorPath) {
        outro(colors.yellow("[!] Operation cancelled"));
        return { success: false, message: `No ${emulatorName} path specified` };
      }
      Logger.success(`[+] Using ${emulatorName} at: ${emulatorPath}`);

      const loadingSpinner = spinner();
      loadingSpinner.start(colors.gray(`Loading ${emulatorName} instances...`));

      const instances = await emulatorService.getInstances();
      loadingSpinner.stop(colors.green("[+] Instances loaded"));

      if (instances.length === 0) {
        outro(
          colors.red(
            `[X] No ${emulatorName} instances found. Create some instances first.`
          )
        );
        return {
          success: false,
          message: `No ${emulatorName} instances found`,
        };
      }

      this.displayInstances(instances, emulatorName);

      const config = await this.getConfiguration(instances);
      if (!config) {
        outro(colors.yellow("[!] Operation cancelled"));
        return { success: false, message: "Operation cancelled" };
      }

      const shouldProceed = await confirm({
        message: `Create ${colors.bold(config.cloneCount.toString())} clone(s) of ${colors.bold(config.sourceInstance.name)}?`,
      });

      if (!shouldProceed) {
        outro(colors.yellow("[!] Operation cancelled"));
        return { success: false, message: "Operation cancelled by user" };
      }

      return await this.executeCloning(
        emulatorService,
        context.emulatorType,
        config
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Unexpected error: ${errorMessage}`));
      return { success: false, message: `Unexpected error: ${errorMessage}` };
    }
  }

  private displayInstances(
    instances: EmulatorInstance[],
    emulatorName: string
  ): void {
    Logger.info(`[#] Available ${emulatorName} Instances:`, {
      spaceBefore: true,
    });
    instances.forEach((instance) => {
      const statusColor =
        instance.status === "Running" ? colors.green : colors.gray;
      Logger.normal(
        `${colors.cyan(instance.index.toString())}. ${colors.white(instance.name)} ${statusColor(`[${instance.status}]`)}`,
        { indent: 1 }
      );
    });
    Logger.space();
  }

  private async getConfiguration(
    instances: EmulatorInstance[]
  ): Promise<CloneConfiguration | null> {
    try {
      const instanceOptions = instances.map((instance) => ({
        value: instance.index,
        label: `${instance.name} [${instance.status}]`,
      }));

      const sourceInstanceIndex = await select({
        message: "Select the VM to clone:",
        options: instanceOptions,
      });

      if (
        sourceInstanceIndex === null ||
        sourceInstanceIndex === undefined ||
        typeof sourceInstanceIndex === "symbol"
      ) {
        return null;
      }

      const sourceInstance = instances.find(
        (i) => i.index === Number(sourceInstanceIndex)
      );
      if (sourceInstance === undefined) return null;

      const newInstanceName = await this.getSimpleInput(
        "Enter name for the new cloned VM: "
      );
      if (
        !newInstanceName ||
        instances.some((i) => i.name === newInstanceName)
      ) {
        Logger.error("Invalid name or name already exists");
        return null;
      }

      const cloneCountStr = await this.getSimpleInput(
        "How many clones do you want to create? (1-100): "
      );
      const cloneCount = parseInt(cloneCountStr);
      if (isNaN(cloneCount) || cloneCount < 1 || cloneCount > 100) {
        Logger.error("Invalid clone count");
        return null;
      }

      return { sourceInstance, newInstanceName, cloneCount };
    } catch (error) {
      Logger.error(
        `Configuration error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return null;
    }
  }

  private async getSimpleInput(prompt: string): Promise<string> {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    return new Promise((resolve) => {
      rl.question(colors.cyan(prompt), (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  private async executeCloning(
    emulatorService: any,
    emulatorType: string,
    config: CloneConfiguration
  ): Promise<ToolResult> {
    Logger.success("[^] Starting clone operation...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    try {
      const backupDir = path.join(process.cwd(), `${emulatorType}_backups`);
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      await this.prepareSourceInstance(emulatorService, config.sourceInstance);

      const backupPath = await this.createBackup(
        emulatorService,
        config.sourceInstance,
        backupDir
      );

      const results = await this.createClones(
        emulatorService,
        emulatorType,
        config,
        backupPath
      );

      this.displayResults(results, backupPath);

      const successCount = results.filter((r) => r.success).length;
      const message = `${successCount}/${results.length} clone(s) created successfully`;

      outro(colors.cyan(`[*] Clone operation finished - ${message}`));
      return {
        success: successCount > 0,
        message,
        data: { successfulClones: successCount, totalClones: results.length },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Logger.error("Clone operation failed", { spaceBefore: true });
      outro(colors.red("[*] Clone operation finished with errors"));
      return {
        success: false,
        message: `Clone operation failed: ${errorMessage}`,
      };
    }
  }

  private async prepareSourceInstance(
    emulatorService: any,
    sourceInstance: EmulatorInstance
  ): Promise<void> {
    const spinner_inst = spinner();
    spinner_inst.start(colors.gray("Preparing source instance..."));

    const isRunning = await emulatorService.isInstanceRunning(
      sourceInstance.index
    );
    if (isRunning) {
      await emulatorService.stopInstance(sourceInstance.index);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    spinner_inst.stop(colors.green("[+] Source instance prepared"));
  }

  private async createBackup(
    emulatorService: any,
    sourceInstance: EmulatorInstance,
    backupDir: string
  ): Promise<string> {
    const backupSpinner = spinner();
    backupSpinner.start(colors.gray("Creating backup..."));

    try {
      const backupPath = await emulatorService.createBackup(
        sourceInstance.index,
        backupDir
      );
      backupSpinner.stop(colors.green("[+] Backup created"));
      return backupPath;
    } catch (error) {
      backupSpinner.stop(colors.red("[X] Backup creation failed"));
      throw error;
    }
  }

  private async createClones(
    emulatorService: any,
    emulatorType: string,
    config: CloneConfiguration,
    backupPath: string
  ): Promise<CloneResult[]> {
    const results: CloneResult[] = [];

    if (emulatorType === "mumu") {
      const cloneSpinner = spinner();
      cloneSpinner.start(
        colors.gray(`Creating ${config.cloneCount} clone(s)...`)
      );

      try {
        await importMuMuBackup(backupPath, config.cloneCount);
        cloneSpinner.stop(
          colors.green(`[+] ${config.cloneCount} clone(s) created`)
        );

        await new Promise((resolve) => setTimeout(resolve, 3000));
        const instances = await emulatorService.getInstances();
        const newInstances = instances.slice(-config.cloneCount);

        for (let i = 0; i < newInstances.length; i++) {
          const cloneName =
            config.cloneCount === 1
              ? config.newInstanceName
              : `${config.newInstanceName}-${i + 1}`;

          try {
            await emulatorService.renameInstance(
              newInstances[i].index,
              cloneName
            );
            results.push({ cloneName, success: true });
          } catch (error) {
            results.push({
              cloneName,
              success: false,
              error: error instanceof Error ? error.message : "Rename failed",
            });
          }
        }
      } catch (error) {
        cloneSpinner.stop(colors.red("[X] Clone creation failed"));
        for (let i = 1; i <= config.cloneCount; i++) {
          const cloneName =
            config.cloneCount === 1
              ? config.newInstanceName
              : `${config.newInstanceName}-${i}`;
          results.push({
            cloneName,
            success: false,
            error: error instanceof Error ? error.message : "Import failed",
          });
        }
      }
    } else {
      for (let i = 1; i <= config.cloneCount; i++) {
        const cloneName =
          config.cloneCount === 1
            ? config.newInstanceName
            : `${config.newInstanceName}-${i}`;

        const result = await this.createSingleClone(
          emulatorService,
          config.sourceInstance,
          cloneName,
          i,
          config.cloneCount
        );
        results.push(result);
      }
    }

    return results;
  }

  private async createSingleClone(
    emulatorService: any,
    sourceInstance: EmulatorInstance,
    cloneName: string,
    cloneIndex: number,
    totalClones: number
  ): Promise<CloneResult> {
    const cloneSpinner = spinner();
    cloneSpinner.start(
      colors.gray(
        `Creating clone ${cloneIndex}/${totalClones}: ${cloneName}...`
      )
    );

    try {
      const instancesBefore: EmulatorInstance[] =
        await emulatorService.getInstances();

      await emulatorService.cloneInstance(sourceInstance.index);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const instancesAfter: EmulatorInstance[] =
        await emulatorService.getInstances();

      const newInstance: EmulatorInstance | undefined = instancesAfter.find(
        (after: EmulatorInstance) =>
          !instancesBefore.some(
            (before: EmulatorInstance) => before.index === after.index
          )
      );

      if (!newInstance) {
        throw new Error("Could not find newly created instance");
      }

      await emulatorService.renameInstance(newInstance.index, cloneName);

      cloneSpinner.stop(
        colors.green(`[+] Clone ${cloneIndex} created: ${cloneName}`)
      );
      return { cloneName, success: true };
    } catch (error) {
      cloneSpinner.stop(colors.red(`[X] Failed to create clone ${cloneIndex}`));
      return {
        cloneName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private displayResults(results: CloneResult[], backupPath: string): void {
    Logger.success("Clone operation completed!", { spaceBefore: true });
    Logger.muted(`Backup saved: ${backupPath}`, { indent: 1 });

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (successful.length > 0) {
      Logger.info("Successfully created clones:", { indent: 1 });
      successful.forEach((result) =>
        Logger.success(`• ${result.cloneName}`, { indent: 2 })
      );
    }

    if (failed.length > 0) {
      Logger.warning("Failed to create clones:", { indent: 1 });
      failed.forEach((result) =>
        Logger.error(`• ${result.cloneName}: ${result.error}`, { indent: 2 })
      );
    }
  }
}

ToolRegistry.register(new CloneVMTool());
