import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { RobloxAccount } from "./types";

export function displayAccountSummary(accounts: RobloxAccount[]): void {
  const validAccounts = accounts.filter((acc) => acc.Valid);
  const invalidAccounts = accounts.filter((acc) => !acc.Valid);

  Logger.info("[#] Account Summary:", { spaceBefore: true });
  Logger.muted(`Total accounts: ${accounts.length}`, { indent: 1 });
  Logger.success(`Valid accounts: ${validAccounts.length}`, { indent: 1 });
  if (invalidAccounts.length > 0) {
    Logger.error(`Invalid accounts: ${invalidAccounts.length}`, { indent: 1 });
  }
}

export function displayAccountDetails(accounts: RobloxAccount[]): void {
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
}
