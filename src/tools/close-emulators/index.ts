import { spinner, outro, confirm } from "@clack/prompts";
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
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface InstanceAnalysis {
  allInstances: EmulatorInstance[];
  runningInstances: EmulatorInstance[];
  stoppedInstances: EmulatorInstance[];
  needsShutdown: boolean;
}

export interface ShutdownResult {
  instance: EmulatorInstance;
  success: boolean;
  isStillRunning?: boolean;
  error?: string;
}

export interface ShutdownSummary {
  totalInstances: number;
  runningInstances: number;
  stoppedInstances: number;
  successfullyStopped: number;
  failedToStop: number;
}

export class CloseEmulatorsTool extends BaseTool {
  constructor() {
    super({
      id: "close-emulators",
      label: "Close All Emulators (Shut Down All Running Instances)",
      description: "Shut down all running emulator instances",
    });
  }

  protected override async beforeExecute(
    context?: ToolRunContext
  ): Promise<void> {
    const emulatorName =
      context?.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";
    Logger.title(`[!] ${this.label}`);
    Logger.muted(`Shut down all running ${emulatorName} instances`, {
      indent: 1,
    });
  }

  override async execute(context?: ToolRunContext): Promise<ToolResult> {
    if (!context?.emulatorType) {
      return {
        success: false,
        message: "Emulator type not specified",
      };
    }

    try {
      const emulatorService = getEmulatorService(context.emulatorType);
      const emulatorName =
        context.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";

      const emulatorPath = await this.getEmulatorPath(
        emulatorService,
        emulatorName
      );
      if (!emulatorPath.success) return emulatorPath;

      const instances = await this.loadInstances(emulatorService, emulatorName);
      if (!instances.success) return instances;

      const analysis = this.analyzeAndDisplayInstances(
        instances.data!,
        emulatorService
      );
      if (!analysis.needsShutdown) {
        return this.handleAllInstancesStopped(analysis);
      }

      const confirmed = await this.confirmShutdown(
        analysis.runningInstances.length
      );
      if (!confirmed.success) return confirmed;

      return await this.executeShutdownProcess(
        emulatorService,
        context.emulatorType,
        analysis
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

  private async getEmulatorPath(
    emulatorService: any,
    emulatorName: string
  ): Promise<ToolResult & { data?: string }> {
    Logger.muted(
      `[>] Please specify your ${emulatorName} installation path...`
    );
    const emulatorPath = await emulatorService.getPath();

    if (!emulatorPath) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: `Operation cancelled - no ${emulatorName} path specified`,
      };
    }

    Logger.success(`[+] Using ${emulatorName} at: ${emulatorPath}`);
    return {
      success: true,
      message: `${emulatorName} path confirmed`,
      data: emulatorPath,
    };
  }

  private async loadInstances(
    emulatorService: any,
    emulatorName: string
  ): Promise<ToolResult & { data?: EmulatorInstance[] }> {
    const loadingSpinner = spinner();
    loadingSpinner.start(colors.gray(`Loading ${emulatorName} instances...`));

    try {
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

  private analyzeAndDisplayInstances(
    instances: EmulatorInstance[],
    emulatorService: any
  ): InstanceAnalysis {
    const runningInstances = instances.filter(
      (instance) => instance.status === "Running"
    );
    const stoppedInstances = instances.filter(
      (instance) => instance.status === "Stopped"
    );

    const analysis: InstanceAnalysis = {
      allInstances: instances,
      runningInstances,
      stoppedInstances,
      needsShutdown: runningInstances.length > 0,
    };

    emulatorService.printInstancesList(instances);

    if (!analysis.needsShutdown) {
      Logger.success("All instances are already stopped!", {
        spaceBefore: true,
      });
    } else {
      Logger.warning(
        `[!] Found ${colors.bold(analysis.runningInstances.length.toString())} running instance(s)`,
        { spaceBefore: true }
      );
      Logger.success(
        `[+] Found ${colors.bold(analysis.stoppedInstances.length.toString())} stopped instance(s)`
      );
    }

    return analysis;
  }

  private handleAllInstancesStopped(analysis: InstanceAnalysis): ToolResult {
    outro(
      colors.cyan(
        `[*] ${analysis.stoppedInstances.length}/${analysis.allInstances.length} instances stopped`
      )
    );
    return {
      success: true,
      message: "All instances are already stopped",
      data: this.createShutdownSummary(0, 0),
    };
  }

  private async confirmShutdown(runningCount: number): Promise<ToolResult> {
    const shouldProceed = await confirm({
      message: `Close ${colors.bold(runningCount.toString())} running instance(s)?`,
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
      message: "Shutdown confirmed",
    };
  }

  private async executeShutdownProcess(
    emulatorService: any,
    emulatorType: string,
    analysis: InstanceAnalysis
  ): Promise<ToolResult> {
    Logger.warning("[!] Starting shutdown operation...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    try {
      const shutdownSpinner = spinner();
      shutdownSpinner.start(
        colors.gray("Shutting down all running instances...")
      );

      const shutdownPromises = analysis.runningInstances.map(
        async (instance) => {
          try {
            await emulatorService.stopInstance(instance.index);

            await new Promise((resolve) => setTimeout(resolve, 2000));
            const isStillRunning = await emulatorService.isInstanceRunning(
              instance.index
            );

            return {
              instance,
              success: !isStillRunning,
              isStillRunning,
            };
          } catch (error) {
            return {
              instance,
              success: false,
              isStillRunning: true,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        }
      );

      const results = await Promise.all(shutdownPromises);
      shutdownSpinner.stop(colors.green("[+] Shutdown commands sent"));

      this.displayShutdownResults(results);

      const stillRunning = results.filter((r) => r.isStillRunning).length;
      const successfullyStopped = results.length - stillRunning;

      const summary = this.createShutdownSummary(
        analysis.runningInstances.length,
        stillRunning
      );

      if (stillRunning === 0) {
        outro(
          colors.green(
            `All instances stopped successfully! (${successfullyStopped}/${results.length})`
          )
        );
        return {
          success: true,
          message: `All ${results.length} instance(s) stopped successfully`,
          data: summary,
        };
      } else {
        outro(
          colors.yellow(
            `[!] Some instances may still be running. (${successfullyStopped}/${results.length} stopped)`
          )
        );
        return {
          success: true,
          message: `${successfullyStopped}/${results.length} instance(s) stopped`,
          data: summary,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Logger.error("Shutdown operation failed", { spaceBefore: true });
      Logger.error(`Error: ${errorMessage}`, { indent: 1 });
      outro(colors.red("[X] Please try closing instances manually"));

      return {
        success: false,
        message: `Shutdown operation failed: ${errorMessage}`,
      };
    }
  }

  private displayShutdownResults(results: ShutdownResult[]): void {
    Logger.title("[!] Shutdown Results:");

    const successfullyStopped = results.filter((result) => result.success);
    const failed = results.filter((result) => !result.success);

    if (successfullyStopped.length > 0) {
      Logger.success("[+] Successfully stopped:");
      for (const result of successfullyStopped) {
        Logger.success(`• ${result.instance.name}`, { indent: 1 });
      }
    }

    if (failed.length > 0) {
      Logger.error("[X] Failed to stop:", { spaceBefore: true });
      for (const result of failed) {
        Logger.error(
          `• ${result.instance.name}${result.error ? `: ${result.error}` : ""}`,
          { indent: 1 }
        );
      }
    }

    Logger.space();
  }

  private createShutdownSummary(
    totalRunning: number,
    actuallyStillRunning: number
  ): ShutdownSummary {
    const successfullyStopped = totalRunning - actuallyStillRunning;

    return {
      totalInstances: totalRunning,
      runningInstances: totalRunning,
      stoppedInstances: 0,
      successfullyStopped,
      failedToStop: actuallyStillRunning,
    };
  }
}

ToolRegistry.register(new CloseEmulatorsTool());
