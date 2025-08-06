import { outro } from "@clack/prompts";
import colors from "picocolors";
import { runTool } from "./tools";
import { Logger } from "@/utils/logger";

async function main() {
  try {
    await runTool();
  } catch (error) {
    Logger.error("Error occurred:", { spaceBefore: true });
    console.error(error);
    outro(colors.red("CLI Tool crashed - check the error above"));
    process.exit(1);
  }

  outro(
    colors.green(
      "✨ " + colors.bold("zerx.lol") + " CLI Tool completed successfully!"
    )
  );
}

await main();
