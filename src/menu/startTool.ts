import path from "node:path";
import { listProviders } from "../config/providers.js";
import { getAgentDefinition } from "../agents/catalog.js";
import { detectAgents } from "../agents/detect.js";
import { launchAgent, type LaunchOptions } from "../agents/launch.js";
import { getModels } from "../discovery/models.js";
import { getLastSelection, setLastSelection } from "../config/store.js";
import { getProjectDir } from "../config/paths.js";
import { appendHandoff, createContextPack, getContextPackForProject } from "../context/store.js";
import { injectContext } from "../context/inject.js";
import { containsReservedMarkerText } from "../context/render.js";
import { promptChoiceWithBack, promptConfirm, promptText } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";
import type { AgentDefinition, AgentId, ContextPack, Provider } from "../types.js";

// Sentinel value for the "★ last used" shortcut choice, same NUL-delimited pattern as `BACK` in
// ui/prompts.ts — a real agentId is never NUL-delimited, so this can't collide with one.
const LAST_USED = "\0ai-switch:last-used\0";

/** Per-session memory of the user's last skip-permissions choice for each agent. Lets the
 *  last-selection shortcut pre-select the same answer so a repeat run is one Enter.
 *  Deliberately NOT persisted to disk — skipping approvals is a conscious decision that
 *  shouldn't silently become the default across CLI invocations. */
const lastSkipByAgent: Map<AgentId, boolean> = new Map();

/** Test-only escape hatch: the Map lives at module scope (so the ★ shortcut shares state with the
 *  normal flow), but vitest re-uses the same module across `it()` blocks within a file, which would
 *  leak state. Tests should call this in beforeEach to start each case from a clean slate. */
export function __resetSkipForTests(): void {
  lastSkipByAgent.clear();
}

/** Returns true when the user wants to launch in skip-permissions mode. When the agent has no
 *  skipPermissionsArgs, this is a no-op (returns false) — the menu only shows the prompt for
 *  agents with a known public flag. Takes the full definition so the function doesn't need to
 *  re-look-up the agent by id and so it can be tested without mocking the catalog. */
async function askSkipPermissions(agent: AgentDefinition): Promise<boolean> {
  if (!agent.skipPermissionsArgs) return false;
  const previous = lastSkipByAgent.get(agent.id) ?? false;
  const answer = await promptConfirm(`Iniciar ${agent.label} sem pedir aprovação? (pula prompts de permissão)`, previous);
  lastSkipByAgent.set(agent.id, answer);
  return answer;
}

/** Per-menu-session flag: don't re-offer creating a context pack after the user already said no
 *  once. Same pattern as `lastSkipByAgent` — module-scoped, reset for tests. */
let offeredContextThisSession = false;

/** Test-only escape hatch, mirroring __resetSkipForTests. */
export function __resetContextPromptForTests(): void {
  offeredContextThisSession = false;
}

/** Resolves the context pack for the current project, offering to create one the first time this
 *  menu session sees a project without one. Returns `null` when there is no pack (declined, or
 *  already declined earlier this session) — callers then just skip context entirely, same as before
 *  the feature existed. */
async function resolveContextPack(): Promise<ContextPack | null> {
  const existing = getContextPackForProject();
  if (existing) return existing;
  if (offeredContextThisSession) return null;
  offeredContextThisSession = true;

  const projectDir = getProjectDir();
  const wants = await promptConfirm(
    `Nenhum contexto cadastrado para "${projectDir}". Criar um agora? (evita repetir arquitetura e decisões a cada troca de modelo)`,
    false,
  );
  if (!wants) return null;

  const defaultName = path.basename(projectDir);
  const name = await promptText(`Nome do contexto [${defaultName}]:`, undefined, defaultName);
  const created = createContextPack({ name: name.trim() || defaultName });
  console.log(theme.dim(`Contexto "${created.name}" criado. Ative a injeção em "Contexto do Projeto" quando quiser.`));
  return created;
}

