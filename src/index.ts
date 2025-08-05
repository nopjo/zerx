import { outro } from "@clack/prompts";
import colors from "picocolors";
import { runTool } from "./tools";

async function main() {
  try {
    await runTool();
  } catch (error) {
    console.log();
    console.error(colors.red("[X]" + colors.bold("Error occurred:")), error);
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
