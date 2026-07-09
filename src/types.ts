export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  CURSOR_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_USER_ID?: string;
  ALLOWED_USER_IDS?: string;
  DEFAULT_GITHUB_REPO?: string;
  DEFAULT_GITHUB_BRANCH?: string;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  ENVIRONMENT?: string;
  WORKER_PUBLIC_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SESSIONS: KVNamespace;
  PENDING_POLLER?: DurableObjectNamespace;
}

export interface StoredAgentEntry {
  agentId: string;
  name: string;
  url: string;
  latestRunId?: string;
  createdAt: string;
  createdBy?: number;
  workspaceFolder?: string;
}

export interface UserSession {
  activeAgentId?: string;
  agentId?: string;
  agents?: StoredAgentEntry[];
  repoUrl?: string;
  latestRunId?: string;
  workspaceFolder?: string;
  /** /new dan keyin foydalanuvchi nom yuborishi kutilmoqda */
  awaitingNewAgentName?: boolean;
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

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  mime_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface CursorPromptImage {
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

export interface TelegramSticker {
  file_id: string;
  emoji?: string;
  set_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  sticker?: TelegramSticker;
  reply_to_message?: TelegramMessage;
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
