import { runMainMenu } from "./menu/mainMenu.js";

export async function main(): Promise<void> {
  try {
    await runMainMenu();
  } catch (error) {
    if (error instanceof Error && error.name === "ExitPromptError") {
      console.log("\nAté logo!");
      return;
    }
    console.error("Erro inesperado:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();
