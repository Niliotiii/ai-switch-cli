# opencode Config-File Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix opencode launching — opencode ignores `OPENAI_BASE_URL` (uses `OPENAI_API_KEY` only against the hardcoded `api.openai.com`), so ai-switch must instead write/sync a custom provider entry into `~/.config/opencode/opencode.json` and launch with `-m ai-switch-<provider>/<model>`. copilot and the env-inject agents are unchanged.

**Architecture:** Replace opencode's `envBuilder` (which injected `OPENAI_*` env vars that opencode ignores) with a `prepareLaunch(provider, model)` hook on `AgentDefinition` that writes the opencode.json provider entry (idempotent merge preserving `$schema` + existing providers) and returns the spawn args. Extend `buildArgs` to `(provider, model) => string[]` so opencode can build `-m ai-switch-<providerName>/<model>`. `launchAgent` calls `prepareLaunch` (if present) before spawning. A new UI-free module `src/agents/opencode-config.ts` owns the opencode.json read/merge/write. The `copilotEnv` envBuilder path (copilot) is unchanged and verified working.

**Tech Stack:** Node.js >=18, TypeScript ESM (`.js` imports), `@inquirer/prompts`, vitest, tsup, tsx.

## Global Constraints

- Node >=18 (engines field).
- ESM imports use `.js` extensions (existing pattern).
- Business-logic modules (`src/agents/*`, `src/tools/env.ts`, `src/doctor/checks.ts`) MUST be UI-free — no chalk/inquirer/console.log. Only `src/menu/*` may use the UI.
- The `spawn` seam MUST stay injectable for tests (defaulted parameter or `vi.mock`).
- `buildEnv` for env-inject agents MUST throw on a null protocol URL (anti-silent-corruption guard, commit `1d21ad7` — no `?? ""` coercion). `anthropicEnv`/`openaiEnv`/`copilotEnv` already throw; this plan does NOT touch them. opencode no longer uses an envBuilder, so it no longer throws via env — its guard moves to `prepareLaunch` (throws if `openaiBaseUrl` is null, same `/URL OpenAI/` message — see Task 2).
- `apiKey` never displayed. NOTE: this plan writes the apiKey into `~/.config/opencode/opencode.json` (plaintext, mode 0644 — opencode's own default, matching the user's existing CrofAI entry which already stores a plaintext key there). This is a NEW behavior: ai-switch writes a secret to a user-owned external config file. The README (Task 5) must document this transparently. The ai-switch config itself stays 0600.
- tsconfig `include` is `["src"]` — tests in `tests/` are NOT type-checked by `tsc --noEmit`. New tests must still be type-correct; verify with `npm test`.
- opencode.json structure (verified): `{ "$schema": "https://opencode.ai/config.json", "provider": { <key>: { npm, name, options: { baseURL, apiKey }, models: { <id>: { name, limit? } } } } }`. The merge MUST preserve `$schema` and all existing provider entries; it adds/overwrites only the `ai-switch-<providerName>` key.
- opencode provider key format (verified): hyphenated alphanumeric accepted (e.g. `ai-switch-Openference`). The `-m` flag format is `<key>/<modelId>` (e.g. `ai-switch-Openference/GLM-5.2`). The model id is the raw id from `fetchModels` (e.g. `GLM-5.2`, NOT `glm-4.7`).
- opencode.json path: `~/.config/opencode/opencode.json`. Resolve via `os.homedir()` (NOT `$HOME`, which can be unset). If the file does not exist, create it (with `$schema` + the new provider). If the directory does not exist, create it (mode 0700).
- opencode's custom-provider `models` map: each entry is `{ name: <id> }` (limit optional; omit it — opencode accepts entries without `limit`, and ai-switch doesn't know context/output limits). Populate from `fetchModels(provider)` — but `prepareLaunch` receives `model` (the selected one), not the full list. Decision: write ONLY the selected model into the `models` map (YAGNI — the user selected one model; writing all models is unnecessary and risks a huge config). If the user picks a different model next launch, the entry is overwritten with that model (idempotent by key).
- copilot is verified working (`COPILOT_PROVIDER_BASE_URL` honored; the earlier 404 was a wrong model id, not a routing failure). Do NOT change copilot's `envBuilder`/`buildArgs`.
- codex `requiresModel: false` (model from `~/.codex/config.toml`) — unchanged.

## Context

The provider-integration feature (merged, commits `2d00c16`..`5c18ff5`) made opencode `env-inject` with `OPENAI_*` env vars + `-m openai/<model>`. Systematic debugging (reproduced: opencode stalled at "build · gpt-4o" hitting `api.openai.com` with an Openference key) revealed opencode's built-in OpenAI provider ignores `OPENAI_BASE_URL` — it uses `OPENAI_API_KEY` only as a credential against the hardcoded `api.openai.com`. The correct mechanism (verified end-to-end: opencode replied "OK" with a written provider entry) is a custom provider in `opencode.json` using `npm: "@ai-sdk/openai-compatible"`. This plan replaces opencode's env-injection with config-file writing.

User decision: "Escrever opencode.json no launch" — ai-switch writes/syncs the provider entry at launch time.

