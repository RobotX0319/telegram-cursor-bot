export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ADMIN_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  WEBHOOK_KEY?: string;
  ADMIN_PANEL_PATH?: string;
  TELEGRAM_ADMIN_ID: string;
  TELEGRAM_ADMIN_IDS?: string;
  REQUIRED_CHANNELS?: string;
  ENVIRONMENT?: string;
  WORKER_PUBLIC_URL?: string;
  VIDEOS: KVNamespace;
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

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width?: number;
  height?: number;
  duration?: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  video?: TelegramVideo;
  document?: TelegramDocument;
  photo?: TelegramPhotoSize[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface StoredVideo {
  id: number;
  fileId: string;
  fileUniqueId: string;
  kind: "video" | "document";
  caption?: string;
  fileName?: string;
  mimeType?: string;
  uploadedBy: number;
  uploadedAt: string;
}

export interface StoredChannel {
  id: string;
  title?: string;
  url?: string;
  addedAt: string;
}

export interface SubscriptionConfig {
  enabled: boolean;
  channels: StoredChannel[];
}

export interface RequiredChannel {
  id: string;
  title: string;
  url?: string;
}

export interface StoredPaymentCard {
  id: number;
  title: string;
  value: string;
  addedBy: number;
  addedAt: string;
}

export interface AdChannelConfig {
  enabled: boolean;
  channelId?: string;
  channelTitle?: string;
  templateFileId?: string;
}
