# Provider Integration for opencode + copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let opencode and copilot launch with a selected provider's credentials and a chosen model (same as claude-code/codex already do), instead of being plain-spawned self-contained agents. antigravity stays self-contained.

**Architecture:** Add two optional per-agent functions to `AgentDefinition`: `envBuilder(provider, model) → Record<string,string>` (custom env vars — only copilot needs this, emitting `COPILOT_PROVIDER_*` + `COPILOT_MODEL`) and `buildArgs(model) → string[]` (CLI args — claude-code emits `--model`, opencode emits `-m <provider-prefix>/<model>`, codex/copilot/antigravity emit `[]`). `buildAgentEnv` prefers `envBuilder` when present, else falls back to the existing `anthropicEnv`/`openaiEnv` by `envProtocol` (so opencode reuses the standard ANTHROPIC_*/OPENAI_* vars — verified it honors them — with no custom envBuilder). `launchAgent` gains a `model` param and passes `buildArgs(model)`. `startToolFlow` restores the model-prompt (via `fetchModels` + manual fallback) for env-inject agents. opencode and copilot flip from `self-contained` to `env-inject`.

**Tech Stack:** Node.js >=18, TypeScript ESM (`.js` imports), `@inquirer/prompts`, vitest, tsup, tsx.

## Global Constraints