## File Structure (changes only)

```
src/types.ts                  [MODIFY] ArgsBuilder signature → (provider, model); add prepareLaunch? hook
src/agents/catalog.ts         [MODIFY] opencode: remove envBuilder, add prepareLaunch + buildArgs(provider, model); others: buildArgs gains provider arg (ignored)
src/agents/opencode-config.ts [CREATE] readOpencodeConfig / writeOpencodeProviderEntry (UI-free, idempotent merge, throws on null openaiBaseUrl)
src/agents/launch.ts          [MODIFY] launchAgent calls prepareLaunch before spawn; buildArgs now (provider, model)
src/menu/startTool.ts         [MODIFY] (minor) — launchAgent call unchanged signature; no logic change expected
tests/agents/catalog.test.ts  [MODIFY] buildArgs calls gain provider arg; opencode prepareLaunch assertions; opencode no envBuilder
tests/agents/opencode-config.test.ts [CREATE] merge idempotency, $schema preserved, throw-on-null, dir/file creation
tests/agents/launch.test.ts   [MODIFY] buildArgs/launchAgent calls gain provider; opencode launch now writes config (mock) + uses -m ai-switch-<provider>/<model>
tests/menu/startAgent.test.ts [MODIFY] launchAgent call signature (provider, model) unchanged — verify no break
README.md                     [MODIFY] document opencode config-file writing + the apiKey-in-opencode.json caveat
```

No deletions. `src/tools/env.ts` (copilotEnv) untouched.

---

### Task 1: Extend types — `buildArgs(provider, model)` + `prepareLaunch` hook

**Files:**
- Modify: `src/types.ts`
- Modify: `tests/agents/catalog.test.ts` (update buildArgs calls to the new 2-arg signature; these will FAIL until Task 2 updates the catalog — expected mid-refactor)

**Interfaces:**
- Produces (in `src/types.ts`):
  ```ts
  export type ArgsBuilder = (provider: Provider, model: string) => string[];
  export type PrepareLaunch = (provider: Provider, model: string) => void | Promise<void>;
  export interface AgentDefinition {
    // ...existing fields...
    envBuilder?: EnvBuilder;
    buildArgs: ArgsBuilder; // now takes (provider, model); most agents ignore provider
    requiresModel?: boolean;
    prepareLaunch?: PrepareLaunch; // side-effect hook run before spawn (e.g. write opencode.json); throws on invalid provider
  }
  ```
  `EnvBuilder` unchanged. The change is: `ArgsBuilder` gains a `provider` first param; `prepareLaunch?` is new.

- [ ] **Step 1: Write the failing tests**

In `tests/agents/catalog.test.ts`, update the existing `buildArgs produce the expected per-agent CLI args` test to pass a provider as the first arg. Use a `Provider` literal:
```ts
  it("buildArgs produce the expected per-agent CLI args", () => {
    const p: import("../../src/types.js").Provider = { id: "1", name: "openrouter", anthropicBaseUrl: "https://anthropic.example.com", openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };
    expect(getAgentDefinition("claude-code").buildArgs(p, "claude-sonnet-5")).toEqual(["--model", "claude-sonnet-5"]);
    expect(getAgentDefinition("codex").buildArgs(p, "gpt-4o")).toEqual([]);
    expect(getAgentDefinition("opencode").buildArgs(p, "gpt-4o")).toEqual(["-m", "openai/gpt-4o"]); // TEMPORARY — Task 2 changes this to ai-switch-openrouter/gpt-4o
    expect(getAgentDefinition("copilot").buildArgs(p, "gpt-4o")).toEqual([]);
    expect(getAgentDefinition("antigravity").buildArgs(p, "x")).toEqual([]);
  });
```
This test will FAIL after the type change (catalog `buildArgs` functions still take 1 arg → TS/runtime mismatch) until Task 2 updates them. That is the expected mid-refactor state.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: FAIL — the `buildArgs produce...` test fails (signature mismatch / wrong args). Other catalog tests still pass.

- [ ] **Step 3: Implement the type change**

In `src/types.ts`: change `ArgsBuilder` to `(provider: Provider, model: string) => string[]`; add `export type PrepareLaunch = (provider: Provider, model: string) => void | Promise<void>;`; add `prepareLaunch?: PrepareLaunch;` to `AgentDefinition`. Do NOT touch the catalog (Task 2 does).

