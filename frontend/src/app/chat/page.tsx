"use client";

import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { MessageSquare, Clock, Send, Hash, Users, Sparkles } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Workspace {
  id: string;
  name: string;
  description: string;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id?: string;
  content: string;
  created_at: string;
  full_name: string;
}

const cleanWorkspaceName = (name: string): string => {
  if (!name) return "";
  const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
  if (uuidRegex.test(name)) {
    return name.replace(uuidRegex, "User");
  }
  const truncatedUuidRegex = /(&\s*)[0-9a-fA-F]{8}$/;
  if (truncatedUuidRegex.test(name)) {
    return name.replace(truncatedUuidRegex, "$1User");
  }
  return name;
};

const cleanWorkspaceDescription = (desc: string): string => {
  if (!desc) return "";
  const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
  return desc.replace(uuidRegex, "User");
};

export default function ChatPage() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, status, userId, clearAuth } = useAuthStore();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const [fetchingWorkspaces, setFetchingWorkspaces] = useState(true);
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
        return;
      }
      if (status === "pending") {
        router.push("/pending");
        return;
      }
    }
  }, [isAuthenticated, isLoading, status, router]);

  // Fetch all workspaces user is a member of
  useEffect(() => {
    if (!token) return;
    const loadWorkspaces = async () => {
      try {
        const res = await fetch(`${API_BASE}/user/workspaces`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) {
          clearAuth();
          router.push("/");
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setWorkspaces(data);
          if (data.length > 0) {
            setSelectedWorkspace(data[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load workspaces:", err);
      } finally {
        setFetchingWorkspaces(false);
      }
    };
    loadWorkspaces();
  }, [token]);

  // Fetch messages when workspace changes
  const loadMessages = async () => {
    if (!token || !selectedWorkspace) return;
    setFetchingMessages(true);
    try {
      const res = await fetch(`${API_BASE}/user/workspaces/${selectedWorkspace.id}/messages`, {
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
    loadMessages();
    
    // Set up polling interval to simulate real-time updates (every 4 seconds)
    const interval = setInterval(() => {
      loadMessages();
    }, 4000);

    return () => clearInterval(interval);
  }, [token, selectedWorkspace]);

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !token || !selectedWorkspace) return;
    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/user/workspaces/${selectedWorkspace.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: newMessage })
      });
      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      if (res.ok) {
        setNewMessage("");
        await loadMessages();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 flex overflow-hidden md:ml-64">
        {fetchingWorkspaces ? (
          <div className="flex flex-1 animate-pulse">
            <div className="w-64 border-r border-theme-sidebar-border bg-theme-sidebar flex flex-col py-6 px-4 space-y-4 pt-4">
              <div className="h-4 bg-zinc-200/20 dark:bg-zinc-800/20 rounded-md w-2/3"></div>
              <div className="h-8 bg-zinc-200/20 dark:bg-zinc-800/20 rounded-md"></div>
              <div className="h-8 bg-zinc-200/20 dark:bg-zinc-800/20 rounded-md"></div>
              <div className="h-8 bg-zinc-200/20 dark:bg-zinc-800/20 rounded-md"></div>
            </div>
            <div className="flex-1 flex flex-col bg-theme-bg/10 p-6 space-y-4">
              <div className="h-12 bg-zinc-200/20 dark:bg-zinc-800/20 rounded-md w-1/3"></div>
              <div className="flex-1 bg-zinc-200/20 dark:bg-zinc-800/20 rounded-md flex items-center justify-center text-xs text-theme-secondary">
                Loading messages...
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Workspace List column */}
            <div className="w-64 border-r border-theme-sidebar-border bg-theme-sidebar flex flex-col py-6 px-4">
              <h3 className="text-xs font-bold text-theme-secondary uppercase tracking-widest px-2 mb-4">Workspaces</h3>
              
              {workspaces.length === 0 ? (
                <p className="text-xs text-theme-secondary px-2 py-4">No active research workspaces.</p>
              ) : (
                <div className="space-y-1 overflow-y-auto flex-1">
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => setSelectedWorkspace(ws)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                        selectedWorkspace?.id === ws.id
                          ? "bg-purple-600/15 text-purple-600 dark:text-purple-400 border border-purple-500/25"
                          : "text-theme-secondary hover:bg-zinc-200/55 dark:hover:bg-zinc-900/60 hover:text-theme-fg"
                      }`}
                    >
                      <Hash className="h-4 w-4" />
                      {cleanWorkspaceName(ws.name)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Message Window column */}
            <div className="flex-1 flex flex-col bg-theme-bg/10">
              {selectedWorkspace ? (
                <>
                  {/* Top bar info */}
                  <div className="border-b border-theme-border px-6 py-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-theme-fg flex items-center gap-2">
                        <Hash className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                        {cleanWorkspaceName(selectedWorkspace.name)}
                      </h2>
                      <p className="text-xs text-theme-secondary mt-1">{cleanWorkspaceDescription(selectedWorkspace.description)}</p>
                    </div>
                  </div>

                  {/* Message scroll area */}
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-sm text-theme-secondary">
                        <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                        No messages yet. Send the first update!
                      </div>
                    ) : (
                      messages.map(msg => {
                        const isOwnMessage = msg.sender_id === userId;
                        return (
                          <div 
                            key={msg.id}
                            className={`flex flex-col max-w-[70%] ${isOwnMessage ? "ml-auto items-end" : "mr-auto items-start"}`}
                          >
                            <span className="text-[10px] text-theme-secondary mb-1 px-1">
                              {isOwnMessage ? "You" : msg.full_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className={`p-3 rounded-xl text-sm ${
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

                  {/* Input Form */}
                  <form onSubmit={handleSendMessage} className="p-4 border-t border-theme-border bg-theme-bg/40">
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="Type progress update..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-3 pl-4 pr-12 text-sm text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                      />
                      <button
                        type="submit"
                        disabled={sending || !newMessage.trim()}
                        className="absolute inset-y-1.5 right-1.5 flex items-center justify-center h-8 w-8 rounded-md bg-purple-600 text-white hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-sm text-theme-secondary">
                  Select a workspace from the list to join the conversation.
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
