import { normalizeChannelId } from "./subscription";
import { sendPhotoByFileId } from "./telegram";
import type { AdChannelConfig, Env } from "./types";

const AD_CHANNEL_KEY = "meta:ad_channel";

export async function getAdChannelConfig(env: Env): Promise<AdChannelConfig> {
  const raw = await env.VIDEOS.get(AD_CHANNEL_KEY);
  if (!raw) {
    return { enabled: false };
  }
  try {
    return JSON.parse(raw) as AdChannelConfig;
  } catch {
    return { enabled: false };
  }
}

export async function saveAdChannelConfig(
  env: Env,
  config: AdChannelConfig,
): Promise<void> {
  await env.VIDEOS.put(AD_CHANNEL_KEY, JSON.stringify(config));
}

export async function setAdChannel(
  env: Env,
  input: string,
  title?: string,
): Promise<
  { ok: true; config: AdChannelConfig } | { ok: false; error: string }
> {
  const channelId = normalizeChannelId(input);
  if (!channelId) {
    return { ok: false, error: "Kanal ID kiritilmagan" };
  }

  const config = await getAdChannelConfig(env);
  config.channelId = channelId;
  config.channelTitle = title?.trim() || channelId;
  if (config.templateFileId) {
    config.enabled = true;
  }
  await saveAdChannelConfig(env, config);
  return { ok: true, config };
}

export async function clearAdChannel(env: Env): Promise<AdChannelConfig> {
  const config = await getAdChannelConfig(env);
  config.channelId = undefined;
  config.channelTitle = undefined;
  config.enabled = false;
  await saveAdChannelConfig(env, config);
  return config;
}

export async function setAdTemplate(
  env: Env,
  templateFileId: string,
): Promise<AdChannelConfig> {
  const config = await getAdChannelConfig(env);
  config.templateFileId = templateFileId;
  if (config.channelId) {
    config.enabled = true;
  }
  await saveAdChannelConfig(env, config);
  return config;
}

export async function clearAdTemplate(env: Env): Promise<AdChannelConfig> {
  const config = await getAdChannelConfig(env);
  config.templateFileId = undefined;
  if (!config.channelId) {
    config.enabled = false;
  }
  await saveAdChannelConfig(env, config);
  return config;
}

export async function setAdEnabled(
  env: Env,
  enabled: boolean,
): Promise<AdChannelConfig> {
  const config = await getAdChannelConfig(env);
  config.enabled = enabled;
  await saveAdChannelConfig(env, config);
  return config;
}

export function buildVideoAdCaption(
  videoId: number,
  title?: string,
): string {
  const lines = [
    "🎬 Yangi video!",
    "",
    `🆔 ID: ${videoId}`,
  ];
  if (title?.trim()) {
    lines.push(`📌 ${title.trim()}`);
  }
  lines.push("", "📥 Olish uchun @Detskebot ga shu raqamni yuboring.");
  return lines.join("\n");
}

export async function postVideoAd(
  env: Env,
  videoId: number,
  title?: string,
): Promise<{ ok: true } | { ok: false; error: string } | { ok: false; skipped: true }> {
  const config = await getAdChannelConfig(env);
  if (!config.enabled || !config.channelId || !config.templateFileId) {
    return { ok: false, skipped: true };
  }

  const caption = buildVideoAdCaption(videoId, title);
  const posted = await sendPhotoByFileId(
    env,
    config.channelId,
    config.templateFileId,
    caption,
  );

  if (!posted) {
    return {
      ok: false,
      error:
        "Reklama kanalga yuborilmadi. @Detskebot kanalda admin ekanini tekshiring.",
    };
  }

  return { ok: true };
}
