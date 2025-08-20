import { text, select as clackSelect } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import { getConfigValue } from "@/utils/config";

export async function select(config: {
  message: string;
  options: Array<{ value: string | number; label: string }>;
}): Promise<string | number | symbol> {
  const inputMethod = getConfigValue("inputMethod") || "numbers";

  if (inputMethod === "arrows") {
    const clackOptions = config.options.map((option) => ({
      value: String(option.value),
      label: option.label,
    }));

    const result = await clackSelect({
      message: config.message,
      options: clackOptions,
    });

    if (result && typeof result === "string") {
      const originalOption = config.options.find(
        (opt) => String(opt.value) === result
      );
      return originalOption?.value ?? result;
    }

    return result;
  } else {
    Logger.info(config.message);
    Logger.space();

    config.options.forEach((option, index) => {
      const number = colors.yellow((index + 1).toString().padStart(2));
      console.log(`   ${number}. ${option.label}`);
    });

    Logger.space();

    const choice = await text({
      message: colors.cyan("Enter your choice:"),
      validate: (value) => {
        const num = parseInt(value as string);
        if (isNaN(num) || num < 1 || num > config.options.length) {
          return `Please enter a number between 1 and ${config.options.length}`;
        }
      },
    });

    if (!choice || typeof choice === "symbol") {
      return choice;
    }

    const selectedIndex = parseInt(choice as string) - 1;
    return config.options[selectedIndex]?.value ?? "";
  }
}