export async function startToolFlow(): Promise<void> {
  console.log(theme.heading("\nIniciar Agent"));

  const installed = detectAgents().filter((s) => s.installed);
  if (installed.length === 0) {
    console.log(theme.fail("Nenhum agente detectado. Instale claude, codex, opencode ou copilot."));
    return;
  }
  const installedIds = new Set(installed.map((s) => s.definition.id));
  const installedMap = new Map(installed.map((s) => [s.definition.id, s.definition]));

  const providers = listProviders();
  const providersById = new Map(providers.map((p) => [p.id, p]));

  // Build the agent choices, optionally prepending a "use last selection" shortcut when the
  // stored combination is still valid (agent installed, provider still exists, model compatible).
  const last = getLastSelection();
  const lastIsValid = isLastSelectionValid(last, installedIds, providersById);
  const agentChoices: Array<{ name: string; value: string }> = [];
  if (lastIsValid) {
    const lastAgent = installedMap.get(last!.agentId)!;
    const lastProvider = providersById.get(last!.providerId)!;
    const modelLabel = lastAgent.requiresModel === false ? "(do config)" : last!.model;
    agentChoices.push({ name: `★ ${lastAgent.label} + ${lastProvider.name} · ${modelLabel}`, value: LAST_USED });
  }
  for (const s of installed) {
    agentChoices.push({ name: s.definition.label, value: s.definition.id });
  }

  const choice = await promptChoiceWithBack(
    "Selecione o agente:",
    agentChoices,
  );
  if (choice === null) return; // Voltar → menu principal

  let pickedAgentId: AgentId;
  let pickedProvider: Provider | null;
  let pickedModel: string;
  let skip = false;
  if (choice === LAST_USED) {
    pickedAgentId = last!.agentId;
    pickedProvider = providersById.get(last!.providerId)!;
    pickedModel = last!.model;
  } else {
    const result = await pickAgentProviderModel(choice as AgentId, installedMap, providers, providersById);
    if (result === null) return; // Voltar
    ({ agentId: pickedAgentId, provider: pickedProvider, model: pickedModel, skip } = result);
  }

  // Pre-flight: confirm the provider has the URL for this agent's protocol (skipped for the
  // last-selection shortcut because isLastSelectionValid already enforced it).
  if (pickedProvider) {
    const required = agentRequiredUrl(getAgentDefinition(pickedAgentId), pickedProvider);
    if (!required.url) {
      console.log(theme.fail(`Provedor "${pickedProvider.name}" não tem URL ${required.protocol} configurada. Edite o provedor para adicioná-la.`));
      return;
    }
  }

  // The ★ shortcut skips the normal flow's skip prompt (asked inside pickAgentProviderModel),
  // so ask it here — pre-selected with the user's last answer for this agent. (Ctrl+C during
  // this prompt throws ExitPromptError, caught by main() — same as every other prompt.)
  if (choice === LAST_USED) {
    skip = await askSkipPermissions(installedMap.get(pickedAgentId)!);
  }

  const agent = installedMap.get(pickedAgentId)!;

  // Resolves (or offers to create) this project's context pack. Only acts on it when injection is
  // actually enabled — a pack that exists but is disabled changes nothing about this run, same as
  // if no pack existed at all.
  const contextPack = await resolveContextPack();
  const launchOptions: LaunchOptions = { skipPermissions: skip };
  if (contextPack?.injectionEnabled) {
    // Injects here — NOT via launchAgent's own `options.context` — specifically so the try/catch
    // below wraps injection alone. Wrapping the whole launchAgent call would also swallow a real
    // spawn failure (ENOENT, EACCES) under a misleading "falha ao injetar contexto" message and
    // trigger a pointless unconditional retry for an error that has nothing to do with context.
    try {
      injectContext(contextPack, agent);
      const targets = [...new Set(agent.contextFiles)].join(", ");
      console.log(theme.dim(`Contexto injetado em: ${targets}`));
    } catch (error) {
      // injectContext throws before any spawn (Task 5), so proceeding without it is safe — no
      // agent process was started yet. Losing the launch over an optimization is worse than the
      // symptom, so ask instead of aborting outright.
      console.log(theme.fail(`Falha ao injetar contexto: ${error instanceof Error ? error.message : error}`));
      const proceed = await promptConfirm("Continuar sem contexto?", true);
      if (!proceed) return;
    }
  } else if (contextPack) {
    console.log(theme.dim(`Contexto "${contextPack.name}" existe, mas a injeção está desativada. Ative em "Contexto do Projeto".`));
  }

  console.log(theme.ok(`\nIniciando ${agent.label}...\n`));
  const exitCode = await launchAgent(agent, pickedProvider, pickedModel, launchOptions);

  if (exitCode === 0 && pickedProvider) {
    setLastSelection({ agentId: pickedAgentId, providerId: pickedProvider.id, model: pickedModel });
  }
  // The handoff is what lets the NEXT model (possibly another provider) continue from here instead
  // of the user repeating everything — only worth asking when there's an active pack to record it.
  if (exitCode === 0 && contextPack?.injectionEnabled) {
    const summary = await promptText("Resumo do que avançou nesta sessão (Enter para pular):");
    if (summary.trim() !== "") {
      // renderContextMarkdown remove qualquer ocorrência literal dos marcadores desse resumo antes
      // de injetar (para nenhum texto poder criar um 3º marcador ambíguo) — avisa aqui para essa
      // remoção não ser silenciosa para quem escreveu o resumo.
      if (containsReservedMarkerText(summary)) {
        console.log(theme.fail("Aviso: este resumo contém a sintaxe reservada do ai-switch e será removido ao injetar o contexto."));
      }
      appendHandoff(contextPack.id, {
        agentId: pickedAgentId,
        providerName: pickedProvider?.name ?? "—",
        model: pickedModel,
        summary: summary.trim(),
      });
    }
  }
  if (exitCode !== 0) {
    console.log(theme.fail(`${agent.label} encerrou com código ${exitCode}.`));
  }
}

