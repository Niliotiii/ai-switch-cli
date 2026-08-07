import chalk from "chalk";

export const theme = {
  ok: (text: string) => chalk.green(text),
  fail: (text: string) => chalk.red(text),
  heading: (text: string) => chalk.bold.cyan(text),
  dim: (text: string) => chalk.dim(text),
};
