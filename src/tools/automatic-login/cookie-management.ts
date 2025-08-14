import { text } from "@clack/prompts";
import { existsSync, readFileSync } from "fs";

export async function getCookieFilePath(): Promise<string | null> {
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

  return cookieFilePath.replace(/^["']|["']$/g, "");
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
