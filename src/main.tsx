import { render, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  AudioLines,
  House,
  Search,
  LibraryBig,
  Heart,
  Plus,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  MoreHorizontal,
  ChevronDown,
  X,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  LogOut,
  Settings,
  Share2,
  Check,
  Music2,
  Disc3,
  ChevronRight,
  ListPlus,
  Pencil,
  Trash2,
  Volume2,
  UsersRound,
  History as HistoryIcon,
  Upload,
  Link as LinkIcon,
} from "lucide-preact";
import {
  createPlaylist,
  deletePlaylist,
  loadLibrary,
  localPreview,
  previewUser,
  setLike,
  supabase,
  updatePlaylist,
} from "./data";
import {
  formatTime,
  groupTracks,
  matches,
  moveItem,
  type Library,
  type Playlist,
  type Track,
} from "./model";
import { player, type PlayerState } from "./player";
import { Sleeve, TrackArt } from "./art";
import { requestPersistentSessionStorage } from "./auth-storage";
import { listening } from "./rooms";
import { roomIdFromLink } from "./room-model";
import { RoomChat } from "./room-chat";
import { Lyrics } from "./lyrics";
import { Uploads } from "./uploads";
import "./style.css";

type User = { id: string; email?: string };
type View =
  | "home"
  | "browse"
  | "search"
  | "library"
  | "liked"
  | "history"
  | "uploads"
  | `collection:${string}`
  | `playlist:${string}`;
