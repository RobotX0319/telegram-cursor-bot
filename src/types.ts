export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  CURSOR_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_USER_ID?: string;
  ALLOWED_USER_IDS?: string;
  DEFAULT_GITHUB_REPO?: string;
  DEFAULT_GITHUB_BRANCH?: string;
  ENVIRONMENT?: string;
  WORKER_PUBLIC_URL?: string;
  SESSIONS: KVNamespace;
}

export interface StoredAgentEntry {
  agentId: string;
  name: string;
  url: string;
  latestRunId?: string;
  createdAt: string;
}

export interface UserSession {
  activeAgentId?: string;
  agentId?: string;
  agents?: StoredAgentEntry[];
  repoUrl?: string;
  latestRunId?: string;
  updatedAt: string;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export type RunStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "ERROR"
  | "CANCELLED"
  | "EXPIRED";

export interface CursorRun {
  id: string;
  agentId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  durationMs?: number;
  result?: string;
  git?: {
    branches: Array<{
      repoUrl: string;
      branch?: string;
      prUrl?: string;
    }>;
  };
}

export interface CursorAgent {
  id: string;
  name: string;
  status: string;
  url: string;
  latestRunId?: string;
  repos?: Array<{ url: string; startingRef?: string }>;
}

export interface CreateAgentResponse {
  agent: CursorAgent;
  run: CursorRun;
}

export interface CreateRunResponse {
  run: CursorRun;
}