- [ ] **Step 4: Run the test to verify it still fails (right reason)**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: FAIL on the buildArgs test (catalog entries still 1-arg); other tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/agents/catalog.test.ts
git commit -m "feat: ArgsBuilder gains provider param; add prepareLaunch hook"
```

> **Note:** `tsc` red until Task 2 (catalog `buildArgs` 1-arg). Gate ONLY on the catalog test file. Do NOT run `tsc`/`npm test`.

---

### Task 2: opencode catalog entry — remove envBuilder, add prepareLaunch + provider-aware buildArgs; update other buildArgs

**Files:**
- Modify: `src/agents/catalog.ts`
- Modify: `tests/agents/catalog.test.ts`

**Interfaces:**
- Produces (`src/agents/catalog.ts`):
  - opencode: remove `envBuilder`; add `prepareLaunch: (provider, model) => syncOpencodeProvider(provider, model)` (import `syncOpencodeProvider` from `./opencode-config.js`, created in Task 3 — but to avoid a forward-dependency, Task 2 inlines a thin call to a function imported from `./opencode-config.js`; since that module doesn't exist until Task 3, `tsc` is red between Task 2 and Task 3 — expected, gate on catalog test only). To keep Task 2 self-testable WITHOUT Task 3, inline the prepareLaunch body verbatim (the same logic Task 3 extracts):
    ```ts
    prepareLaunch: (provider, model) => {
      if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
      // Task 3 extracts this into syncOpencodeProvider in ./opencode-config.js
      // (read/merge/write opencode.json with an ai-switch-<name> provider entry)
      syncOpencodeProviderEntry(provider, model);
    },
    ```
    BUT `syncOpencodeProviderEntry` doesn't exist yet. **Resolution:** Task 2 does NOT inline the body — instead it imports `syncOpencodeProvider` from `./opencode-config.js` and the catalog test MOCKS that module. The catalog test for opencode's prepareLaunch uses `vi.mock("../../src/agents/opencode-config.js", ...)`. Since the real module lands in Task 3, Task 2's catalog test mocks it (so it doesn't need the real implementation). The catalog source imports the not-yet-existing module → `tsc` red (expected). The catalog TEST passes because vitest's `vi.mock` replaces the import.
  - opencode `buildArgs`: `(provider, model) => ["-m", `ai-switch-${provider.name}/${model}`]` — uses the provider NAME for the opencode-internal provider key.
  - claude-code `buildArgs`: `(provider, model) => ["--model", model]` (provider ignored).
  - codex `buildArgs`: `() => []` — BUT the type now requires `(provider, model)`. Use `(_provider, _model) => []`.
  - copilot `buildArgs`: `(_provider, _model) => []` (unchanged behavior, updated signature).
  - antigravity `buildArgs`: `(_provider, _model) => []`.

- [ ] **Step 1: Write the failing tests**

Update `tests/agents/catalog.test.ts`:
- Add `vi.mock("../../src/agents/opencode-config.js", () => ({ syncOpencodeProvider: vi.fn() }));` at the top.
- Replace the opencode `buildArgs` assertion in the `buildArgs produce...` test:
  ```ts
    expect(getAgentDefinition("opencode").buildArgs(p, "gpt-4o")).toEqual(["-m", "ai-switch-openrouter/gpt-4o"]);
  ```
  (provider.name is "openrouter" in the test fixture `p`).
- Remove the `copilot envBuilder` test block's reference to opencode (opencode no longer has envBuilder). The existing `only copilot has a custom envBuilder` test still holds (opencode's envBuilder is removed; copilot keeps its envBuilder). Verify: the loop asserts `a.envBuilder` is undefined for non-copilot — opencode now has NO envBuilder → still passes.
- Add a new test for opencode's prepareLaunch:
  ```ts
  it("opencode prepareLaunch chama syncOpencodeProvider e dá throw em openaiBaseUrl null", async () => {
    const { syncOpencodeProvider } = await import("../../src/agents/opencode-config.js");
    const { getAgentDefinition } = await import("../../src/agents/catalog.js");
    const p: import("../../src/types.js").Provider = { id: "1", name: "openrouter", anthropicBaseUrl: null, openaiBaseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };
    getAgentDefinition("opencode").prepareLaunch!(p, "gpt-4o");
    expect(syncOpencodeProvider).toHaveBeenCalledWith(p, "gpt-4o");
    const noOpenai = { ...p, openaiBaseUrl: null } as import("../../src/types.js").Provider;
    expect(() => getAgentDefinition("opencode").prepareLaunch!(noOpenai, "x")).toThrow(/URL OpenAI/);
  });
  ```
  Note: the throw happens BEFORE `syncOpencodeProvider` is called (the prepareLaunch guard checks `openaiBaseUrl` first). So for the null case, `syncOpencodeProvider` is NOT called — the test only asserts the throw.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: FAIL — opencode buildArgs still `openai/...`; prepareLaunch undefined.

- [ ] **Step 3: Update `src/agents/catalog.ts`**

```ts
import type { AgentDefinition, AgentId } from "../types.js";
import { copilotEnv } from "../tools/env.js";
import { syncOpencodeProvider } from "./opencode-config.js";