const blank: Library = { tracks: [], playlists: [], likes: [], history: [] };
const collections = [
  {
    id: "archive",
    title: "The full collection",
    sub: "Every track. Every version.",
    match: (_: Track) => true,
  },
  {
    id: "slower",
    title: "Slower paced",
    sub: "Take it easy · Approximate",
    match: (t: Track) => t.tags.includes("pace-slower"),
  },
  {
    id: "upbeat",
    title: "Upbeat",
    sub: "A little more bounce · Approximate",
    match: (t: Track) => t.tags.includes("pace-upbeat"),
  },
  {
    id: "harder",
    title: "Harder tracks",
    sub: "Turn it up · Approximate",
    match: (t: Track) => t.tags.includes("pace-harder"),
  },
  {
    id: "gunna",
    title: "With Gunna",
    sub: "The collaborations",
    match: (t: Track) =>
      t.features.some((f) => /gunna/i.test(f)) || /gunna/i.test(t.artist || ""),
  },
  {
    id: "edits",
    title: "Edits & mixes",
    sub: "Another way to hear it",
    match: (t: Track) => t.tags.includes("edit"),
  },
  {
    id: "versions",
    title: "Alternate takes",
    sub: "Explore the differences",
    match: (t: Track) => t.tags.includes("version"),
  },
];
function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
  className = "",
}: {
  label: string;
  children: ComponentChildren;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      class={`icon-button ${active ? "active" : ""} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  close,
  className = "",
}: {
  title: string;
  children: ComponentChildren;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={`modal ${className}`}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div class="modal-inner">
        <div class="modal-heading">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={close}>
            <X />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function Login({ onUser }: { onUser: (user: User) => void }) {
  const invited =
    new URLSearchParams(location.hash.slice(1)).get("invite") || "";
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [signup, setSignup] = useState(!!invited),
    [invite, setInvite] = useState(invited);
  async function signIn(e: SubmitEvent) {
    e.preventDefault();
    if (!supabase) {
      setError(
        "The archive is being connected. Sign-in will be available when setup is complete.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const name = username.trim().toLowerCase();
      if (signup) {
        const result = await supabase.functions.invoke("register", {
          body: { username: name, password, invite_code: invite.trim() },
        });
        if (result.error) {
          let message =
            "Couldn’t create your account. Check your invite code and try another username.";
          try {
            message = (await result.error.context.json()).error || message;
          } catch {}
          throw new Error(message);
        }
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: `${name}@thug-archive.invalid`,
        password,
      });
      if (error)
        throw new Error(
          "Couldn’t sign in. Check your username and password, then try again.",
        );
      if (data.user) {
        void requestPersistentSessionStorage();
        const room = new URLSearchParams(location.hash.slice(1)).get("room");
        history.replaceState(
          null,
          "",
          location.pathname +
            location.search +
            (roomIdFromLink(room || "") ? `#room=${room}` : ""),
        );
        onUser(data.user);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="login-layout">
      <div class="login-art">
        <div class="brand">
          <AudioLines /> THUG ARCHIVE
          <span class="brand-dot" />
        </div>
        <div class="login-statement">
          <p class="eyebrow">A PRIVATE COLLECTION</p>
          <h1>
            Good music.
            <br />
            Kept close.
          </h1>
          <p>
            The tracks you kept. The versions you love.
            <br />
            All in one place.
          </p>
        </div>
        <div class="login-sleeves">
          <Sleeve label="THE COLLECTION" />
          <Sleeve kind="edits" label="ON REPEAT" />
        </div>
        <p class="login-foot">YOUR COLLECTION. YOUR ROTATION.</p>
      </div>
      <div class="login-form-wrap">
        <div class="mobile-brand brand">
          <AudioLines /> THUG ARCHIVE
        </div>
        <form class="login-form" onSubmit={signIn}>
          <p class="eyebrow">{signup ? "YOU’RE INVITED" : "WELCOME BACK"}</p>
          <h2>{signup ? "Make yourself at home." : "Your archive awaits."}</h2>
          <p class="muted">
            {signup
              ? "Choose a username and password. Your playlists are yours."
              : "Sign in and pick up where you left off."}
          </p>
          <label>
            Username
            <input
              autoComplete="username"
              type="text"
              name="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]{3,24}"
              value={username}
              onInput={(e) => setUsername(e.currentTarget.value)}
              placeholder="Your username"
              spellcheck={false}
              autoCapitalize="none"
            />
          </label>
          <label>
            Password
            <input
              autoComplete={signup ? "new-password" : "current-password"}
              type="password"
              name="password"
              required
              minLength={signup ? 10 : undefined}
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder={signup ? "At least 10 characters" : "Your password"}
            />
          </label>
          {signup && (
            <label>
              Invite code
              <input
                autoComplete="off"
                type="text"
                required
                value={invite}
                onInput={(e) => setInvite(e.currentTarget.value)}
                placeholder="The code Ethan shared"
                spellcheck={false}
                autoCapitalize="none"
              />
            </label>
          )}
          {error && (
            <p class="form-error" role="alert">
              {error}
            </p>
          )}
          <button class="primary wide" disabled={busy}>
            {busy
              ? signup
                ? "Creating your account…"
                : "Signing in…"
              : signup
                ? "Create account"
                : "Sign in"}{" "}
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            class="text-button wide"
            disabled={busy}
            onClick={() => {
              setSignup(!signup);
              setError("");
              setPassword("");
            }}
          >
            {signup
              ? "Already have an account? Sign in"
              : "Have an invite? Create an account"}
          </button>
          <p class="login-help">
            You stay signed in on this device until you sign out.
          </p>
          <p class="login-help">
            {signup
              ? "Letters, numbers, and underscores work for usernames. No email needed."
              : "Forgot your password? Ask Ethan to help you reset it."}
          </p>
        </form>
        <p class="install-hint">
          On iPhone: Safari → Share → Add to Home Screen.
        </p>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(
      localPreview ? previewUser : null,
    ),
    [authReady, setAuthReady] = useState(localPreview || !supabase);
  const [lib, setLib] = useState<Library>(blank),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("home"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("archive"),
    [filter, setFilter] = useState("all");
  const navigationHistory = useRef<
    {
      view: View;
      query: string;
      filter: string;
      sort: string;
      scrollY: number;
    }[]
  >([]);
  const [ps, setPs] = useState<PlayerState>({ ...player.state }),
    [nowPlaying, setNowPlaying] = useState(false),
    [lyricsOpen, setLyricsOpen] = useState(false),
    [queueOpen, setQueueOpen] = useState(false),
    [queueQuery, setQueueQuery] = useState(""),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<Track | null>(null),
    [versions, setVersions] = useState<Track[] | null>(null),
    [addTrack, setAddTrack] = useState<Track | null>(null);
  const [edit, setEdit] = useState<Playlist | "new" | null>(null),
    [playlistName, setPlaylistName] = useState(""),
    [playlistDescription, setPlaylistDescription] = useState(""),
    [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(navigator.onLine);
  const [roomState, setRoomState] = useState({ ...listening.state });
  const [uploadsOpen, setUploadsOpen] = useState(false);
  const uploadBusy = useRef(false);
  const [uploadRole, setUploadRole] = useState("");
  useEffect(() => {
    setUploadRole("");
    let active = true;
    if (user && supabase && !localPreview) void supabase.from("archive_upload_roles").select("role").eq("user_id",user.id).maybeSingle().then(({data}) => {if(active) setUploadRole(data?.role || "");});
    return () => {active = false;};
  }, [user?.id]);
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomLink, setRoomLink] = useState("");
  const liveUser = useRef<string | null>(user?.id || null);
  liveUser.current = user?.id || null;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function toast(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  }
  listening.notify = toast;
  async function refresh() {
    const owner = liveUser.current;
    if (!owner) return;
    try {
      const data = await loadLibrary();
      if (liveUser.current !== owner) return;
      setLib(data);
      player.connect(data.tracks, owner);
      setLoadError("");
    } catch (e) {
      if (liveUser.current === owner) setLoadError((e as Error).message);
    }
  }
  async function run(action: () => Promise<unknown>, success?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
      if (success) toast(success);
    } catch (e) {
      toast((e as Error).message || "Couldn’t save that change. Try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!supabase || localPreview) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user || null);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user || null);
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    listening.setUser(user?.id || "");
    setRoomOpen(false);
    setSettingsOpen(false);
    setNowPlaying(false);
    setLyricsOpen(false);
    setQueueOpen(false);
    setMenu(null);
    setVersions(null);
    setAddTrack(null);
    setEdit(null);
    setDeleteTarget(null);
    setView("home");
    navigationHistory.current = [];
    setQuery("");
    setLib(blank);
    if (!user) {
      setLib(blank);
      player.reset();
      return;
    }
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [user?.id]);
  useEffect(
    () => listening.subscribe(() => setRoomState({ ...listening.state })),
    [],
  );
  useEffect(() => {
    const openLinkedRoom = () => {
      const id = roomIdFromLink(
        new URLSearchParams(location.hash.slice(1)).get("room") || "",
      );
      if (user && lib.tracks.length && id && !listening.state.snapshot) {
        setRoomLink(id);
        setRoomOpen(true);
      }
    };
    openLinkedRoom();
    window.addEventListener("hashchange", openLinkedRoom);
    return () => window.removeEventListener("hashchange", openLinkedRoom);
  }, [user?.id, lib.tracks.length]);
  useEffect(
    () =>
      player.subscribe(() =>
        setPs({ ...player.state, queue: [...player.state.queue] }),
      ),
    [],
  );
  useEffect(() => {
    const online = () => {
      setConnected(navigator.onLine);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    const keys = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(e.target as HTMLElement).closest(
          "input, textarea, button, select, dialog",
        )
      ) {
        e.preventDefault();
        void player.toggle();
      }
    };
    window.addEventListener("keydown", keys);
    const history = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      setLib((prev) => ({
        ...prev,
        history: [
          {
            track_id: id,
            last_played: new Date().toISOString(),
            play_count:
              (prev.history.find((h) => h.track_id === id)?.play_count || 0) +
              1,
          },
          ...prev.history.filter((h) => h.track_id !== id),
        ].slice(0, 100),
      }));
    };
    window.addEventListener("archive-history-updated", history);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("keydown", keys);
      window.removeEventListener("archive-history-updated", history);
    };
  }, []);
  function navigate(next: View) {
    if (next !== view) {
      navigationHistory.current.push({
        view,
        query,
        filter,
        sort,
        scrollY: window.scrollY,
      });
    }
    setView(next);
    if (next === "uploads") void refresh();
    setQuery("");
    setFilter("all");
    setSort("archive");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function goBack() {
    const previous = navigationHistory.current.pop();
    const fallback: View =
      view.startsWith("playlist:") || view === "liked" ? "library" : "home";
    setView(previous?.view || fallback);
    setQuery(previous?.query || "");
    setFilter(previous?.filter || "all");
    setSort(previous?.sort || "archive");
    requestAnimationFrame(() =>
      window.scrollTo({ top: previous?.scrollY || 0, behavior: "instant" }),
    );
  }
  function beginEdit(target: Playlist | "new") {
    setPlaylistName(target === "new" ? "" : target.title);
    setPlaylistDescription(target === "new" ? "" : target.description);
    setEdit(target);
  }
  useEffect(() => {
    if (queueOpen && roomState.snapshot) void listening.refresh();
  }, [queueOpen, roomState.snapshot?.room.id]);
  const visibleQueue = roomState.snapshot?.room.queue ?? ps.queue;
  const visibleQueueIndex = roomState.snapshot?.room.queue_index ?? ps.index;
  const queueEntries = visibleQueue.map((id, index) => ({
    index, track: lib.tracks.find(t => t.id === id),
  })).filter((entry): entry is {index: number; track: Track} =>
    entry.index > visibleQueueIndex && !!entry.track && matches(entry.track, queueQuery));
  useEffect(() => { if (!queueOpen) setQueueQuery(""); }, [queueOpen]);
  const current = player.current;
  const playlist = view.startsWith("playlist:")
    ? lib.playlists.find((p) => p.id === view.slice(9))
    : undefined;
  const collection = view.startsWith("collection:")
    ? collections.find((c) => c.id === view.slice(11))
    : undefined;
  const myPlaylists = lib.playlists.filter((p) => p.owner_id === user?.id);
  const sharedPlaylists = lib.playlists.filter((p) => p.owner_id !== user?.id);
  const ordered = (ids: string[]) =>
    ids
      .map((id) => lib.tracks.find((t) => t.id === id))
      .filter((t): t is Track => !!t);
  const historyTracks = ordered([...lib.history].sort((a,b) => Date.parse(b.last_played)-Date.parse(a.last_played)).map((h) => h.track_id));
  const recent = historyTracks.slice(0, 6);
  const newestTracks = [...lib.tracks].filter(t => t.available).sort((a,b) => b.archive_order-a.archive_order || b.id.localeCompare(a.id));
  const liked = ordered(lib.likes);
  let shown = playlist
    ? ordered(playlist.track_ids)
    : view === "liked"
      ? liked
      : collection
        ? lib.tracks.filter(collection.match)
        : lib.tracks;
  shown = shown.filter(
    (t) =>
      matches(t, query) &&
      (filter === "all" ||
        (filter === "available" && t.available) ||
        (filter === "versions" &&
          (t.tags.includes("version") ||
            lib.tracks.filter((x) => x.group_key === t.group_key).length >
              1)) ||
        t.tags.includes(filter)),
  );
  if (sort === "title")
    shown = [...shown].sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "artist")
    shown = [...shown].sort((a, b) =>
      (a.artist || "zz").localeCompare(b.artist || "zz"),
    );
  const grouped = groupTracks(shown);
  const title =
    playlist?.title ||
    collection?.title ||
    (view === "liked"
      ? "Liked songs"
      : view === "search"
        ? "Find your next repeat."
        : view === "browse"
          ? "The collection"
          : "Your library");
  async function like(track: Track) {
    if (user)
      await run(() =>
        setLike(user.id, track.id, !lib.likes.includes(track.id)),
      );
  }
  async function signOut() {
    await listening.leave();
    player.reset();
    if (localPreview) {
      location.href = "/";
      return;
    }
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error) toast("Couldn’t sign out. Check your connection and try again.");
    else {
      setUser(null);
      setView("home");
    }
  }
  const play = (tracks: Track[], shuffle = false) => {
    void player.playQueue(
      tracks.filter((t) => t.available).map((t) => t.id),
      0,
      shuffle,
    );
  };
  function trackRows({
    tracks,
    compact = false,
    reorder = false,
  }: {
    tracks: Track[];
    compact?: boolean;
    reorder?: boolean;
  }) {
    if (!tracks.length)
      return (
        <div class="empty-state">
          <Music2 size={32} />
          <h3>
            {query
              ? "No tracks found"
              : playlist
                ? "Make it your rotation."
                : "Nothing here yet."}
          </h3>
          <p>
            {query
              ? "Try another title, artist, or filename."
              : playlist
                ? "Browse the collection and add songs from the ••• menu."
                : "Your songs will appear here as the collection is connected."}
          </p>
          {playlist && (
            <button class="secondary" onClick={() => navigate("browse")}>
              Browse songs
            </button>
          )}
        </div>
      );
    return (
      <div class={`track-list ${compact ? "compact" : ""}`}>
        <div class="track-list-head">
          <span>#</span>
          <span>TRACK</span>
          <span class="desktop-col">ARTIST / CREDIT</span>
          <span class="time-col">TIME</span>
          <span />
        </div>
        {tracks.map((t, i) => {
          const alternatives = lib.tracks.filter(
            (other) => other.group_key === t.group_key,
          );
          return (
            <div
              class={`track-row ${current?.id === t.id ? "is-current" : ""}`}
              key={t.id}
              onClick={(event) => {
                if (
                  (event.target as Element).closest(
                    "button, a, input, select, .row-actions",
                  )
                )
                  return;
                void player.playQueue(
                  tracks.map((track) => track.id),
                  i,
                );
              }}
            >
              <button
                class="track-number"
                aria-label={`Play ${t.title}`}
                onClick={() =>
                  void player.playQueue(
                    tracks.map((x) => x.id),
                    i,
                  )
                }
              >
                {current?.id === t.id && ps.playing ? (
                  <AudioLines size={17} />
                ) : (
                  <>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <Play size={15} />
                  </>
                )}
              </button>
              <div class="track-main">
                <button
                  class="art-play"
                  aria-label={`Play ${t.title}`}
                  onClick={() =>
                    void player.playQueue(
                      tracks.map((x) => x.id),
                      i,
                    )
                  }
                >
                  <TrackArt track={t} />
                </button>
                <div class="track-copy">
                  <button
                    class="track-title"
                    onClick={() =>
                      void player.playQueue(
                        tracks.map((x) => x.id),
                        i,
                      )
                    }
                  >
                    {t.title}
                  </button>
                  <div class="track-sub">
                    {view === "history" && (() => {
                      const entry = lib.history.find(h => h.track_id === t.id);
                      return entry && <span>{new Date(entry.last_played).toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})} · {entry.play_count} {entry.play_count === 1 ? "play" : "plays"}</span>;
                    })()}
                    {t.version ? (
                      <span>{t.version}</span>
                    ) : (
                      <span class="mobile-credit">
                        {t.artist ||
                          (t.features.length
                            ? `With ${t.features.join(", ")}`
                            : "Archive track")}
                      </span>
                    )}
                    {!t.available && (
                      <span class="import-status">Import pending</span>
                    )}
                    {t.tags.includes("audio-review") && (
                      <span class="audio-review">Audio needs review</span>
                    )}
                    {alternatives.length > 1 && !compact && (
                      <button
                        class="version-pill"
                        onClick={() => setVersions(alternatives)}
                      >
                        {alternatives.length} versions
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <span class="artist desktop-col">
                {t.artist ||
                  (t.features.length ? `With ${t.features.join(", ")}` : "—")}
              </span>
              <span class="time-col">{formatTime(t.duration)}</span>
              <div class="row-actions">
                {reorder && playlist && (
                  <>
                    <IconButton
                      label={`Move ${t.title} up`}
                      disabled={busy || i === 0}
                      onClick={() =>
                        void run(() =>
                          updatePlaylist(playlist, {
                            track_ids: moveItem(playlist.track_ids, i, i - 1),
                          }),
                        )
                      }
                    >
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton
                      label={`Move ${t.title} down`}
                      disabled={busy || i === tracks.length - 1}
                      onClick={() =>
                        void run(() =>
                          updatePlaylist(playlist, {
                            track_ids: moveItem(playlist.track_ids, i, i + 1),
                          }),
                        )
                      }
                    >
                      <ArrowDown size={16} />
                    </IconButton>
                    <IconButton
                      label={`Remove ${t.title} from playlist`}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            updatePlaylist(playlist, {
                              track_ids: playlist.track_ids.filter(
                                (id) => id !== t.id,
                              ),
                            }),
                          "Removed from playlist",
                        )
                      }
                    >
                      <X size={16} />
                    </IconButton>
                  </>
                )}
                {!reorder && (
                  <IconButton
                    className="row-heart"
                    label={`${lib.likes.includes(t.id) ? "Unlike" : "Like"} ${t.title}`}
                    active={lib.likes.includes(t.id)}
                    disabled={busy}
                    onClick={() => void like(t)}
                  >
                    <Heart
                      size={17}
                      fill={lib.likes.includes(t.id) ? "currentColor" : "none"}
                    />
                  </IconButton>
                )}
                <IconButton
                  label={`More options for ${t.title}`}
                  onClick={() => setMenu(t)}
                >
                  <MoreHorizontal size={20} />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (!authReady)
    return (
      <div class="boot">
        <AudioLines />
        <p>Opening your archive…</p>
      </div>
    );
  if (!user) return <Login onUser={setUser} />;
  return (
    <div class="app-shell">
      <aside class="sidebar">
        <button class="brand" onClick={() => navigate("home")}>
          <AudioLines /> THUG ARCHIVE
          <span class="brand-dot" />
        </button>
        <p class="eyebrow sidebar-label">YOUR LISTENING ROOM</p>
        <nav aria-label="Main navigation">
          {[
            { v: "home", n: "Listen now", I: House },
            { v: "browse", n: "Browse", I: Disc3 },
            { v: "uploads", n: "Recently uploaded", I: Upload },
            { v: "search", n: "Search", I: Search },
            { v: "library", n: "Your library", I: LibraryBig },
          ].map(({ v, n, I }) => (
            <button
              class={`nav-item ${view === v ? "selected" : ""}`}
              onClick={() => navigate(v as View)}
            >
              <I size={20} />
              {n}
            </button>
          ))}
        </nav>
        <div class="sidebar-divider" />
        <button
          class={`nav-item ${view === "liked" ? "selected" : ""}`}
          onClick={() => navigate("liked")}
        >
          <Heart size={20} />
          Liked songs<span class="nav-count">{lib.likes.length}</span>
        </button>
        <button class={`nav-item ${view === "history" ? "selected" : ""}`} onClick={() => navigate("history")}>
          <HistoryIcon size={20} /> Listening history
        </button>
        <div class="playlist-label">
          <span class="eyebrow">PLAYLISTS</span>
          <IconButton label="Create playlist" onClick={() => beginEdit("new")}>
            <Plus size={18} />
          </IconButton>
        </div>
        <div class="sidebar-playlists">
          {myPlaylists.map((p) => (
            <button
              class={`nav-item ${playlist?.id === p.id ? "selected" : ""}`}
              onClick={() => navigate(`playlist:${p.id}`)}
            >
              <ListMusic size={18} />
              <span>{p.title}</span>
            </button>
          ))}
          {!myPlaylists.length && (
            <button class="sidebar-empty" onClick={() => beginEdit("new")}>
              Make a playlist.
              <br />
              <span>Keep your favorites together.</span>
            </button>
          )}
        </div>
        <div class="sidebar-bottom">
          <div class="record-mark">
            <AudioLines size={42} />
            <span>
              KEEP THE
              <br />
              GOOD ONES.
            </span>
          </div>
          <button class="account" onClick={() => setSettingsOpen(true)}>
            <span class="avatar">
              {localPreview ? "L" : user.email?.[0].toUpperCase()}
            </span>
            <span>
              <strong>
                {localPreview ? "Local preview" : user.email?.split("@")[0]}
              </strong>
              <small>
                {localPreview ? "Development only" : "Private archive"}
              </small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <main id="main" class="main">
        <header class="topbar">
          <div class="topbar-left">
            <button
              class="topbar-back"
              aria-label="Go back"
              disabled={
                view === "home" && navigationHistory.current.length === 0
              }
              onClick={goBack}
            >
              <ArrowLeft size={19} /> Back
            </button>
            <div class="mobile-brand brand">
              <AudioLines /> ARCHIVE
            </div>
            <span class="topbar-caption">YOUR COLLECTION. YOUR ROTATION.</span>
          </div>
          <div class="topbar-right">
            <span class="topbar-status">
              <span class="private-dot" />
              {localPreview ? "Local preview" : "Private collection"}
            </span>
            <button
              class={`room-launch ${roomState.snapshot ? "is-active" : ""}`}
              aria-label="Listen together"
              onClick={() => setRoomOpen(true)}
            >
              <UsersRound size={18} />
              <span class="room-full-label">Listen together</span>
              <span class="room-short-label">Together</span>
            </button>
            <IconButton
              label="Account settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={18} />
            </IconButton>
          </div>
        </header>
        {roomState.snapshot && (
          <button class="room-strip" onClick={() => setRoomOpen(true)}>
            <UsersRound size={17} />
            <span>
              {listening.isHost
                ? "You’re hosting"
                : `Listening with ${roomState.snapshot.members.find((member) => member.user_id === roomState.snapshot!.room.host_id)?.display_name || "your host"}`}{" "}
              · {roomState.snapshot.members.length}{" "}
              {roomState.snapshot.members.length === 1 ? "person" : "people"}
            </span>
            <span>
              {roomState.connected ? "Open room" : "Reconnecting…"}
              <ChevronRight size={16} />
            </span>
          </button>
        )}
        {!connected && (
          <div class="status-banner">
            You’re offline. Streaming and cloud saves need a connection.
          </div>
        )}
        {localPreview && (
          <div class="preview-banner">
            LOCAL PREVIEW · Changes stay on this device. Real login is separate.
          </div>
        )}
        {loadError ? (
          <div class="empty-state error-state" role="alert">
            <Music2 />
            <h2>Couldn’t open the collection.</h2>
            <p>{loadError}</p>
            <button class="secondary" onClick={() => void refresh()}>
              Try again
            </button>
            <button class="text-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : loading ? (
          <div class="boot">
            <AudioLines />
            <p>Finding the good ones…</p>
          </div>
        ) : (
          <div class="page-content">
            {view === "home" ? (
              <>
                <section class="hero">
                  <div class="hero-copy">
                    <p class="eyebrow">THE PERSONAL COLLECTION / VOL. 01</p>
                    <h1>
                      KEEP IT
                      <br />
                      IN ROTATION.
                    </h1>
                    <p>A home for the tracks worth keeping.</p>
                    <div class="hero-actions">
                      <button
                        class="primary"
                        onClick={() => play(lib.tracks, true)}
                      >
                        <Shuffle size={18} />
                        Shuffle collection
                      </button>
                      <button
                        class="hero-link"
                        onClick={() => navigate("browse")}
                      >
                        Explore archive <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                  <div class="hero-art">
                    <Sleeve label="THE COLLECTION" />
                    <div class="sleeve-sticker">
                      {lib.tracks.length}
                      <small>TRACKS</small>
                    </div>
                  </div>
                </section>
                <section class="section">
                  <div class="section-heading">
                    <div>
                      <p class="eyebrow">A WAY IN</p>
                      <h2>Find your rotation</h2>
                    </div>
                    <button
                      class="text-button"
                      onClick={() => navigate("browse")}
                    >
                      View all <ChevronRight size={16} />
                    </button>
                  </div>
                  <div class="collection-grid">
                    {collections.map((c) => (
                      <button
                        class="collection-card"
                        onClick={() => navigate(`collection:${c.id}`)}
                      >
                        <div class="cover-wrap">
                          <Sleeve kind={c.id} label={c.title} />
                          <span class="cover-play">
                            <Play fill="currentColor" size={23} />
                          </span>
                        </div>
                        <strong>{c.title}</strong>
                        <span>
                          {lib.tracks.filter(c.match).length} tracks · {c.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section class="section">
                  <div class="section-heading">
                    <div>
                      <p class="eyebrow">
                        {recent.length
                          ? "RIGHT WHERE YOU LEFT OFF"
                          : "FROM THE ARCHIVE"}
                      </p>
                      <h2>
                        {recent.length
                          ? "Back in rotation"
                          : "Start somewhere good"}
                      </h2>
                    </div>
                    <button
                      class="text-button"
                      onClick={() => navigate(recent.length ? "history" : "browse")}
                    >
                      {recent.length ? "View history" : "Browse collection"} <ChevronRight size={16} />
                    </button>
                  </div>
                  {trackRows({
                    tracks: recent.length ? recent : lib.tracks.slice(0, 6),
                    compact: true,
                  })}
                </section>
              </>
            ) : view === "uploads" ? (
              <>
                <div class="page-heading">
                  <p class="eyebrow">NEW IN THE COLLECTION</p>
                  <h1>Recently uploaded</h1>
                  <p class="muted">Newest additions first, including approved uploads and imports. Pending files stay in the review queue.</p>
                </div>
                <div class="recent-upload-actions">
                  <button class="secondary" onClick={() => void refresh().then(() => toast("Latest songs loaded"))}>Refresh songs</button>
                  {uploadRole && <button class="primary" onClick={() => setUploadsOpen(true)}>Uploads & review</button>}
                </div>
                <label class="search-field"><Search size={18}/><span class="sr-only">Search recent uploads</span><input type="search" value={query} onInput={e => setQuery(e.currentTarget.value)} placeholder="Find a new song"/></label>
                {newestTracks.filter(t => matches(t,query)).length ? trackRows({tracks:newestTracks.filter(t => matches(t,query))}) : <div class="empty-state"><Upload size={32}/><h3>{query ? "No matching songs" : "No uploaded songs yet"}</h3><p>{query ? "Try another title." : "Approved songs will appear here."}</p></div>}
              </>
            ) : view === "history" ? (
              <>
                <div class="page-heading">
                  <p class="eyebrow">YOUR LISTENING</p>
                  <h1>Listening history</h1>
                  <p class="muted">Most recently played first. Songs appear after five seconds of listening.</p>
                </div>
                {historyTracks.length ? trackRows({tracks: historyTracks}) : (
                  <div class="empty-state"><HistoryIcon size={32} /><h3>Your history starts here.</h3><p>Play a song to find it here later.</p><button class="secondary" onClick={() => navigate("browse")}>Browse songs</button></div>
                )}
              </>
            ) : view === "library" ? (
              <>
                <div class="page-heading">
                  <p class="eyebrow">MADE BY YOU</p>
                  <h1>Your library</h1>
                  <p class="muted">The songs you keep coming back to.</p>
                </div>
                <button class="secondary wide history-shortcut" onClick={() => navigate("uploads")}><Upload size={18}/> Recently uploaded <ChevronRight size={16}/></button>
                <button class="secondary wide history-shortcut" onClick={() => navigate("history")}><HistoryIcon size={18} /> Listening history <ChevronRight size={16} /></button>
                <div class="section-heading">
                  <h2>Your playlists</h2>
                  <button class="secondary" onClick={() => beginEdit("new")}>
                    <Plus size={18} />
                    Create playlist
                  </button>
                </div>
                <div class="library-grid">
                  <button
                    class="collection-card"
                    onClick={() => navigate("liked")}
                  >
                    <Sleeve kind="liked" label="LIKED SONGS" />
                    <strong>Liked songs</strong>
                    <span>{liked.length} tracks</span>
                  </button>
                  {myPlaylists.map((p) => (
                    <button
                      class="collection-card"
                      onClick={() => navigate(`playlist:${p.id}`)}
                    >
                      <Sleeve kind="playlist" label={p.title} />
                      <strong>{p.title}</strong>
                      <span>
                        {p.track_ids.length} tracks{p.shared ? " · Shared" : ""}
                      </span>
                    </button>
                  ))}
                  <button
                    class="new-playlist-tile"
                    onClick={() => beginEdit("new")}
                  >
                    <Plus size={30} />
                    <strong>Make a playlist</strong>
                    <span>Put your own spin on it.</span>
                  </button>
                </div>
                {sharedPlaylists.length > 0 && (
                  <section class="section">
                    <h2>Shared with you</h2>
                    <div class="library-grid">
                      {sharedPlaylists.map((p) => (
                        <button
                          class="collection-card"
                          onClick={() => navigate(`playlist:${p.id}`)}
                        >
                          <Sleeve kind="playlist" label={p.title} />
                          <strong>{p.title}</strong>
                          <span>{p.track_ids.length} tracks</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <>
                {collection || playlist || view === "liked" ? (
                  <div class="detail-heading">
                    <button
                      class="back-button"
                      onClick={goBack}
                      aria-label="Back"
                    >
                      <ArrowLeft size={19} />
                    </button>
                    <div class="detail-art">
                      <Sleeve
                        kind={
                          collection?.id ||
                          (view === "liked" ? "liked" : "playlist")
                        }
                        label={title}
                      />
                    </div>
                    <div class="detail-copy">
                      <p class="eyebrow">
                        {playlist
                          ? playlist.owner_id === user.id
                            ? "YOUR PLAYLIST"
                            : "SHARED PLAYLIST"
                          : view === "liked"
                            ? "YOUR FAVORITES"
                            : "ARCHIVE COLLECTION"}
                      </p>
                      <h1>{title}</h1>
                      <p>
                        {playlist
                          ? playlist.description || "A rotation of your own."
                          : collection?.sub ||
                            "Every song you’ve saved a heart for."}
                      </p>
                      <span class="muted">
                        {playlist
                          ? playlist.track_ids.length
                          : view === "liked"
                            ? liked.length
                            : lib.tracks.filter(collection!.match).length}{" "}
                        tracks
                        {playlist?.shared
                          ? " · Shared with archive members"
                          : ""}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div class="page-heading">
                    <p class="eyebrow">
                      {view === "search"
                        ? "DIG A LITTLE DEEPER"
                        : "EVERY TRACK, ONE PLACE"}
                    </p>
                    <h1>{title}</h1>
                    <p class="muted">
                      {view === "search"
                        ? "Titles, features, and the names you remember."
                        : `${lib.tracks.length} tracks · Original versions preserved`}
                    </p>
                  </div>
                )}
                <div class="list-toolbar">
                  <div class="list-play-actions">
                    <button
                      class="play-round"
                      aria-label={`Play ${title}`}
                      onClick={() => play(shown)}
                    >
                      <Play fill="currentColor" size={24} />
                    </button>
                    <IconButton
                      label={`Shuffle ${title}`}
                      onClick={() => play(shown, true)}
                    >
                      <Shuffle />
                    </IconButton>
                    {playlist?.owner_id === user.id && (
                      <>
                        <IconButton
                          label="Edit playlist"
                          onClick={() => beginEdit(playlist)}
                        >
                          <Pencil size={20} />
                        </IconButton>
                        <IconButton
                          label={
                            playlist.shared
                              ? "Make playlist private"
                              : "Share playlist with archive members"
                          }
                          active={playlist.shared}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                updatePlaylist(playlist, {
                                  shared: !playlist.shared,
                                }),
                              playlist.shared
                                ? "Playlist is private"
                                : "Shared with archive members",
                            )
                          }
                        >
                          <Share2 size={20} />
                        </IconButton>
                        <IconButton
                          label="Delete playlist"
                          onClick={() => setDeleteTarget(playlist)}
                        >
                          <Trash2 size={19} />
                        </IconButton>
                      </>
                    )}
                  </div>
                  <label class="search-field">
                    <Search size={18} />
                    <span class="sr-only">Search tracks</span>
                    <input
                      type="search"
                      value={query}
                      onInput={(e) => setQuery(e.currentTarget.value)}
                      placeholder="Search the collection"
                    />
                  </label>
                </div>
                <div class="filter-toolbar">
                  <div class="filter-chips">
                    {[
                      { id: "all", label: "All tracks" },
                      { id: "edit", label: "Edits" },
                      { id: "versions", label: "Versions" },
                      { id: "available", label: "Ready to play" },
                    ].map((f) => (
                      <button
                        aria-pressed={filter === f.id}
                        class={filter === f.id ? "selected" : ""}
                        onClick={() => setFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <label class="sort-control">
                    <span class="sr-only">Sort tracks</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.currentTarget.value)}
                    >
                      <option value="archive">Archive order</option>
                      <option value="title">Title A–Z</option>
                      <option value="artist">Artist A–Z</option>
                    </select>
                  </label>
                </div>
                {trackRows({
                  tracks:
                    playlist || view === "liked"
                      ? shown
                      : grouped.map((g) => g[0]),
                  reorder:
                    !!playlist &&
                    playlist.owner_id === user.id &&
                    !query &&
                    sort === "archive" &&
                    filter === "all",
                })}
              </>
            )}
            <footer class="page-footer">
              <AudioLines size={16} />
              <span>THUG ARCHIVE</span>
              <span>Keep the good ones.</span>
            </footer>
          </div>
        )}
      </main>
      <nav class="mobile-nav" aria-label="Mobile navigation">
        {[
          { v: "home", n: "Listen", I: House },
          { v: "search", n: "Search", I: Search },
          { v: "browse", n: "Browse", I: Disc3 },
          { v: "uploads", n: "New", I: Upload },
          { v: "library", n: "Library", I: LibraryBig },
        ].map(({ v, n, I }) => (
          <button
            class={view === v ? "selected" : ""}
            aria-label={v === "uploads" ? "Recently uploaded" : n}
            onClick={() => navigate(v as View)}
          >
            <I size={21} />
            <span>{n}</span>
          </button>
        ))}
      </nav>
      <div class="player-dock">
        {ps.error && (
          <div class="playback-error" role="alert">
            {ps.error}
            <button
              onClick={() => {
                player.state.error = "";
                setPs({ ...player.state });
              }}
              aria-label="Dismiss playback message"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div class="mini-player">
          <button
            class="mini-track"
            onClick={() => current && setNowPlaying(true)}
            disabled={!current}
          >
            {current ? (
              <TrackArt track={current} />
            ) : (
              <div class="empty-art">
                <AudioLines />
              </div>
            )}
            <span>
              <strong>
                {current?.title || "Your next repeat is waiting."}
              </strong>
              <small>
                {current?.artist ||
                  (current
                    ? current.features.length
                      ? `With ${current.features.join(", ")}`
                      : "Thug Archive"
                    : "Pick a track to start listening")}
              </small>
            </span>
          </button>
          <div class="desktop-player-controls">
            <div class="transport">
              <IconButton
                label="Toggle shuffle"
                active={ps.shuffle}
                disabled={!current}
                onClick={() => player.toggleShuffle()}
              >
                <Shuffle size={17} />
              </IconButton>
              <IconButton
                label="Previous track"
                disabled={!current}
                onClick={() => void player.previous()}
              >
                <SkipBack fill="currentColor" size={19} />
              </IconButton>
              <IconButton
                className="player-play"
                label={ps.playing ? "Pause" : "Play"}
                disabled={!current}
                onClick={() => void player.toggle()}
              >
                {ps.playing ? (
                  <Pause fill="currentColor" size={20} />
                ) : (
                  <Play fill="currentColor" size={20} />
                )}
              </IconButton>
              <IconButton
                label="Next track"
                disabled={!current}
                onClick={() => void player.advance()}
              >
                <SkipForward fill="currentColor" size={19} />
              </IconButton>
              <IconButton
                label={`Repeat: ${ps.repeat}`}
                active={ps.repeat !== "off"}
                disabled={!current}
                onClick={() => player.cycleRepeat()}
              >
                {ps.repeat === "one" ? (
                  <Repeat1 size={17} />
                ) : (
                  <Repeat size={17} />
                )}
              </IconButton>
            </div>
            <div class="scrubber">
              <span>{formatTime(ps.position)}</span>
              <input
                aria-label="Playback position"
                type="range"
                min="0"
                max={ps.duration || 1}
                step="0.1"
                value={Math.min(ps.position, ps.duration || 1)}
                disabled={!current}
                onInput={(e) => player.seek(Number(e.currentTarget.value))}
              />
              <span>{formatTime(ps.duration || null)}</span>
            </div>
          </div>
          <div class="mini-actions">
            <button class="lyrics-shortcut" disabled={!current} onClick={() => setLyricsOpen(true)}>Lyrics</button>
            <IconButton
              label="Open queue"
              disabled={!current}
              onClick={() => setQueueOpen(true)}
            >
              <ListMusic size={21} />
            </IconButton>
            <IconButton
              className="mobile-transport"
              label={ps.playing ? "Pause" : "Play"}
              disabled={!current}
              onClick={() => void player.toggle()}
            >
              {ps.playing ? (
                <Pause fill="currentColor" />
              ) : (
                <Play fill="currentColor" />
              )}
            </IconButton>
            <IconButton
              className="mobile-transport"
              label="Next track"
              disabled={!current}
              onClick={() => void player.advance()}
            >
              <SkipForward fill="currentColor" />
            </IconButton>
            <label class="volume-control">
              <Volume2 size={17} />
              <span class="sr-only">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                defaultValue="1"
                onInput={(e) =>
                  (player.audio.volume = Number(e.currentTarget.value))
                }
              />
            </label>
          </div>
        </div>
        <div
          class="mobile-progress"
          style={{
            width: `${ps.duration ? (ps.position / ps.duration) * 100 : 0}%`,
          }}
        />
      </div>
      {notice && (
        <div class="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {menu && (
        <Modal title={menu.title} close={() => setMenu(null)}>
          <p class="muted">
            {menu.artist ||
              (menu.features.length
                ? `With ${menu.features.join(", ")}`
                : "Archive track")}
          </p>
          <div class="menu-options">
            <button
              disabled={!!roomState.snapshot && !listening.isHost}
              onClick={() => {
                player.add(menu.id, true);
                setMenu(null);
              }}
            >
              <ListPlus />
              Play next
            </button>
            <button
              onClick={() => {
                player.add(menu.id);
                setMenu(null);
              }}
            >
              <ListMusic />
              {roomState.snapshot ? "Add to shared queue" : "Add to queue"}
            </button>
            <button
              onClick={() => {
                setAddTrack(menu);
                setMenu(null);
              }}
            >
              <Plus />
              Add to playlist
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void like(menu);
                setMenu(null);
              }}
            >
              <Heart />
              {lib.likes.includes(menu.id)
                ? "Remove from liked songs"
                : "Add to liked songs"}
            </button>
            {lib.tracks.filter((t) => t.group_key === menu.group_key).length >
              1 && (
              <button
                onClick={() => {
                  setVersions(
                    lib.tracks.filter((t) => t.group_key === menu.group_key),
                  );
                  setMenu(null);
                }}
              >
                <Disc3 />
                Explore versions
              </button>
            )}
          </div>
        </Modal>
      )}
      {versions && (
        <Modal title="Explore versions" close={() => setVersions(null)}>
          <p class="muted">
            All recordings are preserved. Choose the one you want.
          </p>
          <div class="version-list">
            {versions.map((t) => (
              <div>
                <button
                  onClick={() => {
                    void player.playQueue(
                      versions.map((x) => x.id),
                      versions.indexOf(t),
                    );
                    setVersions(null);
                  }}
                >
                  <Play size={18} />
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {t.version || "Archive version"} ·{" "}
                      {formatTime(t.duration)}
                      {!t.available ? " · Import pending" : ""}
                    </small>
                  </span>
                </button>
                <IconButton
                  label={`Add ${t.title} to playlist`}
                  onClick={() => {
                    setVersions(null);
                    setAddTrack(t);
                  }}
                >
                  <Plus size={18} />
                </IconButton>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {addTrack && (
        <Modal title="Add to playlist" close={() => setAddTrack(null)}>
          <p class="muted">{addTrack.title}</p>
          <div class="menu-options">
            {myPlaylists.map((p) => (
              <button
                disabled={busy || p.track_ids.includes(addTrack.id)}
                onClick={() =>
                  void run(async () => {
                    await updatePlaylist(p, {
                      track_ids: [...p.track_ids, addTrack.id],
                    });
                    setAddTrack(null);
                  }, `Added to ${p.title}`)
                }
              >
                <ListMusic />
                <span>{p.title}</span>
                {p.track_ids.includes(addTrack.id) && <Check size={17} />}
              </button>
            ))}
            <button onClick={() => beginEdit("new")}>
              <Plus />
              Create a new playlist
            </button>
          </div>
        </Modal>
      )}
      {edit && (
        <Modal
          title={edit === "new" ? "Make a playlist" : "Edit playlist"}
          close={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (edit === "new") {
                  const p = await createPlaylist(
                    user.id,
                    playlistName,
                    addTrack ? [addTrack.id] : [],
                  );
                  setAddTrack(null);
                  navigate(`playlist:${p.id}`);
                } else
                  await updatePlaylist(edit, {
                    title: playlistName.trim(),
                    description: playlistDescription,
                  });
                setEdit(null);
              }, "Playlist saved");
            }}
          >
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={80}
                value={playlistName}
                onInput={(e) => setPlaylistName(e.currentTarget.value)}
                placeholder="Give it a name"
              />
            </label>
            {edit !== "new" && (
              <label>
                Description
                <textarea
                  maxLength={300}
                  value={playlistDescription}
                  onInput={(e) => setPlaylistDescription(e.currentTarget.value)}
                  placeholder="A few words about this rotation"
                />
              </label>
            )}
            <button
              class="primary wide"
              disabled={busy || !playlistName.trim()}
            >
              {busy
                ? "Saving…"
                : edit === "new"
                  ? "Create playlist"
                  : "Save changes"}
            </button>
          </form>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title="Delete playlist?" close={() => setDeleteTarget(null)}>
          <p>Delete “{deleteTarget.title}”? The songs stay in the archive.</p>
          <button
            class="danger wide"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await deletePlaylist(deleteTarget.id);
                setDeleteTarget(null);
                navigate("library");
              }, "Playlist deleted")
            }
          >
            Delete playlist
          </button>
          <button
            class="text-button wide"
            onClick={() => setDeleteTarget(null)}
          >
            Keep playlist
          </button>
        </Modal>
      )}
      {roomOpen && (
        <Modal
          title="Listen together"
          className="room-modal"
          close={() => setRoomOpen(false)}
        >
          {roomState.error && (
            <p class="form-error" role="alert">
              {roomState.error}
            </p>
          )}
          {roomState.snapshot ? (
            <>
              <div class="room-intro">
                <span class="room-symbol">
                  <UsersRound size={26} />
                </span>
                <p class="eyebrow">
                  {listening.isHost
                    ? "YOU’VE GOT THE AUX"
                    : "SAME TRACK. GOOD COMPANY."}
                </p>
                <h3>
                  {listening.isHost
                    ? "Your listening room."
                    : "You’re in the room."}
                </h3>
                <p class="muted">
                  {listening.isHost
                    ? "You control playback. Everyone can add to the queue."
                    : "Your host controls playback. Add something good to the queue."}
                </p>
              </div>
              <label>
                Room link
                <input
                  readOnly
                  value={
                    new URL(import.meta.env.BASE_URL, location.origin).href +
                    `#room=${roomState.snapshot.room.id}`
                  }
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <div class="room-buttons">
                <button
                  class="secondary"
                  onClick={() => {
                    const url =
                      new URL(import.meta.env.BASE_URL, location.origin).href +
                      `#room=${roomState.snapshot!.room.id}`;
                    void navigator.clipboard
                      .writeText(url)
                      .then(() => toast("Room link copied"))
                      .catch(() =>
                        toast("Select the room link above to copy it."),
                      );
                  }}
                >
                  <LinkIcon size={17} />
                  Copy link
                </button>
                <button
                  class="secondary"
                  onClick={() => void listening.syncNow()}
                >
                  <AudioLines size={17} />
                  Sync now
                </button>
              </div>
              <p class="eyebrow room-members-heading">
                IN THE ROOM · {roomState.snapshot.members.length}/10
              </p>
              <ul class="room-members">
                {roomState.snapshot.members.map((member) => (
                  <li key={member.user_id}>
                    <span class="avatar">
                      {member.display_name[0]?.toUpperCase()}
                    </span>
                    <strong>{member.display_name}</strong>
                    {member.user_id === roomState.snapshot!.room.host_id && (
                      <span class="room-host">HOST</span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                class="primary wide"
                onClick={() => {
                  setRoomOpen(false);
                  setQueueOpen(true);
                }}
              >
                <ListMusic size={18} />
                Open shared queue
              </button>
              {listening.isHost && (
                <button
                  class="secondary wide"
                  disabled={!roomState.snapshot.room.queue.length}
                  onClick={() =>
                    void (roomState.snapshot!.room.playing
                      ? player.pause()
                      : player.play())
                  }
                >
                  {roomState.snapshot.room.playing ? (
                    <Pause size={17} />
                  ) : (
                    <Play size={17} />
                  )}
                  {roomState.snapshot.room.playing ? "Pause room" : "Play room"}
                </button>
              )}
              <RoomChat
                key={`${roomState.snapshot.room.id}:${user.id}`}
                roomId={roomState.snapshot.room.id}
                userId={user.id}
              />
              <p class="room-help">
                Keep the app open for the closest sync. After an interruption,
                tap Sync now. Rooms last up to 24 hours.
              </p>
              <button
                class="text-button wide room-leave"
                disabled={roomState.busy}
                onClick={() =>
                  void listening.leave().then(() => {
                    if (!listening.state.snapshot) setRoomOpen(false);
                  })
                }
              >
                {roomState.busy
                  ? "Leaving…"
                  : listening.isHost
                    ? "End room for everyone"
                    : "Leave room"}
              </button>
            </>
          ) : (
            <>
              <div class="room-intro">
                <span class="room-symbol">
                  <UsersRound size={30} />
                </span>
                <p class="eyebrow">PASS THE AUX</p>
                <h3>One room. A shared rotation.</h3>
                <p class="muted">
                  Listen to the same songs with your friends, wherever you are.
                  Everyone needs an archive account.
                </p>
              </div>
              <button
                class="primary wide"
                disabled={roomState.busy || localPreview}
                onClick={() => void listening.start()}
              >
                <Plus size={18} />
                {roomState.busy ? "Connecting…" : "Start a room"}
              </button>
              <div class="room-divider">OR JOIN A FRIEND</div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const id = roomIdFromLink(roomLink);
                  if (!id) {
                    toast("Paste a complete room link or room code.");
                    return;
                  }
                  void listening.join(id);
                }}
              >
                <label>
                  Room link or code
                  <input
                    value={roomLink}
                    onInput={(event) => setRoomLink(event.currentTarget.value)}
                    placeholder="Paste your friend’s room link"
                    autoComplete="off"
                    spellcheck={false}
                    autoCapitalize="none"
                    required
                  />
                </label>
                <button
                  class="secondary wide"
                  disabled={roomState.busy || !roomLink.trim() || localPreview}
                >
                  <UsersRound size={18} />
                  {roomState.busy ? "Connecting…" : "Join & listen"}
                </button>
              </form>
              {listening.savedRoom && (
                <button
                  class="text-button wide"
                  disabled={roomState.busy}
                  onClick={() => void listening.join(listening.savedRoom)}
                >
                  Rejoin your last room
                </button>
              )}
              <p class="room-help">
                Up to 10 people. Only people with the link and an archive
                account can join.
                {localPreview
                  ? " Rooms are available in the signed-in app."
                  : ""}
              </p>
            </>
          )}
        </Modal>
      )}
      {queueOpen && (
        <Modal
          title={roomState.snapshot ? "Shared queue" : "Up next"}
          close={() => setQueueOpen(false)}
        >
          {roomState.snapshot && (
            <p class="muted">
              {listening.isHost
                ? "You control playback. Everyone can add songs from the ⋯ menu."
                : "Your host controls playback. Add songs from the ⋯ menu in the collection."}
            </p>
          )}
          <p class="eyebrow">
            {current?.title ? `PLAYING: ${current.title}` : "YOUR QUEUE"}
          </p>
          <div class="queue-search">
            <label for="queue-search">Search queue</label>
            <div class="queue-search-field">
              <Search size={18} aria-hidden="true" />
              <input id="queue-search" type="search" value={queueQuery}
                placeholder="Song, artist, or alternate title"
                onInput={e => setQueueQuery(e.currentTarget.value)} />
              {queueQuery && <button class="text-button" onClick={() => setQueueQuery("")}>Clear</button>}
            </div>
            <p class="muted" role="status">{queueEntries.length} {queueQuery ? "matching" : "upcoming"} {queueEntries.length === 1 ? "song" : "songs"}</p>
          </div>
          <div class="queue-list">
            {queueEntries.map(({track: t, index}) => {
              return (
                t && (
                  <div key={`${index}:${t.id}`}>
                    <button
                      disabled={!!roomState.snapshot && !listening.isHost}
                      onClick={() => void player.jump(index)}
                    >
                      <TrackArt track={t} />
                      <span>
                        <strong>{t.title}</strong>
                        <small>{t.artist || "Thug Archive"}</small>
                      </span>
                    </button>
                    <IconButton
                      label={`Remove ${t.title} from queue`}
                      disabled={!!roomState.snapshot && !listening.isHost}
                      onClick={() => player.remove(index)}
                    >
                      <X size={17} />
                    </IconButton>
                  </div>
                )
              );
            })}
            {!queueEntries.length && queueQuery && (
              <div class="empty-state"><Search size={26} /><p>No songs match your search.</p><button class="secondary" onClick={() => setQueueQuery("")}>Clear search</button></div>
            )}
            {visibleQueueIndex + 1 >= visibleQueue.length && !queueQuery && (
              <div class="empty-state">
                <ListMusic />
                <p>
                  That’s the end of the queue.
                  <br />
                  Add something good from the collection.
                </p>
              </div>
            )}
          </div>
          <button
            class="secondary wide"
            onClick={() => {
              void createPlaylist(user.id, "Saved queue", visibleQueue)
                .then(() => refresh())
                .then(() => toast("Queue saved as a playlist"))
                .catch((e) => toast(e.message));
            }}
          >
            Save queue as playlist
          </button>
        </Modal>
      )}
      {uploadsOpen && <Modal title="Uploads & review" close={() => {if(uploadBusy.current){toast("Please wait for this step to finish before closing.");return;}setUploadsOpen(false);}} className="uploads-dialog"><Uploads onPublished={() => {void refresh();toast("Song added to the library");}} onBusy={(value) => {uploadBusy.current=value;}}/></Modal>}
      {settingsOpen && (
        <Modal title="Your account" close={() => setSettingsOpen(false)}>
          <div class="account-details">
            <span class="avatar">{user.email?.[0].toUpperCase()}</span>
            <div>
              <strong>{user.email?.split("@")[0]}</strong>
              <p class="muted">
                {localPreview
                  ? "Local preview · No real account"
                  : "Invite-only archive member"}
              </p>
            </div>
          </div>
          <div class="install-card">
            <AudioLines size={28} />
            <h3>Keep it on your Home Screen.</h3>
            <p>
              Open this site in Safari, tap Share, then Add to Home Screen. Keep
              “Open as Web App” enabled if shown.
            </p>
            <small>
              Streaming needs an internet connection. Offline song downloads are
              not enabled.
            </small>
          </div>
          {uploadRole && <button class="secondary wide" onClick={() => {setSettingsOpen(false);setUploadsOpen(true);}}>Uploads & review</button>}
          <button
            class="secondary wide"
            onClick={() =>
              void refresh().then(() => toast("Library refreshed"))
            }
          >
            Refresh library
          </button>
          <button class="text-button wide" onClick={() => void signOut()}>
            <LogOut size={17} />
            Sign out
          </button>
        </Modal>
      )}
      {lyricsOpen && current && (
        <Modal title="Lyrics" close={() => setLyricsOpen(false)} className="lyrics-dialog">
          <h2 class="lyrics-song-title">{current.title}</h2>
          <div class="lyrics-playback">
            <IconButton label={ps.playing ? "Pause" : "Play"} onClick={() => void player.toggle()}>
              {ps.playing ? <Pause /> : <Play />}
            </IconButton>
            <span>{formatTime(ps.position)} / {formatTime(ps.duration || null)}</span>
          </div>
          <Lyrics key={current.id} trackId={current.id} position={ps.position}
            canSeek={!roomState.snapshot || listening.isHost}
            seek={(position) => player.seek(position)} />
        </Modal>
      )}
      {nowPlaying && current && (
        <Modal
          title="Now playing"
          close={() => setNowPlaying(false)}
          className="now-playing"
        >
          <button class="secondary wide lyrics-launch" onClick={() => { setNowPlaying(false); setLyricsOpen(true); }}>Lyrics</button>
          <div class="now-art">
            <TrackArt track={current} />
          </div>
          <div class="now-title">
            <div>
              <h2>{current.title}</h2>
              <p>
                {current.artist ||
                  (current.features.length
                    ? `With ${current.features.join(", ")}`
                    : "Thug Archive")}
              </p>
            </div>
            <IconButton
              label={
                lib.likes.includes(current.id)
                  ? "Unlike current song"
                  : "Like current song"
              }
              active={lib.likes.includes(current.id)}
              onClick={() => void like(current)}
            >
              <Heart
                fill={lib.likes.includes(current.id) ? "currentColor" : "none"}
              />
            </IconButton>
          </div>
          <div class="scrubber">
            <input
              aria-label="Now playing position"
              type="range"
              min="0"
              max={ps.duration || 1}
              step="0.1"
              value={Math.min(ps.position, ps.duration || 1)}
              onInput={(e) => player.seek(Number(e.currentTarget.value))}
            />
          </div>
          <div class="time-labels">
            <span>{formatTime(ps.position)}</span>
            <span>{formatTime(ps.duration || null)}</span>
          </div>
          <div class="transport big">
            <IconButton
              label="Toggle shuffle"
              active={ps.shuffle}
              onClick={() => player.toggleShuffle()}
            >
              <Shuffle />
            </IconButton>
            <IconButton
              label="Previous track"
              onClick={() => void player.previous()}
            >
              <SkipBack fill="currentColor" />
            </IconButton>
            <IconButton
              className="player-play"
              label={ps.playing ? "Pause" : "Play"}
              onClick={() => void player.toggle()}
            >
              {ps.playing ? (
                <Pause fill="currentColor" size={29} />
              ) : (
                <Play fill="currentColor" size={29} />
              )}
            </IconButton>
            <IconButton
              label="Next track"
              onClick={() => void player.advance()}
            >
              <SkipForward fill="currentColor" />
            </IconButton>
            <IconButton
              label={`Repeat: ${ps.repeat}`}
              active={ps.repeat !== "off"}
              onClick={() => player.cycleRepeat()}
            >
              {ps.repeat === "one" ? <Repeat1 /> : <Repeat />}
            </IconButton>
          </div>
          {ps.loading && (
            <p class="muted" role="status">
              Loading audio…
            </p>
          )}
          {ps.error && (
            <p class="form-error" role="alert">
              {ps.error}
            </p>
          )}

          <div class="now-footer">
            <span class="eyebrow">FROM YOUR ARCHIVE</span>
            <IconButton
              label="Open queue"
              onClick={() => {
                setNowPlaying(false);
                setQueueOpen(true);
              }}
            >
              <ListMusic />
            </IconButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

render(<App />, document.getElementById("app")!);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => {});
  });
