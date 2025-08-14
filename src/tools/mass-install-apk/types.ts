import type { AdbDevice } from "@/utils/adb";

export type { AdbDevice };

export interface InstallResult {
  deviceId: string;
  success: boolean;
  error?: string;
}

export interface InstallSummary {
  total: number;
  successful: number;
  failed: number;
  results: InstallResult[];
}
