import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getLDPlayerInstances, getLDPlayerPath } from "@/utils/ld";
import { Logger } from "@/utils/logger";
import { analyzeInstances, displayInstanceAnalysis } from "./instance-analysis";
import { getDelayConfiguration } from "./launch-configuration";
import { launchInstancesSequentially } from "./instance-launch";
import { displayLaunchResults } from "./launch-results";

export class LaunchEmulatorsTool extends BaseTool {
  constructor() {
    super({
      id: "launch-emulators",
      label: "Launch All Emulators (Boot Up All Stopped Instances)",
      description: "Boot up all stopped LDPlayer instances",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[^] ${this.label}`);
    Logger.muted(this.description, { indent: 1 });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const ldPath = await this.getLDPlayerPath();
      if (!ldPath.success) return ldPath;

      const instances = await this.loadInstances(ldPath.data!);
      if (!instances.success) return instances;

      const analysis = this.analyzeAndDisplayInstances(instances.data!);
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
        ldPath.data!,
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

  private async loadInstances(
    ldPath: string
  ): Promise<ToolResult & { data?: any[] }> {
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

  private analyzeAndDisplayInstances(instances: any[]) {
    const analysis = analyzeInstances(instances);
    displayInstanceAnalysis(analysis);
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
    ldPath: string,
    stoppedInstances: any[],
    delayMs: number
  ): Promise<ToolResult> {
    Logger.success("[^] Starting sequential launch operation...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    try {
      const results = await launchInstancesSequentially(
        ldPath,
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
