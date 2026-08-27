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

interface ProfileContact {
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

function AdminChatHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryUserId = searchParams ? searchParams.get("userId") : null;

  const { token, refreshToken, isAuthenticated, initialize, isLoading, role, userId, labId, clearAuth } = useAuthStore();

  const [contacts, setContacts] = useState<ProfileContact[]>([]);
  const [activeContact, setActiveContact] = useState<ProfileContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const [fetchingContacts, setFetchingContacts] = useState(true);
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

  // Fetch both Superadmin and local researchers
  useEffect(() => {
    if (!token || !userId || !sessionReady) return;
    const loadContacts = async () => {
      try {
        const targetLab = labId || "";
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name, role, lab_id")
          .or(`role.eq.superadmin,and(role.eq.employee,lab_id.eq.${targetLab},status.eq.approved)`)
          .order("full_name", { ascending: true });

        if (error) throw error;
        setContacts(data || []);
      } catch (err) {
        console.error("Failed to load contacts:", err);
      } finally {
        setFetchingContacts(false);
      }
    };
    loadContacts();
  }, [token, userId, labId, sessionReady]);

  // Auto-select contact if query parameters have userId
  useEffect(() => {
    if (queryUserId && contacts.length > 0) {
      const match = contacts.find(c => c.id === queryUserId);
      if (match) {
        setActiveContact(match);
      }
    }
  }, [queryUserId, contacts]);

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
        console.error("Failed to load messages:", err);
      } finally {
        if (isMounted) {
          setFetchingMessages(false);
        }
      }
    };

    fetchMessages();

    // Subscribe to Postgres Changes for Realtime Chat
    const channel = supabase
      .channel(`dm-realtime-admin-${activeContact.id}`)
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

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !token || !activeContact || !userId || !sessionReady) return;

    setSending(true);
    const textToSend = newMessage;
    setNewMessage("");

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
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  const headquartersContacts = contacts.filter(c => c.role === "superadmin");
  const researchContacts = contacts.filter(c => c.role === "employee");

  return (
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 flex overflow-hidden md:ml-64">
        {/* Left Column: Contacts Directory */}
        <div className="w-80 border-r border-theme-sidebar-border bg-theme-sidebar flex flex-col py-6 px-4">
          <div className="mb-6 px-2">
            <h3 className="text-xs font-bold text-theme-secondary uppercase tracking-widest">Administrative DMs</h3>
            <p className="text-[10px] text-theme-secondary mt-1">Direct private messaging channels with personnel.</p>
          </div>

          {fetchingContacts ? (
            <div className="flex-1 space-y-3 px-2">
              <div className="h-10 bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse rounded-lg"></div>
              <div className="h-10 bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse rounded-lg"></div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* HEADQUARTERS SECTION */}
              {headquartersContacts.length > 0 && (
                <div>
                  <h4 className="text-[9px] font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest px-2 mb-2">Headquarters</h4>
                  <div className="space-y-1">
                    {headquartersContacts.map(c => {
                      const isSelected = activeContact?.id === c.id;
                      const initials = c.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveContact(c)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left cursor-pointer ${
                            isSelected
                              ? "bg-purple-600/10 text-purple-655 dark:text-purple-400 border border-purple-500/20"
                              : "hover:bg-zinc-250/50 dark:hover:bg-zinc-900/40 text-theme-fg/80"
                          }`}
                        >
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected ? "bg-purple-600 text-white" : "bg-purple-600/15 text-purple-600 dark:text-purple-400 border border-purple-500/10"
                          }`}>
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold truncate text-theme-fg">{c.full_name}</h4>
                            <p className="text-[10px] text-theme-secondary truncate">NCAI Superadministrator</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* RESEARCHERS SECTION */}
              <div>
                <h4 className="text-[9px] font-bold text-theme-secondary uppercase tracking-widest px-2 mb-2">Lab Researchers</h4>
                {researchContacts.length === 0 ? (
                  <p className="text-[10px] text-theme-secondary px-2">No local researchers approved.</p>
                ) : (
                  <div className="space-y-1">
                    {researchContacts.map(c => {
                      const isSelected = activeContact?.id === c.id;
                      const initials = c.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveContact(c)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left cursor-pointer ${
                            isSelected
                              ? "bg-purple-600/10 text-purple-655 dark:text-purple-400 border border-purple-500/20"
                              : "hover:bg-zinc-250/50 dark:hover:bg-zinc-900/40 text-theme-fg/80"
                          }`}
                        >
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                            isSelected ? "bg-purple-600 text-white" : "bg-zinc-200 dark:bg-zinc-800 text-theme-fg"
                          }`}>
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold truncate text-theme-fg">{c.full_name}</h4>
                            <p className="text-[10px] text-theme-secondary truncate">{c.email}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Chat Window */}
        <div className="flex-1 flex flex-col bg-theme-bg/10">
          {activeContact ? (
            <>
              {/* Header Info */}
              <div className="border-b border-theme-border px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-theme-fg flex items-center gap-2">
                    DM: {activeContact.full_name}
                  </h2>
                  <p className="text-[10px] text-theme-secondary mt-0.5">Secure 1-on-1 Communication • {activeContact.email}</p>
                </div>
                <span className="bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded text-[9px] font-bold border border-purple-200/50 dark:border-purple-500/20 uppercase tracking-wide">
                  {activeContact.role === "superadmin" ? "Super Admin" : (activeContact.lab_id ? labNameMap[activeContact.lab_id] : "Lab Staff")}
                </span>
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
                    const isOwnMessage = msg.sender_id === userId;
                    return (
                      <div 
                        key={msg.id}
                        className={`flex flex-col max-w-[75%] ${isOwnMessage ? "ml-auto items-end" : "mr-auto items-start"}`}
                      >
                        <span className="text-[9px] text-theme-secondary mb-1 px-1">
                          {isOwnMessage ? "You" : activeContact.full_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                    placeholder={`Type message to ${activeContact.full_name}...`}
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
              Select an administrative contact or local researcher to open the chat log.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AdminChatHubPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    }>
      <AdminChatHubContent />
    </Suspense>
  );
}
