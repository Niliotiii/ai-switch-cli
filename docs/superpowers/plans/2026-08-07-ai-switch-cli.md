# AI Switch CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/TypeScript interactive CLI that lets a developer register AI provider endpoints, discover their models, and launch dev tools (Claude Code, Aider, Open Interpreter) pre-wired with the right credentials via environment variables.

**Architecture:** Single-process Node CLI with a text menu loop (`@inquirer/prompts`). Business logic (config storage, provider/tool/agent registries, model discovery, doctor checks, process launching) lives in pure, dependency-injectable modules under `src/`, fully unit-tested. A thin `menu/` layer wires that logic to interactive prompts and is the only layer that talks to stdin/stdout. Provider credentials persist as JSON at `~/.config/ai-switch/config.json` with `0600` permissions. Launching a tool sets provider credentials as env vars and `spawn`s the target binary with `stdio: "inherit"`.

**Tech Stack:** Node.js >=18, TypeScript (ESM), `@inquirer/prompts` (interactive prompts), `chalk` (color), native `fetch` (model discovery), `vitest` (tests), `tsup` (build), `tsx` (dev run).

## Global Constraints

- Node >=18 required (native `fetch`, `node:` protocol imports). Declare in `package.json` `engines`.
- Config file must be written with mode `0600`; config dir with mode `0700`. (PRD §4 Segurança e Privacidade)
- No network call may block the menu loop indefinitely — all `fetch` calls must be `await`ed inside try/catch and surfaced as readable errors, never crash the process. (PRD §4 UX/robustez)
- Menu must be numbered options with clear labels, matching PRD §3.1 items 1–6 exactly: Iniciar Ferramenta, Cadastrar Novo Provedor, Ver Modelos, Ver Agents, Diagnóstico, Sair.
- All business-logic modules (`config/`, `tools/`, `agents/`, `discovery/`, `doctor/`) must be UI-framework-free — no `@inquirer/prompts` or `console.log` imports there — so they stay unit-testable without mocking stdin.
- Package manager: npm (repo has no lockfile yet; use `npm install` / `package-lock.json`).

## Assumptions (not fully specified in PRD — documented here, confirm with user before diverging)

- **"Agents"** (PRD §3.1 item 4, §3.5) are interpreted as **built-in launch profiles** shipped with the app (tool + description + extra CLI flags), not user-created entities — the PRD only lists "Ver Agents", never "Cadastrar Agent". If the user actually wants custom/user-authored agents, that's a follow-up task (`agents/store.ts` mirroring `config/providers.ts`).
- **Model discovery** assumes an OpenAI-compatible `GET {baseUrl}/models` endpoint returning `{ data: [{ id: string }] }` — this is the de facto standard for "alternative AI provider" proxies (OpenRouter, LiteLLM, Ollama-compatible, etc.) mentioned in the PRD.
- **Supported dev tools** for v1: Claude Code (`claude`), Aider (`aider`), Open Interpreter (`interpreter`). Adding more tools later is a one-entry addition to `tools/registry.ts`.
- Provider **delete/edit** is out of scope — PRD only requires cadastro (create) and consulta (read). Deleting a bad entry means editing the JSON file directly for now.

---

## File Structure

```
ai-switch-cli/
  package.json
  tsconfig.json
  vitest.config.ts
  bin/
    ai-switch.mjs          # shebang entrypoint, runs built dist/index.js
  src/
    types.ts               # Provider, Model, ToolId, ToolDefinition, AgentProfile, AppConfig, DoctorCheckResult
    index.ts                # main(): banner + menu loop, process entrypoint
    config/
      paths.ts               # getConfigDir(), getConfigFile() — respects AI_SWITCH_CONFIG_DIR override
      store.ts                # readConfig(), writeConfig() — JSON + 0600 perms
      providers.ts             # listProviders, providerNameExists, addProvider, getProviderByName
    tools/
      registry.ts              # TOOL_DEFINITIONS (claude-code, aider, open-interpreter), listTools, getTool
      launcher.ts               # isBinaryInstalled, launchTool
    agents/
      registry.ts                # AGENT_PROFILES (built-in), listAgents, listAgentsByTool
    discovery/
      models.ts                   # fetchModels(provider): Promise<Model[]>
    doctor/
      checks.ts                    # checkTools, checkProvider, runDoctor
    ui/
      theme.ts                      # chalk color helpers (ok/fail/heading/dim)
      prompts.ts                     # promptText, promptSecret, promptChoice, promptConfirm (wraps @inquirer/prompts)
      table.ts                        # renderTable(rows): string
    menu/
      mainMenu.ts                      # top-level loop, dispatches to the 5 flows below
      registerProvider.ts                # PRD §3.2 guided 3-step flow
      listModels.ts                       # PRD §3.3
      listAgents.ts                        # PRD §3.1 item 4
      startTool.ts                          # PRD §3.5
      doctorMenu.ts                          # PRD §3.4
  tests/
    config/store.test.ts
    config/providers.test.ts
    tools/registry.test.ts
    tools/launcher.test.ts
    agents/registry.test.ts
    discovery/models.test.ts
    doctor/checks.test.ts
```

---

### Task 1: Project bootstrap

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/types.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**

- Produces: all shared types re-used by every later task — `Provider`, `Model`, `ToolId`, `ToolDefinition`, `AgentProfile`, `AppConfig`, `DoctorCheckResult`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ai-switch-cli",
  "version": "0.1.0",
  "description": "Universal CLI to switch between AI dev tools and providers",
  "type": "module",
  "bin": {
    "ai-switch": "bin/ai-switch.mjs"
  },
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@inquirer/prompts": "^5.3.8",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "tsup": "^8.2.3",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 5: Create `src/types.ts`**

