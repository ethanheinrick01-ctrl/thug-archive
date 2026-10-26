import { audioUrls, recordPlay } from "./data";
import { shuffled, type Track } from "./model";
import type { ListeningRoom, RoomCommand } from "./room-model";

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
  roomCommand: ((command: RoomCommand) => Promise<void>) | null = null;
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
  private sourceId = "";
  private gesturePriming = false;
  private unlocked = false;
  private roomEntry = "";
  constructor() {
    this.audio.preload = "metadata";
    this.audio.addEventListener("playing", () => {
      this.unlocked = true;
      if (this.gesturePriming) return;
      this.state.playing = true;
      this.state.loading = false;
      this.state.error = "";
      this.emit();
    });
    this.audio.addEventListener("pause", () => {
      if (this.gesturePriming) return;
      this.state.playing = false;
      this.emit();
    });
    this.audio.addEventListener("waiting", () => {
      if (this.gesturePriming) return;
      this.state.loading = true;
      this.emit();
    });
    this.audio.addEventListener("timeupdate", () => {
      if (this.gesturePriming) return;
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
      if (this.gesturePriming) return;
      this.state.duration = this.audio.duration;
      this.positionMetadata();
      this.emit();
    });
    this.audio.addEventListener("ended", () => {
      if (this.gesturePriming) return;
      void this.advance(true);
    });
    this.audio.addEventListener("error", () => {
      if (this.gesturePriming) return;
      this.fail(
        "This audio could not load. Check your connection and tap play to retry.",
      );
    });
    if ("mediaSession" in navigator) {
      const actions: Partial<
        Record<MediaSessionAction, MediaSessionActionHandler>
      > = {
        play: () => {
          void this.play();
        },
        pause: () => void this.pause(),
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
    if (this.storageKey && !this.roomCommand) {
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
    this.gesturePriming = false;
    this.loadToken++;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.signed.clear();
    this.sourceId = "";
    this.roomEntry = "";
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
    if (this.roomCommand)
      return this.roomCommand({
        type: "playQueue",
        ids: available,
        start: Math.max(0, available.indexOf(wanted)),
        shuffle,
      });
    this.original = available;
    this.state.shuffle = shuffle;
    this.state.queue = shuffle ? shuffled(available) : available;
    this.state.index = shuffle
      ? 0
      : Math.max(0, this.state.queue.indexOf(wanted));
    await this.load();
  }
  private async load(
    position: () => number = () => 0,
    shouldPlay = true,
    resetHistory = true,
  ) {
    this.gesturePriming = false;
    const token = ++this.loadToken;
    const track = this.current;
    if (!track) return;
    this.audio.pause();
    this.state.loading = true;
    this.state.position = 0;
    this.state.duration = track.duration || 0;
    this.state.error = "";
    if (resetHistory) this.playRecorded = false;
    this.emit();
    try {
      await this.prime([track.id]);
      if (token !== this.loadToken) return;
      const signed = this.signed.get(track.id);
      if (!signed) throw new Error("This track has not been uploaded yet.");
      this.sourceId = track.id;
      this.audio.addEventListener(
        "loadedmetadata",
        () => {
          if (token !== this.loadToken) return;
          this.seekLocal(position());
        },
        { once: true },
      );
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
      if (shouldPlay) await this.audio.play();
      else {
        this.audio.load();
        this.state.loading = false;
        this.emit();
      }
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
    if (this.roomCommand)
      return this.roomCommand({ type: this.state.playing ? "pause" : "play" });
    if (this.state.playing) {
      this.audio.pause();
      return;
    }
    await this.play();
  }
  async play() {
    if (this.roomCommand) return this.roomCommand({ type: "play" });
    if (!this.audio.getAttribute("src") || this.state.error) {
      if (this.state.error && this.current) this.signed.delete(this.current.id);
      await this.load();
      return;
    }
    try {
      await this.audio.play();
    } catch {
      this.fail("Tap play again to resume.");
    }
  }
  async pause() {
    if (this.roomCommand) return this.roomCommand({ type: "pause" });
    this.audio.pause();
  }
  async advance(ended = false) {
    if (this.roomCommand) return this.roomCommand({ type: "next", ended });
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
    if (this.roomCommand) return this.roomCommand({ type: "previous" });
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    this.state.index = Math.max(0, this.state.index - 1);
    await this.load();
  }
  seek(position: number) {
    if (this.roomCommand) {
      void this.roomCommand({ type: "seek", position });
      return;
    }
    this.seekLocal(position);
  }
  private seekLocal(position: number) {
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
    if (this.roomCommand) {
      void this.roomCommand({ type: "add", id, next });
      return;
    }
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
    if (this.roomCommand) {
      void this.roomCommand({ type: "remove", index });
      return;
    }
    if (index <= this.state.index) return;
    this.state.queue.splice(index, 1);
    this.original = [...this.state.queue];
    this.emit();
  }
  async jump(index: number) {
    if (this.roomCommand) return this.roomCommand({ type: "jump", index });
    this.state.index = index;
    await this.load();
  }
  toggleShuffle() {
    if (this.roomCommand) {
      void this.roomCommand({ type: "shuffle" });
      return;
    }
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
    if (this.roomCommand) {
      void this.roomCommand({ type: "repeat" });
      return;
    }
    this.state.repeat =
      this.state.repeat === "off"
        ? "all"
        : this.state.repeat === "all"
          ? "one"
          : "off";
    this.emit();
  }
  unlockForRoom(playCurrent = false) {
    // Run directly inside Join/Sync's tap, before any network await. Reuse the
    // same audio element so Safari can play subsequent room updates.
    if (playCurrent && this.audio.getAttribute("src") && !this.gesturePriming) {
      void this.audio.play().catch(() => {});
      return;
    }
    if (this.unlocked) return;
    const token = ++this.loadToken;
    this.gesturePriming = true;
    this.sourceId = "";
    const bytes = new Uint8Array(172);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) =>
      [...value].forEach((char, index) => {
        bytes[offset + index] = char.charCodeAt(0);
      });
    text(0, "RIFF");
    view.setUint32(4, 164, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 8000, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    text(36, "data");
    view.setUint32(40, 128, true);
    bytes.fill(128, 44);
    this.audio.src =
      "data:audio/wav;base64," + btoa(String.fromCharCode(...bytes));
    void this.audio
      .play()
      .then(() => {
        this.unlocked = true;
        if (token !== this.loadToken) return;
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
        this.gesturePriming = false;
      })
      .catch(() => {
        if (token === this.loadToken) this.gesturePriming = false;
      });
  }
  async applyRoom(room: ListeningRoom, position: () => number) {
    const token = ++this.loadToken;
    const failed = !!this.state.error || !!this.audio.error;
    const entry = `${room.id}:${room.queue_index}:${room.queue[room.queue_index] || ""}`;
    if (
      entry !== this.roomEntry ||
      (this.audio.ended && room.playing && room.position === 0)
    )
      this.playRecorded = false;
    this.roomEntry = entry;
    this.state.error = "";
    this.state.queue = [...room.queue];
    this.state.index = room.queue_index;
    this.state.shuffle = room.shuffle;
    this.state.repeat = room.repeat_mode;
    if (!this.current) {
      this.loadToken++;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.sourceId = "";
      this.state.position = this.state.duration = 0;
      this.state.loading = this.state.playing = false;
      this.emit();
      return;
    }
    if (
      failed ||
      this.sourceId !== this.current.id ||
      !this.audio.getAttribute("src")
    ) {
      if (failed) this.signed.delete(this.current.id);
      await this.load(position, room.playing, false);
      return;
    }
    if (this.audio.readyState === 0)
      this.audio.addEventListener(
        "loadedmetadata",
        () => {
          if (token === this.loadToken) this.seekLocal(position());
        },
        { once: true },
      );
    if (!room.playing || Math.abs(this.audio.currentTime - position()) > 1.25)
      this.seekLocal(position());
    if (room.playing && this.audio.paused) {
      try {
        await this.audio.play();
      } catch {
        if (token === this.loadToken)
          this.fail("Tap Sync now to start listening with the room.");
      }
    } else if (!room.playing && !this.audio.paused) this.audio.pause();
    if (!room.playing) this.state.loading = false;
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
