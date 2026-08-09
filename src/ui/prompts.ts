import { confirm, input, password, select } from "@inquirer/prompts";

export async function promptText(
  message: string,
  validate?: (value: string) => true | string,
  defaultValue?: string
): Promise<string> {
  const opts: { message: string; validate?: (value: string) => true | string; default?: string } = { message };
  if (validate) opts.validate = validate;
  if (defaultValue) opts.default = defaultValue;
  return input(opts);
}

export async function promptSecret(
  message: string,
  defaultValue?: string
): Promise<string> {
  return password({ message, mask: "*", ...(defaultValue !== undefined ? { default: defaultValue } : {}) });
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
