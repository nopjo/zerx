import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import {
  getLDPlayerPath,
  getLDPlayerInstances,
  type LDPlayerInstance,
} from "@/utils/ld";
import { Logger } from "@/utils/logger";
import {
  getCustomConfiguration,
  displayConfiguration,
  displayOptimizationNotes,
} from "./optimization-config";
import {
  displayInstances,
  displayRunningInstancesNotice,
} from "./instance-display";
import { getOptimizeMode, getInstancesToOptimize } from "./optimize-selection";
import {
  optimizeAllInstances,
  restartPreviouslyRunningInstances,
} from "./instance-optimization";
import { displayOptimizeResults } from "./optimize-results";
import type { OptimizeConfiguration, OptimizeSummary } from "./types";

export class OptimizeDevicesTool extends BaseTool {
  constructor() {
    super({
      id: "optimize-devices",
      label: "Optimize Devices (Change device specs)",
      description:
        "Configure CPU, RAM, and resolution settings for your instances",
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
      const ldPath = await this.getLDPlayerPath();
      if (!ldPath.success) return ldPath;

      const instances = await this.loadInstances(ldPath.data!);
      if (!instances.success) return instances;

      const config = await this.getOptimizationConfiguration();
      if (!config.success) return config;

      const selection = await this.getInstanceSelection(
        instances.data!,
        config.data!
      );
      if (!selection.success) return selection;

      const confirmed = await this.confirmOptimization(
        selection.data!,
        config.data!
      );
      if (!confirmed.success) return confirmed;

      return await this.executeOptimization(
        ldPath.data!,
        selection.data!,
        config.data!
      );
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
    Logger.muted("[>] Getting your LDPlayer installation path...");
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

  private async loadInstances(
    ldPath: string
  ): Promise<ToolResult & { data?: LDPlayerInstance[] }> {
    const loadingSpinner = spinner();
    loadingSpinner.start(colors.gray("Loading LDPlayer instances..."));

    try {
      const instances = await getLDPlayerInstances(ldPath);
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

  private async getOptimizationConfiguration(): Promise<
    ToolResult & { data?: OptimizeConfiguration }
  > {
    const config = await getCustomConfiguration();
    if (!config) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no configuration provided",
      };
    }

    displayConfiguration(config);
    displayOptimizationNotes();

    return {
      success: true,
      message: "Configuration collected",
      data: config,
    };
  }

  private async getInstanceSelection(
    instances: LDPlayerInstance[],
    config: OptimizeConfiguration
  ): Promise<ToolResult & { data?: LDPlayerInstance[] }> {
    const runningInstances = instances.filter((i) => i.status === "Running");

    displayRunningInstancesNotice(runningInstances);

    const optimizeMode = await getOptimizeMode(instances, runningInstances);
    if (!optimizeMode) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no optimize mode selected",
      };
    }

    const instancesToOptimize = getInstancesToOptimize(
      optimizeMode,
      instances,
      runningInstances
    );

    if (instancesToOptimize.length === 0) {
      outro(
        colors.yellow("[@] No instances to optimize with the selected filter")
      );
      return {
        success: false,
        message: "No instances to optimize with the selected filter",
      };
    }

    return {
      success: true,
      message: `Selected ${instancesToOptimize.length} instances to optimize`,
      data: instancesToOptimize,
    };
  }

  private async confirmOptimization(
    instances: LDPlayerInstance[],
    config: OptimizeConfiguration
  ): Promise<ToolResult> {
    const shouldProceed = await confirm({
      message: `Apply configuration (${config.cores} cores, ${config.ram}MB RAM, ${config.resolution.replace(/,/g, "x").replace(/x(\d+)$/, " @ $1 DPI")}) to ${colors.bold(
        instances.length.toString()
      )} LDPlayer instance(s)?`,
    });

    if (shouldProceed !== true) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled by user",
      };
    }

    return {
      success: true,
      message: "Optimization confirmed",
    };
  }

  private async executeOptimization(
    ldPath: string,
    instances: LDPlayerInstance[],
    config: OptimizeConfiguration
  ): Promise<ToolResult> {
    try {
      const results = await optimizeAllInstances(ldPath, instances, config);
      const summary = displayOptimizeResults(results);

      if (summary.previouslyRunning.length > 0) {
        const shouldRestart = await confirm({
          message: `Restart the ${summary.previouslyRunning.length} instance(s) that were previously running?`,
        });

        if (shouldRestart === true) {
          await restartPreviouslyRunningInstances(
            ldPath,
            summary.previouslyRunning
          );
        }
      }

      if (summary.successful === summary.total) {
        outro(
          colors.green(
            `✅ All instances optimized successfully! (${summary.successful}/${summary.total} instances)`
          )
        );
        return {
          success: true,
          message: `All ${summary.total} instance(s) optimized successfully`,
          data: summary,
        };
      } else if (summary.successful > 0) {
        outro(
          colors.yellow(
            `[!] Some optimizations failed. (${summary.successful}/${summary.total} successful)`
          )
        );
        return {
          success: true,
          message: `${summary.successful}/${summary.total} instance(s) optimized successfully`,
          data: summary,
        };
      } else {
        outro(
          colors.red(
            `[X] All optimization failed. (0/${summary.total} instances)`
          )
        );
        return {
          success: false,
          message: `All optimizations failed (0/${summary.total} instances)`,
          data: summary,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Optimization failed: ${errorMessage}`));
      return {
        success: false,
        message: `Optimization failed: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new OptimizeDevicesTool());