function isLastSelectionValid(
  last: ReturnType<typeof getLastSelection>,
  installedIds: Set<AgentId>,
  providersById: Map<string, Provider>,
): last is NonNullable<ReturnType<typeof getLastSelection>> {
  if (!last) return false;
  if (!installedIds.has(last.agentId)) return false;
  const provider = providersById.get(last.providerId);
  if (!provider) return false;
  // The shortcut skips URL/protocol checks because the agent + provider must still be compatible.
  // We re-check here so the shortcut isn't offered when the provider has since lost the URL.
  const agentDef = getAgentDefinition(last.agentId);
  if (agentDef.authStrategy === "env-inject" && agentDef.envProtocol) {
    if (!agentRequiredUrl(agentDef, provider).url) return false;
  }
  return true;
}

/** Returns the protocol an env-inject agent needs and whether the provider currently has a URL
 *  for it. The single source of truth for "is this provider usable by this agent" — used by the
 *  ★ last-selection validator, the pre-flight check, and the provider pick flow. */
function agentRequiredUrl(agent: AgentDefinition, provider: Provider): { protocol: "Anthropic" | "OpenAI"; url: string | null } {
  if (agent.envProtocol === "anthropic") {
    return { protocol: "Anthropic", url: provider.anthropicBaseUrl };
  }
  return { protocol: "OpenAI", url: provider.openaiBaseUrl };
}

async function pickAgentProviderModel(
  agentId: AgentId,
  installedMap: Map<AgentId, ReturnType<typeof getAgentDefinition>>,
  providers: Provider[],
  providersById: Map<string, Provider>,
): Promise<{ agentId: AgentId; provider: Provider | null; model: string; skip: boolean } | null> {
  const agent = installedMap.get(agentId)!;

  // Ask about skip-permissions early (only for agents that support it) so the rest of the flow
  // reads naturally; the answer is carried through to launchAgent.
  const skip = await askSkipPermissions(agent);

  let provider: Provider | null = null;
  let model = "";
  if (agent.authStrategy === "env-inject") {
    if (providers.length === 0) {
      console.log(theme.fail('Nenhum provedor cadastrado. Use "Gerenciar Provedores" primeiro.'));
      return null;
    }
    const providerId = await promptChoiceWithBack(
      "Selecione o provedor:",
      providers.map((p) => ({ name: p.name, value: p.id }))
    );
    if (providerId === null) return null; // Voltar
    const selected = providersById.get(providerId)!;
    const required = agentRequiredUrl(agent, selected);
    if (!required.url) {
      console.log(theme.fail(`Provedor "${selected.name}" não tem URL ${required.protocol} configurada. Edite o provedor para adicioná-la.`));
      return null;
    }
    provider = selected;
    if (agent.requiresModel !== false) {
      const selectedModel = await selectModel(selected);
      if (selectedModel === null) return null; // Voltar
      model = selectedModel;
    }
  }
  return { agentId, provider, model, skip };
}

async function selectModel(provider: Provider): Promise<string | null> {
  try {
    const models = await getModels(provider);
    if (models.length === 0) throw new Error("nenhum modelo retornado");
    return await promptChoiceWithBack(
      "Selecione o modelo:",
      models.map((m) => ({ name: m.id, value: m.id }))
    );
  } catch (error) {
    console.log(theme.fail(`Não foi possível listar modelos automaticamente (${error instanceof Error ? error.message : error}).`));
    const manual = await promptText("Digite o nome do modelo manualmente:");
    return manual === "" ? null : manual;
  }
}
