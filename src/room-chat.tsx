import { useEffect, useRef, useState } from "preact/hooks";
import { MessageCircle, Send } from "lucide-preact";
import { supabase } from "./data";
import {
  mergeRoomMessages,
  roomMessageError,
  type RoomMessage,
} from "./room-chat-model";

export function RoomChat({
  roomId,
  userId,
}: {
  roomId: string;
  userId: string;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const refresh = useRef<() => void>(() => {});
  const alive = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let disposed = false;
    let channel: ReturnType<typeof client.channel> | null = null;
    let request = 0;
    alive.current = true;
    const load = async () => {
      const sequence = ++request;
      const { data, error } = await client
        .from("listening_room_messages")
        .select("id,room_id,user_id,display_name,body,created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100);
      if (disposed || sequence !== request) return;
      setLoading(false);
      if (error) {
        setError(roomMessageError(error));
        return;
      }
      setMessages((previous) =>
        mergeRoomMessages(roomId, previous, data || []),
      );
      setError("");
    };
    refresh.current = () => {
      void load();
    };
    void load();
    void (async () => {
      const { data } = await client.auth.getSession();
      if (disposed || !data.session) return;
      await client.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      channel = client
        .channel(`room-chat:${roomId}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "listening_room_messages",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (disposed) return;
            setMessages((previous) =>
              mergeRoomMessages(roomId, previous, [payload.new as RoomMessage]),
            );
          },
        )
        .subscribe((status) => {
          if (disposed) return;
          setConnected(status === "SUBSCRIBED");
          // Fetch again after subscribing to cover messages sent during setup/recovery.
          if (status === "SUBSCRIBED") void load();
        });
    })().catch(() => {
      if (!disposed)
        setError("Chat is reconnecting. You can still retry loading messages.");
    });
    const resume = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(resume, 30_000);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
      if (channel) void client.removeChannel(channel);
    };
  }, [roomId, userId]);

  useEffect(() => {
    if (follow.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  async function send(event: SubmitEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || !supabase) return;
    if (Array.from(body).length > 1000) {
      setError("Keep each message to 1,000 characters.");
      return;
    }
    // Keep the same id for retries after an uncertain response.
    if (pending.current?.body !== body)
      pending.current = { id: crypto.randomUUID(), body };
    const message = pending.current;
    setSending(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("send_room_message", {
        p_room: roomId,
        p_id: message.id,
        p_body: body,
      });
      if (error) throw error;
      if (!alive.current) return;
      follow.current = true;
      setMessages((previous) =>
        mergeRoomMessages(roomId, previous, [data as RoomMessage]),
      );
      setDraft("");
      pending.current = null;
    } catch (error) {
      if (alive.current) setError(roomMessageError(error));
    } finally {
      if (alive.current) setSending(false);
    }
  }

  return (
    <section class="room-chat" aria-labelledby="room-chat-heading">
      <div class="room-chat-heading">
        <h3 id="room-chat-heading">
          <MessageCircle size={18} /> Room chat
        </h3>
        <span>{connected ? "Live" : "Connecting…"}</span>
      </div>
      <div
        ref={log}
        class="room-chat-log"
        role="log"
        aria-label="Room messages"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          const element = log.current!;
          follow.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            60;
        }}
      >
        {!messages.length && (
          <p class="room-chat-empty">
            {loading
              ? "Loading messages…"
              : "A good song deserves a reaction. Say something."}
          </p>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            class={`room-chat-message ${message.user_id === userId ? "is-own" : ""}`}
          >
            <div>
              <strong>
                {message.user_id === userId ? "You" : message.display_name}
              </strong>
              <time dateTime={message.created_at}>
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <p>{message.body}</p>
          </article>
        ))}
      </div>
      {error && (
        <div class="room-chat-error" role="alert">
          <p>{error}</p>
          <button
            class="text-button"
            type="button"
            onClick={() => refresh.current()}
          >
            Reload messages
          </button>
        </div>
      )}
      <form class="room-chat-compose" onSubmit={(event) => void send(event)}>
        <label htmlFor="room-chat-draft">Message the room</label>
        <div>
          <input
            id="room-chat-draft"
            value={draft}
            disabled={sending}
            maxLength={1000}
            autoComplete="off"
            placeholder="Talk your shit…"
            onInput={(event) => setDraft(event.currentTarget.value)}
          />
          <button
            class="primary"
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label={sending ? "Sending message" : "Send message"}
          >
            <Send size={18} />
            <span>{sending ? "Sending…" : "Send"}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
