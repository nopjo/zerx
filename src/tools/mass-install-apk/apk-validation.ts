import { text } from "@clack/prompts";
import { existsSync } from "fs";

export async function getApkPath(): Promise<string | null> {
  const apkPath = await text({
    message: "Enter the APK file path:",
    placeholder: "/path/to/your/app.apk",
    validate(value) {
      if (value.length === 0) return "Please enter a file path";

      const cleanPath = String(value).replace(/^["']|["']$/g, "");

      if (!existsSync(cleanPath)) return "File does not exist";
      if (!cleanPath.toLowerCase().endsWith(".apk"))
        return "File must be an APK";
    },
  });

  if (!apkPath || typeof apkPath === "symbol") {
    return null;
  }

  return String(apkPath).replace(/^["']|["']$/g, "");
}
