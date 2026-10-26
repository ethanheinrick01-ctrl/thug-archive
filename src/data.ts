import { createClient } from "@supabase/supabase-js";
import { deviceAuthStorage } from "./auth-storage";
import type { Library, Playlist, Track } from "./model";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "thug-archive-auth-v1",
          storage: deviceAuthStorage,
        },
      })
    : null;
export const localPreview =
  import.meta.env.DEV &&
  ["127.0.0.1", "localhost"].includes(location.hostname) &&
  new URLSearchParams(location.search).has("preview");
const previewKey = "thug-archive-local-preview-v1";
export const previewUser = { id: "local-preview", email: "Local preview" };
const empty: Library = { tracks: [], playlists: [], likes: [], history: [] };
let local: Library = { ...empty };
if (localPreview) {
  try {
    local = {
      ...empty,
      ...JSON.parse(localStorage.getItem(previewKey) || "{}"),
      tracks: [],
    };
  } catch {
    /* A corrupt preview never affects real accounts. */
  }
}
const saveLocal = () =>
  localStorage.setItem(previewKey, JSON.stringify({ ...local, tracks: [] }));
const client = () => {
  if (!supabase) throw new Error("Account setup is still in progress.");
  return supabase;
};
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadLibrary(): Promise<Library> {
  if (localPreview) {
    const response = await fetch("/__local/catalog");
    if (!response.ok) throw new Error("The local catalog is not prepared yet.");
    local.tracks = await response.json();
    return structuredClone(local);
  }
  const db = client();
  const member = await db
    .from("archive_members")
    .select("user_id")
    .maybeSingle();
  check(member.error);
  if (!member.data)
    throw new Error(
      "This account has not been invited to the archive. Ask Ethan to add you.",
    );
  const results = await Promise.all([
    db.from("tracks").select("*").order("archive_order"),
    db.from("playlists").select("*").order("updated_at", { ascending: false }),
    db.from("likes").select("track_id"),
    db
      .from("listening_history")
      .select("*")
      .order("last_played", { ascending: false })
      .limit(500),
  ]);
  for (const result of results) check(result.error);
  return {
    tracks: results[0].data as Track[],
    playlists: results[1].data as Playlist[],
    likes: results[2].data!.map((x) => x.track_id),
    history: results[3].data!,
  };
}
export async function createPlaylist(
  userId: string,
  title: string,
  trackIds: string[] = [],
) {
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    owner_id: userId,
    title: title.trim(),
    description: "",
    track_ids: [...new Set(trackIds)],
    shared: false,
    updated_at: new Date().toISOString(),
  };
  if (!playlist.title || playlist.title.length > 80)
    throw new Error("Give your playlist a name between 1 and 80 characters.");
  if (localPreview) {
    local.playlists.unshift(playlist);
    saveLocal();
    return playlist;
  }
  const result = await client()
    .from("playlists")
    .insert(playlist)
    .select()
    .single();
  check(result.error);
  return result.data as Playlist;
}
export async function updatePlaylist(
  playlist: Playlist,
  patch: Partial<
    Pick<Playlist, "title" | "description" | "track_ids" | "shared">
  >,
) {
  if (
    patch.title !== undefined &&
    (!patch.title.trim() || patch.title.trim().length > 80)
  )
    throw new Error("Give your playlist a name between 1 and 80 characters.");
  const changes = { ...patch, updated_at: new Date().toISOString() };
  if (localPreview) {
    local.playlists = local.playlists.map((p) =>
      p.id === playlist.id ? { ...p, ...changes } : p,
    );
    saveLocal();
    return;
  }
  const result = await client()
    .from("playlists")
    .update(changes)
    .eq("id", playlist.id)
    .eq("owner_id", playlist.owner_id)
    .select("id")
    .single();
  check(result.error);
}
export async function deletePlaylist(id: string) {
  if (localPreview) {
    local.playlists = local.playlists.filter((p) => p.id !== id);
    saveLocal();
    return;
  }
  const result = await client()
    .from("playlists")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  check(result.error);
}
export async function setLike(userId: string, trackId: string, liked: boolean) {
  if (localPreview) {
    local.likes = liked
      ? [...new Set([...local.likes, trackId])]
      : local.likes.filter((id) => id !== trackId);
    saveLocal();
    return;
  }
  const result = liked
    ? await client()
        .from("likes")
        .upsert({ user_id: userId, track_id: trackId })
    : await client()
        .from("likes")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", trackId);
  check(result.error);
}
export async function recordPlay(trackId: string) {
  if (localPreview) {
    const prev = local.history.find((h) => h.track_id === trackId);
    local.history = [
      {
        track_id: trackId,
        last_played: new Date().toISOString(),
        play_count: (prev?.play_count || 0) + 1,
      },
      ...local.history.filter((h) => h.track_id !== trackId),
    ].slice(0, 100);
    saveLocal();
    return;
  }
  const result = await client().rpc("record_play", { target_track: trackId });
  check(result.error);
}
export async function audioUrls(
  ids: string[],
): Promise<Record<string, string>> {
  if (localPreview)
    return Object.fromEntries(
      ids.map((id) => [id, `/__local/audio/${id}.mp3`]),
    );
  const { data, error } = await client().functions.invoke("playback", {
    body: { track_ids: ids },
  });
  check(error);
  if (!data?.urls)
    throw new Error("Audio is not connected yet. Try again shortly.");
  return data.urls;
}