- Node >=18 (engines field).
- ESM imports use `.js` extensions (existing pattern).
- Business-logic modules (`src/agents/*`, `src/tools/env.ts`, `src/doctor/checks.ts`) MUST be UI-free — no chalk/inquirer/console.log. Only `src/menu/*` may use the UI.
- The `spawn`/`spawnSync` seam MUST stay injectable for tests (defaulted parameter or `vi.mock`), per the existing `src/agents/launch.ts`/`detect.ts` pattern.
- `buildEnv` for env-inject agents MUST throw on a null protocol URL (anti-silent-corruption guard from commit `1d21ad7` — no `?? ""` coercion). `anthropicEnv`/`openaiEnv` in `src/tools/env.ts` already throw; the new `copilotEnv` must throw too (on null `openaiBaseUrl` — copilot only supports `openai`/`anthropic`/`azure` types, and ai-switch routes it via the provider's OpenAI URL; see Task 4 for the exact guard).
- `apiKey` never displayed in any table (existing invariant — no test in this plan changes it).
- tsconfig `include` is `["src"]` — tests in `tests/` are NOT type-checked by `tsc --noEmit`. New tests must still be type-correct; verify with `npm test` (vitest compiles them).
- Copilot BYOK env vars (verified from `copilot help providers` on the user's machine): `COPILOT_PROVIDER_BASE_URL` (required), `COPILOT_PROVIDER_TYPE` (`openai`|`azure`|`anthropic`, default `openai`), `COPILOT_PROVIDER_API_KEY`, `COPILOT_MODEL` (required for BYOK). ai-switch routes copilot via the provider's **OpenAI** URL and sets `COPILOT_PROVIDER_TYPE` based on the provider's available protocol (see Task 4).
- opencode honors `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` and `OPENAI_API_KEY`/`OPENAI_BASE_URL` from the environment (verified: both appear under "Environment" in `opencode providers list` when set). Its `-m`/`--model` flag requires `provider/model` format where `provider` is the opencode-internal provider name (`anthropic` or `openai` — matching the protocol whose env vars are set). No custom envBuilder needed for opencode.
- claude-code `--model` takes a model alias (e.g. `claude-sonnet-5`). codex model is configured in `~/.codex/config.toml`, NOT via a `--model` flag (unverified locally; codex is not installed) — so codex's `buildArgs` returns `[]` (model comes from its own config), preserving current behavior (no regression).
- Menu stays a flat numbered list. No menu-structure changes in this plan.

## Context

The detected-agent feature (merged) launches opencode/copilot/antigravity as `self-contained` (plain spawn, no provider). The user wants opencode and copilot to instead launch with a selected provider + model, like claude-code/codex. Investigation confirmed:
- **opencode** honors standard `ANTHROPIC_*`/`OPENAI_*` env vars (no custom envBuilder) and takes `-m provider/model`.
- **copilot** uses its own `COPILOT_PROVIDER_*` env vars (custom `envBuilder`) and takes the model via `COPILOT_MODEL` (in env, not args); `--model` flag also exists but the env var is the BYOK-mandated path.
- **antigravity** stays `self-contained` (docs opaque; likely Google/Gemini-only).

Two user decisions shape the design: (1) a per-agent `envBuilder` field (extensible for future agents with bespoke env vars); (2) the model is prompted for **every** env-inject agent (not just copilot), selected from the provider's models via `fetchModels` with a manual fallback.

## File Structure (changes only)

```
src/types.ts                  [MODIFY] AgentDefinition gains optional envBuilder + buildArgs; Model import unchanged
src/agents/catalog.ts         [MODIFY] opencode + copilot flip to env-inject; add envBuilder/buildArgs per agent
src/tools/env.ts              [MODIFY] add copilotEnv(provider, model) — throws on null openaiBaseUrl
src/agents/launch.ts          [MODIFY] buildAgentEnv prefers envBuilder; launchAgent gains model param + buildArgs
src/menu/startTool.ts         [MODIFY] restore model-prompt (fetchModels + fallback) for env-inject agents; pass model to launchAgent
tests/agents/catalog.test.ts  [MODIFY] opencode/copilot now env-inject; assert envBuilder/buildArgs presence
tests/agents/launch.test.ts   [MODIFY] buildAgentEnv signature gains model; add copilot env + opencode -m args coverage
tests/menu/startAgent.test.ts [MODIFY] env-inject flow now prompts model (3rd select call); pass model to launchAgent
README.md                     [MODIFY] update agent table: opencode/copilot now env-inject; document model prompt
```

No new files, no deletions. `src/agents/detect.ts`, `src/doctor/checks.ts`, `src/menu/listAgents.ts`, `src/menu/mainMenu.ts` are untouched.

---

### Task 1: Extend `AgentDefinition` with `envBuilder` + `buildArgs`

**Files:**
- Modify: `src/types.ts`
- Modify: `tests/agents/catalog.test.ts` (assert the new optional fields exist on the right agents)

**Interfaces:**
- Produces (in `src/types.ts`, replacing the current `AgentDefinition`):
  ```ts
  export type EnvBuilder = (provider: Provider, model: string) => Record<string, string>;
  export type ArgsBuilder = (model: string) => string[];
  export interface AgentDefinition {
    id: AgentId;
    label: string;
    binary: string;
    versionArgs: string[];
    authStrategy: AuthStrategy;
    envProtocol: "anthropic" | "openai" | null; // null se, e somente se, authStrategy === "self-contained"
    homepage: string;
    envBuilder?: EnvBuilder;   // custom env vars; when absent, buildAgentEnv falls back to anthropicEnv/openaiEnv by envProtocol
    buildArgs: ArgsBuilder;    // CLI args for the model; env-inject agents use it; self-contained return []
  }
  ```
  `Provider`, `Model`, `AgentId`, `AuthStrategy`, `AgentStatus`, `AppConfig`, `DoctorCheckResult` unchanged. `buildArgs` is required (every agent has one, even if it returns `[]`) — this avoids undefined-checks at call sites and matches the "every agent launches with args" reality.

- [ ] **Step 1: Write the failing test**

Append to `tests/agents/catalog.test.ts` a new `describe` block (keep all existing tests):
```ts
describe("agent definition fields", () => {
  it("every agent has a buildArgs function", () => {
    for (const a of listAgentDefinitions()) {
      expect(typeof a.buildArgs).toBe("function");
    }
  });

  it("only copilot has a custom envBuilder; the others rely on envProtocol fallback", () => {
    for (const a of listAgentDefinitions()) {
      if (a.id === "copilot") {
        expect(a.envBuilder).toBeDefined();
      } else {
        expect(a.envBuilder).toBeUndefined();
      }
    }
  });
});
```
Note: this test will FAIL until Task 2 adds `buildArgs` to all catalog entries and `envBuilder` to copilot. Since `buildArgs` is required by the type after this task, `tsc` would also fail — but per the mid-refactor convention, gate this task on the catalog test file only (Step 4), and run the full `tsc`/suite gate only at the end of Task 5.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: FAIL — `a.buildArgs` is `undefined` (the field doesn't exist yet) and `copilot.envBuilder` is `undefined`.

- [ ] **Step 3: Implement the type change**

In `src/types.ts`, replace the `AgentDefinition` interface with the version in the Interfaces block above (add `EnvBuilder` and `ArgsBuilder` type aliases before it). Do NOT touch the catalog entries yet — Task 2 does that. `tsc` will be red (catalog entries lack `buildArgs`) until Task 2; that is expected mid-refactor.

- [ ] **Step 4: Run the test to verify it still fails (now for the right reason — fields missing on entries)**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: FAIL — the new `agent definition fields` tests fail (entries lack `buildArgs`/`envBuilder`); the existing 5 catalog tests still pass. This confirms the type change landed without breaking existing assertions.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/agents/catalog.test.ts
git commit -m "feat: AgentDefinition gains optional envBuilder + required buildArgs"
```

> **Note:** `tsc` and `npm test` will be red until Task 2 adds `buildArgs`/`envBuilder` to the catalog entries (the new required `buildArgs` field is missing on all 5 entries). Gate this task ONLY on the catalog test file. Do NOT run `tsc` or `npm test`.

---

### Task 2: Wire `envBuilder`/`buildArgs` into the catalog; flip opencode + copilot to env-inject

**Files:**
- Modify: `src/agents/catalog.ts`
- Modify: `tests/agents/catalog.test.ts` (update the auth-strategy assertions: opencode + copilot are now env-inject)

**Interfaces:**
- Produces (`src/agents/catalog.ts`): every entry gets a `buildArgs`; copilot gets an `envBuilder`. opencode and copilot flip `authStrategy: "self-contained"` → `"env-inject"` and gain `envProtocol` (opencode: `"openai"` — routed via the provider's OpenAI URL; copilot: `"openai"`). antigravity stays `self-contained`/`null`. The `envBuilder` for copilot references `copilotEnv` from `../tools/env.js` (added in Task 4) — **but Task 4 hasn't run yet.** To avoid a forward-dependency that breaks `tsc` mid-plan, this task defines copilot's `envBuilder` as a thin inline closure that delegates to a function imported from `../tools/env.js`. Since `copilotEnv` doesn't exist until Task 4, `tsc` will be red between Task 2 and Task 4 — that is expected mid-refactor (gate on the catalog test only here).

  To keep Task 2 self-testable WITHOUT Task 4, define copilot's `envBuilder` inline (not importing the not-yet-existing `copilotEnv`):
  ```ts
  copilot: {
    id: "copilot", label: "GitHub Copilot CLI", binary: "copilot", versionArgs: ["--version"],
    authStrategy: "env-inject", envProtocol: "openai", homepage: "https://github.com/github/copilot-cli",
    envBuilder: (provider, model) => {
      if (!provider.openaiBaseUrl) throw new Error("Provedor não tem URL OpenAI configurada");
      return {
        COPILOT_PROVIDER_BASE_URL: provider.openaiBaseUrl,
        COPILOT_PROVIDER_TYPE: "openai",
        COPILOT_PROVIDER_API_KEY: provider.apiKey,
        COPILOT_MODEL: model,
      };
    },
    buildArgs: () => [],
  },
  ```
  Task 4 will refactor this inline closure to call the exported `copilotEnv` (behavior-identical) so the logic is testable in isolation and lives with the other env helpers. Until then, the inline version is correct and testable through the catalog.

  The other entries:
  ```ts
  "claude-code": { ..., buildArgs: (model) => ["--model", model] },
  codex: { ..., buildArgs: () => [] },  // model comes from ~/.codex/config.toml
  opencode: { id: "opencode", label: "opencode", binary: "opencode", versionArgs: ["--version"],
              authStrategy: "env-inject", envProtocol: "openai", homepage: "https://opencode.ai",
              buildArgs: (model) => ["-m", `openai/${model}`] },  // opencode -m expects provider/model; provider is the opencode-internal "openai"
  antigravity: { ..., authStrategy: "self-contained", envProtocol: null, buildArgs: () => [] },
  ```
  opencode has NO `envBuilder` (undefined) — it falls back to `openaiEnv` via `envProtocol: "openai"`. Its `buildArgs` prefixes `openai/` per the `-m provider/model` requirement.

- [ ] **Step 1: Write the failing tests**

Update `tests/agents/catalog.test.ts`. In the existing `"claude-code e codex são env-inject; opencode/copilot/antigravity são self-contained"` test, change the expectations: opencode and copilot are now `env-inject`, antigravity stays `self-contained`:
```ts
  it("claude-code/codex/opencode/copilot são env-inject; antigravity é self-contained", () => {
    const auth = (id: string) => getAgentDefinition(id as never).authStrategy;
    expect(auth("claude-code")).toBe("env-inject");
    expect(auth("codex")).toBe("env-inject");
    expect(auth("opencode")).toBe("env-inject");
    expect(auth("copilot")).toBe("env-inject");
    expect(auth("antigravity")).toBe("self-contained");
  });
```
And in `"todo agente tem binary, versionArgs [--version]..."`, the self-contained check now applies only to antigravity — update the loop:
```ts
      if (a.authStrategy === "self-contained") {
        expect(a.envProtocol).toBeNull();
        expect(a.id).toBe("antigravity"); // the only self-contained agent
      } else {
        expect(a.envProtocol === "anthropic" || a.envProtocol === "openai").toBe(true);
      }
```
Add a new test for `buildArgs` shapes:
```ts
  it("buildArgs produce the expected per-agent CLI args", () => {
    expect(getAgentDefinition("claude-code").buildArgs("claude-sonnet-5")).toEqual(["--model", "claude-sonnet-5"]);
    expect(getAgentDefinition("codex").buildArgs("gpt-4o")).toEqual([]);
    expect(getAgentDefinition("opencode").buildArgs("gpt-4o")).toEqual(["-m", "openai/gpt-4o"]);
    expect(getAgentDefinition("copilot").buildArgs("gpt-4o")).toEqual([]);
    expect(getAgentDefinition("antigravity").buildArgs("x")).toEqual([]);
  });

  it("copilot envBuilder emits COPILOT_PROVIDER_* with the model", () => {
    const provider = { id: "1", name: "p", anthropicBaseUrl: null, openaiBaseUrl: "https://api.example.com/v1", apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as const;
    expect(getAgentDefinition("copilot").envBuilder!(provider, "gpt-4o")).toEqual({
      COPILOT_PROVIDER_BASE_URL: "https://api.example.com/v1",
      COPILOT_PROVIDER_TYPE: "openai",
      COPILOT_PROVIDER_API_KEY: "sk-x",
      COPILOT_MODEL: "gpt-4o",
    });
  });

  it("copilot envBuilder throws when openaiBaseUrl is null", () => {
    const provider = { id: "1", name: "p", anthropicBaseUrl: null, openaiBaseUrl: null, apiKey: "sk-x", createdAt: "2026-01-01T00:00:00.000Z" } as const;
    expect(() => getAgentDefinition("copilot").envBuilder!(provider, "m")).toThrow(/URL OpenAI/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: FAIL — opencode/copilot still `self-contained`, `buildArgs` missing, `envBuilder` missing.

- [ ] **Step 3: Update `src/agents/catalog.ts`**

Replace the `AGENT_CATALOG` with the 5 entries from the Interfaces block (each with `buildArgs`; copilot with the inline `envBuilder`; opencode flipped to `env-inject`/`openai` with `-m openai/<model>` args; antigravity unchanged but with `buildArgs: () => []`). Keep `listAgentDefinitions` and `getAgentDefinition` unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/agents/catalog.test.ts`
Expected: PASS — all catalog tests (existing + new) green.

- [ ] **Step 5: Commit**

```bash
git add src/agents/catalog.ts tests/agents/catalog.test.ts
git commit -m "feat: opencode+copilot flip to env-inject; per-agent buildArgs; copilot envBuilder"
```

> **Note:** `tsc` is still red (Task 3's `launchAgent` signature change hasn't landed, and the inline copilot envBuilder will be refactored in Task 4). `npm test` may have failures in `tests/agents/launch.test.ts` and `tests/menu/startAgent.test.ts` because `buildAgentEnv`/`launchAgent` haven't been updated yet. Gate this task ONLY on the catalog test. Full gate runs at end of Task 5.

---

### Task 3: Update `launchAgent` to use `envBuilder` + `buildArgs(model)`

**Files:**
- Modify: `src/agents/launch.ts`
- Modify: `tests/agents/launch.test.ts`

**Interfaces:**
- Produces (`src/agents/launch.ts`):
  ```ts
  export function buildAgentEnv(agent: AgentDefinition, provider: Provider | null, model: string): Record<string, string>
  export function launchAgent(agent: AgentDefinition, provider: Provider | null, model: string, spawnFn: typeof spawn = spawn): Promise<number>
  ```
  `buildAgentEnv`: if `authStrategy === "self-contained"` or `provider === null` → `{}`; else if `agent.envBuilder` is defined → `agent.envBuilder(provider, model)`; else → `envProtocol === "anthropic" ? anthropicEnv(provider) : openaiEnv(provider)` (the existing fallback, which does NOT need `model` — pass it anyway is fine since the fallback ignores it; but to keep the signature uniform, `anthropicEnv`/`openaiEnv` keep their 1-arg signature and `buildAgentEnv` just doesn't forward `model` to them).
  `launchAgent`: `env = { ...process.env, ...buildAgentEnv(agent, provider, model) }`; `args = agent.buildArgs(model)`; `spawnFn(agent.binary, args, { stdio: "inherit", env })`; resolves `code ?? 1`.

- [ ] **Step 1: Write the failing tests**

Update `tests/agents/launch.test.ts`:
- Every `buildAgentEnv(def(...), provider)` call gains a third `model` arg, e.g. `buildAgentEnv(def("claude-code"), provider, "claude-sonnet-5")`.
- Every `launchAgent(def(...), provider)` call gains a model arg, e.g. `launchAgent(def("claude-code"), provider, "claude-sonnet-5")`.
- The claude-code spawn assertion now checks args: `expect(spawn).toHaveBeenCalledWith("claude", ["--model", "claude-sonnet-5"], expect.objectContaining({...}))`.
- The opencode spawn test (currently "SEM chaves de env de provedor") changes: opencode is now env-inject, so it SHOULD get OPENAI_* env. Replace that test with:
  ```ts
  it("launchAgent faz spawn do opencode com OPENAI env e -m openai/<model>", async () => {
    const realEnv = process.env;
    process.env = { PATH: "/usr/bin" };
    try {
      const { spawn } = await import("node:child_process");
      const fakeChild = new EventEmitter();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
      const { launchAgent } = await import("../../src/agents/launch.js");
      const p = launchAgent(def("opencode"), provider, "gpt-4o");
      const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("opencode");
      expect(call[1]).toEqual(["-m", "openai/gpt-4o"]);
      const env = (call[2] as { env: Record<string, string> }).env;
      expect(env.OPENAI_API_KEY).toBe("sk-x");
      expect(env.OPENAI_BASE_URL).toBe("https://openrouter.ai/api/v1");
      fakeChild.emit("exit", 0);
      await expect(p).resolves.toBe(0);
    } finally {
      process.env = realEnv;
    }
  });
  ```
- Add a copilot launch test:
  ```ts
  it("launchAgent faz spawn do copilot com COPILOT_PROVIDER_* env e sem args (model vai em COPILOT_MODEL)", async () => {
    const realEnv = process.env;
    process.env = { PATH: "/usr/bin" };
    try {
      const { spawn } = await import("node:child_process");
      const fakeChild = new EventEmitter();
      (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);
      const { launchAgent } = await import("../../src/agents/launch.js");
      const p = launchAgent(def("copilot"), provider, "gpt-4o");
      const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe("copilot");
      expect(call[1]).toEqual([]);
      const env = (call[2] as { env: Record<string, string> }).env;
      expect(env.COPILOT_PROVIDER_BASE_URL).toBe("https://openrouter.ai/api/v1");
      expect(env.COPILOT_PROVIDER_API_KEY).toBe("sk-x");
      expect(env.COPILOT_MODEL).toBe("gpt-4o");
      fakeChild.emit("exit", 0);
      await expect(p).resolves.toBe(0);
    } finally {
      process.env = realEnv;
    }
  });
  ```
- The self-contained `{}` test now covers only antigravity: `for (const id of ["antigravity"])`.
- The throw-on-null test for claude-code stays (now with a model arg): `buildAgentEnv(def("claude-code"), { ...provider, anthropicBaseUrl: null }, "x")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/agents/launch.test.ts`
Expected: FAIL — `buildAgentEnv`/`launchAgent` still take 2 args; the opencode test expects OPENAI env but opencode is still self-contained in `launch.ts`'s view (it checks `authStrategy`, which is now `env-inject` from Task 2, so it'll route to `openaiEnv` — actually the env part may pass; the args part `["-m","openai/gpt-4o"]` will fail because `launchAgent` still spawns with `[]`). Expect failures on the args assertions and the 3-arg signature.

- [ ] **Step 3: Implement the `launch.ts` changes**

```ts
import { spawn } from "node:child_process";
import type { AgentDefinition, Provider } from "../types.js";
import { anthropicEnv, openaiEnv } from "../tools/env.js";

export function buildAgentEnv(agent: AgentDefinition, provider: Provider | null, model: string): Record<string, string> {
  if (agent.authStrategy === "self-contained" || provider === null) return {};
  if (agent.envBuilder) return agent.envBuilder(provider, model);
  return agent.envProtocol === "anthropic" ? anthropicEnv(provider) : openaiEnv(provider);
}

export function launchAgent(agent: AgentDefinition, provider: Provider | null, model: string, spawnFn: typeof spawn = spawn): Promise<number> {
  const env = { ...process.env, ...buildAgentEnv(agent, provider, model) };
  const args = agent.buildArgs(model);
  return new Promise((resolve, reject) => {
    const child = spawnFn(agent.binary, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/agents/launch.test.ts`
Expected: PASS — all launch tests green (existing updated + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/agents/launch.ts tests/agents/launch.test.ts
git commit -m "feat: launchAgent uses per-agent envBuilder + buildArgs(model)"
```

> **Note:** `tests/menu/startAgent.test.ts` will now FAIL (it calls `launchAgent(def, provider)` with 2 args, and `launchAgent` now requires 3). That is Task 5's scope. Gate this task on the launch test only.

---

### Task 4: Extract `copilotEnv` into `src/tools/env.ts`; refactor catalog to use it

**Files:**
- Modify: `src/tools/env.ts`
- Modify: `src/agents/catalog.ts` (copilot's `envBuilder` now calls `copilotEnv`)
- Modify: `tests/agents/catalog.test.ts` (the copilot envBuilder test still passes — behavior identical; no change needed, but verify)

**Interfaces:**
- Produces (`src/tools/env.ts`): add `copilotEnv(provider, model): Record<string, string>` — throws `/URL OpenAI/` if `!provider.openaiBaseUrl`; returns `{ COPILOT_PROVIDER_BASE_URL, COPILOT_PROVIDER_TYPE: "openai", COPILOT_PROVIDER_API_KEY, COPILOT_MODEL }`. Behavior identical to the inline closure from Task 2.
- `src/agents/catalog.ts` copilot entry: `envBuilder: (provider, model) => copilotEnv(provider, model)` (import `copilotEnv` from `../tools/env.js`).

- [ ] **Step 1: Write the failing test**

Create no new test file — the copilot envBuilder test in `tests/agents/catalog.test.ts` (Task 2) already pins the exact output and the throw. To also cover `copilotEnv` directly, append to `tests/agents/launch.test.ts` (it already imports the env helpers' consumers):
```ts
  it("copilotEnv throws on null openaiBaseUrl (guard) and emits the COPILOT_PROVIDER_* map", async () => {
    const { copilotEnv } = await import("../../src/tools/env.js");
    const ok = { ...provider } as Provider;
    expect(copilotEnv(ok, "gpt-4o")).toEqual({
      COPILOT_PROVIDER_BASE_URL: "https://openrouter.ai/api/v1",
      COPILOT_PROVIDER_TYPE: "openai",
      COPILOT_PROVIDER_API_KEY: "sk-x",
      COPILOT_MODEL: "gpt-4o",
    });
    expect(() => copilotEnv({ ...provider, openaiBaseUrl: null } as Provider, "m")).toThrow(/URL OpenAI/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/agents/launch.test.ts`
Expected: FAIL — `copilotEnv` is not exported from `src/tools/env.js`.

- [ ] **Step 3: Implement `copilotEnv` and refactor the catalog**

In `src/tools/env.ts`, append:
```ts
export function copilotEnv(provider: Provider, model: string): Record<string, string> {
  if (!provider.openaiBaseUrl) {
    throw new Error("Provedor não tem URL OpenAI configurada");
  }
  return {
    COPILOT_PROVIDER_BASE_URL: provider.openaiBaseUrl,
    COPILOT_PROVIDER_TYPE: "openai",
    COPILOT_PROVIDER_API_KEY: provider.apiKey,
    COPILOT_MODEL: model,
  };
}
```
In `src/agents/catalog.ts`, add `import { copilotEnv } from "../tools/env.js";` and change copilot's `envBuilder` to `envBuilder: (provider, model) => copilotEnv(provider, model)`. (The inline closure is removed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/agents/catalog.test.ts tests/agents/launch.test.ts`
Expected: PASS — the catalog's copilot envBuilder test (Task 2) still passes (behavior identical), and the new `copilotEnv` direct test passes.

- [ ] **Step 5: Commit**

```bash
git add src/tools/env.ts src/agents/catalog.ts tests/agents/launch.test.ts
git commit -m "feat: extract copilotEnv into tools/env (throw-on-null preserved)"
```

---

### Task 5: Restore model-prompt in `startToolFlow`; pass model to `launchAgent`

**Files:**
- Modify: `src/menu/startTool.ts`
- Modify: `tests/menu/startAgent.test.ts`

**Interfaces:**
- Produces (`src/menu/startTool.ts`): `startToolFlow` now, for env-inject agents, after provider selection + URL validation, prompts for a model:
  - Try `fetchModels(provider)`; if it returns ≥1 model, `promptChoice` over them (`name: m.id, value: m.id`).
  - On failure (throw or empty), fall back to `promptText("Digite o nome do modelo manualmente:")`.
  - Then `launchAgent(agent, provider, model)`.
  - Self-contained agents (antigravity) still launch bare: `launchAgent(agent, null, "")` — `model` is `""` (unused since `buildArgs("")` returns `[]` and there's no envBuilder). Use `""` not `null` to satisfy the `string` signature.
- Needs imports: `fetchModels` from `../discovery/models.js`; `promptText` from `../ui/prompts.js`.

- [ ] **Step 1: Write the failing tests**

Update `tests/menu/startAgent.test.ts`:
- The no-agent test: unchanged.
- The opencode test: opencode is now env-inject, so it DOES prompt for a provider + model. Replace it with an antigravity self-contained test (the only remaining self-contained agent):
  ```ts
  const antigravityDef = { id: "antigravity", label: "Antigravity", binary: "antigravity", versionArgs: ["--version"], authStrategy: "self-contained" as const, envProtocol: null, homepage: "https://antigravity.google", buildArgs: () => [] };
  ```
  ```ts
  it("agente self-contained (antigravity) é lançado com provider null e model vazio, sem prompt de provedor/modelo", async () => {
    const { detectAgents } = await import("../../src/agents/detect.js");
    (detectAgents as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { definition: antigravityDef, installed: true },
    ]);
    const { select } = await import("@inquirer/prompts");
    (select as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("antigravity");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { launchAgent } = await import("../../src/agents/launch.js");
    const { listProviders } = await import("../../src/config/providers.js");
    const { fetchModels } = await import("../../src/discovery/models.js");
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    await startToolFlow();
    expect(listProviders).not.toHaveBeenCalled();
    expect(fetchModels).not.toHaveBeenCalled();
    expect(launchAgent).toHaveBeenCalledWith(antigravityDef, null, "");
  });
  ```
- The claude-code env-inject test: now there are THREE `select` calls (agent, provider, model) — but the model prompt uses `select` only if `fetchModels` returns models; on fallback it uses `input` (promptText). Mock `fetchModels` to resolve `[{ id: "claude-sonnet-5" }]` so the model is a `select`. Update the `select` mock to return three values in order:
  ```ts
  (select as unknown as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce("claude-code")   // agent
    .mockResolvedValueOnce("openrouter")     // provider
    .mockResolvedValueOnce("claude-sonnet-5"); // model
  const { fetchModels } = await import("../../src/discovery/models.js");
  (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "claude-sonnet-5" }]);
  ```
  and the final assertion: `expect(launchAgent).toHaveBeenCalledWith(claudeDef, provider, "claude-sonnet-5")`.
  Note `claudeDef` in this test is a local literal — add `buildArgs: (m: string) => ["--model", m]` to it (the startTool flow doesn't call buildArgs directly, but the literal should match the real shape to avoid confusion; it's not asserted on buildArgs so it's optional — but include it for realism).
- Add a fallback test: when `fetchModels` rejects, the flow uses `promptText` (mocked) for the model:
  ```ts
  vi.mock("../../src/ui/prompts.js", () => ({ promptChoice: vi.fn(), promptText: vi.fn(async () => "manual-model") }));
  ```
  This requires importing `promptText` — but the existing test mocks `@inquirer/prompts`, not `../ui/prompts.js`. Since `startTool` imports from `../ui/prompts.js`, mock THAT module instead of `@inquirer/prompts` for the fallback test (a separate `it` can re-mock). Simplest: add the `vi.mock("../../src/ui/prompts.js", ...)` at the top and have `promptChoice` delegate to the `select` mock already set up. To minimize churn, keep the existing `@inquirer/prompts` mock for the select-based tests, and write the fallback test in a SEPARATE file `tests/menu/startAgentFallback.test.ts` that mocks `../ui/prompts.js` directly.

  Actually — to avoid a second file and a competing top-level mock, put the fallback assertion in the SAME file but use `vi.doMock` inside the test body before the dynamic import. Concretely:
  ```ts
  it("env-inject: usa promptText (entrada manual) quando fetchModels falha", async () => {
    vi.resetModules();
    vi.doMock("../../src/agents/detect.js", () => ({ detectAgents: vi.fn(() => [{ definition: claudeDef, installed: true }]), isAgentInstalled: vi.fn() }));
    vi.doMock("../../src/config/providers.js", () => ({ listProviders: vi.fn(() => [provider]) }));
    vi.doMock("../../src/discovery/models.js", () => ({ fetchModels: vi.fn(() => Promise.reject(new Error("HTTP 401"))) }));
    vi.doMock("../../src/ui/prompts.js", () => ({
      promptChoice: vi.fn(async (_msg: string, choices: Array<{ value: string }>) => choices[0].value), // agent=openrouter... but agent select is first
      promptText: vi.fn(async () => "manual-model"),
    }));
    vi.doMock("../../src/agents/launch.js", () => ({ launchAgent: vi.fn(() => Promise.resolve(0)) }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { startToolFlow } = await import("../../src/menu/startTool.js");
    const { launchAgent } = await import("../../src/agents/launch.js");
    await startToolFlow();
    expect(launchAgent).toHaveBeenCalledWith(claudeDef, provider, "manual-model");
    vi.resetModules();
  });
  ```
  The `promptChoice` mock above returns the first choice's value — but the flow calls `promptChoice` twice (agent, then provider). Returning the first choice each time gives agent=`claude-code` (first installed) and provider=`openrouter` (first provider). That works for this fixture.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/menu/startAgent.test.ts`
Expected: FAIL — `launchAgent` is called with 2 args (the current `startTool` doesn't pass a model), and the antigravity/3-select/fallback tests don't match.

- [ ] **Step 3: Implement `src/menu/startTool.ts`**

```ts
import { listProviders } from "../config/providers.js";
import { getAgentDefinition } from "../agents/catalog.js";
import { detectAgents } from "../agents/detect.js";
import { launchAgent } from "../agents/launch.js";
import { fetchModels } from "../discovery/models.js";
import { promptChoice, promptText } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

export async function startToolFlow(): Promise<void> {
  console.log(theme.heading("\nIniciar Agent"));

  const installed = detectAgents().filter((s) => s.installed);
  if (installed.length === 0) {
    console.log(theme.fail("Nenhum agente detectado. Instale claude, codex, opencode, copilot ou antigravity."));
    return;
  }

  const agentId = await promptChoice(
    "Selecione o agente:",
    installed.map((s) => ({ name: s.definition.label, value: s.definition.id }))
  );
  const agent = getAgentDefinition(agentId);

  let provider = null;
  let model = "";
  if (agent.authStrategy === "env-inject") {
    const providers = listProviders();
    if (providers.length === 0) {
      console.log(theme.fail("Nenhum provedor cadastrado. Use \"Gerenciar Provedores\" primeiro."));
      return;
    }
    const providerName = await promptChoice(
      "Selecione o provedor:",
      providers.map((p) => ({ name: p.name, value: p.name }))
    );
    const selected = providers.find((p) => p.name === providerName)!;
    const url = agent.envProtocol === "anthropic" ? selected.anthropicBaseUrl : selected.openaiBaseUrl;
    if (!url) {
      const protocol = agent.envProtocol === "anthropic" ? "Anthropic" : "OpenAI";
      console.log(theme.fail(`Provedor "${selected.name}" não tem URL ${protocol} configurada. Edite o provedor para adicioná-la.`));
      return;
    }
    provider = selected;
    model = await selectModel(selected);
  }

  console.log(theme.ok(`\nIniciando ${agent.label}...\n`));
  const exitCode = await launchAgent(agent, provider, model);
  if (exitCode !== 0) {
    console.log(theme.fail(`${agent.label} encerrou com código ${exitCode}.`));
  }
}

async function selectModel(provider: Provider): Promise<string> {
  try {
    const models = await fetchModels(provider);
    if (models.length === 0) throw new Error("nenhum modelo retornado");
    return await promptChoice(
      "Selecione o modelo:",
      models.map((m) => ({ name: m.id, value: m.id }))
    );
  } catch (error) {
    console.log(theme.fail(`Não foi possível listar modelos automaticamente (${error instanceof Error ? error.message : error}).`));
    return await promptText("Digite o nome do modelo manualmente:");
  }
}
```
Add `import type { Provider } from "../types.js";` for the `selectModel` parameter type.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/menu/startAgent.test.ts`
Expected: PASS — all startAgent tests green (no-agent, antigravity self-contained, claude-code 3-select, fallback manual).

- [ ] **Step 5: Commit**

```bash
git add src/menu/startTool.ts tests/menu/startAgent.test.ts
git commit -m "feat: startToolFlow prompts for model (fetchModels + manual fallback) per env-inject agent"
```

---

### Task 6: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Update the agent table and the "Iniciar Agent" description:
- The table's `Auth` column: opencode → `env-inject (OpenAI)`, copilot → `env-inject (OpenAI, COPILOT_PROVIDER_*)`, antigravity stays `self-contained`. (claude-code/codex unchanged.)
- Add a sentence: "Ao iniciar um agente env-inject, você seleciona o provedor e o modelo (listado automaticamente do provedor, com fallback para entrada manual); o agente é lançado com as env vars e a flag `--model` apropriadas (copilot usa `COPILOT_MODEL` no env em vez de flag; codex lê o modelo do seu próprio `~/.codex/config.toml`)."
- opencode note: "opencode é lançado com `-m openai/<modelo>` (formato exigido pelo opencode)."

- [ ] **Step 2: Final gate**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass; `tsc` clean; `dist/index.js` produced.

- [ ] **Step 3: Smoke-test the built CLI**

Run (with a provider that has an OpenAI URL configured; if none, the flow blocks at the provider-URL check — that itself confirms the guard): `printf '1\n' | node bin/ai-switch.mjs 2>&1 | head` — verify the menu shows "1. Iniciar Agent" and selecting an installed env-inject agent proceeds to the provider/model prompts. (Full interactive smoke is manual; the automated gate is the test suite.)

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document opencode+copilot provider integration and model prompt"
```

---

## Verification (end-to-end, after all 6 tasks)

1. `npm test` → all pass (catalog 8, detect 4, launch 9, listAgents 1, startAgent 4, doctor 6, providers 15, store 4, models 4, table 2, smoke 1 — counts approximate; the gate is "all green").
2. `npx tsc --noEmit` → clean. No dangling references; `buildArgs` present on all entries; `envBuilder` only on copilot.
3. `npm run build` → `dist/index.js` produced.
4. Invariants preserved: `anthropicEnv`/`openaiEnv`/`copilotEnv` all throw on null protocol URL (no `?? ""`); apiKey never rendered.
5. Manual smoke: `npm run dev` → Iniciar Agent → opencode (installed) → prompts provider + model → launches `opencode -m openai/<model>` with `OPENAI_*` env. copilot → launches `copilot` with `COPILOT_PROVIDER_*` + `COPILOT_MODEL`. claude-code → `--model`. antigravity → plain spawn, no prompts.

## Self-Review

1. **Spec coverage:** User wants opencode + copilot to launch with a registered provider + model. Task 2 flips them to env-inject; Task 3 makes `launchAgent` use per-agent env/args; Task 4 centralizes copilot's env; Task 5 restores the model prompt + passes the model through. antigravity stays self-contained (Task 2 leaves it). The per-agent `envBuilder` (Task 1/2) and "model for every env-inject agent" (Task 5) decisions are encoded. No gap.
2. **Placeholder scan:** no TBD/TODO; every code block is complete; test code shown. The one inline closure in Task 2 is explicitly temporary and refactored in Task 4 (documented).
3. **Type consistency:** `EnvBuilder = (provider, model) => Record<string,string>`; `ArgsBuilder = (model) => string[]`; `buildAgentEnv(agent, provider, model)`; `launchAgent(agent, provider, model, spawnFn?)`; `copilotEnv(provider, model)`. Consistent across types, catalog, launch, env, startTool, tests. `selectModel(provider)` returns `Promise<string>`. `model` is `string` everywhere (self-contained passes `""`).
4. **Global Constraints:** UI-free `src/agents/*` + `src/tools/env.ts`; spawn injectable; throw-on-null in all three env helpers (copilotEnv added with the same guard); ESM `.js`. Mid-refactor `tsc`/suite redness between Tasks 1–4 is expected and gated per-task; full gate at end of Task 5 + Task 6.
5. **Forward-dependency note:** Task 2 defines copilot's `envBuilder` inline (not importing the not-yet-existing `copilotEnv`) so Task 2's catalog test passes without Task 4. Task 4 refactors it to call `copilotEnv`. This ordering avoids a broken import mid-plan and is the reason Task 4 is separate rather than folded into Task 2.
6. **Test-isolation pattern:** the opencode/copilot launch tests isolate `process.env` (save/`{PATH}`/restore in `try/finally`) because the host runtime carries `ANTHROPIC_API_KEY`/`OPENAI_*` — same fix the prior feature's Task 3 used and the final review approved.
