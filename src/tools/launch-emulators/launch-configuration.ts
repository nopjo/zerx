import { text } from "@clack/prompts";

export async function getDelayConfiguration(): Promise<number | null> {
  const delayBetweenLaunches = await text({
    message: "Delay between each launch (in seconds):",
    placeholder: "3",
    validate: (value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 60)
        return "Enter a number between 0 and 60 seconds";
      return undefined;
    },
  });

  if (!delayBetweenLaunches || typeof delayBetweenLaunches === "symbol") {
    return null;
  }

  return parseFloat(String(delayBetweenLaunches)) * 1000;
}
