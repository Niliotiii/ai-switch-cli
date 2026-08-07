import { describe, expect, it } from "vitest";
import { listAgents, listAgentsByTool } from "../../src/agents/registry.js";

describe("agent registry", () => {
  it("listAgents returns at least one profile per known tool", () => {
    const agents = listAgents();
    const tools = new Set(agents.map((a) => a.toolId));
    expect(tools).toEqual(new Set(["claude-code", "aider", "open-interpreter"]));
  });

  it("listAgentsByTool filters correctly", () => {
    const aiderAgents = listAgentsByTool("aider");
    expect(aiderAgents.length).toBeGreaterThan(0);
    expect(aiderAgents.every((a) => a.toolId === "aider")).toBe(true);
  });

  it("every agent has a non-empty id, name and description", () => {
    for (const agent of listAgents()) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.description).toBeTruthy();
    }
  });
});
