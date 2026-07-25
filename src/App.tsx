import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const ME_ID = "00000000-0000-0000-0000-000000000000";

interface User {
  id: string;
  name: string;
  avatar: string;
}

interface Conversation {
  id: string;
  user_id: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${Math.floor(diffMin)}m`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.floor(diffHr)}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: c }, { data: m }] = await Promise.all([
        supabase.from("users").select("*"),
        supabase.from("conversations").select("*"),
        supabase.from("messages").select("*").order("created_at", { ascending: true }),
      ]);
      setUsers(u ?? []);
      setConversations(c ?? []);
      setMessages(m ?? []);
      setActiveId(c?.[0]?.id ?? "");
      setLoading(false);
    })();
  }, []);

  const userById: Record<string, User> = {};
  users.forEach((u) => (userById[u.id] = u));

  const activeConversation = conversations.find((c) => c.id === activeId);
  const activeUser = activeConversation ? userById[activeConversation.user_id] : undefined;
  const activeMessages = messages.filter((m) => m.conversation_id === activeId);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activeConversation) return;
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeConversation.id,
        sender_id: ME_ID,
        text,
      })
      .select()
      .single();
    if (error || !data) return;
    setMessages((prev) => [...prev, data]);
    setDraft("");
  };

  if (loading) {
    return <div className="loading">Loading chats...</div>;
  }

  const lastMessageFor = (cid: string): Message | undefined => {
    const filtered = messages.filter((m) => m.conversation_id === cid);
    return filtered[filtered.length - 1];
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Chats</h1>
        </div>
        <ul className="conversation-list">
          {conversations.map((c) => {
            const user = userById[c.user_id];
            const last = lastMessageFor(c.id);
            const isActive = c.id === activeId;
            return (
              <li
                key={c.id}
                className={`conversation-item ${isActive ? "active" : ""}`}
                onClick={() => setActiveId(c.id)}
              >
                <div className="avatar">{user?.avatar ?? "?"}</div>
                <div className="conversation-content">
                  <div className="conversation-top">
                    <span className="conversation-name">{user?.name ?? "Unknown"}</span>
                    <span className="conversation-time">{last ? formatTime(last.created_at) : ""}</span>
                  </div>
                  <span className="conversation-last">{last?.text ?? "No messages yet"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="chat">
        {activeUser ? (
          <>
            <header className="chat-header">
              <div className="avatar">{activeUser.avatar}</div>
              <div>
                <h2>{activeUser.name}</h2>
                <span className="status">Active now</span>
              </div>
            </header>

            <section className="message-list">
              {activeMessages.map((m) => {
                const mine = m.sender_id === ME_ID;
                return (
                  <div key={m.id} className={`message ${mine ? "mine" : "theirs"}`}>
                    <div className="bubble">{m.text}</div>
                    <div className="message-time">{formatTime(m.created_at)}</div>
                  </div>
                );
              })}
            </section>

            <footer className="composer">
              <input
                type="text"
                placeholder="Type a message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
              />
              <button onClick={handleSend} disabled={!draft.trim()}>
                Send
              </button>
            </footer>
          </>
        ) : (
          <div className="empty-chat">Select a conversation to start chatting</div>
        )}
      </main>
    </div>
  );
}
