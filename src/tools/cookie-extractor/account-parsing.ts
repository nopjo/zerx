import type { RobloxAccount, ExtractedCookie } from "./types";

export function parseAccountData(jsonData: string): RobloxAccount[] {
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

export function extractCookies(accounts: RobloxAccount[]): ExtractedCookie[] {
  return accounts.map((account) => ({
    username: account.Username,
    token: account.SecurityToken,
    userId: account.UserID,
    valid: account.Valid,
  }));
}
