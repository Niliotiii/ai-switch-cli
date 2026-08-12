import path from "node:path";
import { getProjectDir } from "../config/paths.js";
import { createContextPack, deleteContextPack, getContextPackForProject, updateContextPack } from "../context/store.js";
import { containsReservedMarkerText, renderContextMarkdown } from "../context/render.js";
import { promptChoiceWithBack, promptConfirm, promptText } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { theme } from "../ui/theme.js";
import type { ContextPack } from "../types.js";

type SubmenuOption = "view" | "edit-architecture" | "edit-patterns" | "edit-goal" | "add-decision" | "history" | "toggle-injection" | "delete";

/** Oferece criar um pack quando o projeto ainda não tem um. Retorna o pack (novo ou existente) ou
 *  `null` se o usuário recusou — nesse caso não há submenu para mostrar. */
async function ensurePack(): Promise<ContextPack | null> {
  const existing = getContextPackForProject();
  if (existing) return existing;

  const projectDir = getProjectDir();
  console.log(theme.dim(`Nenhum contexto cadastrado para "${projectDir}".`));
  const wants = await promptConfirm("Criar um contexto de projeto agora?", true);
  if (!wants) return null;

  const defaultName = path.basename(projectDir);
  const name = await promptText(`Nome do contexto [${defaultName}]:`, undefined, defaultName);
  const created = createContextPack({ name: name.trim() || defaultName });
  console.log(theme.ok(`\nContexto "${created.name}" criado.`));
  return created;
}

function viewFlow(pack: ContextPack): void {
  console.log(theme.dim(`\nProjeto: ${pack.projectPath}`));
  console.log(theme.dim(`Injeção: ${pack.injectionEnabled ? "ativada" : "desativada"}`));
  console.log(renderContextMarkdown(pack));
}

/** A sintaxe reservada dos marcadores nunca sobrevive à renderização (render.ts remove qualquer
 *  ocorrência literal, para nenhum texto do usuário poder criar um 3º marcador ambíguo) — mas a
 *  remoção em si é silenciosa. Avisar aqui, no ponto de entrada, é o que torna essa mudança visível
 *  para quem digitou o texto, em vez de ele só notar que "algo desapareceu" ao ver o CLAUDE.md. */
function warnIfMarkerTextWillBeStripped(value: string): void {
  if (containsReservedMarkerText(value)) {
    console.log(
      theme.fail("Aviso: este texto contém a sintaxe reservada do ai-switch e será removido ao injetar o contexto."),
    );
  }
}

async function editSectionFlow(pack: ContextPack, section: "architecture" | "patterns" | "goal", label: string): Promise<void> {
  const current = pack.sections[section];
  const next = await promptText(`${label} [Enter para manter]:`, undefined, current || undefined);
  const value = next.trim() === "" ? current : next.trim();
  warnIfMarkerTextWillBeStripped(value);
  updateContextPack(pack.id, { sections: { [section]: value } });
  console.log(theme.ok(`\n${label} atualizado.`));
}

async function addDecisionFlow(pack: ContextPack): Promise<void> {
  const decision = await promptText("Nova decisão (Enter para cancelar):");
  if (decision.trim() === "") return;
  warnIfMarkerTextWillBeStripped(decision);
  updateContextPack(pack.id, { sections: { decisions: [...pack.sections.decisions, decision.trim()] } });
  console.log(theme.ok("\nDecisão adicionada."));
}

function historyFlow(pack: ContextPack): void {
  if (pack.handoffs.length === 0) {
    console.log(theme.dim("\nNenhum histórico registrado ainda."));
    return;
  }
  const rows = pack.handoffs.map((h) => [h.at.slice(0, 10), h.agentId, h.providerName, h.model, h.summary]);
  console.log(renderTable(["Data", "Agente", "Provedor", "Modelo", "Resumo"], rows));
}

