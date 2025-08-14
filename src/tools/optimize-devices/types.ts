export interface OptimizeResult {
  instanceName: string;
  instanceIndex: number;
  isSuccess: boolean;
  error?: string;
  wasRunning: boolean;
}

export interface OptimizeConfiguration {
  cores: number;
  ram: number;
  resolution: string;
}

export interface OptimizeSummary {
  total: number;
  successful: number;
  failed: number;
  results: OptimizeResult[];
  previouslyRunning: OptimizeResult[];
}

export type OptimizeMode = "all" | "running-only" | "stopped-only";
