import type { LDPlayerInstance } from "@/utils/ld";

export interface LaunchResult {
  instance: LDPlayerInstance;
  success: boolean;
  error?: string;
}

export interface LaunchConfiguration {
  stoppedInstances: LDPlayerInstance[];
  delayMs: number;
}

export interface LaunchSummary {
  total: number;
  successful: number;
  failed: number;
  results: LaunchResult[];
}
