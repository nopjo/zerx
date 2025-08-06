import { text, spinner, outro } from "@clack/prompts";
import colors from "picocolors";
import path from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "@/utils/logger";

const execAsync = promisify(exec);

// PowerShell decryption script template
const POWERSHELL_DECRYPT_SCRIPT = `
try {
    Add-Type -AssemblyName System.Security
    $encryptedBytes = [System.IO.File]::ReadAllBytes("{{ENCRYPTED_PATH}}")
    $entropy = @({{ENTROPY_BYTES}})
    $decryptedBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($encryptedBytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.IO.File]::WriteAllBytes("{{DECRYPTED_PATH}}", $decryptedBytes)
    Write-Output "SUCCESS: Decryption completed"
} catch {
    Write-Error "FAILED: $($_.Exception.Message)"
    exit 1
}
`;

interface RobloxAccount {
  Valid: boolean;
  SecurityToken: string;
  Username: string;
  LastUse: string;
  UserID: number;
  Fields: object;
  LastAttemptedRefresh: string;
  Region: string;
  BrowserTrackerID: string | null;
  Group: string;
  Alias: string;
  Description: string;
  Password: string;
}

const ENTROPY = new Uint8Array([
  0x52, 0x4f, 0x42, 0x4c, 0x4f, 0x58, 0x20, 0x41, 0x43, 0x43, 0x4f, 0x55, 0x4e,
  0x54, 0x20, 0x4d, 0x41, 0x4e, 0x41, 0x47, 0x45, 0x52, 0x20, 0x7c, 0x20, 0x3a,
  0x29, 0x20, 0x7c, 0x20, 0x42, 0x52, 0x4f, 0x55, 0x47, 0x48, 0x54, 0x20, 0x54,
  0x4f, 0x20, 0x59, 0x4f, 0x55, 0x20, 0x42, 0x55, 0x59, 0x20, 0x69, 0x63, 0x33,
  0x77, 0x30, 0x6c, 0x66,
]);

