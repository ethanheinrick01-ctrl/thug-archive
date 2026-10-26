import type { RealtimeChannel } from "@supabase/supabase-js";
import { localPreview, supabase } from "./data";
import { shuffled } from "./model";
import { player } from "./player";
import {
  terminalRoomError,
  roomPosition,
  type ListeningRoom,
  type RoomCommand,
  type RoomSnapshot,
} from "./room-model";

interface RoomState {
  snapshot: RoomSnapshot | null;
  connected: boolean;
  busy: boolean;
  error: string;
}
class ListeningTogether {
  state: RoomState = {
    snapshot: null,
    connected: false,
    busy: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private userId = "";
  private generation = 0;
  private offset = 0;
  private refreshing = false;
  private refreshAgain = false;
  private commands: Promise<void> = Promise.resolve();
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSeek: Extract<RoomCommand, { type: "seek" }> | null = null;
  notify: (message: string) => void = () => {};
  get isHost() {
    return this.state.snapshot?.room.host_id === this.userId;
  }
  get savedRoom() {
    try {
      return localStorage.getItem(`thug-archive-room-v1:${this.userId}`) || "";
    } catch {
      return "";
    }
  }
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };
  private emit() {
    for (const callback of this.listeners) callback();
  }
  setUser(id: string) {
    if (id === this.userId) return;
    this.detach(false);
    this.userId = id;
  }
  private async request(
    action: string,
    id: string | null,
    params: object = {},
  ): Promise<RoomSnapshot> {
    if (!supabase || localPreview)
      throw new Error("Listening rooms are available in the signed-in app.");
    const start = Date.now();
    const { data, error } = await supabase.rpc("listening_room", {
      p_action: action,
      p_room: id,
      p_params: params,
    });
    if (error)
      throw Object.assign(
        new Error(
          error.message ||
            "Couldn’t reach the room. Check your connection and try again.",
        ),
        { code: error.code },
      );
    if (data?.server_now)
      this.offset = Date.parse(data.server_now) - (start + Date.now()) / 2;
    return data as RoomSnapshot;
  }
  private fail(error: unknown) {
    this.state.error =
      (error as Error)?.message || "Couldn’t update the room. Try again.";
    this.notify(this.state.error);
    this.emit();
  }
  private async accept(snapshot: RoomSnapshot, force = false) {
    const previous = this.state.snapshot;
    if (previous && previous.room.id !== snapshot.room.id) return;
    if (previous && snapshot.room.revision < previous.room.revision) return;
    if (
      snapshot.room.ended_at ||
      Date.parse(snapshot.room.expires_at) <= Date.now() + this.offset
    ) {
      this.detach(true);
      this.notify(
        "This listening room has ended. Your personal queue is ready.",
      );
      return;
    }
    const changed =
      !previous || snapshot.room.revision !== previous.room.revision;
    this.state.snapshot = snapshot;
    if (this.channel?.state === "joined") this.state.connected = true;
    this.state.error = "";
    this.emit();
    if (changed || force)
      void this.apply(snapshot.room).catch((error) => this.fail(error));
  }
  private async apply(room: ListeningRoom) {
    const duration =
      player.tracks.get(room.queue[room.queue_index])?.duration || 0;
    await player.applyRoom(room, () =>
      roomPosition(room, Date.now() + this.offset, duration),
    );
  }
  private attach(snapshot: RoomSnapshot) {
    const id = snapshot.room.id;
    const generation = this.generation;
    player.roomCommand = (command) => this.command(command);
    try {
      localStorage.setItem(`thug-archive-room-v1:${this.userId}`, id);
    } catch {}
    void this.accept(snapshot, true);
    void this.subscribeRoom(id, generation).catch((error) => this.fail(error));
    this.timer = setInterval(() => {
      const room = this.state.snapshot?.room;
      if (
        !room ||
        document.visibilityState === "hidden" ||
        player.state.loading ||
        player.state.error ||
        this.pendingSeek
      )
        return;
      if (Date.parse(room.expires_at) <= Date.now() + this.offset) {
        this.detach(true);
        this.notify(
          "This room expired. Start a new one to keep listening together.",
        );
        return;
      }
      void this.apply(room);
    }, 2000);
    this.poll = setInterval(() => {
      if (document.visibilityState === "visible") void this.refresh();
    }, 30_000);
    window.addEventListener("online", this.resume);
    window.addEventListener("pageshow", this.resume);
    document.addEventListener("visibilitychange", this.resume);
  }
  private async subscribeRoom(id: string, generation: number) {
    const { data } = await supabase!.auth.getSession();
    if (generation !== this.generation || !data.session) return;
    await supabase!.realtime.setAuth(data.session.access_token);
    if (generation !== this.generation) return;
    this.channel = supabase!
      .channel(`listening:${id}:${this.userId}`)
      .on("system", {}, (payload) => {
        if (generation !== this.generation) return;
        if (
          payload.extension === "postgres_changes" &&
          payload.status === "ok"
        ) {
          this.state.connected = true;
          this.emit();
          void this.refresh(true);
        }
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "listening_rooms",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (generation !== this.generation || !this.state.snapshot) return;
          void this.accept({
            ...this.state.snapshot,
            room: payload.new as ListeningRoom,
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "listening_room_members",
          filter: `room_id=eq.${id}`,
        },
        () => {
          if (generation === this.generation) void this.refresh();
        },
      )
      .subscribe((status) => {
        if (generation !== this.generation) return;
        if (status !== "SUBSCRIBED") this.state.connected = false;
        this.emit();
        if (status === "SUBSCRIBED") void this.refresh();
      });
  }
  private resume = () => {
    if (document.visibilityState === "visible") void this.refresh(true);
  };
  async refresh(force = false) {
    const id = this.state.snapshot?.room.id;
    if (!id) return;
    if (this.refreshing) {
      this.refreshAgain = true;
      return;
    }
    const generation = this.generation;
    this.refreshing = true;
    try {
      const snapshot = await this.request("get", id);
      if (generation === this.generation) await this.accept(snapshot, force);
    } catch (error) {
      if (generation === this.generation) {
        if (terminalRoomError(error)) {
          this.detach(true);
          this.notify(
            "You’re no longer in this room. Your personal queue is ready.",
          );
          return;
        }
        this.state.connected = false;
        this.state.error =
          "Reconnecting to the room… Check your connection if this continues.";
        this.emit();
      }
    } finally {
      if (generation === this.generation) {
        this.refreshing = false;
        if (this.refreshAgain) {
          this.refreshAgain = false;
          void this.refresh(true);
        }
      }
    }
  }
  async start() {
    if (this.state.snapshot || this.state.busy) return;
    player.unlockForRoom();
    const generation = this.generation;
    this.state.busy = true;
    this.state.error = "";
    this.emit();
    try {
      const snapshot = await this.request("create", null, {
        queue: player.state.queue,
        index: player.state.index,
        position: player.audio.currentTime || 0,
        playing: player.state.playing,
        shuffle: player.state.shuffle,
        repeat_mode: player.state.repeat,
      });
      if (generation === this.generation) this.attach(snapshot);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (generation === this.generation) {
        this.state.busy = false;
        this.emit();
      }
    }
  }
  async join(id: string) {
    if (this.state.snapshot || this.state.busy) return;
    player.unlockForRoom();
    const generation = this.generation;
    this.state.busy = true;
    this.state.error = "";
    this.emit();
    try {
      const snapshot = await this.request("join", id);
      if (generation === this.generation) {
        this.attach(snapshot);
        if (new URLSearchParams(location.hash.slice(1)).has("room"))
          history.replaceState(null, "", location.pathname + location.search);
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (generation === this.generation) {
        this.state.busy = false;
        this.emit();
      }
    }
  }
  async syncNow() {
    player.unlockForRoom(!!this.state.snapshot?.room.playing);
    await this.refresh(true);
  }
  private command(command: RoomCommand): Promise<void> {
    const id = this.state.snapshot?.room.id;
    if (!id) return Promise.resolve();
    if (!this.isHost && command.type !== "add") {
      if (command.type === "next" && command.ended) return Promise.resolve();
      if (
        (command.type === "toggle" || command.type === "play") &&
        (player.state.error || player.audio.paused)
      )
        return this.syncNow();
      this.notify(
        "The host controls playback. Use ⋯ → Add to shared queue to suggest a song.",
      );
      return Promise.resolve();
    }
    if (command.type === "seek") {
      if (Number.isFinite(player.audio.duration))
        player.audio.currentTime = Math.min(
          Math.max(command.position, 0),
          player.audio.duration,
        );
      this.pendingSeek = command;
      if (this.seekTimer) clearTimeout(this.seekTimer);
      this.seekTimer = setTimeout(() => {
        const pending = this.pendingSeek;
        this.pendingSeek = null;
        this.seekTimer = null;
        if (pending) void this.enqueue(pending);
      }, 180);
      return Promise.resolve();
    }
    if (this.pendingSeek) {
      if (this.seekTimer) clearTimeout(this.seekTimer);
      void this.enqueue(this.pendingSeek);
      this.pendingSeek = null;
      this.seekTimer = null;
    }
    return this.enqueue(command);
  }
  private enqueue(command: RoomCommand): Promise<void> {
    const id = this.state.snapshot?.room.id;
    const generation = this.generation;
    const anchor = this.state.snapshot?.room.anchor_at;
    if (!id) return Promise.resolve();
    this.commands = this.commands
      .then(async () => {
        if (generation !== this.generation) return;
        if (
          command.type === "next" &&
          command.ended &&
          (!this.state.snapshot?.room.playing ||
            this.state.snapshot.room.anchor_at !== anchor)
        )
          return;
        let params: object = command;
        if (command.type === "playQueue") {
          const queue = command.shuffle ? shuffled(command.ids) : command.ids;
          params = {
            queue,
            index: command.shuffle ? 0 : command.start,
            shuffle: command.shuffle,
          };
        }
        if (command.type === "next" && command.ended)
          params = { ...command, expected_anchor: anchor };
        const snapshot = await this.request(command.type, id, params);
        if (generation !== this.generation) return;
        await this.accept(snapshot, true);
        if (command.type === "add") {
          const { queue, queue_index } = snapshot.room;
          const index = command.next && this.isHost
            ? queue_index + 1
            : queue.length - 1;
          const ahead = Math.max(0, index - queue_index - 1);
          this.notify(`Added to shared queue · ${ahead ? `${ahead} songs ahead` : "up next"}`);
        }
      })
      .catch((error) => {
        if (generation === this.generation) this.fail(error);
      });
    return this.commands;
  }
  async leave() {
    const id = this.state.snapshot?.room.id;
    if (!id) return;
    this.state.busy = true;
    this.emit();
    try {
      await this.request("leave", id);
    } catch (error) {
      const terminal = terminalRoomError(error);
      this.detach(true, terminal);
      this.notify(
        terminal
          ? "You’re out of this room. Your personal queue is ready."
          : "Left on this device. Rejoin when you’re online to update the room.",
      );
      return;
    } finally {
      this.state.busy = false;
      this.emit();
    }
    this.detach(true);
  }
  private detach(restoreQueue: boolean, forgetSavedRoom = true) {
    const hadRoom = !!this.state.snapshot;
    this.generation++;
    if (this.channel) void supabase?.removeChannel(this.channel);
    this.channel = null;
    if (this.timer) clearInterval(this.timer);
    if (this.poll) clearInterval(this.poll);
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = null;
    this.pendingSeek = null;
    this.timer = this.poll = null;
    window.removeEventListener("online", this.resume);
    window.removeEventListener("pageshow", this.resume);
    document.removeEventListener("visibilitychange", this.resume);
    player.roomCommand = null;
    this.refreshing = false;
    this.refreshAgain = false;
    this.commands = Promise.resolve();
    this.state = { snapshot: null, connected: false, busy: false, error: "" };
    if (hadRoom) {
      try {
        if (forgetSavedRoom)
          localStorage.removeItem(`thug-archive-room-v1:${this.userId}`);
      } catch {}
      const tracks = [...player.tracks.values()];
      player.reset();
      if (restoreQueue) player.connect(tracks, this.userId);
    }
    this.emit();
  }
}
export const listening = new ListeningTogether();
