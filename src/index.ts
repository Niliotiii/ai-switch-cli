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

// Only auto-run when this file is the program entry point. Guards against importing `main`
// from tests/dev tools without triggering the interactive menu. Uses fileUrlToPath so the
// comparison works on both POSIX and Windows and regardless of how the file was loaded.
import { fileURLToPath } from "node:url";

function isMainEntry(): boolean {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
}

if (isMainEntry()) {
  void main();
}
