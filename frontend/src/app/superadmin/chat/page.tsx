"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import { createClient } from "@supabase/supabase-js";
import { MessageSquare, Clock, Send, ShieldCheck } from "lucide-react";

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const labNameMap: Record<string, string> = {
  gen_ai: "Generative AI Lab",
  ai: "Artificial Intelligence Lab",
  web_dev: "Web Development Lab",
  cyber_sec: "Cyber Security Lab",
};

interface AdminContact {
  id: string;
  email: string;
  full_name: string;
  role: string;
  lab_id?: string;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

function SuperadminChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryUserId = searchParams ? searchParams.get("userId") : null;

  const { token, refreshToken, isAuthenticated, initialize, isLoading, role, userId, clearAuth } = useAuthStore();

  const [admins, setAdmins] = useState<AdminContact[]>([]);
  const [activeContact, setActiveContact] = useState<AdminContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [fetchingAdmins, setFetchingAdmins] = useState(true);
  const [fetchingMessages, setFetchingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auth Protection
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/");
      } else if (role !== "superadmin") {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, role, router]);

  const [sessionReady, setSessionReady] = useState(false);

  // Bind JWT Session Token to Supabase client for RLS
  useEffect(() => {
    if (token) {
      supabase.auth.setSession({
        access_token: token,
        refresh_token: refreshToken || "",
      }).then(() => {
        setSessionReady(true);
      }).catch(err => {
        console.error("Failed to set Supabase session:", err);
        setSessionReady(false);
      });
    } else {
      setSessionReady(false);
    }
  }, [token, refreshToken]);

  // Fetch Admins List
  useEffect(() => {
    if (!token || !sessionReady) return;
    const fetchAdmins = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name, role, lab_id")
          .eq("role", "admin")
          .order("full_name", { ascending: true });

        if (error) throw error;
        setAdmins(data || []);
      } catch (err) {
        console.error("Failed to load admin contacts:", err);
      } finally {
        setFetchingAdmins(false);
      }
    };
    fetchAdmins();
  }, [token, sessionReady]);

  // Auto-select Admin from query params
  useEffect(() => {
    if (queryUserId && admins.length > 0) {
      const match = admins.find(a => a.id === queryUserId);
      if (match) {
        setActiveContact(match);
      }
    }
  }, [queryUserId, admins]);

  // Load messages and subscribe to Realtime updates in a single effect hook
  useEffect(() => {
    if (!userId || !activeContact || !sessionReady) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    const fetchMessages = async () => {
      setFetchingMessages(true);
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .or(`and(sender_id.eq.${userId},receiver_id.eq.${activeContact.id}),and(sender_id.eq.${activeContact.id},receiver_id.eq.${userId})`)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (isMounted) {
          setMessages(data || []);
        }
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        if (isMounted) {
          setFetchingMessages(false);
        }
      }
    };

    fetchMessages();

    // Subscribe to Postgres Changes for Realtime Chat
    const channel = supabase
      .channel(`dm-${userId}-${activeContact.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as Message;
          const isRelevant =
            (newMsg.receiver_id === userId && newMsg.sender_id === activeContact.id) ||
            (newMsg.sender_id === userId && newMsg.receiver_id === activeContact.id);

          if (isRelevant) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId, activeContact, sessionReady]);

  // Scroll to Bottom when messages load or change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send Direct Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId || !activeContact || !sessionReady) return;

    const textToSend = newMessage;
    setNewMessage("");
    setSending(true);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          sender_id: userId,
          receiver_id: activeContact.id,
          content: textToSend
        })
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages((prev) => {
          if (prev.some(m => m.id === data[0].id)) return prev;
          return [...prev, data[0]];
        });
      }
    } catch (err) {
      console.error("Failed to send direct message:", err);
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-[#0B0F19]">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 flex overflow-hidden md:ml-64">
        {/* Left Pane: Contacts List */}
        <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col py-6 px-4">
          <div className="mb-6 px-2">
            <h1 className="text-lg font-extrabold flex items-center gap-2">
              Superadmin DMs <ShieldCheck className="h-4.5 w-4.5 text-purple-500" />
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">Direct private dialogue channels with Lab Administrators.</p>
          </div>

          <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2 mb-3">Lab Administrators</h3>

          {fetchingAdmins ? (
            <div className="flex-1 space-y-3 px-2">
              <div className="h-12 bg-slate-100 dark:bg-slate-800/50 animate-pulse rounded-lg"></div>
              <div className="h-12 bg-slate-100 dark:bg-slate-800/50 animate-pulse rounded-lg"></div>
            </div>
          ) : admins.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No Lab Administrators registered.
            </div>
          ) : (
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
              {admins.map((admin) => (
                <button
                  key={admin.id}
                  type="button"
                  onClick={() => setActiveContact(admin)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left cursor-pointer ${
                    activeContact?.id === admin.id
                      ? "bg-purple-600/10 text-purple-650 dark:text-purple-400 border border-purple-500/20"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="h-9 w-9 rounded-full bg-purple-600/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs border border-purple-500/10">
                    {admin.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold truncate">{admin.full_name}</h4>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {admin.lab_id ? labNameMap[admin.lab_id] : "Not Scoped"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Pane: Active DM Conversation */}
        <div className="flex-1 flex flex-col bg-slate-50/50 dark:bg-slate-950/20">
          {activeContact ? (
            <>
              {/* Header */}
              <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-purple-650/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-extrabold text-xs">
                    {activeContact.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold">{activeContact.full_name}</h3>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">{activeContact.email}</p>
                  </div>
                </div>
                <span className="bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded text-[9px] font-bold border border-purple-200/50 dark:border-purple-500/20 uppercase tracking-wide">
                  {activeContact.lab_id ? labNameMap[activeContact.lab_id] : "System Global"}
                </span>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {fetchingMessages ? (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
                    <MessageSquare className="h-8 w-8 text-purple-500/20" />
                    <p className="text-xs font-semibold text-slate-450 dark:text-slate-500">Secure Direct Message Room</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-600">Messages are end-to-end scoped by Row Level Security.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isSentByMe = msg.sender_id === userId;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isSentByMe ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-xs ${
                            isSentByMe
                              ? "bg-purple-600 text-white rounded-tr-none"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none"
                          }`}
                        >
                          <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
                          <div
                            className={`text-[8px] mt-1.5 text-right font-medium ${
                              isSentByMe ? "text-purple-200" : "text-slate-500"
                            }`}
                          >
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box */}
              <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Send secure message...`}
                  className="flex-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="p-4 rounded-full bg-purple-600/5 border border-purple-500/10">
                <MessageSquare className="h-10 w-10 text-purple-500" />
              </div>
              <h3 className="text-sm font-bold">Secure Administrative Communications</h3>
              <p className="text-xs text-slate-550 dark:text-slate-400 max-w-sm">
                Select a Lab Administrator from the left contact directory to launch a private, real-time message stream.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SuperadminChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-[#0B0F19]">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    }>
      <SuperadminChatContent />
    </Suspense>
  );
}