export const AGENT_CATALOG: Record<AgentId, AgentDefinition> = {
  "claude-code": {
    id: "claude-code", label: "Claude Code", binary: "claude", versionArgs: ["--version"],
    authStrategy: "env-inject", envProtocol: "anthropic", homepage: "https://claude.ai/claude-code",
    buildArgs: (_provider, model) => ["--model", model],
  },
  codex: {
    id: "codex", label: "OpenAI Codex", binary: "codex", versionArgs: ["--version"],
    authStrategy: "env-inject", envProtocol: "openai", homepage: "https://github.com/openai/codex",
    buildArgs: () => [], requiresModel: false,
  },
  opencode: {
    id: "opencode", label: "opencode", binary: "opencode", versionArgs: ["--version"],
    authStrategy: "env-inject", envProtocol: "openai", homepage: "https://opencode.ai",
    prepareLaunch: (provider, model) => {
      if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
      syncOpencodeProvider(provider, model);
    },
    buildArgs: (provider, model) => ["-m", `ai-switch-${provider.name}/${model}`],
  },
  copilot: {
    id: "copilot", label: "GitHub Copilot CLI", binary: "copilot", versionArgs: ["--version"],
    authStrategy: "env-inject", envProtocol: "openai", homepage: "https://github.com/github/copilot-cli",
    envBuilder: (provider, model) => copilotEnv(provider, model),
    buildArgs: () => [],
  },
  antigravity: {
    id: "antigravity", label: "Antigravity", binary: "antigravity", versionArgs: ["--version"],
    authStrategy: "self-contained", envProtocol: null, homepage: "https://antigravity.google",
    buildArgs: () => [],
  },
};
```
Keep `listAgentDefinitions` / `getAgentDefinition` unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: PASS — all catalog tests (the opencode-config mock satisfies the import; prepareLaunch + buildArgs assertions pass).

- [ ] **Step 5: Commit**

```bash
git add src/agents/catalog.ts tests/agents/catalog.test.ts
git commit -m "feat: opencode uses prepareLaunch (config sync) + ai-switch-<name>/<model> args"
```

> **Note:** `tsc` red (opencode-config.js missing until Task 3; launch.ts buildArgs signature until Task 4). Gate on catalog test only.

---

### Task 3: `src/agents/opencode-config.ts` — read/merge/write opencode.json

**Files:**
- Create: `src/agents/opencode-config.ts`
- Create: `tests/agents/opencode-config.test.ts`

**Interfaces:**
- Produces (`src/agents/opencode-config.ts`):
  ```ts
  export const OPENCODE_CONFIG_PATH: string; // resolved ~ / opencode.json (for test override)
  export function buildOpencodeProviderEntry(provider: Provider, model: string): Record<string, unknown>
  export function syncOpencodeProvider(provider: Provider, model: string): void
  ```
  - `OPENCODE_CONFIG_PATH`: `path.join(os.homedir(), ".config", "opencode", "opencode.json")`. Exported so tests can point it elsewhere via `vi.mock` or by re-importing after setting `HOME` — simplest: the module reads a path from `process.env.AI_SWITCH_OPENCODE_CONFIG` if set, else the default. (Tests set this env var to a tmp path.)
  - `buildOpencodeProviderEntry(provider, model)`: returns the provider entry object:
    ```ts
    {
      npm: "@ai-sdk/openai-compatible",
      name: `ai-switch-${provider.name}`,
      options: { baseURL: provider.openaiBaseUrl, apiKey: provider.apiKey },
      models: { [model]: { name: model } }
    }
    ```
    (caller — `syncOpencodeProvider` — guarantees `openaiBaseUrl` is non-null; `buildOpencodeProviderEntry` asserts it.)
  - `syncOpencodeProvider(provider, model)`:
    1. assert `provider.openaiBaseUrl` non-null (throws `/URL OpenAI/` — defense in depth; the catalog prepareLaunch already guards, but this is the load-bearing guard for direct callers).
    2. Read the existing opencode.json (if missing → start from `{ "$schema": "https://opencode.ai/config.json", provider: {} }`; if the file exists but is invalid JSON → throw a readable error, do NOT silently overwrite).
    3. Ensure `config.provider` exists (if not, create `{}`).
    4. Set `config.provider[\`ai-switch-${provider.name}\`] = buildOpencodeProviderEntry(provider, model)` (idempotent overwrite of just this key — preserves all other providers + `$schema`).
    5. `fs.mkdirSync(path.dirname(configPath), { recursive: true })` (mode 0700 if creating — use `fs.mkdirSync` then `fs.chmodSync` to 0o700 only when the dir did not exist; if it existed, leave mode alone).
    6. `fs.writeFileSync(configPath, JSON.stringify(config, null, 2))` (mode 0644 — opencode's default; the user's existing file is 0644. Do NOT force 0600, which would surprise the user by changing their file's perms and could break opencode's own writes. Match the existing posture.)
  - File-path resolution: a helper `resolveOpencodeConfigPath(): string` returns `process.env.AI_SWITCH_OPENCODE_CONFIG || path.join(os.homedir(), ".config", "opencode", "opencode.json")`. `OPENCODE_CONFIG_PATH` is NOT a const (it's resolved at call time so the env var is honored) — export the function instead:
    ```ts
    export function resolveOpencodeConfigPath(): string
    ```

- [ ] **Step 1: Write the failing tests**

Create `tests/agents/opencode-config.test.ts`:
```ts
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Provider } from "../../src/types.js";

let tmpDir: string;
const provider: Provider = { id: "1", name: "Openference", anthropicBaseUrl: null, openaiBaseUrl: "https://api.openference.com/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "opencode-cfg-"));
  process.env.AI_SWITCH_OPENCODE_CONFIG = path.join(tmpDir, "opencode", "opencode.json");
});
afterEach(() => {
  delete process.env.AI_SWITCH_OPENCODE_CONFIG;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("opencode-config", () => {
  it("buildOpencodeProviderEntry produces the ai-sdk/openai-compatible entry with the selected model", async () => {
    const { buildOpencodeProviderEntry } = await import("../../src/agents/opencode-config.js");
    expect(buildOpencodeProviderEntry(provider, "GLM-5.2")).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "ai-switch-Openference",
      options: { baseURL: "https://api.openference.com/v1", apiKey: "sk-x" },
      models: { "GLM-5.2": { name: "GLM-5.2" } },
    });
  });

  it("syncOpencodeProvider creates the file (with \$schema) when it does not exist", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    syncOpencodeProvider(provider, "GLM-5.2");
    const cfg = JSON.parse(readFileSync(resolveOpencodeConfigPath(), "utf8"));
    expect(cfg.$schema).toBe("https://opencode.ai/config.json");
    expect(cfg.provider["ai-switch-Openference"].options.baseURL).toBe("https://api.openference.com/v1");
    expect(cfg.provider["ai-switch-Openference"].models["GLM-5.2"]).toEqual({ name: "GLM-5.2" });
  });

  it("syncOpencodeProvider preserves \$schema and existing providers (idempotent merge)", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    const cfgPath = resolveOpencodeConfigPath();
    mkdirSync(path.dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      provider: { CrofAI: { npm: "@ai-sdk/openai-compatible", name: "CrofAI", options: { baseURL: "https://crof.ai/v1", apiKey: "crof-key" }, models: { "kimi": { name: "kimi" } } } }
    }, null, 2));
    syncOpencodeProvider(provider, "GLM-5.2");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    expect(cfg.provider.CrofAI.options.apiKey).toBe("crof-key"); // preserved
    expect(cfg.provider["ai-switch-Openference"].options.baseURL).toBe("https://api.openference.com/v1"); // added
    expect(Object.keys(cfg.provider).sort()).toEqual(["CrofAI", "ai-switch-Openference"]);
  });

  it("syncOpencodeProvider overwrites the ai-switch entry on re-run (idempotent by key, model updates)", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    syncOpencodeProvider(provider, "GLM-5.2");
    syncOpencodeProvider(provider, "GLM-5.1");
    const cfg = JSON.parse(readFileSync(resolveOpencodeConfigPath(), "utf8"));
    expect(cfg.provider["ai-switch-Openference"].models["GLM-5.2"]).toBeUndefined();
    expect(cfg.provider["ai-switch-Openference"].models["GLM-5.1"]).toEqual({ name: "GLM-5.1" });
  });

  it("syncOpencodeProvider throws /URL OpenAI/ when openaiBaseUrl is null", async () => {
    const { syncOpencodeProvider } = await import("../../src/agents/opencode-config.js");
    expect(() => syncOpencodeProvider({ ...provider, openaiBaseUrl: null }, "x")).toThrow(/URL OpenAI/);
  });

  it("syncOpencodeProvider throws a readable error on invalid existing JSON (does not silently overwrite)", async () => {
    const { syncOpencodeProvider, resolveOpencodeConfigPath } = await import("../../src/agents/opencode-config.js");
    const cfgPath = resolveOpencodeConfigPath();
    mkdirSync(path.dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, "{ not valid json");
    expect(() => syncOpencodeProvider(provider, "GLM-5.2")).toThrow(/opencode.json/);
    // file untouched
    expect(readFileSync(cfgPath, "utf8")).toBe("{ not valid json");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/agents/opencode-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/agents/opencode-config.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Provider } from "../types.js";

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";

export function resolveOpencodeConfigPath(): string {
  return process.env.AI_SWITCH_OPENCODE_CONFIG || path.join(tmpdir ? path.join(require("node:os").homedir(), ".config", "opencode", "opencode.json") : "", "");
}
```
Wait — `require` is not available in ESM. Fix: import `homedir` from `node:os`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Provider } from "../types.js";

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";

export function resolveOpencodeConfigPath(): string {
  return process.env.AI_SWITCH_OPENCODE_CONFIG || path.join(homedir(), ".config", "opencode", "opencode.json");
}

export function buildOpencodeProviderEntry(provider: Provider, model: string): Record<string, unknown> {
  if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
  return {
    npm: "@ai-sdk/openai-compatible",
    name: `ai-switch-${provider.name}`,
    options: { baseURL: provider.openaiBaseUrl, apiKey: provider.apiKey },
    models: { [model]: { name: model } },
  };
}

export function syncOpencodeProvider(provider: Provider, model: string): void {
  if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
  const cfgPath = resolveOpencodeConfigPath();
  let config: { $schema?: string; provider?: Record<string, unknown> };
  if (existsSync(cfgPath)) {
    const raw = readFileSync(cfgPath, "utf8");
    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error(`Não foi possível ler ${cfgPath} — JSON inválido. Corrija o arquivo opencode.json manualmente.`);
    }
  } else {
    config = { $schema: OPENCODE_SCHEMA, provider: {} };
  }
  if (!config.provider) config.provider = {};
  config.provider[`ai-switch-${provider.name}`] = buildOpencodeProviderEntry(provider, model);
  mkdirSync(path.dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(config, null, 2));
}
```
(The `buildOpencodeProviderEntry` guard + `syncOpencodeProvider` guard are both present — defense in depth. The invalid-JSON case does NOT overwrite — it throws before reaching `writeFileSync`. The `existsSync` check ensures the throw only fires when the file genuinely exists with bad JSON.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/agents/opencode-config.test.ts`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/agents/opencode-config.ts tests/agents/opencode-config.test.ts
git commit -m "feat: syncOpencodeProvider merges ai-switch provider into opencode.json"
```

---

### Task 4: `launchAgent` calls `prepareLaunch` + uses `buildArgs(provider, model)`

**Files:**
- Modify: `src/agents/launch.ts`
- Modify: `tests/agents/launch.test.ts`

**Interfaces:**
- Produces (`src/agents/launch.ts`):
  ```ts
  export function buildAgentEnv(agent: AgentDefinition, provider: Provider | null, model: string): Record<string, string>  // unchanged signature; opencode no longer has envBuilder, so it falls back to openaiEnv — BUT opencode should NOT inject OPENAI_* env (it uses the config file). Fix: if agent has prepareLaunch, buildAgentEnv returns {} (the config file is the injection mechanism, not env).
  export function launchAgent(agent: AgentDefinition, provider: Provider | null, model: string, spawnFn: typeof spawn = spawn): Promise<number>
  ```
  - `buildAgentEnv`: add a check — if `agent.prepareLaunch` is defined OR `agent.authStrategy === "self-contained"` OR `provider === null` → `{}`; else if `agent.envBuilder` → envBuilder; else anthropicEnv/openaiEnv. (prepareLaunch agents don't use env injection.)
  - `launchAgent`: before spawning, if `agent.prepareLaunch` is defined AND `provider !== null` → `await agent.prepareLaunch(provider, model)` (it may be async — `await` it). Then `args = agent.buildArgs(provider, model)`; spawn.

- [ ] **Step 1: Write the failing tests**

Update `tests/agents/launch.test.ts`:
- Every `buildAgentEnv(def(...), provider, "model")` call — unchanged signature, but add an assertion that opencode (now prepareLaunch-based) returns `{}` from buildAgentEnv:
  ```ts
  it("buildAgentEnv: opencode (prepareLaunch-based) retorna {} mesmo com provedor (config file é o mecanismo, não env)", async () => {
    const { buildAgentEnv } = await import("../../src/agents/launch.js");
    expect(buildAgentEnv(def("opencode"), provider, "gpt-4o")).toEqual({});
  });
  ```
  (Add this test. The existing "self-contained (antigravity) retorna {}" test stays.)
- Mock `../../src/agents/opencode-config.js` at the top so opencode's prepareLaunch doesn't write a real file:
  ```ts
  vi.mock("../../src/agents/opencode-config.js", () => ({ syncOpencodeProvider: vi.fn() }));
  ```
- Update the opencode launch test: it now asserts `prepareLaunch` was called (via the mocked `syncOpencodeProvider`) AND args are `["-m", "ai-switch-openrouter/gpt-4o"]` (provider.name is "openrouter"):
  ```ts
  it("launchAgent: opencode chama syncOpencodeProvider e faz spawn com -m ai-switch-<name>/<model>", async () => {
    const realEnv = process.env;
    process.env = { PATH: "/usr/bin" };
    try {
      const { spawn } = await import("node:child_process");
      const { syncOpencodeProvider } = await import("../../src/agents/opencode-config.js");
      const fakeChild = new EventEmitter();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
      const { launchAgent } = await import("../../src/agents/launch.js");
      const p = launchAgent(def("opencode"), provider, "gpt-4o");
      expect(syncOpencodeProvider).toHaveBeenCalledWith(provider, "gpt-4o");
      const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("opencode");
      expect(call[1]).toEqual(["-m", "ai-switch-openrouter/gpt-4o"]);
      fakeChild.emit("exit", 0);
      await expect(p).resolves.toBe(0);
    } finally {
      process.env = realEnv;
    }
  });
  ```
- Update ALL existing `buildArgs`/`launchAgent` calls that pass a model to also pass the provider where buildArgs is asserted — actually `launchAgent` signature is unchanged `(agent, provider, model)`. The `buildArgs` is called internally. The claude-code launch test's args assertion changes: `["--model", "claude-sonnet-5"]` stays (claude-code ignores provider). The copilot launch test: args `[]` stays.
- Remove/replace the old opencode launch test ("OPENAI env + -m openai/gpt-4o") — opencode no longer injects OPENAI env and the args changed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/agents/launch.test.ts`
Expected: FAIL — opencode buildAgentEnv returns OPENAI vars (old behavior); launchAgent doesn't call prepareLaunch; args still `openai/...`.

