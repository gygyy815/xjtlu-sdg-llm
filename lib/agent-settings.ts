export const AGENT_SETTINGS_STORAGE_KEY = "xjtlu-agent-settings-v1";

export type AgentSettings = {
  name: string;
  systemPrompt: string;
  nativeAnythingLLMAgent: boolean;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  name: "XJTLU Campus Assistant",
  systemPrompt: [
    "You are the XJTLU Campus Information & SDG Assistant.",
    "Use the selected AnythingLLM knowledge base as the factual source for campus-information answers.",
    "Do not invent missing dates, numbers, names, locations, registration methods, URLs or SDG evidence.",
    "When the retrieved documents do not explicitly support a field, say that the document does not clearly state it.",
    "Preserve source dates, names, numbers and URLs accurately, and keep the answer concise and easy to verify.",
  ].join("\n"),
  nativeAnythingLLMAgent: true,
};

export function normalizeAgentSettings(value: unknown): AgentSettings {
  if (!value || typeof value !== "object") return DEFAULT_AGENT_SETTINGS;
  const row = value as Partial<AgentSettings>;
  const name = typeof row.name === "string" && row.name.trim()
    ? row.name.trim().slice(0, 80)
    : DEFAULT_AGENT_SETTINGS.name;
  const systemPrompt = typeof row.systemPrompt === "string" && row.systemPrompt.trim()
    ? row.systemPrompt.trim().slice(0, 6000)
    : DEFAULT_AGENT_SETTINGS.systemPrompt;

  return {
    name,
    systemPrompt,
    nativeAnythingLLMAgent: row.nativeAnythingLLMAgent !== false,
  };
}

export function agentInstruction(settings: AgentSettings) {
  return `\n[Agent configuration]\nAgent name: ${settings.name}\nSystem instructions:\n${settings.systemPrompt}\n[End agent configuration]\n`;
}
