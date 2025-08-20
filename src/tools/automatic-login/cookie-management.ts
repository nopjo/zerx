import { text } from "@clack/prompts";
import { existsSync, readFileSync } from "fs";
import { getConfigValue, updateConfig } from "@/utils/config";
import { Logger } from "@/utils/logger";
import { select } from "@/utils/prompts";
import colors from "picocolors";
import path from "path";

interface CookieFileOption {
  path: string;
  cookieCount: number;
  exists: boolean;
}

export async function getCookieFilePath(): Promise<string | null> {
  const cookieFileOptions = await getCookieFileOptions();

  if (cookieFileOptions.length > 0) {
    Logger.info("[@] Available cookie files:");

    const choices = [
      ...cookieFileOptions.map((option, index) => ({
        value: option.path,
        label: option.exists
          ? `[${index + 1}] ${option.path} (${colors.green(option.cookieCount + " cookies")})`
          : `[${index + 1}] ${option.path} (${colors.red("not found")})`,
        disabled: !option.exists,
      })),
      {
        value: "browse",
        label: `[${cookieFileOptions.length + 1}] Browse for different file...`,
      },
    ];

    const selection = await select({
      message: "Choose a cookie file:",
      options: choices,
    });

    if (!selection || typeof selection === "symbol") return null;

    if (selection === "browse") {
      return await browseCookieFile();
    }

    return selection as string;
  }

  Logger.muted("[@] No previous cookie files found, please select a file...");
  return await browseCookieFile();
}

async function getCookieFileOptions(): Promise<CookieFileOption[]> {
  const options: CookieFileOption[] = [];

  const recentCookieFiles = getConfigValue("recentCookieFiles") || [];

  const localCookiesPath = path.join(process.cwd(), "cookies.txt");
  if (existsSync(localCookiesPath)) {
    const cookieCount = countCookiesInFile(localCookiesPath);
    options.push({
      path: localCookiesPath,
      cookieCount,
      exists: true,
    });
  }

  for (const filePath of recentCookieFiles) {
    if (options.some((opt) => opt.path === filePath)) continue;

    const exists = existsSync(filePath);
    const cookieCount = exists ? countCookiesInFile(filePath) : 0;

    options.push({
      path: filePath,
      cookieCount,
      exists,
    });
  }

  return options;
}

async function browseCookieFile(): Promise<string | null> {
  const cookieFilePath = await text({
    message: "Enter the path to your cookies file:",
    placeholder: "path/to/cookies.txt",
    validate: (value) => {
      if (!value) return "Path is required";

      const cleanPath = value.replace(/^["']|["']$/g, "");

      if (!existsSync(cleanPath)) return "File not found at this path";
      if (!cleanPath.toLowerCase().endsWith(".txt"))
        return "File must be a .txt file";
      return undefined;
    },
  });

  if (!cookieFilePath || typeof cookieFilePath === "symbol") return null;

  const cleanPath = cookieFilePath.replace(/^["']|["']$/g, "");

  await saveRecentCookieFile(cleanPath);

  return cleanPath;
}

function countCookiesInFile(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;
  } catch (error) {
    return 0;
  }
}

async function saveRecentCookieFile(filePath: string): Promise<void> {
  try {
    const recentFiles = getConfigValue("recentCookieFiles") || [];

    const filteredFiles = recentFiles.filter((f) => f !== filePath);

    const updatedFiles = [filePath, ...filteredFiles].slice(0, 5);

    updateConfig("recentCookieFiles", updatedFiles);

    Logger.muted(`[+] Saved ${filePath} to recent cookie files`, { indent: 1 });
  } catch (error) {
    Logger.warning("Could not save cookie file path to config", { indent: 1 });
  }
}

export function loadCookiesFromFile(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf8");
    const cookies = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return cookies;
  } catch (error) {
    throw new Error(
      `Failed to read cookie file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
