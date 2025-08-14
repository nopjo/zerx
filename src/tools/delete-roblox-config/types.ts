export interface ConfigAnalysis {
  deviceCount: number;
  templateCount: number;
  hasDefaultGame: boolean;
  hasKeepAliveSettings: boolean;
  configExists: boolean;
}

export type DeleteOption =
  | "all"
  | "assignments"
  | "templates"
  | "default"
  | "keepalive"
  | "cancel";

export interface DeletionResult {
  option: DeleteOption;
  itemsDeleted: number;
  description: string;
}
