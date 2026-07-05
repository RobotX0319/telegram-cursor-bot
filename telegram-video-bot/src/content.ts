import { getVideo, listVideos, saveVideo } from "./storage";
import type { Env, StoredVideo } from "./types";

export function movieName(video: StoredVideo): string {
  return video.name ?? video.caption ?? video.fileName ?? `Kino #${video.id}`;
}

export function movieGenre(video: StoredVideo): string {
  return video.genre ?? "—";
}

export async function incrementMovieViews(
  env: Env,
  id: number,
): Promise<void> {
  const video = await getVideo(env, id);
  if (!video) return;
  await saveVideo(env, {
    ...video,
    views: (video.views ?? 0) + 1,
  });
}

export type SearchFilter = "code" | "name" | "genre" | "all";

export async function searchMovies(
  env: Env,
  query: string,
  filter: SearchFilter = "all",
): Promise<StoredVideo[]> {
  const all = await listVideos(env);
  const q = query.trim().toLowerCase();
  if (!q) return all;

  return all.filter((v) => {
    if (filter === "code" || filter === "all") {
      if (String(v.id).includes(q)) return true;
    }
    if (filter === "name" || filter === "all") {
      if (movieName(v).toLowerCase().includes(q)) return true;
    }
    if (filter === "genre" || filter === "all") {
      if ((v.genre ?? "").toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

export function parseBulkIds(text: string): number[] {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const ids: number[] = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) {
      const n = Number.parseInt(p, 10);
      if (n > 0 && !ids.includes(n)) ids.push(n);
    }
  }
  return ids;
}

export function formatMovieInfo(video: StoredVideo, admin = false): string {
  const lines = [
    `🎬 ${movieName(video)}`,
    `🔢 Kod: ${video.id}`,
    video.year ? `📅 Yil: ${video.year}` : null,
    video.genre ? `🎭 Janr: ${video.genre}` : null,
    video.description ? `📝 ${video.description}` : null,
    `👁 Ko'rishlar: ${video.views ?? 0}`,
    video.variants?.length
      ? `🎞 Variantlar: ${video.variants.map((v) => v.label).join(", ")}`
      : null,
    admin
      ? `📤 Yuklangan: ${new Date(video.uploadedAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`
      : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function updateMovieField(
  env: Env,
  id: number,
  field: string,
  value: string,
): Promise<{ ok: true; video: StoredVideo } | { ok: false; error: string }> {
  const video = await getVideo(env, id);
  if (!video) return { ok: false, error: "Kino topilmadi" };

  const updated = { ...video, updatedAt: new Date().toISOString() };

  switch (field) {
    case "name":
      updated.name = value;
      updated.caption = value;
      break;
    case "description":
      updated.description = value;
      break;
    case "genre":
      updated.genre = value;
      break;
    case "year": {
      const y = Number.parseInt(value, 10);
      if (!Number.isFinite(y) || y < 1900 || y > 2100) {
        return { ok: false, error: "Yil noto'g'ri (masalan: 2024)" };
      }
      updated.year = y;
      break;
    }
    default:
      return { ok: false, error: "Noma'lum maydon" };
  }

  await saveVideo(env, updated);
  return { ok: true, video: updated };
}

export async function getTopMovies(
  env: Env,
  limit = 10,
): Promise<StoredVideo[]> {
  const all = await listVideos(env);
  return all
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, limit);
}
