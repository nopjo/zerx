import { writeFileSync, existsSync, mkdirSync } from "fs";
import { Logger } from "@/utils/logger";

export function saveCookies(
  cookies: string[],
  checkType: string
): string | null {
  const uniqueCookies = [...new Set(cookies)];

  if (uniqueCookies.length === 0) {
    return null;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .split(".")[0];
  const filename = `output/cookies_${timestamp}.txt`;

  if (!existsSync("output")) {
    mkdirSync("output");
  }

  const content = uniqueCookies.join("\n") + "\n";

  try {
    writeFileSync(filename, content);
    Logger.success(
      `[@] ${uniqueCookies.length} unique cookies saved to ${filename}`,
      { indent: 1 }
    );
    return filename;
  } catch (error) {
    Logger.error(
      `[X] Failed to save cookies: ${error instanceof Error ? error.message : "Unknown error"}`,
      { indent: 1 }
    );
    return null;
  }
}
