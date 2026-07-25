import { useEffect, useRef, useState } from "react";
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

const AVATAR_GRADIENTS: Record<string, string> = {
  AJ: "linear-gradient(135deg, #f59e0b, #ef4444)",
  BS: "linear-gradient(135deg, #10b981, #06b6d4)",
  CD: "linear-gradient(135deg, #8b5cf6, #ec4899)",
  DP: "linear-gradient(135deg, #f43f5e, #f59e0b)",
  EW: "linear-gradient(135deg, #06b6d4, #3b82f6)",
  ME: "linear-gradient(135deg, #64748b, #475569)",
};

function gradientFor(avatar: string): string {
  return AVATAR_GRADIENTS[avatar] ?? "linear-gradient(135deg, #3b82f6, #8b5cf6)";
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

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

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

    const channel = supabase
      .channel("public:messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
          return [...prev, payload.new as Message];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, activeId, typing]);

  const userById: Record<string, User> = {};
  users.forEach((u) => (userById[u.id] = u));

  const activeConversation = conversations.find((c) => c.id === activeId);
  const activeUser = activeConversation ? userById[activeConversation.user_id] : undefined;
  const activeMessages = messages.filter((m) => m.conversation_id === activeId);

  const filteredConversations = conversations.filter((c) => {
    const user = userById[c.user_id];
    if (!user) return false;
    return user.name.toLowerCase().includes(search.toLowerCase());
  });

  const lastMessageFor = (cid: string): Message | undefined => {
    const filtered = messages.filter((m) => m.conversation_id === cid);
    return filtered[filtered.length - 1];
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activeConversation || sending) return;
    setSending(true);
    setDraft("");

    setTyping(true);
    const typingTimer = setTimeout(() => setTyping(false), 1800);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeConversation.id,
        sender_id: ME_ID,
        text,
      })
      .select()
      .single();

    clearTimeout(typingTimer);
    setTyping(false);
    setSending(false);

    if (error || !data) {
      setDraft(text);
      return;
    }
    setMessages((prev) => [...prev, data]);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>Loading your chats...</span>
      </div>
    );
  }

  return (
    <div className={`app ${showChat ? "show-chat" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <h1>Chats</h1>
            <button className="icon-btn" aria-label="New chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          </div>
          <div className="search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="search-input"
              type="text"
              placeholder="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ul className="conversation-list">
          {filteredConversations.length === 0 && (
            <li className="no-results">No conversations found</li>
          )}
          {filteredConversations.map((c) => {
            const user = userById[c.user_id];
            const last = lastMessageFor(c.id);
            const isActive = c.id === activeId;
            const unread = last && last.sender_id !== ME_ID && !isActive ? 1 : 0;
            return (
              <li
                key={c.id}
                className={`conversation-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  setActiveId(c.id);
                  setShowChat(true);
                }}
              >
                <div className="avatar-wrap">
                  <div className="avatar" style={{ background: gradientFor(user?.avatar ?? "?") }}>
                    {user?.avatar ?? "?"}
                  </div>
                  <span className="online-dot" />
                </div>
                <div className="conversation-content">
                  <div className="conversation-top">
                    <span className="conversation-name">{user?.name ?? "Unknown"}</span>
                    <span className={`conversation-time ${unread ? "unread" : ""}`}>
                      {last ? formatTime(last.created_at) : ""}
                    </span>
                  </div>
                  <div className="conversation-bottom">
                    <span className="conversation-last">
                      {last ? (last.sender_id === ME_ID ? "You: " : "") + last.text : "No messages yet"}
                    </span>
                    {unread > 0 && <span className="unread-badge">{unread}</span>}
                  </div>
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
              <button className="back-btn" onClick={() => setShowChat(false)} aria-label="Back">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="avatar-wrap">
                <div className="avatar lg" style={{ background: gradientFor(activeUser.avatar) }}>
                  {activeUser.avatar}
                </div>
                <span className="online-dot" />
              </div>
              <div className="chat-header-info">
                <h2>{activeUser.name}</h2>
                <span className="status">Active now</span>
              </div>
              <div className="chat-header-actions">
                <button className="icon-btn" aria-label="Call">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
                <button className="icon-btn" aria-label="More">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </div>
            </header>

            <section className="message-list" ref={messageListRef}>
              {activeMessages.map((m, i) => {
                const mine = m.sender_id === ME_ID;
                const prev = activeMessages[i - 1];
                const showDate = !prev || !isSameDay(prev.created_at, m.created_at);
                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="date-divider">
                        <span>{dayLabel(m.created_at)}</span>
                      </div>
                    )}
                    <div className={`message ${mine ? "mine" : "theirs"}`}>
                      <div className="bubble">{m.text}</div>
                      <div className="message-meta">
                        <span>{formatTime(m.created_at)}</span>
                        {mine && (
                          <span className={`tick ${true ? "read" : ""}`}>
                            <svg width="15" height="11" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 9l4 4L15 1M9 13l1.5 1.5L23 1" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {typing && (
                <div className="typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              )}
            </section>

            <footer className="composer">
              <div className="composer-inner">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                />
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  aria-label="Send message"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="empty-chat">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span>Select a conversation to start chatting</span>
          </div>
        )}
      </main>
    </div>
  );
}
