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

export async function promptSecret(message: string): Promise<string> {
  // NOTE: @inquirer/password does NOT support a `default` value — pressing Enter
  // with no input returns an empty string. Callers that want "Enter to keep
  // current" must treat empty input as "keep" themselves (see editProviderFlow).
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
