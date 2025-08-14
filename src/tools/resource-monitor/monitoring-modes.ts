import { spinner } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import { collectAllDeviceResources } from "./resource-collector";
import { displayResourceSummary } from "./display";
import { CONTINUOUS_MONITOR_INTERVAL } from "./constants";
import type { DeviceResourceSummary } from "./types";

export async function runSingleScan(
  devices: Array<{ id: string; model?: string }>
): Promise<DeviceResourceSummary[]> {
  const resourceSpinner = spinner();
  resourceSpinner.start(colors.gray("Gathering resource information..."));

  try {
    const summaries = await collectAllDeviceResources(devices);
    resourceSpinner.stop(colors.green("[+] Resource scan complete"));
    displayResourceSummary(summaries);
    return summaries;
  } catch (error) {
    resourceSpinner.stop(colors.red("[X] Resource scan failed"));
    throw error;
  }
}

export async function runContinuousMonitoring(
  devices: Array<{ id: string; model?: string }>
): Promise<void> {
  Logger.success("[~] Starting continuous monitoring...");
  Logger.muted(
    `Updates every ${CONTINUOUS_MONITOR_INTERVAL / 1000} seconds - Press Ctrl+C to stop`,
    {
      indent: 1,
    }
  );
  Logger.space();

  const scanResources = async (): Promise<DeviceResourceSummary[]> => {
    const resourceSpinner = spinner();
    resourceSpinner.start(colors.gray("Gathering resource information..."));

    try {
      const summaries = await collectAllDeviceResources(devices);
      resourceSpinner.stop(colors.green("[+] Resource scan complete"));

      console.clear();
      displayResourceSummary(summaries);
      return summaries;
    } catch (error) {
      resourceSpinner.stop(colors.red("[X] Resource scan failed"));
      throw error;
    }
  };

  try {
    while (true) {
      await scanResources();
      Logger.muted(
        `[~] Next update in ${CONTINUOUS_MONITOR_INTERVAL / 1000} seconds... (Press Ctrl+C to stop)`
      );
      Logger.space();
      await new Promise((resolve) =>
        setTimeout(resolve, CONTINUOUS_MONITOR_INTERVAL)
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("SIGINT")) {
      throw new Error("MONITORING_STOPPED");
    } else {
      throw error;
    }
  }
}
