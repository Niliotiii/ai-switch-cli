import type { Provider } from "../types.js";

// STUB — Task 3 replaces this with the real read/merge/write implementation.
// Exists so `import { syncOpencodeProvider } from "./opencode-config.js"` in catalog.ts resolves
// (vitest's vi.mock needs the module path to be resolvable before it can replace it).
export function syncOpencodeProvider(_provider: Provider, _model: string): void {
  throw new Error("syncOpencodeProvider not implemented — see Task 3");
}
