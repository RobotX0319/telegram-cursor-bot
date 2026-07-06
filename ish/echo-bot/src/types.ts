export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_B64?: string;
  ENVIRONMENT?: string;
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
  photo?: Array<{ file_id: string }>;
  sticker?: { file_id: string; emoji?: string };
  voice?: { file_id: string };
  document?: { file_id: string; file_name?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
