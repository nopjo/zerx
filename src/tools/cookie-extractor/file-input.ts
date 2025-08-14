import { text } from "@clack/prompts";
import { existsSync } from "fs";

export async function getAccountDataPath(): Promise<string | null> {
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
