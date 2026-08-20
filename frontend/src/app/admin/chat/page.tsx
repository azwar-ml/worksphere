"use client";

import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import { MessageSquare, Clock, Send, Hash, Users, ShieldCheck } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Researcher {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface Message {
  id: string;
  workspace_id: string;
  user_id: string;
  content: string;
  created_at: string;
  full_name: string;
}

export default function AdminChatHubPage() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, userId, clearAuth } = useAuthStore();

  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [selectedResearcher, setSelectedResearcher] = useState<Researcher | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const [fetchingResearchers, setFetchingResearchers] = useState(true);
  const [fetchingMessages, setFetchingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/");
      } else if (role !== "admin" && role !== "superadmin") {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, role, router]);

  // Fetch all researchers
  useEffect(() => {
    if (!token) return;
    const loadResearchers = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/employees`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) {
          clearAuth();
          router.push("/");
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          // Filter to only display researchers (role == 'employee')
          setResearchers(data.filter(emp => emp.role === "employee"));
        }
      } catch (err) {
        console.error("Failed to load researchers:", err);
      } finally {
        setFetchingResearchers(false);
      }
    };
    loadResearchers();
  }, [token]);

  // Load chat messages between admin and selected researcher
  const loadMessages = async () => {
    if (!token || !selectedResearcher) return;
    try {
      const res = await fetch(`${API_BASE}/admin/chat/${selectedResearcher.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setFetchingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedResearcher) {
      setFetchingMessages(true);
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [token, selectedResearcher]);

  // Polling interval (every 4 seconds)
  useEffect(() => {
    if (!token || !selectedResearcher) return;
    const interval = setInterval(() => {
      loadMessages();
    }, 4000);

    return () => clearInterval(interval);
  }, [token, selectedResearcher]);

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !token || !selectedResearcher) return;

    setSending(true);
    const textToSend = newMessage;
    const tempId = `temp-${Date.now()}`;

    // Optimistically update the UI
    const tempMsg: Message = {
      id: tempId,
      workspace_id: "",
      user_id: userId || "admin-id",
      content: textToSend,
      created_at: new Date().toISOString(),
      full_name: "Admin"
    };

    setMessages(prev => [...prev, tempMsg]);
    setNewMessage("");

    try {
      const res = await fetch(`${API_BASE}/admin/chat/${selectedResearcher.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: textToSend })
      });
      
      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      
      if (res.ok) {
        const savedMsg = await res.json();
        // Replace temp message with the actual message object from the server
        setMessages(prev => prev.map(m => m.id === tempId ? savedMsg : m));
      } else {
        // Rollback optimistic update
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  if (isLoading || fetchingResearchers) {
    return (
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 flex overflow-hidden">
        {/* Left Column: Researchers Directory List */}
        <div className="w-80 border-r border-theme-sidebar-border bg-theme-sidebar flex flex-col py-6 px-4">
          <div className="mb-4 px-2">
            <h3 className="text-xs font-bold text-theme-secondary uppercase tracking-widest flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              NCAI Researchers
            </h3>
            <p className="text-[10px] text-theme-secondary mt-1">Select a researcher to open direct two-way messaging.</p>
          </div>

          {researchers.length === 0 ? (
            <p className="text-xs text-theme-secondary px-2 py-4">No registered researchers found.</p>
          ) : (
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
              {researchers.map(reser => {
                const isSelected = selectedResearcher?.id === reser.id;
                const initials = reser.full_name
                  ? reser.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                  : "R";
                return (
                  <button
                    key={reser.id}
                    onClick={() => setSelectedResearcher(reser)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-purple-600/15 border-purple-500/30 text-theme-fg"
                        : "bg-transparent border-transparent hover:bg-zinc-200/55 dark:hover:bg-zinc-900/60 hover:text-theme-fg text-theme-secondary"
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                      isSelected ? "bg-purple-600 text-white" : "bg-zinc-200 dark:bg-zinc-800 text-theme-fg"
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold truncate text-theme-fg">{reser.full_name}</h4>
                      <p className="text-[10px] text-theme-secondary truncate">{reser.email}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Chat Window */}
        <div className="flex-1 flex flex-col bg-theme-bg/10">
          {selectedResearcher ? (
            <>
              {/* Header Info */}
              <div className="border-b border-theme-border px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-theme-fg flex items-center gap-2">
                    <Hash className="h-4.5 w-4.5 text-purple-500" />
                    DM: {selectedResearcher.full_name}
                    <ShieldCheck className="h-4 w-4 text-purple-500" />
                  </h2>
                  <p className="text-[10px] text-theme-secondary mt-0.5">Secure 1-on-1 Admin channel • {selectedResearcher.email}</p>
                </div>
              </div>

              {/* Chat Scroll History */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {fetchingMessages ? (
                  <div className="h-full flex items-center justify-center">
                    <Clock className="h-6 w-6 animate-spin text-purple-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-xs text-theme-secondary">
                    <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                    No conversation history. Transmit the first message below!
                  </div>
                ) : (
                  messages.map(msg => {
                    const isOwnMessage = msg.user_id === userId || msg.full_name === "Admin" || msg.user_id === "admin-id";
                    return (
                      <div 
                        key={msg.id}
                        className={`flex flex-col max-w-[75%] ${isOwnMessage ? "ml-auto items-end" : "mr-auto items-start"}`}
                      >
                        <span className="text-[9px] text-theme-secondary mb-1 px-1">
                          {isOwnMessage ? "You" : msg.full_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className={`p-3 rounded-xl text-xs leading-relaxed ${
                          isOwnMessage 
                            ? "bg-purple-600 text-white rounded-tr-none" 
                            : "glass text-theme-fg rounded-tl-none"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Send Input Box */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-theme-border bg-theme-bg/40">
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder={`Type update to ${selectedResearcher.full_name}...`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-3 pl-4 pr-12 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="absolute inset-y-1.5 right-1.5 flex items-center justify-center h-8 w-8 rounded-md bg-purple-600 text-white hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-xs text-theme-secondary">
              <MessageSquare className="h-10 w-10 mb-2 opacity-30 text-purple-500" />
              Select a registered researcher from the sidebar to open the chat log.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
