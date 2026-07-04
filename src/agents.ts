import { getAgent } from "./cursor";
import { getSession, updateSession } from "./session";
import type { CursorAgent, CursorRun, Env, StoredAgentEntry, UserSession } from "./types";

export function normalizeSession(session: UserSession | null): UserSession | null {
  if (!session) return null;

  const activeAgentId = session.activeAgentId ?? session.agentId;
  const agents = session.agents ?? [];

  if (activeAgentId && agents.length === 0) {
    agents.push({
      agentId: activeAgentId,
      name: "Agent",
      url: "",
      latestRunId: session.latestRunId,
      createdAt: session.updatedAt,
    });
  }

  return {
    ...session,
    activeAgentId,
    agentId: activeAgentId,
    agents,
  };
}

export async function getNormalizedSession(
  env: Env,
  userId: number,
): Promise<UserSession | null> {
  return normalizeSession(await getSession(env, userId));
}

export function getActiveAgentId(session: UserSession | null): string | null {
  const normalized = normalizeSession(session);
  return normalized?.activeAgentId ?? null;
}

export function getActiveAgentEntry(
  session: UserSession | null,
): StoredAgentEntry | null {
  const normalized = normalizeSession(session);
  if (!normalized?.activeAgentId || !normalized.agents?.length) return null;

  return (
    normalized.agents.find((a) => a.agentId === normalized.activeAgentId) ??
    null
  );
}

export async function registerAgent(
  env: Env,
  userId: number,
  agent: CursorAgent,
  run: CursorRun,
  repoUrl?: string,
): Promise<UserSession> {
  const session = normalizeSession(await getSession(env, userId));
  const agents = [...(session?.agents ?? [])];

  const existingIndex = agents.findIndex((a) => a.agentId === agent.id);
  const entry: StoredAgentEntry = {
    agentId: agent.id,
    name: agent.name,
    url: agent.url,
    latestRunId: run.id,
    createdAt:
      existingIndex >= 0
        ? agents[existingIndex].createdAt
        : new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    agents[existingIndex] = entry;
  } else {
    agents.push(entry);
  }

  return updateSession(env, userId, {
    agents,
    activeAgentId: agent.id,
    agentId: agent.id,
    latestRunId: run.id,
    ...(repoUrl ? { repoUrl } : {}),
  });
}

export async function updateAgentRun(
  env: Env,
  userId: number,
  agentId: string,
  runId: string,
): Promise<UserSession> {
  const session = normalizeSession(await getSession(env, userId));
  const agents = [...(session?.agents ?? [])];
  const index = agents.findIndex((a) => a.agentId === agentId);

  if (index >= 0) {
    agents[index] = { ...agents[index], latestRunId: runId };
  }

  return updateSession(env, userId, {
    agents,
    activeAgentId: agentId,
    agentId,
    latestRunId: runId,
  });
}

export async function selectAgent(
  env: Env,
  userId: number,
  selector: string,
): Promise<{ ok: true; entry: StoredAgentEntry } | { ok: false; error: string }> {
  const session = await getNormalizedSession(env, userId);
  const agents = session?.agents ?? [];

  if (agents.length === 0) {
    return { ok: false, error: "Saqlangan agent yo'q. /new bilan yangi agent oching." };
  }

  let entry: StoredAgentEntry | undefined;

  if (/^\d+$/.test(selector)) {
    const index = Number.parseInt(selector, 10) - 1;
    if (index < 0 || index >= agents.length) {
      return {
        ok: false,
        error: `Noto'g'ri raqam. /agents ro'yxatidan 1-${agents.length} tanlang.`,
      };
    }
    entry = agents[index];
  } else {
    entry = agents.find(
      (a) =>
        a.agentId === selector ||
        a.agentId.includes(selector) ||
        a.name.toLowerCase().includes(selector.toLowerCase()),
    );
    if (!entry) {
      return { ok: false, error: `Agent topilmadi: ${selector}` };
    }
  }

  try {
    const agent = await getAgent(env, entry.agentId);
    entry = {
      ...entry,
      name: agent.name,
      url: agent.url,
      latestRunId: agent.latestRunId ?? entry.latestRunId,
    };
  } catch {
    // Saqlangan ma'lumot bilan davom etamiz
  }

  const updatedAgents = agents.map((a) =>
    a.agentId === entry!.agentId ? entry! : a,
  );

  await updateSession(env, userId, {
    agents: updatedAgents,
    activeAgentId: entry.agentId,
    agentId: entry.agentId,
    latestRunId: entry.latestRunId,
  });

  return { ok: true, entry };
}

export async function removeAgentFromList(
  env: Env,
  userId: number,
  selector: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const session = await getNormalizedSession(env, userId);
  const agents = [...(session?.agents ?? [])];

  if (agents.length === 0) {
    return { ok: false, error: "O'chirish uchun agent yo'q." };
  }

  let index = -1;
  if (/^\d+$/.test(selector)) {
    index = Number.parseInt(selector, 10) - 1;
  } else {
    index = agents.findIndex(
      (a) => a.agentId === selector || a.agentId.includes(selector),
    );
  }

  if (index < 0 || index >= agents.length) {
    return { ok: false, error: `Agent topilmadi: ${selector}` };
  }

  const [removed] = agents.splice(index, 1);
  const nextActive = agents.at(-1);

  await updateSession(env, userId, {
    agents,
    activeAgentId: nextActive?.agentId,
    agentId: nextActive?.agentId,
    latestRunId: nextActive?.latestRunId,
  });

  return { ok: true, name: removed.name };
}

export function formatAgentsList(session: UserSession | null): string {
  const normalized = normalizeSession(session);
  const agents = normalized?.agents ?? [];
  const activeId = normalized?.activeAgentId;

  if (agents.length === 0) {
    return "Saqlangan agent yo'q.\n\nYangi agent: /new";
  }

  const lines = agents.map((agent, index) => {
    const activeMark = agent.agentId === activeId ? " ★" : "";
    const runInfo = agent.latestRunId ? `\n   run: ${agent.latestRunId}` : "";
    return `${index + 1}. ${agent.name}${activeMark}\n   ${agent.agentId}${runInfo}`;
  });

  return [
    "Sizning agentlaringiz:",
    "",
    ...lines,
    "",
    "Tanlash: /use 2",
    "O'chirish: /agents remove 2",
  ].join("\n");
}
