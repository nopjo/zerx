import path from "path";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import type { ExtractedCookie, CookieFileData } from "./types";

export function generateCookieFile(cookies: ExtractedCookie[]): CookieFileData {
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

export function saveCookieFile(cookieFileData: CookieFileData): {
  outputPath: string;
  validCount: number;
} {
  const outputDir = path.join(process.cwd(), "output");

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, cookieFileData.filename);
  writeFileSync(outputPath, cookieFileData.content, "utf8");

  const validCount = cookieFileData.content
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  return { outputPath, validCount };
}
