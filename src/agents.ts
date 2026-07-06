import { getBootstrapAdminIds, isBootstrapAdmin } from "./admins";
import { getAgent } from "./cursor";
import { getSession, updateSession } from "./session";
import type { CursorAgent, CursorRun, Env, StoredAgentEntry, UserSession } from "./types";

export function normalizeSession(session: UserSession | null): UserSession | null {
  if (!session) return null;

  const activeAgentId = session.activeAgentId ?? session.agentId;
  const agents = session.agents ?? [];

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

const AGENT_META_PREFIX = "agentmeta:";

function agentMetaKey(agentId: string): string {
  return `${AGENT_META_PREFIX}${agentId}`;
}

export async function getAgentMeta(
  env: Env,
  agentId: string,
): Promise<StoredAgentEntry | null> {
  const raw = await env.SESSIONS.get(agentMetaKey(agentId));
  if (!raw) return null;
  return JSON.parse(raw) as StoredAgentEntry;
}

async function deleteAgentMeta(env: Env, agentId: string): Promise<void> {
  await env.SESSIONS.delete(agentMetaKey(agentId));
}

function withCreatedBy(
  entry: StoredAgentEntry,
  fallbackOwner: number,
): StoredAgentEntry & { createdBy: number } {
  return {
    ...entry,
    createdBy: entry.createdBy ?? fallbackOwner,
  };
}

async function listAllAgentMeta(env: Env): Promise<StoredAgentEntry[]> {
  const list = await env.SESSIONS.list({ prefix: AGENT_META_PREFIX });
  const agents = new Map<string, StoredAgentEntry>();

  for (const key of list.keys) {
    const raw = await env.SESSIONS.get(key.name);
    if (!raw) continue;
    const entry = withCreatedBy(JSON.parse(raw) as StoredAgentEntry, 0);
    agents.set(entry.agentId, entry);
  }

  // Eski agentlar (faqat sessiyada) — KV yozmasdan xotirada birlashtirish
  for (const idStr of getBootstrapAdminIds(env)) {
    const ownerId = Number.parseInt(idStr, 10);
    if (Number.isNaN(ownerId)) continue;

    const session = normalizeSession(await getSession(env, ownerId));
    for (const agent of session?.agents ?? []) {
      const entry = withCreatedBy(agent, ownerId);
      if (!agents.has(entry.agentId)) {
        agents.set(entry.agentId, entry);
      }
    }
  }

  return [...agents.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export async function listAccessibleAgents(
  env: Env,
  userId: number,
): Promise<StoredAgentEntry[]> {
  if (isBootstrapAdmin(env, userId)) {
    return listAllAgentMeta(env);
  }

  const session = await getNormalizedSession(env, userId);
  return (session?.agents ?? [])
    .map((a) => withCreatedBy(a, userId))
    .filter((a) => a.createdBy === userId);
}

export function canAccessAgent(
  env: Env,
  userId: number,
  entry: StoredAgentEntry,
): boolean {
  if (isBootstrapAdmin(env, userId)) return true;
  return entry.createdBy === userId;
}

export function getActiveAgentId(session: UserSession | null): string | null {
  return normalizeSession(session)?.activeAgentId ?? null;
}

export async function getActiveAgentEntry(
  env: Env,
  userId: number,
  session: UserSession | null,
): Promise<StoredAgentEntry | null> {
  const normalized = normalizeSession(session);
  const activeId = normalized?.activeAgentId;
  if (!activeId) return null;

  const fromSession = normalized?.agents?.find((a) => a.agentId === activeId);
  if (fromSession && canAccessAgent(env, userId, fromSession)) {
    const fromMeta = await getAgentMeta(env, activeId);
    return {
      ...fromSession,
      latestRunId:
        (normalized?.activeAgentId === activeId
          ? normalized?.latestRunId
          : undefined) ??
        fromMeta?.latestRunId ??
        fromSession.latestRunId,
    };
  }

  const fromMeta = await getAgentMeta(env, activeId);
  if (fromMeta && canAccessAgent(env, userId, fromMeta)) {
    return {
      ...fromMeta,
      latestRunId:
        (normalized?.activeAgentId === activeId
          ? normalized?.latestRunId
          : undefined) ?? fromMeta.latestRunId,
    };
  }

  return null;
}

export async function registerAgent(
  env: Env,
  userId: number,
  agent: CursorAgent,
  run: CursorRun,
  repoUrl?: string,
  workspaceFolder?: string,
): Promise<UserSession> {
  const session = normalizeSession(await getSession(env, userId));
  const agents = [...(session?.agents ?? [])];

  const existingIndex = agents.findIndex((a) => a.agentId === agent.id);
  const entry: StoredAgentEntry = {
    agentId: agent.id,
    name: agent.name,
    url: agent.url,
    latestRunId: run.id,
    createdBy: userId,
    workspaceFolder: workspaceFolder ?? session?.workspaceFolder,
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
  const meta = await getAgentMeta(env, agentId);
  const creatorId = meta?.createdBy ?? userId;
  if (creatorId !== userId) {
    const creatorSession = normalizeSession(await getSession(env, creatorId));
    const existing = creatorSession?.agents?.find((a) => a.agentId === agentId);
    if (creatorSession?.agents?.length && existing?.latestRunId !== runId) {
      const agents = creatorSession.agents.map((a) =>
        a.agentId === agentId ? { ...a, latestRunId: runId } : a,
      );
      await updateSession(env, creatorId, { agents });
    }
  }

  const requesterSession = normalizeSession(await getSession(env, userId));
  const agents = requesterSession?.agents?.map((a) =>
    a.agentId === agentId ? { ...a, latestRunId: runId } : a,
  );
  const agentsSynced =
    !agents?.length ||
    agents.some((a) => a.agentId === agentId && a.latestRunId === runId);

  if (
    requesterSession?.activeAgentId === agentId &&
    requesterSession.latestRunId === runId &&
    agentsSynced
  ) {
    return requesterSession;
  }

  const patch: Partial<UserSession> = {
    activeAgentId: agentId,
    agentId,
    latestRunId: runId,
    ...(agents?.length ? { agents } : {}),
  };

  return updateSession(env, userId, patch);
}

export async function selectAgent(
  env: Env,
  userId: number,
  selector: string,
): Promise<{ ok: true; entry: StoredAgentEntry } | { ok: false; error: string }> {
  const agents = await listAccessibleAgents(env, userId);

  if (agents.length === 0) {
    return { ok: false, error: "Agent yo'q. /new bilan yangi agent oching." };
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
        (a.name ?? "").toLowerCase().includes(selector.toLowerCase()),
    );
    if (!entry) {
      return { ok: false, error: `Agent topilmadi: ${selector}` };
    }
  }

  const session = await getNormalizedSession(env, userId);
  if (
    session?.activeAgentId === entry.agentId &&
    session.latestRunId === (entry.latestRunId ?? session.latestRunId)
  ) {
    return { ok: true, entry };
  }

  try {
    const agent = await Promise.race([
      getAgent(env, entry.agentId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Cursor API timeout")), 8000),
      ),
    ]);
    entry = {
      ...entry,
      name: agent.name,
      url: agent.url,
      latestRunId: agent.latestRunId ?? entry.latestRunId,
    };
  } catch {
    // Saqlangan ma'lumot bilan davom etamiz
  }

  await updateSession(env, userId, {
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
  const agents = await listAccessibleAgents(env, userId);

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

  const removed = withCreatedBy(agents[index], userId);

  if (!isBootstrapAdmin(env, userId) && removed.createdBy !== userId) {
    return { ok: false, error: "Faqat o'z agentingizni o'chira olasiz." };
  }

  await deleteAgentMeta(env, removed.agentId);

  const creatorId = removed.createdBy;
  const creatorSession = normalizeSession(await getSession(env, creatorId));
  if (creatorSession?.agents?.length) {
    const creatorAgents = creatorSession.agents.filter(
      (a) => a.agentId !== removed.agentId,
    );
    const nextActive = creatorAgents.at(-1);
    await updateSession(env, creatorId, {
      agents: creatorAgents,
      activeAgentId: nextActive?.agentId,
      agentId: nextActive?.agentId,
      latestRunId: nextActive?.latestRunId,
    });
  }

  const requesterSession = normalizeSession(await getSession(env, userId));
  if (requesterSession?.activeAgentId === removed.agentId) {
    await updateSession(env, userId, {
      activeAgentId: undefined,
      agentId: undefined,
      latestRunId: undefined,
    });
  }

  return { ok: true, name: removed.name };
}

export async function formatAgentsList(
  env: Env,
  userId: number,
  session: UserSession | null,
): Promise<string> {
  const agents = await listAccessibleAgents(env, userId);
  const activeId = normalizeSession(session)?.activeAgentId;

  if (agents.length === 0) {
    return isBootstrapAdmin(env, userId)
      ? "Hozircha agent yo'q.\n\nYangi agent: /new"
      : "Sizda agent yo'q.\n\nYangi agent: /new";
  }

  const lines = agents.map((agent, index) => {
    const activeMark = agent.agentId === activeId ? " ★" : "";
    const ownerMark = isBootstrapAdmin(env, userId)
      ? `\n   admin: ${agent.createdBy}`
      : "";
    const folderMark = agent.workspaceFolder
      ? `\n   papka: ${agent.workspaceFolder}/`
      : "";
    const runInfo = agent.latestRunId ? `\n   run: ${agent.latestRunId}` : "";
    return `${index + 1}. ${agent.name}${activeMark}\n   ${agent.agentId}${ownerMark}${folderMark}${runInfo}`;
  });

  const header = isBootstrapAdmin(env, userId)
    ? "Barcha agentlar (asosiy admin):"
    : "Sizning agentlaringiz:";

  return [
    header,
    "",
    ...lines,
    "",
    "Tanlash: /use 2",
    "O'chirish: /agents remove 2",
  ].join("\n");
}

export async function resolveActiveAgentId(
  env: Env,
  userId: number,
  session: UserSession | null,
): Promise<string | null> {
  const entry = await getActiveAgentEntry(env, userId, session);
  return entry?.agentId ?? null;
}
