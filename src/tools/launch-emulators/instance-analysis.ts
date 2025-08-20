import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type {
  EmulatorInstance,
  EmulatorService,
} from "@/utils/emu/abstraction";

export interface InstanceAnalysis {
  allInstances: EmulatorInstance[];
  stoppedInstances: EmulatorInstance[];
  runningInstances: EmulatorInstance[];
  needsLaunch: boolean;
}

export function analyzeInstances(
  instances: EmulatorInstance[]
): InstanceAnalysis {
  const stoppedInstances = instances.filter(
    (instance) => instance.status === "Stopped"
  );
  const runningInstances = instances.filter(
    (instance) => instance.status === "Running"
  );

  return {
    allInstances: instances,
    stoppedInstances,
    runningInstances,
    needsLaunch: stoppedInstances.length > 0,
  };
}

export function displayInstanceAnalysis(
  analysis: InstanceAnalysis,
  emulatorService: EmulatorService
): void {
  emulatorService.printInstancesList(analysis.allInstances);

  if (!analysis.needsLaunch) {
    Logger.success("All instances are already running!", { spaceBefore: true });
    return;
  }

  Logger.warning(
    `[!] Found ${colors.bold(
      analysis.stoppedInstances.length.toString()
    )} stopped instance(s)`,
    { spaceBefore: true }
  );

  Logger.success(
    `[+] Found ${colors.bold(
      analysis.runningInstances.length.toString()
    )} running instance(s)`
  );
}
