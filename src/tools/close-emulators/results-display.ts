import { Logger } from "@/utils/logger";
import type { ShutdownResult, ShutdownSummary } from "./types";

export function displayShutdownResults(
  initialResults: ShutdownResult[],
  individualResults?: ShutdownResult[]
): void {
  Logger.title("[!] Shutdown Results:");

  const successfullyStopped = initialResults.filter(
    (result) => !result.isStillRunning
  );
  const stillRunning = initialResults.filter((result) => result.isStillRunning);

  if (successfullyStopped.length > 0) {
    Logger.success("[+] Successfully stopped:");
    for (const result of successfullyStopped) {
      Logger.success(`• ${result.instance.name}`, { indent: 1 });
    }
  }

  if (individualResults && individualResults.length > 0) {
    const individualFailures = individualResults.filter(
      (result) => !result.success
    );

    if (individualFailures.length > 0) {
      Logger.error("[X] Failed to stop:", { spaceBefore: true });
      for (const result of individualFailures) {
        Logger.error(
          `• ${result.instance.name}${result.error ? `: ${result.error}` : ""}`,
          { indent: 1 }
        );
      }
    }
  }

  Logger.space();
}

export function createShutdownSummary(
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
