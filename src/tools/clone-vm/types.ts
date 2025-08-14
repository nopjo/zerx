import type { LDPlayerInstance } from "@/utils/ld";

export interface CloneConfiguration {
  sourceInstance: LDPlayerInstance;
  newInstanceName: string;
  cloneCount: number;
}

export interface CloneResult {
  cloneName: string;
  success: boolean;
  error?: string;
}
