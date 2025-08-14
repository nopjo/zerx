import { outro, spinner } from "@clack/prompts";
import colors from "picocolors";
import { BaseTool, type ToolResult, ToolRegistry } from "@/types/tool";
import { Logger } from "@/utils/logger";
import { getAccountDataPath } from "./file-input";
import { decryptAccountData } from "./decryption";
import { parseAccountData, extractCookies } from "./account-parsing";
import {
  displayAccountSummary,
  displayAccountDetails,
} from "./account-display";
import { generateCookieFile, saveCookieFile } from "./file-generation";
import type { RobloxAccount, ExtractedCookie } from "./types";

export class CookieExtractorTool extends BaseTool {
  constructor() {
    super({
      id: "cookie-extractor",
      label:
        "Cookie Extractor (Get Account Cookies From Roblox Account Manager)",
      description: "Extract SecurityTokens from encrypted AccountData.json",
    });
  }

  protected override async beforeExecute(): Promise<void> {
    Logger.title(`[*] ${this.label}`);
    Logger.muted(this.description, {
      indent: 1,
    });

    Logger.warning(
      "[!] WARNING: Do NOT share the extracted cookies with anyone!"
    );
    Logger.warning(
      "They can be used to steal your accounts, Robux, or get accounts terminated!",
      { indent: 1 }
    );
  }

  override async execute(): Promise<ToolResult> {
    try {
      const filePath = await this.getFilePath();
      if (!filePath.success) return filePath;

      const accounts = await this.processAccountData(filePath.data!);
      if (!accounts.success) return accounts;

      const cookies = this.extractAndDisplayAccounts(accounts.data!);
      if (!cookies.success) return cookies;

      return await this.generateAndSaveFile(cookies.data!);
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

  private async getFilePath(): Promise<ToolResult & { data?: string }> {
    Logger.muted("[@] Please specify your AccountData.json file path...");
    const accountDataPath = await getAccountDataPath();

    if (!accountDataPath) {
      outro(colors.yellow("[!] Operation cancelled"));
      return {
        success: false,
        message: "Operation cancelled - no file path specified",
      };
    }

    Logger.success(`[+] Using AccountData.json at: ${accountDataPath}`);
    return {
      success: true,
      message: "File path confirmed",
      data: accountDataPath,
    };
  }

  private async processAccountData(
    filePath: string
  ): Promise<ToolResult & { data?: RobloxAccount[] }> {
    const extractSpinner = spinner();
    extractSpinner.start(colors.gray("Decrypting AccountData.json..."));

    try {
      const decryptedData = await decryptAccountData(filePath);
      extractSpinner.message(colors.gray("Parsing account data..."));

      const accounts = parseAccountData(decryptedData);

      if (accounts.length === 0) {
        extractSpinner.stop(colors.yellow("[!] No accounts found in file"));
        outro(colors.yellow("[@] AccountData.json contains no accounts"));
        return {
          success: false,
          message: "No accounts found in file",
        };
      }

      extractSpinner.stop(
        colors.green("[+] AccountData.json decrypted and parsed successfully")
      );

      return {
        success: true,
        message: `Processed ${accounts.length} accounts`,
        data: accounts,
      };
    } catch (error) {
      extractSpinner.stop(
        colors.red("[X] Failed to decrypt/parse AccountData.json")
      );
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Error: ${errorMessage}`));
      return {
        success: false,
        message: `Failed to process AccountData.json: ${errorMessage}`,
      };
    }
  }

  private extractAndDisplayAccounts(
    accounts: RobloxAccount[]
  ): ToolResult & { data?: ExtractedCookie[] } {
    try {
      displayAccountSummary(accounts);
      displayAccountDetails(accounts);

      const cookies = extractCookies(accounts);

      return {
        success: true,
        message: `Extracted cookies from ${cookies.length} accounts`,
        data: cookies,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to extract cookies: ${errorMessage}`,
      };
    }
  }

  private async generateAndSaveFile(
    cookies: ExtractedCookie[]
  ): Promise<ToolResult> {
    const saveSpinner = spinner();
    saveSpinner.start(colors.gray("Generating cookie file..."));

    try {
      const cookieFileData = generateCookieFile(cookies);
      const { outputPath, validCount } = saveCookieFile(cookieFileData);

      saveSpinner.stop(colors.green("[+] Cookie file generated"));

      Logger.success("Cookie extraction completed!", { spaceBefore: true });
      Logger.muted(`File saved: ${cookieFileData.filename}`, { indent: 1 });
      Logger.muted(`Location: ${outputPath}`, { indent: 1 });

      const validAccounts = cookies.filter((c) => c.valid);

      if (validAccounts.length > 0) {
        Logger.info("[*] You can now use these cookies for Roblox automation", {
          spaceBefore: true,
        });
        outro(colors.cyan("[*] Cookie extraction finished"));
        return {
          success: true,
          message: `Successfully extracted ${validCount} valid cookies`,
          data: {
            filename: cookieFileData.filename,
            outputPath,
            validCookies: validCount,
            totalAccounts: cookies.length,
          },
        };
      } else {
        Logger.warning("[!] No valid cookies found to extract", {
          spaceBefore: true,
        });
        outro(
          colors.yellow(
            "[*] Cookie extraction finished - No valid cookies found"
          )
        );
        return {
          success: false,
          message: "No valid cookies found to extract",
          data: {
            filename: cookieFileData.filename,
            outputPath,
            validCookies: 0,
            totalAccounts: cookies.length,
          },
        };
      }
    } catch (error) {
      saveSpinner.stop(colors.red("[X] Failed to generate cookie file"));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      outro(colors.red(`[X] Error: ${errorMessage}`));
      return {
        success: false,
        message: `Failed to generate cookie file: ${errorMessage}`,
      };
    }
  }
}

ToolRegistry.register(new CookieExtractorTool());
