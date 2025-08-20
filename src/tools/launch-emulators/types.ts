import type { EmulatorInstance } from "@/utils/emu/abstraction";

export interface LaunchResult {
  instance: EmulatorInstance;
  success: boolean;
  error?: string;
}

export interface LaunchConfiguration {
  stoppedInstances: EmulatorInstance[];
  delayMs: number;
}

export interface LaunchSummary {
  total: number;
  successful: number;
  failed: number;
  results: LaunchResult[];
}