- [ ] **Step 3: Implement `src/agents/launch.ts`**

```ts
import { spawn } from "node:child_process";
import type { AgentDefinition, Provider } from "../types.js";
import { anthropicEnv, openaiEnv } from "../tools/env.js";

export function buildAgentEnv(agent: AgentDefinition, provider: Provider | null, model: string): Record<string, string> {
  if (agent.authStrategy === "self-contained" || provider === null || agent.prepareLaunch) return {};
  if (agent.envBuilder) return agent.envBuilder(provider, model);
  return agent.envProtocol === "anthropic" ? anthropicEnv(provider) : openaiEnv(provider);
}

export async function launchAgent(agent: AgentDefinition, provider: Provider | null, model: string, spawnFn: typeof spawn = spawn): Promise<number> {
  if (agent.prepareLaunch && provider !== null) {
    await agent.prepareLaunch(provider, model);
  }
  const env = { ...process.env, ...buildAgentEnv(agent, provider, model) };
  const args = agent.buildArgs(provider ?? nullAsProvider, model);
  return new Promise((resolve, reject) => {
    const child = spawnFn(agent.binary, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
```
PROBLEM: `buildArgs` now takes `(provider, model)` but for self-contained agents `provider` is null. Resolution: `buildArgs`'s type is `(provider: Provider, model: string)` — for self-contained agents, `launchAgent` passes a sentinel? No — cleaner: `buildArgs(provider: Provider | null, model: string)`. Update the `ArgsBuilder` type in Task 1 to `(provider: Provider | null, model: string) => string[]`. (Self-contained agents ignore provider; opencode is env-inject so provider is non-null when buildArgs is called.) Fix the Task 1 type — but Task 1 already committed. **Resolution:** in Task 4, also update `src/types.ts` `ArgsBuilder` to `(provider: Provider | null, model: string) => string[]` and update the Task 1 test fixture's `buildArgs(p, ...)` to accept `Provider | null` (the test passes a non-null `p`, so it still works). Add this types.ts edit to Task 4 Step 3.

