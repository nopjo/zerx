import type { LDPlayerInstance } from "@/utils/emu/ld";

export interface ShutdownResult {
  instance: LDPlayerInstance;
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