async function getAccountDataPath(): Promise<string | null> {
  const accountDataPath = await text({
    message: "Enter the full path to your AccountData.json file:",
    placeholder: "path\\to\\RobloxAccountManager\\AccountData.json",
    validate: (value) => {
      if (!value) return "Path is required";

      const cleanPath = value.replace(/^["']|["']$/g, "");

      if (!existsSync(cleanPath)) return "File not found at this path";
      if (!cleanPath.toLowerCase().endsWith(".json"))
        return "File must be a .json file";
      return undefined;
    },
  });

  if (!accountDataPath || typeof accountDataPath === "symbol") return null;

  return accountDataPath.replace(/^["']|["']$/g, "");
}

async function decryptAccountData(filePath: string): Promise<string> {
  try {
    const fileBytes = readFileSync(filePath);

    if (fileBytes.length < 3) {
      throw new Error("File is too small to be a valid AccountData.json");
    }

    const byte0 = fileBytes[0];
    const byte1 = fileBytes[1];
    const byte2 = fileBytes[2];

    if (byte0 === undefined || byte1 === undefined || byte2 === undefined) {
      throw new Error("Unable to read file bytes");
    }

    const isEncrypted = byte0 + byte1 + byte2 === 1;

    if (!isEncrypted) {
      return fileBytes.toString("utf8");
    }

    const tempDir = process.cwd();
    const timestamp = Date.now();
    const tempScriptPath = path.join(tempDir, `temp_decrypt_${timestamp}.ps1`);
    const tempEncryptedPath = path.join(
      tempDir,
      `temp_encrypted_${timestamp}.dat`
    );
    const tempDecryptedPath = path.join(
      tempDir,
      `temp_decrypted_${timestamp}.json`
    );

    try {
      writeFileSync(tempEncryptedPath, fileBytes);

      const entropyBytes = Array.from(ENTROPY)
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(",");

      const psScript = POWERSHELL_DECRYPT_SCRIPT.replace(
        "{{ENCRYPTED_PATH}}",
        tempEncryptedPath.replace(/\\/g, "\\\\")
      )
        .replace("{{ENTROPY_BYTES}}", entropyBytes)
        .replace(
          "{{DECRYPTED_PATH}}",
          tempDecryptedPath.replace(/\\/g, "\\\\")
        );

      writeFileSync(tempScriptPath, psScript);

      const { stdout, stderr } = await execAsync(
        `powershell -ExecutionPolicy Bypass -NoProfile -File "${tempScriptPath}"`
      );

      if (stderr && stderr.trim()) {
        throw new Error(`PowerShell error: ${stderr}`);
      }

      if (!stdout.includes("SUCCESS")) {
        throw new Error("PowerShell script did not complete successfully");
      }

      if (!existsSync(tempDecryptedPath)) {
        throw new Error(
          "Decrypted file was not created. The AccountData.json might be corrupted or use a different encryption method."
        );
      }

      const decryptedData = readFileSync(tempDecryptedPath, "utf8");

      return decryptedData;
    } finally {
      try {
        if (existsSync(tempScriptPath)) {
          unlinkSync(tempScriptPath);
        }
        if (existsSync(tempEncryptedPath)) {
          unlinkSync(tempEncryptedPath);
        }
        if (existsSync(tempDecryptedPath)) {
          unlinkSync(tempDecryptedPath);
        }
      } catch (e) {
        Logger.warning(`Could not delete temp files: ${e}`);
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to decrypt AccountData.json: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

function parseAccountData(jsonData: string): RobloxAccount[] {
  try {
    const accounts: RobloxAccount[] = JSON.parse(jsonData);

    if (!Array.isArray(accounts)) {
      throw new Error("AccountData.json must contain an array of accounts");
    }

    return accounts;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON format in decrypted AccountData.json");
    }
    throw error;
  }
}

function extractCookies(
  accounts: RobloxAccount[]
): { username: string; token: string; userId: number; valid: boolean }[] {
  return accounts.map((account) => ({
    username: account.Username,
    token: account.SecurityToken,
    userId: account.UserID,
    valid: account.Valid,
  }));
}

function generateCookieFile(
  cookies: { username: string; token: string; userId: number; valid: boolean }[]
): { filename: string; content: string } {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split(".")[0];

  const filename = `extracted_cookies_${timestamp}.txt`;

  let content = "";

  const validCookies = cookies.filter((c) => c.valid);
  validCookies.forEach((cookie, index) => {
    content += cookie.token;

    if (index < validCookies.length - 1) {
      content += "\n";
    }
  });

  return { filename, content };
}

export async function extractRobloxCookies(): Promise<void> {
  Logger.title("[*] Cookie Extractor - Roblox Account Manager");
  Logger.muted("Extract SecurityTokens from encrypted AccountData.json", {
    indent: 1,
  });

  Logger.warning(
    "[!] WARNING: Do NOT share the extracted cookies with anyone!"
  );
  Logger.warning(
    "They can be used to steal your accounts, Robux, or get accounts terminated!",
    { indent: 1 }
  );

  Logger.muted("[@] Please specify your AccountData.json file path...");
  const accountDataPath = await getAccountDataPath();

  if (!accountDataPath) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  Logger.success(`[+] Using AccountData.json at: ${accountDataPath}`);

  const extractSpinner = spinner();
  extractSpinner.start(colors.gray("Decrypting AccountData.json..."));

  let accounts: RobloxAccount[] = [];
  try {
    const decryptedData = await decryptAccountData(accountDataPath);
    extractSpinner.message(colors.gray("Parsing account data..."));
    accounts = parseAccountData(decryptedData);

    if (accounts.length === 0) {
      extractSpinner.stop(colors.yellow("[!] No accounts found in file"));
      outro(colors.yellow("[@] AccountData.json contains no accounts"));
      return;
    }
  } catch (error) {
    extractSpinner.stop(
      colors.red("[X] Failed to decrypt/parse AccountData.json")
    );
    outro(
      colors.red(
        `[X] Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    return;
  }

  extractSpinner.stop(
    colors.green("[+] AccountData.json decrypted and parsed successfully")
  );

  const validAccounts = accounts.filter((acc) => acc.Valid);
  const invalidAccounts = accounts.filter((acc) => !acc.Valid);

  Logger.info("[#] Account Summary:", { spaceBefore: true });
  Logger.muted(`Total accounts: ${accounts.length}`, { indent: 1 });
  Logger.success(`Valid accounts: ${validAccounts.length}`, { indent: 1 });
  if (invalidAccounts.length > 0) {
    Logger.error(`Invalid accounts: ${invalidAccounts.length}`, { indent: 1 });
  }

  Logger.info("[-] Account Details:", { spaceBefore: true });
  accounts.forEach((account, index) => {
    const statusColor = account.Valid ? colors.green : colors.red;
    const status = account.Valid ? "VALID" : "INVALID";
    Logger.normal(
      `${colors.cyan((index + 1).toString())}. ${colors.white(
        account.Username
      )} ${statusColor(`[${status}]`)}`,
      { indent: 1 }
    );
    Logger.muted(
      `User ID: ${account.UserID} | Group: ${account.Group} | Region: ${account.Region}`,
      { indent: 2 }
    );
    Logger.muted(`Last Use: ${new Date(account.LastUse).toLocaleString()}`, {
      indent: 2,
    });
  });

  const saveSpinner = spinner();
  saveSpinner.start(colors.gray("Generating cookie file..."));

  try {
    const cookies = extractCookies(accounts);
    const { filename, content } = generateCookieFile(cookies);

    const outputDir = path.join(process.cwd(), "output");

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, filename);
    writeFileSync(outputPath, content, "utf8");

    saveSpinner.stop(colors.green("[+] Cookie file generated"));

    Logger.success("Cookie extraction completed!", { spaceBefore: true });
    Logger.muted(`File saved: ${filename}`, { indent: 1 });
    Logger.muted(`Location: ${outputPath}`, { indent: 1 });

    if (validAccounts.length > 0) {
      Logger.info("[*] You can now use these cookies for Roblox automation", {
        spaceBefore: true,
      });
    } else {
      Logger.warning("[!] No valid cookies found to extract", {
        spaceBefore: true,
      });
    }
  } catch (error) {
    saveSpinner.stop(colors.red("[X] Failed to generate cookie file"));
    outro(
      colors.red(
        `[X] Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    return;
  }

  outro(colors.cyan("[*] Cookie extraction finished"));
}
