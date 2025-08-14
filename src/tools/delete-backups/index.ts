import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { statSync } from "fs";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { Logger } from "@/utils/logger";
import {
  getBackupFiles,
  formatFileSize,
  calculateTotalSizeBytes,
} from "./backup-scanning";
import { displayBackupFiles } from "./backup-display";
import {
  getDeleteChoice,
  selectSpecificFile,
  getFilesToDelete,
} from "./deletion-selection";
import { executeFileDeletion } from "./deletion-process";
import { displayDeletionResults } from "./deletion-results";
import type { BackupFile, DeleteChoice, DeletionResult } from "./types";

export class DeleteBackupsTool extends BaseTool {
  constructor() {
    super({
      id: "delete-backups",
      label: "Delete LD Player Backups",
      description: "Clean up backup files to free disk space",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[X] ${this.label}`);
    Logger.muted(this.description, { indent: 1 });
  }

  override async execute(): Promise<ToolResult> {
    try {
      const backupFiles = await this.scanBackupFiles();
      if (!backupFiles.success) return backupFiles;

      if (backupFiles.data!.length === 0) {
        outro(
          colors.yellow("[@] No backup files found in ldplayer_backups folder.")
        );
        return {
          success: true,
          message: "No backup files found",
          data: { deletedCount: 0, failedCount: 0, totalSizeDeleted: 0 },
        };
      }

      const selection = await this.getFileSelection(backupFiles.data!);
      if (!selection.success) return selection;

      const confirmed = await this.confirmDeletion(selection.data!);
      if (!confirmed.success) return confirmed;

      return await this.executeDeletion(selection.data!);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Unexpected error: ${errorMessage}`));
      return {
        success: false,
        message: `Unexpected error: ${errorMessage}`,
      };
    }
  }

  private async scanBackupFiles(): Promise<
    ToolResult & { data?: BackupFile[] }
  > {
    const loadingSpinner = spinner();
    loadingSpinner.start(colors.gray("Scanning for backup files..."));

    try {
      const backupFiles = await getBackupFiles();
      loadingSpinner.stop(colors.green("[+] Backup files loaded"));

      return {
        success: true,
        message: `Found ${backupFiles.length} backup files`,
        data: backupFiles,
      };
    } catch (error) {
      loadingSpinner.stop(colors.red("[X] Failed to scan backup files"));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Error: ${errorMessage}`));
      return {
        success: false,
        message: `Failed to scan backup files: ${errorMessage}`,
      };
    }
  }

  private async getFileSelection(
    backupFiles: BackupFile[]
  ): Promise<ToolResult & { data?: BackupFile[] }> {
    displayBackupFiles(backupFiles);

    const deleteChoice = await getDeleteChoice(backupFiles);
    if (!deleteChoice || deleteChoice === "cancel") {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no deletion choice made",
      };
    }

    let filesToDelete: BackupFile[] = [];

    if (deleteChoice === "select") {
      const selectedFile = await selectSpecificFile(backupFiles);
      if (!selectedFile) {
        outro(colors.yellow("[!] Operation cancelled"));
        return {
          success: false,
          message: "Operation cancelled - no file selected",
        };
      }
      filesToDelete = getFilesToDelete(deleteChoice, backupFiles, selectedFile);
    } else {
      filesToDelete = getFilesToDelete(deleteChoice, backupFiles);
    }

    if (filesToDelete.length === 0) {
      outro(colors.red("[X] No files selected for deletion"));
      return {
        success: false,
        message: "No files selected for deletion",
      };
    }

    return {
      success: true,
      message: `Selected ${filesToDelete.length} files for deletion`,
      data: filesToDelete,
    };
  }

  private async confirmDeletion(
    filesToDelete: BackupFile[]
  ): Promise<ToolResult> {
    const totalSizeToDelete = filesToDelete.reduce((total, backup) => {
      const stats = statSync(backup.path);
      return total + stats.size;
    }, 0);

    const confirmMessage =
      filesToDelete.length === 1 && filesToDelete[0]
        ? `Delete "${filesToDelete[0].name}" (${filesToDelete[0].size})?`
        : `Delete ${colors.bold(
            filesToDelete.length.toString()
          )} backup files (${formatFileSize(totalSizeToDelete)})?`;

    const shouldProceed = await confirm({
      message: confirmMessage,
    });

    if (!shouldProceed) {
      outro(colors.yellow("[!] Deletion cancelled"));
      return {
        success: false,
        message: "Deletion cancelled by user",
      };
    }

    return {
      success: true,
      message: "Deletion confirmed",
    };
  }

  private async executeDeletion(
    filesToDelete: BackupFile[]
  ): Promise<ToolResult> {
    try {
      const totalSizeToDelete = filesToDelete.reduce((total, backup) => {
        const stats = statSync(backup.path);
        return total + stats.size;
      }, 0);

      const result = await executeFileDeletion(filesToDelete);

      displayDeletionResults(result, totalSizeToDelete);

      if (result.deletedCount === filesToDelete.length) {
        outro(colors.cyan("[*] Cleanup completed"));
        return {
          success: true,
          message: `Successfully deleted all ${result.deletedCount} file(s)`,
          data: {
            deletedCount: result.deletedCount,
            failedCount: result.failedCount,
            totalSizeDeleted: totalSizeToDelete,
          },
        };
      } else if (result.deletedCount > 0) {
        outro(colors.cyan("[*] Cleanup completed with some errors"));
        return {
          success: true,
          message: `Deleted ${result.deletedCount}/${filesToDelete.length} file(s)`,
          data: {
            deletedCount: result.deletedCount,
            failedCount: result.failedCount,
            totalSizeDeleted: totalSizeToDelete,
          },
        };
      } else {
        outro(colors.red("[*] Cleanup failed - no files were deleted"));
        return {
          success: false,
          message: "No files were deleted",
          data: {
            deletedCount: 0,
            failedCount: result.failedCount,
            totalSizeDeleted: 0,
          },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Deletion operation failed: ${errorMessage}`));
      return {
        success: false,
        message: `Deletion operation failed: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new DeleteBackupsTool());