Revised `launch.ts`:
```ts
  const args = agent.buildArgs(provider, model);
```
(provider is `Provider | null`; buildArgs accepts `Provider | null`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/agents/launch.test.ts`
Expected: PASS — all launch tests (including the new opencode prepareLaunch + buildArgs(provider, model)).

- [ ] **Step 5: Commit**

```bash
git add src/agents/launch.ts src/types.ts tests/agents/launch.test.ts
git commit -m "feat: launchAgent calls prepareLaunch; buildArgs(provider, model); opencode via config file"
```

> **Note:** `tests/menu/startAgent.test.ts` may need the opencode-config mock added (if it triggers opencode's prepareLaunch). Check in Task 5. Full gate at end of Task 5.

---

### Task 5: startTool tests + full gate + smoke

**Files:**
- Modify: `tests/menu/startAgent.test.ts` (add opencode-config mock if needed)
- Modify: `README.md`
- Verify: full gate + real opencode smoke

**Interfaces:**
- `startTool.ts` itself needs NO change — `launchAgent(agent, provider, model)` signature is unchanged; `prepareLaunch` is called inside `launchAgent`. But the startAgent test file mocks `../../src/agents/launch.js` (so prepareLaunch never runs in those tests) — EXCEPT the fallback test which uses the real `startTool` + doMocks. Verify the doMock set includes `opencode-config` if any test triggers opencode. The existing startAgent tests use claude-code/antigravity/codex — none trigger opencode's prepareLaunch. So no change needed UNLESS a new opencode startTool test is added. **Decision: do NOT add an opencode startTool test** — the opencode prepareLaunch is already covered by the catalog test (Task 2) + launch test (Task 4) + opencode-config test (Task 3). Adding a startTool-level opencode test would duplicate. The startAgent test suite stays as-is (5 tests). Just verify it still passes.

- [ ] **Step 1: Run the startAgent tests**

Run: `npx vitest run tests/menu/startAgent.test.ts`
Expected: PASS — 5/5 (unchanged; launchAgent signature unchanged, mocks intact).

- [ ] **Step 2: Full gate**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass; tsc clean; build OK.

- [ ] **Step 3: Real opencode smoke (the whole point)**

Run (with the Openference provider configured):
```bash
# Build first, then run the menu, select opencode, Openference, a model, and verify it replies.
npm run build
# Use the built CLI non-interactively is hard (it's a TUI). Instead, directly exercise the launch path:
node -e "
import('./src/agents/catalog.js').then(async ({ getAgentDefinition }) => {
  const { launchAgent } = await import('./src/agents/launch.js');
  const { listProviders } = await import('./src/config/providers.js');
  const p = listProviders().find(x => x.name === 'Openference');
  const agent = getAgentDefinition('opencode');
  // opencode run mode is non-interactive with -p? No — opencode run <msg> is non-interactive.
  // But launchAgent spawns 'opencode' with ['-m', 'ai-switch-Openference/GLM-5.2'] — no subcommand.
  // That opens the TUI. For smoke, spawn with 'run' + a prompt instead.
  console.log('provider:', p.name, 'openaiBaseUrl:', p.openaiBaseUrl);
});
"
```
ACTUAL smoke approach: the launch path writes opencode.json then spawns `opencode -m ai-switch-<name>/<model>`. Verify (a) opencode.json gets the entry, (b) `opencode run -m ai-switch-<name>/<model> "reply OK"` replies. Do this by calling `syncOpencodeProvider` directly + a manual `opencode run`:
```bash
node --input-type=module -e "
import { syncOpencodeProvider } from './src/agents/opencode-config.ts';
import { listProviders } from './src/config/providers.ts';
const p = listProviders().find(x => x.name === 'Openference');
syncOpencodeProvider(p, 'GLM-5.2');
console.log('wrote opencode.json entry');
" 2>&1 || npx tsx -e "
import { syncOpencodeProvider } from './src/agents/opencode-config.js';
import { listProviders } from './src/config/providers.js';
const p = listProviders().find(x => x.name === 'Openference');
syncOpencodeProvider(p, 'GLM-5.2');
console.log('wrote opencode.json entry');
"
# then:
opencode run -m ai-switch-Openference/GLM-5.2 "reply with just OK" 2>&1 | tail -5
```
Expected: "OK" (or a real model response). Then RESTORE the user's opencode.json (remove the ai-switch-Openference entry) — the smoke mutates the user's real config; clean up after.

- [ ] **Step 4: Update README**

Document: opencode no longer uses env vars — ai-switch writes a provider entry (`ai-switch-<providerName>`) into `~/.config/opencode/opencode.json` at launch, with the provider's baseURL + apiKey (plaintext, matching opencode's own config posture) and the selected model. Launches with `opencode -m ai-switch-<providerName>/<model>`. Note the apiKey-in-opencode.json caveat. copilot/claude-code/codex unchanged.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: opencode launches via opencode.json provider entry (config-file, not env)"
```

---

## Verification (end-to-end, after all 5 tasks)

1. `npm test` → all pass (catalog + opencode-config 6 + launch + startAgent 5 + doctor + providers + models + table + smoke).
2. `npx tsc --noEmit` → clean. No dangling references; `ArgsBuilder(provider, model)` consistent; `prepareLaunch` only on opencode.
3. `npm run build` → dist produced.
4. Real opencode smoke: `syncOpencodeProvider(Openference, "GLM-5.2")` writes the entry; `opencode run -m ai-switch-Openference/GLM-5.2 "reply OK"` replies. (Restore opencode.json after.)
5. Invariants: `anthropicEnv`/`openaiEnv`/`copilotEnv` throw on null (unchanged); `syncOpencodeProvider` throws on null openaiBaseUrl + on invalid JSON (no silent overwrite); apiKey not displayed in ai-switch (written to opencode.json — documented).
6. copilot still works (unchanged envBuilder).

## Self-Review

1. **Spec coverage:** User wants opencode to launch with a registered provider + model, via writing opencode.json. Task 3 implements the config writer; Task 2 wires opencode's prepareLaunch + buildArgs; Task 4 calls prepareLaunch in launchAgent; Task 5 verifies end-to-end. copilot/claude-code/codex/antigravity unchanged. No gap.
2. **Placeholder scan:** no TBD/TODO; every code block complete; test code shown. The Task 4 `ArgsBuilder` type fix is documented inline (not deferred).
3. **Type consistency:** `ArgsBuilder = (provider: Provider | null, model: string) => string[]` (finalized in Task 4); `PrepareLaunch = (provider: Provider, model: string) => void | Promise<void>`; `buildAgentEnv(agent, provider, model)`; `launchAgent(agent, provider, model, spawnFn?)`; `syncOpencodeProvider(provider, model)`; `buildOpencodeProviderEntry(provider, model)`; `resolveOpencodeConfigPath()`. Consistent across types, catalog, launch, opencode-config, tests.
4. **Global Constraints:** UI-free `src/agents/opencode-config.ts` (no chalk/inquirer/console); spawn injectable; throw-on-null in syncOpencodeProvider (defense in depth) + the catalog prepareLaunch guard; ESM `.js`. The apiKey-in-opencode.json is documented (README Task 5) — it's a new, transparent behavior matching opencode's own posture. Mid-refactor `tsc` redness between Tasks 1–4 is expected and gated per-task; full gate at Task 5.
5. **Forward-dependency note:** Task 2 imports `syncOpencodeProvider` from `./opencode-config.js` (not yet existing until Task 3) — `tsc` red between Task 2 and Task 3, but the Task 2 catalog test passes because it `vi.mock`s the module. This is the same pattern the prior feature used (Task 2 inline → Task 4 extract).
6. **Smoke mutates user config:** Task 5 Step 3 writes to the user's real `~/.config/opencode/opencode.json`. The step RESTORES the entry after (remove `ai-switch-Openference`). Documented in the step.
7. **`buildArgs(provider, model)` for self-contained:** antigravity's `buildArgs` is `() => []` — but the type now requires `(provider, model)`. `() => []` is assignable to `(provider, model) => string[]` in TypeScript (fewer params OK). So antigravity/codex/copilot `() => []` entries still type-check. Verified mentally; `tsc` in Task 5 confirms.
