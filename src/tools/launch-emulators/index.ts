import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import {
  BaseTool,
  type ToolResult,
  type ToolRunContext,
  ToolRegistry,
} from "@/types/tool";
import { Logger } from "@/utils/logger";
import {
  getEmulatorService,
  type EmulatorInstance,
} from "@/utils/emu/abstraction";
import { analyzeInstances, displayInstanceAnalysis } from "./instance-analysis";
import { getDelayConfiguration } from "./launch-configuration";
import { launchInstancesSequentially } from "./instance-launch";
import { displayLaunchResults } from "./launch-results";

export class LaunchEmulatorsTool extends BaseTool {
  constructor() {
    super({
      id: "launch-emulators",
      label: "Launch All Emulators (Boot Up All Stopped Instances)",
      description: "Boot up all stopped emulator instances",
    });
  }

  protected override async beforeExecute(
    context?: ToolRunContext
  ): Promise<void> {
    const emulatorName =
      context?.emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";
    Logger.title(`[^] ${this.label}`);
    Logger.muted(`${this.description} (${emulatorName})`, { indent: 1 });
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

      const emulatorPath = await this.getEmulatorPath(
        emulatorService,
        context.emulatorType
      );
      if (!emulatorPath.success) return emulatorPath;

      const instances = await this.loadInstances(emulatorService);
      if (!instances.success) return instances;

      const analysis = this.analyzeAndDisplayInstances(
        instances.data!,
        emulatorService
      );
      if (!analysis.needsLaunch) {
        return this.handleAllInstancesRunning(analysis);
      }

      const delayMs = await this.getConfiguration();
      if (delayMs === null) {
        outro(colors.yellow("[!] Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no delay configuration",
        };
      }

      const confirmed = await this.confirmLaunchOperation(
        analysis.stoppedInstances.length,
        delayMs
      );
      if (!confirmed.success) return confirmed;

      return await this.executeLaunchOperation(
        emulatorService,
        analysis.stoppedInstances,
        delayMs
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
    emulatorType: string
  ): Promise<ToolResult & { data?: string }> {
    const emulatorName = emulatorType === "mumu" ? "MuMu Player" : "LDPlayer";
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
    emulatorService: any
  ): Promise<ToolResult & { data?: EmulatorInstance[] }> {
    const loadingSpinner = spinner();
    loadingSpinner.start(colors.gray("Loading emulator instances..."));

    try {
      const instances = await emulatorService.getInstances();
      loadingSpinner.stop(colors.green("[+] Instances loaded"));

      if (instances.length === 0) {
        outro(
          colors.red(
            "[X] No emulator instances found. Create some instances first."
          )
        );
        return {
          success: false,
          message: "No emulator instances found",
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
  ) {
    const analysis = analyzeInstances(instances);
    displayInstanceAnalysis(analysis, emulatorService);
    return analysis;
  }

  private handleAllInstancesRunning(analysis: any): ToolResult {
    outro(
      colors.cyan(
        `[*] ${analysis.runningInstances.length}/${analysis.allInstances.length} instances running`
      )
    );
    return {
      success: true,
      message: "All instances are already running",
      data: {
        total: analysis.allInstances.length,
        successful: analysis.runningInstances.length,
        failed: 0,
      },
    };
  }

  private async getConfiguration(): Promise<number | null> {
    return await getDelayConfiguration();
  }

  private async confirmLaunchOperation(
    instanceCount: number,
    delayMs: number
  ): Promise<ToolResult> {
    const delaySeconds = delayMs / 1000;

    const shouldProceed = await confirm({
      message: `Launch ${colors.bold(
        instanceCount.toString()
      )} stopped instance(s) with ${colors.bold(
        delaySeconds.toString()
      )}s delay between each?`,
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
      message: "Launch operation confirmed",
    };
  }

  private async executeLaunchOperation(
    emulatorService: any,
    stoppedInstances: EmulatorInstance[],
    delayMs: number
  ): Promise<ToolResult> {
    Logger.success("[^] Starting sequential launch operation...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    try {
      const results = await launchInstancesSequentially(
        emulatorService,
        stoppedInstances,
        delayMs
      );
      const summary = displayLaunchResults(results);

      if (summary.failed === 0) {
        outro(
          colors.green(
            `All instances launched successfully! (${summary.successful}/${summary.total})`
          )
        );
        return {
          success: true,
          message: `All ${summary.total} instance(s) launched successfully`,
          data: summary,
        };
      } else if (summary.successful > 0) {
        outro(
          colors.yellow(
            `[!] Some launches failed. (${summary.successful}/${summary.total} successful)`
          )
        );
        return {
          success: true,
          message: `${summary.successful}/${summary.total} instance(s) launched successfully`,
          data: summary,
        };
      } else {
        outro(
          colors.red(`[X] All launches failed. (0/${summary.total} instances)`)
        );
        return {
          success: false,
          message: `All launches failed (0/${summary.total} instances)`,
          data: summary,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Launch operation failed: ${errorMessage}`));
      return {
        success: false,
        message: `Launch operation failed: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new LaunchEmulatorsTool());
