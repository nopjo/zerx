import path from "path";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { Logger } from "@/utils/logger";

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

const ENTROPY = new Uint8Array([
  0x52, 0x4f, 0x42, 0x4c, 0x4f, 0x58, 0x20, 0x41, 0x43, 0x43, 0x4f, 0x55, 0x4e,
  0x54, 0x20, 0x4d, 0x41, 0x4e, 0x41, 0x47, 0x45, 0x52, 0x20, 0x7c, 0x20, 0x3a,
  0x29, 0x20, 0x7c, 0x20, 0x42, 0x52, 0x4f, 0x55, 0x47, 0x48, 0x54, 0x20, 0x54,
  0x4f, 0x20, 0x59, 0x4f, 0x55, 0x20, 0x42, 0x55, 0x59, 0x20, 0x69, 0x63, 0x33,
  0x77, 0x30, 0x6c, 0x66,
]);

export function isFileEncrypted(filePath: string): boolean {
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

    return byte0 + byte1 + byte2 === 1;
  } catch (error) {
    throw new Error(
      `Failed to check encryption status: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function decryptFile(filePath: string): Promise<string> {
  const fileBytes = readFileSync(filePath);
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
      .replace("{{DECRYPTED_PATH}}", tempDecryptedPath.replace(/\\/g, "\\\\"));

    writeFileSync(tempScriptPath, psScript);

    const powershellProcess = spawn(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", tempScriptPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      }
    );

    let stdout = "";
    let stderr = "";

    powershellProcess.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    powershellProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const result = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        powershellProcess.on("close", (code) => {
          resolve({ stdout, stderr });
        });

        powershellProcess.on("error", (error) => {
          reject(error);
        });
      }
    );

    if (result.stderr && result.stderr.trim()) {
      throw new Error(`PowerShell error: ${result.stderr}`);
    }

    if (!result.stdout.includes("SUCCESS")) {
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
    await new Promise((resolve) => setTimeout(resolve, 100));

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
}

export async function decryptAccountData(filePath: string): Promise<string> {
  try {
    const fileBytes = readFileSync(filePath);

    if (fileBytes.length < 3) {
      throw new Error("File is too small to be a valid AccountData.json");
    }

    const isEncrypted = isFileEncrypted(filePath);

    if (!isEncrypted) {
      return fileBytes.toString("utf8");
    }

    return await decryptFile(filePath);
  } catch (error) {
    throw new Error(
      `Failed to decrypt AccountData.json: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
