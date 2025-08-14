export interface BackupFile {
  name: string;
  path: string;
  size: string;
  created: string;
}

export interface DeletionResult {
  deletedCount: number;
  failedCount: number;
  totalSizeDeleted: number;
}

export type DeleteChoice = "all" | "select" | "cancel";