async function toggleInjectionFlow(pack: ContextPack): Promise<void> {
  if (pack.injectionEnabled) {
    const confirmed = await promptConfirm(`Desativar a injeção de contexto para "${pack.name}"?`, false);
    if (!confirmed) return;
    updateContextPack(pack.id, { injectionEnabled: false });
    console.log(theme.ok("\nInjeção desativada."));
    return;
  }
  console.log(theme.dim("\nAtivar a injeção grava um bloco gerado nos arquivos de instruções que cada agente lê ao iniciar."));
  // O agente trata todo o conteúdo desses arquivos como instrução confiável ao bootar. Se este
  // projeto for um repositório compartilhado (ou baixado de terceiros), qualquer texto já commitado
  // dentro dos marcadores do ai-switch — ou colocado ali por outra pessoa com acesso de escrita —
  // é lido pelo agente como se fosse legítimo. stripMarkers só remove a sintaxe reservada dos
  // marcadores, não filtra o conteúdo em si; o único controle real é revisar antes de ativar.
  console.log(
    theme.fail(
      "Atenção: o agente trata o conteúdo injetado como instrução confiável. Se este repositório for " +
        "compartilhado ou vier de terceiros, revise o conteúdo do contexto (e o arquivo de destino) " +
        "antes de ativar — qualquer pessoa com acesso de escrita ao repo pode ter deixado texto ali.",
    ),
  );
  const confirmed = await promptConfirm(`Ativar a injeção de contexto para "${pack.name}"?`, false);
  if (!confirmed) return;
  updateContextPack(pack.id, { injectionEnabled: true });
  console.log(theme.ok("\nInjeção ativada. Os arquivos exatos dependem do agente escolhido em \"Iniciar Agent\"."));
}

/** Returns true only when the pack was actually deleted — a mistyped confirmation must NOT be
 *  treated the same as a successful delete by the caller (which decides whether to exit the
 *  submenu). */
async function deleteFlow(pack: ContextPack): Promise<boolean> {
  const confirmPhrase = `remover ${pack.name}`;
  const typed = await promptText(`Esta ação é permanente. Digite exatamente "${confirmPhrase}" para confirmar:`);
  if (typed !== confirmPhrase) {
    console.log(theme.fail("Confirmação não confere. Contexto não foi removido."));
    return false;
  }
  const removed = deleteContextPack(pack.id);
  console.log(theme.ok(`\nContexto "${removed.name}" removido com sucesso.`));
  return true;
}

export async function contextMenuFlow(): Promise<void> {
  console.log(theme.heading("\nContexto do Projeto"));

  let pack = await ensurePack();
  if (!pack) return;

  let inSubmenu = true;
  while (inSubmenu) {
    const choice = await promptChoiceWithBack<SubmenuOption>("Selecione uma opção:", [
      { name: "1. Ver contexto", value: "view" },
      { name: "2. Editar arquitetura", value: "edit-architecture" },
      { name: "3. Editar padrões da equipe", value: "edit-patterns" },
      { name: "4. Editar problema atual", value: "edit-goal" },
      { name: "5. Adicionar decisão", value: "add-decision" },
      { name: "6. Ver histórico entre modelos", value: "history" },
      { name: `7. ${pack.injectionEnabled ? "Desativar" : "Ativar"} injeção`, value: "toggle-injection" },
      { name: "8. Remover contexto", value: "delete" },
    ]);

    if (choice === null) {
      inSubmenu = false; // Voltar → menu principal
      continue;
    }

    switch (choice) {
      case "view":
        viewFlow(pack);
        break;
      case "edit-architecture":
        await editSectionFlow(pack, "architecture", "Arquitetura");
        break;
      case "edit-patterns":
        await editSectionFlow(pack, "patterns", "Padrões da equipe");
        break;
      case "edit-goal":
        await editSectionFlow(pack, "goal", "Problema atual");
        break;
      case "add-decision":
        await addDecisionFlow(pack);
        break;
      case "history":
        historyFlow(pack);
        break;
      case "toggle-injection":
        await toggleInjectionFlow(pack);
        break;
      case "delete": {
        const deleted = await deleteFlow(pack);
        // Só sai do submenu quando o pack foi de fato removido — uma confirmação digitada errada
        // (typo, ou o usuário desistindo) deve devolver ao mesmo submenu, não ao menu principal.
        if (deleted) {
          inSubmenu = false;
          continue;
        }
        break;
      }
    }
    // Cada ação (exceto view/history) pode ter persistido mudanças — relê para as próximas iterações
    // do loop refletirem o estado atual (ex.: o rótulo "Ativar/Desativar injeção").
    pack = getContextPackForProject() ?? pack;
  }
}