```ts
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
}

export interface Model {
  id: string;
}

export type ToolId = 'claude-code' | 'aider' | 'open-interpreter';

export interface ToolDefinition {
  id: ToolId;
  label: string;
  binary: string;
  versionArgs: string[];
  buildEnv: (provider: Provider, model: string) => Record<string, string>;
  buildArgs: (model: string, extraArgs: string[]) => string[];
}

export interface AgentProfile {
  id: string;
  name: string;
  toolId: ToolId;
  description: string;
  extraArgs: string[];
}

export interface AppConfig {
  providers: Provider[];
}

export interface DoctorCheckResult {
  label: string;
  ok: boolean;
  detail: string;
}
```

- [ ] **Step 6: Write the smoke test**

```ts
import { describe, expect, it } from 'vitest';
import type { Provider } from '../src/types.js';

describe('types', () => {
  it('Provider shape compiles and holds values', () => {
    const provider: Provider = {
      id: '1',
      name: 'test',
      baseUrl: 'https://example.com',
      apiKey: 'sk-test',
      createdAt: new Date().toISOString(),
    };
    expect(provider.name).toBe('test');
  });
});
```

- [ ] **Step 7: Install deps and run the test**

Run: `npm install && npm test`
Expected: PASS (1 test)

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/types.ts tests/smoke.test.ts package-lock.json
git commit -m "chore: bootstrap ai-switch-cli project"
```

---

### Task 2: Config paths & store

**Files:**

- Create: `src/config/paths.ts`
- Create: `src/config/store.ts`
- Test: `tests/config/store.test.ts`

**Interfaces:**

- Consumes: `AppConfig` from `src/types.ts`.
- Produces: `getConfigDir(): string`, `getConfigFile(): string`, `readConfig(): AppConfig`, `writeConfig(config: AppConfig): void`. Both `paths.ts` functions honor `process.env.AI_SWITCH_CONFIG_DIR` so tests never touch the real home directory.

- [ ] **Step 1: Write the failing test**

```ts
import {
  mkdtempSync,
  rmSync,
  existsSync,
  statSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ai-switch-test-'));
  process.env.AI_SWITCH_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.AI_SWITCH_CONFIG_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('config store', () => {
  it('readConfig returns empty providers when no file exists', async () => {
    const { readConfig } = await import('../../src/config/store.js');
    expect(readConfig()).toEqual({ providers: [] });
  });

  it('writeConfig persists data readable by readConfig, with 0600 perms', async () => {
    const { readConfig, writeConfig } =
      await import('../../src/config/store.js');
    const { getConfigFile } = await import('../../src/config/paths.js');
    writeConfig({
      providers: [
        {
          id: '1',
          name: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-x',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(readConfig().providers).toHaveLength(1);
    const file = getConfigFile();
    expect(existsSync(file)).toBe(true);
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(JSON.parse(readFileSync(file, 'utf-8')).providers[0].name).toBe(
      'openrouter',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/store.test.ts`
Expected: FAIL — cannot find `src/config/store.js` / `src/config/paths.js`

- [ ] **Step 3: Write `src/config/paths.ts`**

```ts
import os from 'node:os';
import path from 'node:path';

export function getConfigDir(): string {
  return (
    process.env.AI_SWITCH_CONFIG_DIR ??
    path.join(os.homedir(), '.config', 'ai-switch')
  );
}

export function getConfigFile(): string {
  return path.join(getConfigDir(), 'config.json');
}
```

- [ ] **Step 4: Write `src/config/store.ts`**

```ts
import fs from 'node:fs';
import type { AppConfig } from '../types.js';
import { getConfigDir, getConfigFile } from './paths.js';

export function readConfig(): AppConfig {
  const file = getConfigFile();
  if (!fs.existsSync(file)) {
    return { providers: [] };
  }
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw) as AppConfig;
}

export function writeConfig(config: AppConfig): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = getConfigFile();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config/store.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/config/paths.ts src/config/store.ts tests/config/store.test.ts
git commit -m "feat: add config dir/file persistence with 0600 perms"
```

---

### Task 3: Provider persistence

**Files:**

- Create: `src/config/providers.ts`
- Test: `tests/config/providers.test.ts`

**Interfaces:**

- Consumes: `readConfig`, `writeConfig` from `src/config/store.ts`; `Provider` from `src/types.ts`.
- Produces: `listProviders(): Provider[]`, `providerNameExists(name: string): boolean`, `addProvider(input: { name: string; baseUrl: string; apiKey: string }): Provider`, `getProviderByName(name: string): Provider | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ai-switch-test-'));
  process.env.AI_SWITCH_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.AI_SWITCH_CONFIG_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('provider persistence', () => {
  it('addProvider persists and is returned by listProviders', async () => {
    const { addProvider, listProviders } =
      await import('../../src/config/providers.js');
    const created = addProvider({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-x',
    });
    expect(created.id).toBeTruthy();
    expect(listProviders()).toHaveLength(1);
    expect(listProviders()[0].name).toBe('openrouter');
  });

  it('addProvider strips trailing slashes from baseUrl', async () => {
    const { addProvider } = await import('../../src/config/providers.js');
    const created = addProvider({
      name: 'p1',
      baseUrl: 'https://api.example.com/v1/',
      apiKey: 'sk-x',
    });
    expect(created.baseUrl).toBe('https://api.example.com/v1');
  });

  it('addProvider rejects duplicate names', async () => {
    const { addProvider } = await import('../../src/config/providers.js');
    addProvider({ name: 'dup', baseUrl: 'https://a.com', apiKey: 'sk-a' });
    expect(() =>
      addProvider({ name: 'dup', baseUrl: 'https://b.com', apiKey: 'sk-b' }),
    ).toThrow(/already exists/);
  });

  it('getProviderByName finds an existing provider and returns undefined otherwise', async () => {
    const { addProvider, getProviderByName } =
      await import('../../src/config/providers.js');
    addProvider({ name: 'findme', baseUrl: 'https://a.com', apiKey: 'sk-a' });
    expect(getProviderByName('findme')?.baseUrl).toBe('https://a.com');
    expect(getProviderByName('missing')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/providers.test.ts`
Expected: FAIL — cannot find `src/config/providers.js`

- [ ] **Step 3: Write `src/config/providers.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { Provider } from '../types.js';
import { readConfig, writeConfig } from './store.js';

export function listProviders(): Provider[] {
  return readConfig().providers;
}

export function providerNameExists(name: string): boolean {
  return listProviders().some(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
}

export function addProvider(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
}): Provider {
  if (providerNameExists(input.name)) {
    throw new Error(`Provider "${input.name}" already exists`);
  }
  const provider: Provider = {
    id: randomUUID(),
    name: input.name,
    baseUrl: input.baseUrl.replace(/\/+$/, ''),
    apiKey: input.apiKey,
    createdAt: new Date().toISOString(),
  };
  const config = readConfig();
  config.providers.push(provider);
  writeConfig(config);
  return provider;
}

export function getProviderByName(name: string): Provider | undefined {
  return listProviders().find((p) => p.name === name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/providers.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/providers.ts tests/config/providers.test.ts
git commit -m "feat: add provider CRUD (create/list/find) with dedup"
```

---

### Task 4: Tools registry

**Files:**

- Create: `src/tools/registry.ts`
- Test: `tests/tools/registry.test.ts`

**Interfaces:**

- Consumes: `Provider`, `ToolDefinition`, `ToolId` from `src/types.ts`.
- Produces: `TOOL_DEFINITIONS: Record<ToolId, ToolDefinition>`, `listTools(): ToolDefinition[]`, `getTool(id: ToolId): ToolDefinition`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { getTool, listTools } from '../../src/tools/registry.js';
import type { Provider } from '../../src/types.js';

const provider: Provider = {
  id: '1',
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('tools registry', () => {
  it('listTools returns claude-code, aider and open-interpreter', () => {
    const ids = listTools()
      .map((t) => t.id)
      .sort();
    expect(ids).toEqual(['aider', 'claude-code', 'open-interpreter']);
  });

  it('claude-code buildEnv maps to ANTHROPIC_* vars', () => {
    const tool = getTool('claude-code');
    expect(tool.buildEnv(provider, 'claude-sonnet-5')).toEqual({
      ANTHROPIC_API_KEY: 'sk-x',
      ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
    });
  });

  it('aider buildEnv maps to OPENAI_* vars and buildArgs includes --model', () => {
    const tool = getTool('aider');
    expect(tool.buildEnv(provider, 'gpt-4o')).toEqual({
      OPENAI_API_KEY: 'sk-x',
      OPENAI_API_BASE: 'https://openrouter.ai/api/v1',
      OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
    });
    expect(tool.buildArgs('gpt-4o', ['--yes'])).toEqual([
      '--model',
      'gpt-4o',
      '--yes',
    ]);
  });

  it('getTool throws on unknown id', () => {
    // @ts-expect-error testing runtime guard
    expect(() => getTool('unknown')).toThrow(/Unknown tool/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/registry.test.ts`
Expected: FAIL — cannot find `src/tools/registry.js`

- [ ] **Step 3: Write `src/tools/registry.ts`**

```ts
import type { Provider, ToolDefinition, ToolId } from '../types.js';

function buildOpenAIEnv(provider: Provider): Record<string, string> {
  return {
    OPENAI_API_KEY: provider.apiKey,
    OPENAI_API_BASE: provider.baseUrl,
    OPENAI_BASE_URL: provider.baseUrl,
  };
}

export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    binary: 'claude',
    versionArgs: ['--version'],
    buildEnv: (provider: Provider) => ({
      ANTHROPIC_API_KEY: provider.apiKey,
      ANTHROPIC_BASE_URL: provider.baseUrl,
    }),
    buildArgs: (_model: string, extraArgs: string[]) => [...extraArgs],
  },
  aider: {
    id: 'aider',
    label: 'Aider',
    binary: 'aider',
    versionArgs: ['--version'],
    buildEnv: buildOpenAIEnv,
    buildArgs: (model: string, extraArgs: string[]) => [
      '--model',
      model,
      ...extraArgs,
    ],
  },
  'open-interpreter': {
    id: 'open-interpreter',
    label: 'Open Interpreter',
    binary: 'interpreter',
    versionArgs: ['--version'],
    buildEnv: buildOpenAIEnv,
    buildArgs: (model: string, extraArgs: string[]) => [
      '--model',
      model,
      ...extraArgs,
    ],
  },
};

export function listTools(): ToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS);
}

export function getTool(id: ToolId): ToolDefinition {
  const tool = TOOL_DEFINITIONS[id];
  if (!tool) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return tool;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/registry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry.ts tests/tools/registry.test.ts
git commit -m "feat: add built-in tool registry (claude-code, aider, open-interpreter)"
```

---

### Task 5: Tool launcher (process spawn)

**Files:**

- Create: `src/tools/launcher.ts`
- Test: `tests/tools/launcher.test.ts`

**Interfaces:**

- Consumes: `ToolDefinition`, `Provider` from `src/types.ts`.
- Produces: `isBinaryInstalled(tool: ToolDefinition): boolean`, `launchTool(tool: ToolDefinition, provider: Provider, model: string, extraArgs?: string[]): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Provider, ToolDefinition } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

const provider: Provider = {
  id: '1',
  name: 'test',
  baseUrl: 'https://api.example.com',
  apiKey: 'sk-x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const tool: ToolDefinition = {
  id: 'claude-code',
  label: 'Claude Code',
  binary: 'claude',
  versionArgs: ['--version'],
  buildEnv: (p) => ({
    ANTHROPIC_API_KEY: p.apiKey,
    ANTHROPIC_BASE_URL: p.baseUrl,
  }),
  buildArgs: (_model, extra) => [...extra],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('launcher', () => {
  it('isBinaryInstalled returns true when spawnSync exits 0', async () => {
    const { spawnSync } = await import('node:child_process');
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 0,
    });
    const { isBinaryInstalled } = await import('../../src/tools/launcher.js');
    expect(isBinaryInstalled(tool)).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith('claude', ['--version'], {
      stdio: 'ignore',
    });
  });

  it('isBinaryInstalled returns false when spawnSync exits non-zero', async () => {
    const { spawnSync } = await import('node:child_process');
    (spawnSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 127,
    });
    const { isBinaryInstalled } = await import('../../src/tools/launcher.js');
    expect(isBinaryInstalled(tool)).toBe(false);
  });

  it('launchTool spawns the binary with merged env and resolves with exit code', async () => {
    const { spawn } = await import('node:child_process');
    const fakeChild = new EventEmitter();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeChild);

    const { launchTool } = await import('../../src/tools/launcher.js');
    const resultPromise = launchTool(tool, provider, 'claude-sonnet-5', []);

    expect(spawn).toHaveBeenCalledWith(
      'claude',
      [],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({
          ANTHROPIC_API_KEY: 'sk-x',
          ANTHROPIC_BASE_URL: 'https://api.example.com',
        }),
      }),
    );

    fakeChild.emit('exit', 0);
    await expect(resultPromise).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/launcher.test.ts`
Expected: FAIL — cannot find `src/tools/launcher.js`

- [ ] **Step 3: Write `src/tools/launcher.ts`**

```ts
import { spawn, spawnSync } from 'node:child_process';
import type { Provider, ToolDefinition } from '../types.js';

export function isBinaryInstalled(tool: ToolDefinition): boolean {
  const result = spawnSync(tool.binary, tool.versionArgs, { stdio: 'ignore' });
  return result.status === 0;
}

export function launchTool(
  tool: ToolDefinition,
  provider: Provider,
  model: string,
  extraArgs: string[] = [],
): Promise<number> {
  const env = { ...process.env, ...tool.buildEnv(provider, model) };
  const args = tool.buildArgs(model, extraArgs);
  return new Promise((resolve, reject) => {
    const child = spawn(tool.binary, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/launcher.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/launcher.ts tests/tools/launcher.test.ts
git commit -m "feat: add tool binary detection and process launcher"
```

---

### Task 6: Agent registry

**Files:**

- Create: `src/agents/registry.ts`
- Test: `tests/agents/registry.test.ts`

**Interfaces:**

- Consumes: `AgentProfile`, `ToolId` from `src/types.ts`.
- Produces: `AGENT_PROFILES: AgentProfile[]`, `listAgents(): AgentProfile[]`, `listAgentsByTool(toolId: ToolId): AgentProfile[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { listAgents, listAgentsByTool } from '../../src/agents/registry.js';

describe('agent registry', () => {
  it('listAgents returns at least one profile per known tool', () => {
    const agents = listAgents();
    const tools = new Set(agents.map((a) => a.toolId));
    expect(tools).toEqual(
      new Set(['claude-code', 'aider', 'open-interpreter']),
    );
  });

  it('listAgentsByTool filters correctly', () => {
    const aiderAgents = listAgentsByTool('aider');
    expect(aiderAgents.length).toBeGreaterThan(0);
    expect(aiderAgents.every((a) => a.toolId === 'aider')).toBe(true);
  });

  it('every agent has a non-empty id, name and description', () => {
    for (const agent of listAgents()) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.description).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agents/registry.test.ts`
Expected: FAIL — cannot find `src/agents/registry.js`

- [ ] **Step 3: Write `src/agents/registry.ts`**

```ts
import type { AgentProfile, ToolId } from '../types.js';

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'claude-code-default',
    name: 'Coding Assistant',
    toolId: 'claude-code',
    description: 'Modo padrão de pair-programming interativo do Claude Code.',
    extraArgs: [],
  },
  {
    id: 'aider-default',
    name: 'Coding Assistant',
    toolId: 'aider',
    description: 'Modo padrão de edição de código do Aider.',
    extraArgs: [],
  },
  {
    id: 'aider-architect',
    name: 'Architect',
    toolId: 'aider',
    description:
      'Aider em modo de planejamento arquitetural antes de editar código.',
    extraArgs: ['--architect'],
  },
  {
    id: 'open-interpreter-default',
    name: 'Coding Assistant',
    toolId: 'open-interpreter',
    description: 'Modo padrão de execução de código do Open Interpreter.',
    extraArgs: [],
  },
];

export function listAgents(): AgentProfile[] {
  return AGENT_PROFILES;
}

export function listAgentsByTool(toolId: ToolId): AgentProfile[] {
  return AGENT_PROFILES.filter((a) => a.toolId === toolId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agents/registry.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/registry.ts tests/agents/registry.test.ts
git commit -m "feat: add built-in agent profile registry"
```

---

### Task 7: Model discovery

**Files:**

- Create: `src/discovery/models.ts`
- Test: `tests/discovery/models.test.ts`

**Interfaces:**

- Consumes: `Provider`, `Model` from `src/types.ts`.
- Produces: `fetchModels(provider: Provider): Promise<Model[]>`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Provider } from '../../src/types.js';

const provider: Provider = {
  id: '1',
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchModels', () => {
  it('fetches, sorts and maps the model list, sending a Bearer token', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'z-model' }, { id: 'a-model' }] }),
    });

    const { fetchModels } = await import('../../src/discovery/models.js');
    const models = await fetchModels(provider);

    expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: 'Bearer sk-x' },
    });
    expect(models).toEqual([{ id: 'a-model' }, { id: 'z-model' }]);
  });

  it('throws a readable error on non-ok response', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
    });
    const { fetchModels } = await import('../../src/discovery/models.js');
    await expect(fetchModels(provider)).rejects.toThrow(/HTTP 401/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discovery/models.test.ts`
Expected: FAIL — cannot find `src/discovery/models.js`

- [ ] **Step 3: Write `src/discovery/models.ts`**

```ts
import type { Model, Provider } from '../types.js';

export async function fetchModels(provider: Provider): Promise<Model[]> {
  const response = await fetch(`${provider.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${provider.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: Array<{ id: string }> };
  const data = body.data ?? [];
  return data
    .map((m) => ({ id: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/discovery/models.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/discovery/models.ts tests/discovery/models.test.ts
git commit -m "feat: add OpenAI-compatible model discovery"
```

---

### Task 8: Doctor checks

**Files:**

- Create: `src/doctor/checks.ts`
- Test: `tests/doctor/checks.test.ts`

**Interfaces:**

- Consumes: `listTools`, `getTool` from `src/tools/registry.ts`; `isBinaryInstalled` from `src/tools/launcher.ts`; `fetchModels` from `src/discovery/models.ts`; `Provider`, `DoctorCheckResult` from `src/types.ts`.
- Produces: `checkTools(): DoctorCheckResult[]`, `checkProvider(provider: Provider): Promise<DoctorCheckResult>`, `runDoctor(providers: Provider[]): Promise<DoctorCheckResult[]>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Provider } from '../../src/types.js';

vi.mock('../../src/tools/launcher.js', () => ({
  isBinaryInstalled: vi.fn(() => true),
}));

vi.mock('../../src/discovery/models.js', () => ({
  fetchModels: vi.fn(),
}));

const provider: Provider = {
  id: '1',
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('doctor checks', () => {
  it('checkTools returns one result per registered tool, all ok when isBinaryInstalled is true', async () => {
    const { checkTools } = await import('../../src/doctor/checks.js');
    const results = checkTools();
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('checkProvider returns ok with model count on success', async () => {
    const { fetchModels } = await import('../../src/discovery/models.js');
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
    ]);
    const { checkProvider } = await import('../../src/doctor/checks.js');
    const result = await checkProvider(provider);
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/2 modelo/);
  });

  it('checkProvider returns ok:false with the error message on failure', async () => {
    const { fetchModels } = await import('../../src/discovery/models.js');
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('HTTP 401'),
    );
    const { checkProvider } = await import('../../src/doctor/checks.js');
    const result = await checkProvider(provider);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe('HTTP 401');
  });

  it('runDoctor combines tool checks and provider checks', async () => {
    const { fetchModels } = await import('../../src/discovery/models.js');
    (fetchModels as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { runDoctor } = await import('../../src/doctor/checks.js');
    const results = await runDoctor([provider]);
    expect(results).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/doctor/checks.test.ts`
Expected: FAIL — cannot find `src/doctor/checks.js`

- [ ] **Step 3: Write `src/doctor/checks.ts`**

```ts
import type { DoctorCheckResult, Provider } from '../types.js';
import { listTools } from '../tools/registry.js';
import { isBinaryInstalled } from '../tools/launcher.js';
import { fetchModels } from '../discovery/models.js';

export function checkTools(): DoctorCheckResult[] {
  return listTools().map((tool) => {
    const ok = isBinaryInstalled(tool);
    return {
      label: `Ferramenta: ${tool.label}`,
      ok,
      detail: ok
        ? `binário "${tool.binary}" encontrado`
        : `binário "${tool.binary}" não encontrado no PATH`,
    };
  });
}

export async function checkProvider(
  provider: Provider,
): Promise<DoctorCheckResult> {
  try {
    const models = await fetchModels(provider);
    return {
      label: `Provedor: ${provider.name}`,
      ok: true,
      detail: `conectado, ${models.length} modelo(s) disponível(is)`,
    };
  } catch (error) {
    return {
      label: `Provedor: ${provider.name}`,
      ok: false,
      detail: error instanceof Error ? error.message : 'erro desconhecido',
    };
  }
}

export async function runDoctor(
  providers: Provider[],
): Promise<DoctorCheckResult[]> {
  const toolChecks = checkTools();
  const providerChecks = await Promise.all(providers.map(checkProvider));
  return [...toolChecks, ...providerChecks];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/doctor/checks.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/doctor/checks.ts tests/doctor/checks.test.ts
git commit -m "feat: add doctor diagnostics for tools and provider connectivity"
```

---

### Task 9: UI helpers (theme, prompts, table)

**Files:**

- Create: `src/ui/theme.ts`
- Create: `src/ui/prompts.ts`
- Create: `src/ui/table.ts`
- Test: `tests/ui/table.test.ts`

**Interfaces:**

- Produces: `theme.ok/fail/heading/dim: (text: string) => string`; `promptText(message: string, validate?: (v: string) => true | string): Promise<string>`, `promptSecret(message: string): Promise<string>`, `promptChoice<T extends string>(message: string, choices: Array<{ name: string; value: T }>): Promise<T>`, `promptConfirm(message: string): Promise<boolean>`; `renderTable(headers: string[], rows: string[][]): string`.
- Note: `prompts.ts` is a thin wrapper around `@inquirer/prompts` — it is intentionally not unit tested (it has no logic besides delegation); it exists so menu modules depend on one file instead of the library directly, keeping menu code swappable/mockable in later integration tests.

- [ ] **Step 1: Write the failing test (for `table.ts`, the only piece with real logic)**

```ts
import { describe, expect, it } from 'vitest';
import { renderTable } from '../../src/ui/table.js';

describe('renderTable', () => {
  it('pads columns to the widest cell and separates with two spaces', () => {
    const output = renderTable(
      ['Nome', 'URL'],
      [
        ['openrouter', 'https://openrouter.ai/api/v1'],
        ['local', 'http://localhost:11434/v1'],
      ],
    );
    const lines = output.split('\n');
    expect(lines[0]).toBe('Nome        URL');
    expect(lines[1]).toBe('openrouter  https://openrouter.ai/api/v1');
    expect(lines[2]).toBe('local       http://localhost:11434/v1');
  });

  it('returns a placeholder line when rows is empty', () => {
    expect(renderTable(['Nome'], [])).toBe('(nenhum registro encontrado)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/table.test.ts`
Expected: FAIL — cannot find `src/ui/table.js`

- [ ] **Step 3: Write `src/ui/table.ts`**

```ts
export function renderTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return '(nenhum registro encontrado)';
  }
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => row[col]?.length ?? 0)),
  );
  const renderRow = (cells: string[]) =>
    cells
      .map((cell, col) => cell.padEnd(widths[col]))
      .join('  ')
      .trimEnd();
  return [renderRow(headers), ...rows.map(renderRow)].join('\n');
}
```

- [ ] **Step 4: Write `src/ui/theme.ts`**

```ts
import chalk from 'chalk';

export const theme = {
  ok: (text: string) => chalk.green(text),
  fail: (text: string) => chalk.red(text),
  heading: (text: string) => chalk.bold.cyan(text),
  dim: (text: string) => chalk.dim(text),
};
```

- [ ] **Step 5: Write `src/ui/prompts.ts`**

```ts
import { confirm, input, password, select } from '@inquirer/prompts';

export async function promptText(
  message: string,
  validate?: (value: string) => true | string,
): Promise<string> {
  return input({ message, validate });
}

export async function promptSecret(message: string): Promise<string> {
  return password({ message, mask: '*' });
}

export async function promptChoice<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T }>,
): Promise<T> {
  return select({ message, choices });
}

export async function promptConfirm(message: string): Promise<boolean> {
  return confirm({ message });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/ui/table.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/ui/theme.ts src/ui/prompts.ts src/ui/table.ts tests/ui/table.test.ts
git commit -m "feat: add UI theme, prompt wrappers and table renderer"
```

---

### Task 10: Menu — Cadastrar Novo Provedor (PRD §3.2)

**Files:**

- Create: `src/menu/registerProvider.ts`

**Interfaces:**

- Consumes: `promptText`, `promptSecret` from `src/ui/prompts.ts`; `theme` from `src/ui/theme.ts`; `addProvider`, `providerNameExists` from `src/config/providers.ts`.
- Produces: `registerProviderFlow(): Promise<void>` — guides through name → baseUrl → apiKey in three separate, validated steps as required by PRD §3.2, then persists and prints confirmation.

- [ ] **Step 1: Write `src/menu/registerProvider.ts`**

```ts
import { addProvider, providerNameExists } from '../config/providers.js';
import { promptSecret, promptText } from '../ui/prompts.js';
import { theme } from '../ui/theme.js';

export async function registerProviderFlow(): Promise<void> {
  console.log(theme.heading('\nCadastrar Novo Provedor'));

  const name = await promptText(
    'Nome identificador único do provedor:',
    (value) => {
      if (!value.trim()) return 'O nome não pode ser vazio';
      if (providerNameExists(value.trim()))
        return `Já existe um provedor chamado "${value.trim()}"`;
      return true;
    },
  );

  const baseUrl = await promptText(
    'URL base do serviço (ex: https://openrouter.ai/api/v1):',
    (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return 'URL inválida';
      }
    },
  );

  const apiKey = await promptSecret('Chave de autenticação (API Key):');

  const provider = addProvider({
    name: name.trim(),
    baseUrl: baseUrl.trim(),
    apiKey,
  });
  console.log(
    theme.ok(`\nProvedor "${provider.name}" cadastrado com sucesso.`),
  );
}
```

Note: no unit test — this module is pure interactive orchestration over already-tested `addProvider`/`providerNameExists`; correctness is verified manually in Task 15's end-to-end smoke run.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/menu/registerProvider.ts
git commit -m "feat: add guided provider registration menu flow"
```

---

### Task 11: Menu — Ver Modelos (PRD §3.3)

**Files:**

- Create: `src/menu/listModels.ts`

**Interfaces:**

- Consumes: `listProviders` from `src/config/providers.ts`; `fetchModels` from `src/discovery/models.ts`; `promptChoice` from `src/ui/prompts.ts`; `renderTable` from `src/ui/table.ts`; `theme` from `src/ui/theme.ts`.
- Produces: `listModelsFlow(): Promise<void>`.

- [ ] **Step 1: Write `src/menu/listModels.ts`**

```ts
import { listProviders } from '../config/providers.js';
import { fetchModels } from '../discovery/models.js';
import { promptChoice } from '../ui/prompts.js';
import { renderTable } from '../ui/table.js';
import { theme } from '../ui/theme.js';

export async function listModelsFlow(): Promise<void> {
  console.log(theme.heading('\nVer Modelos'));

  const providers = listProviders();
  if (providers.length === 0) {
    console.log(
      theme.fail(
        'Nenhum provedor cadastrado. Use "Cadastrar Novo Provedor" primeiro.',
      ),
    );
    return;
  }

  const providerName = await promptChoice(
    'Selecione o provedor:',
    providers.map((p) => ({ name: p.name, value: p.name })),
  );
  const provider = providers.find((p) => p.name === providerName)!;

  try {
    const models = await fetchModels(provider);
    console.log(
      renderTable(
        ['Modelo'],
        models.map((m) => [m.id]),
      ),
    );
  } catch (error) {
    console.log(
      theme.fail(
        `Falha ao consultar modelos: ${error instanceof Error ? error.message : error}`,
      ),
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/menu/listModels.ts
git commit -m "feat: add model discovery menu flow"
```

---

### Task 12: Menu — Ver Agents (PRD §3.1 item 4)

**Files:**

- Create: `src/menu/listAgents.ts`

**Interfaces:**

- Consumes: `listAgents` from `src/agents/registry.ts`; `getTool` from `src/tools/registry.ts`; `renderTable` from `src/ui/table.ts`; `theme` from `src/ui/theme.ts`.
- Produces: `listAgentsFlow(): void`.

- [ ] **Step 1: Write `src/menu/listAgents.ts`**

```ts
import { listAgents } from '../agents/registry.js';
import { getTool } from '../tools/registry.js';
import { renderTable } from '../ui/table.js';
import { theme } from '../ui/theme.js';

export function listAgentsFlow(): void {
  console.log(theme.heading('\nVer Agents'));
  const rows = listAgents().map((agent) => [
    agent.name,
    getTool(agent.toolId).label,
    agent.description,
  ]);
  console.log(renderTable(['Agent', 'Ferramenta', 'Descrição'], rows));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/menu/listAgents.ts
git commit -m "feat: add agents listing menu flow"
```

---

### Task 13: Menu — Iniciar Ferramenta / Start (PRD §3.5)

**Files:**

- Create: `src/menu/startTool.ts`

**Interfaces:**

- Consumes: `listTools`, `getTool` from `src/tools/registry.ts`; `listProviders` from `src/config/providers.ts`; `fetchModels` from `src/discovery/models.ts`; `listAgentsByTool` from `src/agents/registry.ts`; `launchTool`, `isBinaryInstalled` from `src/tools/launcher.ts`; `promptChoice`, `promptText` from `src/ui/prompts.ts`; `theme` from `src/ui/theme.ts`.
- Produces: `startToolFlow(): Promise<void>` — implements the 4-step selection PRD §3.1 item 1 describes (ferramenta → provedor → modelo → agente) then calls `launchTool`.

- [ ] **Step 1: Write `src/menu/startTool.ts`**

```ts
import { listAgentsByTool } from '../agents/registry.js';
import { listProviders } from '../config/providers.js';
import { fetchModels } from '../discovery/models.js';
import { isBinaryInstalled, launchTool } from '../tools/launcher.js';
import { getTool, listTools } from '../tools/registry.js';
import { promptChoice, promptText } from '../ui/prompts.js';
import { theme } from '../ui/theme.js';

export async function startToolFlow(): Promise<void> {
  console.log(theme.heading('\nIniciar Ferramenta'));

  const providers = listProviders();
  if (providers.length === 0) {
    console.log(
      theme.fail(
        'Nenhum provedor cadastrado. Use "Cadastrar Novo Provedor" primeiro.',
      ),
    );
    return;
  }

  const toolId = await promptChoice(
    'Selecione a ferramenta de desenvolvimento:',
    listTools().map((t) => ({ name: t.label, value: t.id })),
  );
  const tool = getTool(toolId);

  if (!isBinaryInstalled(tool)) {
    console.log(
      theme.fail(
        `Binário "${tool.binary}" não encontrado no PATH. Instale-o antes de continuar.`,
      ),
    );
    return;
  }

  const providerName = await promptChoice(
    'Selecione o provedor:',
    providers.map((p) => ({ name: p.name, value: p.name })),
  );
  const provider = providers.find((p) => p.name === providerName)!;

  let model: string;
  try {
    const models = await fetchModels(provider);
    if (models.length === 0) throw new Error('nenhum modelo retornado');
    model = await promptChoice(
      'Selecione o modelo:',
      models.map((m) => ({ name: m.id, value: m.id })),
    );
  } catch (error) {
    console.log(
      theme.fail(
        `Não foi possível listar modelos automaticamente (${error instanceof Error ? error.message : error}).`,
      ),
    );
    model = await promptText('Digite o nome do modelo manualmente:');
  }

  const agents = listAgentsByTool(toolId);
  const agentId = await promptChoice(
    'Selecione o agente de atuação:',
    agents.map((a) => ({ name: `${a.name} — ${a.description}`, value: a.id })),
  );
  const agent = agents.find((a) => a.id === agentId)!;

  console.log(
    theme.ok(
      `\nIniciando ${tool.label} com provedor "${provider.name}" e modelo "${model}"...\n`,
    ),
  );
  const exitCode = await launchTool(tool, provider, model, agent.extraArgs);
  if (exitCode !== 0) {
    console.log(theme.fail(`${tool.label} encerrou com código ${exitCode}.`));
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/menu/startTool.ts
git commit -m "feat: add unified start flow (tool -> provider -> model -> agent -> launch)"
```

---

### Task 14: Menu — Diagnóstico / Doctor (PRD §3.4)

**Files:**

- Create: `src/menu/doctorMenu.ts`

**Interfaces:**

- Consumes: `runDoctor` from `src/doctor/checks.ts`; `listProviders` from `src/config/providers.ts`; `theme` from `src/ui/theme.ts`.
- Produces: `doctorFlow(): Promise<void>`.

- [ ] **Step 1: Write `src/menu/doctorMenu.ts`**

```ts
import { listProviders } from '../config/providers.js';
import { runDoctor } from '../doctor/checks.js';
import { theme } from '../ui/theme.js';

export async function doctorFlow(): Promise<void> {
  console.log(theme.heading('\nDiagnóstico'));
  const results = await runDoctor(listProviders());
  for (const result of results) {
    const status = result.ok ? theme.ok('OK') : theme.fail('FALHA');
    console.log(`[${status}] ${result.label} — ${result.detail}`);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/menu/doctorMenu.ts
git commit -m "feat: add doctor diagnostics menu flow"
```

---

### Task 15: Main menu loop, entrypoint & packaging

**Files:**

- Create: `src/menu/mainMenu.ts`
- Create: `src/index.ts`
- Create: `bin/ai-switch.mjs`
- Create: `README.md`

**Interfaces:**

- Consumes: `registerProviderFlow`, `listModelsFlow`, `listAgentsFlow`, `startToolFlow`, `doctorFlow` from their respective `src/menu/*.ts` files; `promptChoice` from `src/ui/prompts.ts`; `theme` from `src/ui/theme.ts`.
- Produces: `runMainMenu(): Promise<void>` (loops until "Sair"), `main(): Promise<void>` (process entrypoint, exported from `src/index.ts`).

- [ ] **Step 1: Write `src/menu/mainMenu.ts`**

```ts
import { doctorFlow } from './doctorMenu.js';
import { listAgentsFlow } from './listAgents.js';
import { listModelsFlow } from './listModels.js';
import { registerProviderFlow } from './registerProvider.js';
import { startToolFlow } from './startTool.js';
import { promptChoice } from '../ui/prompts.js';
import { theme } from '../ui/theme.js';

type MenuOption =
  | 'start'
  | 'register'
  | 'models'
  | 'agents'
  | 'doctor'
  | 'exit';

export async function runMainMenu(): Promise<void> {
  console.log(theme.heading('AI Switch CLI'));
  console.log(
    theme.dim('Centralize e alterne entre provedores e ferramentas de IA.\n'),
  );

  let running = true;
  while (running) {
    const choice = await promptChoice<MenuOption>('Selecione uma opção:', [
      { name: '1. Iniciar Ferramenta', value: 'start' },
      { name: '2. Cadastrar Novo Provedor', value: 'register' },
      { name: '3. Ver Modelos', value: 'models' },
      { name: '4. Ver Agents', value: 'agents' },
      { name: '5. Diagnóstico', value: 'doctor' },
      { name: '6. Sair', value: 'exit' },
    ]);

    switch (choice) {
      case 'start':
        await startToolFlow();
        break;
      case 'register':
        await registerProviderFlow();
        break;
      case 'models':
        await listModelsFlow();
        break;
      case 'agents':
        listAgentsFlow();
        break;
      case 'doctor':
        await doctorFlow();
        break;
      case 'exit':
        running = false;
        console.log(theme.dim('\nAté logo!'));
        break;
    }
  }
}
```

- [ ] **Step 2: Write `src/index.ts`**

```ts
import { runMainMenu } from './menu/mainMenu.js';

export async function main(): Promise<void> {
  try {
    await runMainMenu();
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      console.log('\nAté logo!');
      return;
    }
    console.error(
      'Erro inesperado:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  }
}

main();
```

- [ ] **Step 3: Write `bin/ai-switch.mjs`**

```js
#!/usr/bin/env node
import '../dist/index.js';
```

Run: `chmod +x bin/ai-switch.mjs`

- [ ] **Step 4: Write `README.md`**

```markdown
# AI Switch CLI

CLI universal para centralizar, gerenciar e alternar entre provedores de IA e ferramentas de desenvolvimento (Claude Code, Aider, Open Interpreter).

## Instalação

\`\`\`bash
npm install
npm run build
npm link
\`\`\`

## Uso

\`\`\`bash
ai-switch
\`\`\`

Navegue pelo menu numérico para cadastrar provedores, consultar modelos, listar agentes, iniciar uma ferramenta ou rodar o Diagnóstico.

## Desenvolvimento

\`\`\`bash
npm run dev # roda via tsx sem build
npm test # roda a suíte vitest
npm run typecheck # checagem de tipos
\`\`\`

Configuração persistida em `~/.config/ai-switch/config.json` (permissão 0600). Sobrescreva o diretório com a env var `AI_SWITCH_CONFIG_DIR` (usado pelos testes).
```

- [ ] **Step 5: Run full verification**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass, no type errors, `dist/index.js` produced

- [ ] **Step 6: Manual end-to-end smoke test**

Run: `npm link && ai-switch`
Expected: menu displays with 6 numbered options; "Cadastrar Novo Provedor" successfully writes to `~/.config/ai-switch/config.json` with mode 600; "Diagnóstico" runs without crashing even with zero providers cadastrados.

- [ ] **Step 7: Commit**

```bash
git add src/menu/mainMenu.ts src/index.ts bin/ai-switch.mjs README.md
git commit -m "feat: wire main menu loop and package CLI entrypoint"
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 (menu + 6 options) → Task 15; §3.2 (guided 3-step provider registration) → Task 10; §3.3 (model discovery) → Task 11 (+ Task 7 for the fetch logic); §3.4 (doctor: tool install checks + provider connectivity) → Task 14 (+ Task 8); §3.5 (start applies credentials/routes automatically) → Task 13 (+ Tasks 4–5); §4 non-functional (leveza/portabilidade: single Node process, no heavy deps; segurança: 0600 perms in Task 2; UX conversacional: numbered menu, validated guided steps) → covered throughout, called out in Global Constraints.
- **Placeholder scan:** no TBD/TODO left; every step has full code.
- **Type consistency:** `ToolId` used consistently across `types.ts`, `tools/registry.ts`, `agents/registry.ts`, `discovery/models.ts` signatures. `Provider`/`Model`/`AgentProfile`/`DoctorCheckResult` field names match across producing and consuming tasks (verified `provider.baseUrl`, `provider.apiKey`, `agent.extraArgs`, `agent.toolId` usage in Tasks 10–14 against Task 1's `types.ts`).
