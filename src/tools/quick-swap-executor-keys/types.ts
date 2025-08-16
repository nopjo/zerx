import type { AdbDevice } from "@/utils/adb";

export type { AdbDevice };

export interface ExecutorKeyInfo {
  name: string;
  keyPath: string;
  description: string;
}

export interface KeySwapResult {
  success: number;
  failed: number;
  executor: string;
  devicesProcessed: string[];
}

export interface KeyValidationResult {
  isValid: boolean;
  error?: string;
}

export interface DeviceKeyStatus {
  device: AdbDevice;
  hasKey: boolean;
  currentKeyContent?: string;
  error?: string;
}
