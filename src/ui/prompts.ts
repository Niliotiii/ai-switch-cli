import { confirm, input, password, select } from "@inquirer/prompts";

export async function promptText(
  message: string,
  validate?: (value: string) => true | string
): Promise<string> {
  return input({ message, validate });
}

export async function promptSecret(message: string): Promise<string> {
  return password({ message, mask: "*" });
}

export async function promptChoice<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T }>
): Promise<T> {
  return select({ message, choices });
}

export async function promptConfirm(message: string): Promise<boolean> {
  return confirm({ message });
}
