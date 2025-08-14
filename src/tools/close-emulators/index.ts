import { spinner, outro, confirm } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { getLDPlayerInstances, getLDPlayerPath } from "@/utils/ld";
import { Logger } from "@/utils/logger";
import {
  analyzeInstances,
  displayInstanceAnalysis,
  type InstanceAnalysis,
} from "./instance-analysis";
import {
  performBulkShutdown,
  performIndividualShutdown,
  getFinalShutdownStatus,
} from "./shutdown-process";
import {
  displayShutdownResults,
  createShutdownSummary,
} from "./results-display";
import type { ShutdownResult, ShutdownSummary } from "./types";

export class CloseEmulatorsTool extends BaseTool {
  constructor() {
    super({
      id: "close-emulators",
      label: "Close All Emulators (Shut Down All Running Instances)",
      description: "Shut down all running LDPlayer instances",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[!] ${this.label}`);
    Logger.muted(this.description, { indent: 1 });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const ldPath = await this.getLDPlayerPath();
      if (!ldPath.success) return ldPath;

      const instances = await this.loadInstances(ldPath.data!);
      if (!instances.success) return instances;

      const analysis = this.analyzeAndDisplayInstances(instances.data!);
      if (!analysis.needsShutdown) {
        return this.handleAllInstancesStopped(analysis);
      }

      const confirmed = await this.confirmShutdown(
        analysis.runningInstances.length
      );
      if (!confirmed.success) return confirmed;

      return await this.executeShutdownProcess(ldPath.data!, analysis);
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

  private analyzeAndDisplayInstances(instances: any[]): InstanceAnalysis {
    const analysis = analyzeInstances(instances);
    displayInstanceAnalysis(analysis);
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
      data: createShutdownSummary(0, 0),
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
    ldPath: string,
    analysis: InstanceAnalysis
  ): Promise<ToolResult> {
    Logger.warning("[!] Starting shutdown operation...", {
      spaceBefore: true,
      spaceAfter: true,
    });

    try {
      const initialResults = await performBulkShutdown(
        ldPath,
        analysis.runningInstances
      );

      const stillRunning = initialResults.filter(
        (result) => result.isStillRunning
      );
      let individualResults: ShutdownResult[] = [];

      if (stillRunning.length > 0) {
        individualResults = await performIndividualShutdown(
          ldPath,
          stillRunning
        );
      }

      displayShutdownResults(initialResults, individualResults);

      const actuallyStillRunning = await getFinalShutdownStatus(
        ldPath,
        stillRunning.map((r) => r.instance)
      );

      const summary = createShutdownSummary(
        analysis.runningInstances.length,
        actuallyStillRunning
      );

      if (actuallyStillRunning === 0) {
        outro(
          colors.green(
            `All instances stopped successfully! (${summary.successfullyStopped}/${summary.totalInstances})`
          )
        );
        return {
          success: true,
          message: `All ${summary.totalInstances} instance(s) stopped successfully`,
          data: summary,
        };
      } else {
        outro(
          colors.yellow(
            `[!] Some instances may still be running. (${summary.successfullyStopped}/${summary.totalInstances} stopped)`
          )
        );
        return {
          success: true,
          message: `${summary.successfullyStopped}/${summary.totalInstances} instance(s) stopped`,
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
}

ToolRegistry.register(new CloseEmulatorsTool());
