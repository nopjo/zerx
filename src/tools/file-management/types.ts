import type { AdbDevice } from "@/utils/adb";

export type { AdbDevice };

export interface ExecutorInfo {
  name: string;
  path: string;
  description: string;
}

export interface FileSystemItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FileSelection {
  path: string;
  isDirectory: boolean;
}

export interface CopyOperation {
  sourceDeviceId: string;
  sourcePath: string;
  targetDevices: AdbDevice[];
  isDirectory: boolean;
}

export interface OperationResult {
  success: number;
  failed: number;
  operation: string;
}

export type FileAction =
  | "back"
  | "navigate"
  | "select-file"
  | "view-file"
  | "delete-file"
  | "delete-directory"
  | "copy-from-local"
  | "copy-directory"
  | "copy-contents"
  | "refresh"
  | "cancel";
