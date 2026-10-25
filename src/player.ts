import { audioUrls, recordPlay } from "./data";
import { shuffled, type Track } from "./model";

export interface PlayerState {
  queue: string[];
  index: number;
  playing: boolean;
  loading: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  position: number;
  duration: number;
  error: string;
}
export class ArchivePlayer {
  readonly audio = new Audio();
  state: PlayerState = {
    queue: [],
    index: 0,
    playing: false,
    loading: false,
    shuffle: false,
    repeat: "off",
    position: 0,
    duration: 0,
    error: "",
  };
  tracks = new Map<string, Track>();
  private listeners = new Set<() => void>();
  private signed = new Map<string, { url: string; until: number }>();
  private original: string[] = [];
  private loadToken = 0;
  private playRecorded = false;
  private storageKey = "";
  constructor() {
    this.audio.preload = "metadata";
    this.audio.addEventListener("playing", () => {
      this.state.playing = true;
      this.state.loading = false;
      this.state.error = "";
      this.emit();
    });
    this.audio.addEventListener("pause", () => {
      this.state.playing = false;
      this.emit();
    });
    this.audio.addEventListener("waiting", () => {
      this.state.loading = true;
      this.emit();
    });
    this.audio.addEventListener("timeupdate", () => {
      this.state.position = this.audio.currentTime;
      if (this.audio.currentTime >= 5 && !this.playRecorded && this.current) {
        const id = this.current.id;
        this.playRecorded = true;
        void recordPlay(id)
          .then(() =>
            window.dispatchEvent(
              new CustomEvent("archive-history-updated", { detail: id }),
            ),
          )
          .catch(() => {});
      }
      this.emit();
      this.positionMetadata();
    });
    this.audio.addEventListener("loadedmetadata", () => {
      this.state.duration = this.audio.duration;
      this.positionMetadata();
      this.emit();
    });
    this.audio.addEventListener("ended", () => {
      void this.advance(true);
    });
    this.audio.addEventListener("error", () => {
      this.fail(
        "This audio could not load. Check your connection and tap play to retry.",
      );
    });
    if ("mediaSession" in navigator) {
      const actions: Partial<
        Record<MediaSessionAction, MediaSessionActionHandler>
      > = {
        play: () => {
          if (this.audio.paused) void this.toggle();
        },
        pause: () => this.audio.pause(),
        nexttrack: () => {
          void this.advance();
        },
        previoustrack: () => {
          void this.previous();
        },
        seekto: (details) => this.seek(details.seekTime ?? 0),
      };
      for (const [action, handler] of Object.entries(actions)) {
        try {
          navigator.mediaSession.setActionHandler(
            action as MediaSessionAction,
            handler!,
          );
        } catch {
          /* Unsupported OS control. */
        }
      }
    }
  }
  get current() {
    return this.tracks.get(this.state.queue[this.state.index]);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    for (const fn of this.listeners) fn();
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = this.state.playing
        ? "playing"
        : "paused";
    if (this.storageKey) {
      try {
        localStorage.setItem(
          this.storageKey,
          JSON.stringify({
            queue: this.state.queue,
            index: this.state.index,
            shuffle: this.state.shuffle,
            repeat: this.state.repeat,
          }),
        );
      } catch {
        /* Playback works without local persistence. */
      }
    }
  }
  connect(tracks: Track[], userId: string) {
    this.tracks = new Map(tracks.map((t) => [t.id, t]));
    const key = `thug-archive-queue-v1:${userId}`;
    if (key !== this.storageKey) {
      this.reset();
      this.storageKey = key;
      try {
        const saved = JSON.parse(localStorage.getItem(key) || "{}");
        this.state.queue = (saved.queue || []).filter((id: string) =>
          this.tracks.has(id),
        );
        this.original = [...this.state.queue];
        this.state.index = Math.min(
          Math.max(saved.index || 0, 0),
          Math.max(this.state.queue.length - 1, 0),
        );
        this.state.shuffle = !!saved.shuffle;
        this.state.repeat = ["off", "all", "one"].includes(saved.repeat)
          ? saved.repeat
          : "off";
      } catch {
        /* Ignore invalid saved queue. */
      }
      this.emit();
    }
  }
  reset() {
    this.loadToken++;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.signed.clear();
    this.storageKey = "";
    this.state = {
      queue: [],
      index: 0,
      playing: false,
      loading: false,
      shuffle: false,
      repeat: "off",
      position: 0,
      duration: 0,
      error: "",
    };
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
    this.emit();
  }
  private fail(message: string) {
    this.state.loading = false;
    this.state.playing = false;
    this.state.error = message;
    this.emit();
  }
  private async prime(ids: string[]) {
    const needed = [...new Set(ids)].filter(
      (id) =>
        this.tracks.get(id)?.available &&
        (!this.signed.has(id) || this.signed.get(id)!.until < Date.now()),
    );
    if (!needed.length) return;
    const urls = await audioUrls(needed.slice(0, 50));
    for (const [id, url] of Object.entries(urls))
      this.signed.set(id, { url, until: Date.now() + 55 * 60_000 });
  }
  async playQueue(ids: string[], start = 0, shuffle = false) {
    const available = ids.filter((id) => this.tracks.get(id)?.available);
    if (!available.length) {
      this.fail(
        "These songs are still being imported. Your playlists can already be organized.",
      );
      return;
    }
    if (!shuffle && !this.tracks.get(ids[start])?.available) {
      this.fail(
        "This song is still being imported. Choose a song marked ready to play.",
      );
      return;
    }
    const wanted = ids[start];
    this.original = available;
    this.state.shuffle = shuffle;
    this.state.queue = shuffle ? shuffled(available) : available;
    this.state.index = shuffle
      ? 0
      : Math.max(0, this.state.queue.indexOf(wanted));
    await this.load();
  }
  private async load() {
    const token = ++this.loadToken;
    const track = this.current;
    if (!track) return;
    this.audio.pause();
    this.state.loading = true;
    this.state.position = 0;
    this.state.duration = track.duration || 0;
    this.state.error = "";
    this.playRecorded = false;
    this.emit();
    try {
      await this.prime([track.id]);
      if (token !== this.loadToken) return;
      const signed = this.signed.get(track.id);
      if (!signed) throw new Error("This track has not been uploaded yet.");
      this.audio.src = signed.url;
      if ("mediaSession" in navigator)
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist || "Thug Archive",
          album: "Thug Archive",
          artwork: [
            {
              src: new URL(
                `${import.meta.env.BASE_URL}icon-512.png`,
                location.origin,
              ).href,
              sizes: "512x512",
              type: "image/png",
            },
          ],
        });
      await this.audio.play();
      void this.prime(
        this.state.queue.slice(this.state.index + 1, this.state.index + 11),
      ).catch(() => {});
    } catch (error) {
      if (token === this.loadToken)
        this.fail(
          error instanceof Error && error.name === "NotAllowedError"
            ? "Tap play to continue listening."
            : (error as Error).message,
        );
    }
  }
  async toggle() {
    if (this.state.playing) {
      this.audio.pause();
      return;
    }
    if (!this.audio.getAttribute("src") || this.state.error) {
      await this.load();
      return;
    }
    try {
      await this.audio.play();
    } catch {
      this.fail("Tap play again to resume.");
    }
  }
  async advance(ended = false) {
    if (ended && this.state.repeat === "one") {
      this.seek(0);
      await this.toggle();
      return;
    }
    if (this.state.index + 1 >= this.state.queue.length) {
      if (this.state.repeat !== "all") {
        this.state.playing = false;
        this.state.loading = false;
        this.emit();
        return;
      }
      this.state.index = 0;
    } else this.state.index++;
    await this.load();
  }
  async previous() {
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    this.state.index = Math.max(0, this.state.index - 1);
    await this.load();
  }
  seek(position: number) {
    if (Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.min(
        Math.max(position, 0),
        this.audio.duration,
      );
      this.state.position = this.audio.currentTime;
      this.emit();
    }
  }
  add(id: string, next = false) {
    if (!this.tracks.get(id)?.available) {
      this.fail("This song is still being imported.");
      return;
    }
    if (next) this.state.queue.splice(this.state.index + 1, 0, id);
    else this.state.queue.push(id);
    this.original = [...this.state.queue];
    this.emit();
    void this.prime([id]).catch(() => {});
  }
  remove(index: number) {
    if (index <= this.state.index) return;
    this.state.queue.splice(index, 1);
    this.original = [...this.state.queue];
    this.emit();
  }
  async jump(index: number) {
    this.state.index = index;
    await this.load();
  }
  toggleShuffle() {
    const current = this.current?.id;
    this.state.shuffle = !this.state.shuffle;
    this.state.queue = this.state.shuffle
      ? [
          current!,
          ...shuffled(
            this.state.queue.filter((_, i) => i !== this.state.index),
          ),
        ].filter(Boolean)
      : [...this.original];
    this.state.index = Math.max(0, this.state.queue.indexOf(current!));
    this.emit();
  }
  cycleRepeat() {
    this.state.repeat =
      this.state.repeat === "off"
        ? "all"
        : this.state.repeat === "all"
          ? "one"
          : "off";
    this.emit();
  }
  private positionMetadata() {
    if (
      "mediaSession" in navigator &&
      navigator.mediaSession.setPositionState &&
      Number.isFinite(this.audio.duration) &&
      this.audio.duration > 0
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          position: Math.min(this.audio.currentTime, this.audio.duration),
          playbackRate: 1,
        });
      } catch {
        /* OS may not support position state. */
      }
    }
  }
}
export const player = new ArchivePlayer();
