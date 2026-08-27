"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { Send, MessageSquare, Loader2, Sparkles, AlertCircle, RefreshCw, Bot, User, Trash2 } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Message {
  role: "user" | "ai";
  content: string;
  intent?: string; // Tracks the classified intent from the backend
}

interface WorkSphereChatProps {
  targetId?: string; // Can be user_id (for employee dossier) or lab_id (for lab aggregate)
  targetName?: string; // Optional display name for the target (e.g. Dr. Sarah Connor or Lab 4)
  targetType?: "employee" | "lab" | "general"; // Restricts scope
}

export default function WorkSphereChat({
  targetId,
  targetName,
  targetType = "general",
}: WorkSphereChatProps) {
  const { token } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      content: `Welcome to the WorkSphere Analytical Suite. I am the AI Dossier Assistant. How can I help you today${
        targetName ? ` regarding ${targetName}` : ""
      }?`,
      intent: "general"
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages area
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Clean chat history helper
  const clearChat = () => {
    setMessages([
      {
        role: "ai",
        content: `Conversation restarted. Ready to compile analytical dossier telemetry${
          targetName ? ` regarding ${targetName}` : ""
        }.`,
        intent: "general"
      },
    ]);
    setError(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    setError(null);
    setLoading(true);

    // Append user message to state
    const updatedMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(updatedMessages);

    try {
      // Map chat history roles from UI format ('ai') to API format ('assistant')
      const chatHistoryApi = messages.map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.content,
      }));

      // Call the intelligent router POST endpoint /api/v1/chat
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: userText,
          chat_history: chatHistoryApi,
          target_id: targetId || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned error status ${response.status}`);
      }

      const data = await response.json();
      
      // Append AI response
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: data.response || "No telemetry context resolved.",
          intent: data.intent,
        },
      ]);
    } catch (err: any) {
      console.error("Chat API error:", err);
      setError("Network connectivity issue or LLM routing timeout. Please retry.");
      // Keep user's input so they can retry sending
      setInput(userText);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-4xl rounded-2xl border border-theme-border glass card-glow overflow-hidden transition-all duration-300">
      {/* Header Area */}
      <div className="bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border-b border-theme-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <Sparkles className="h-5 w-5 text-purple-400 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-theme-fg flex items-center gap-2">
              WorkSphere AI Dossier Assistant
            </h3>
            <p className="text-[11px] text-theme-secondary mt-0.5 flex items-center gap-1">
              <Bot className="h-3 w-3 text-purple-400" />
              {targetType === "employee" && `Employee Scope: ${targetName || "Target Researcher"}`}
              {targetType === "lab" && `Lab Scope: ${targetName || "Target Lab"}`}
              {targetType === "general" && "Universal Analytical Co-pilot"}
            </p>
          </div>
        </div>
        
        <button
          onClick={clearChat}
          title="Clear Conversation History"
          className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 text-theme-secondary hover:text-theme-fg rounded-lg transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Message Scroll Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-zinc-500/5 custom-scrollbar">
        {messages.map((msg, index) => {
          const isAi = msg.role === "ai";
          return (
            <div key={index} className={`flex gap-4 ${isAi ? "justify-start" : "justify-end"}`}>
              {isAi && (
                <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-purple-900/40 border border-purple-500/30 text-purple-400 shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
              )}

              <div className="flex flex-col max-w-[75%]">
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-200 ${
                    isAi
                      ? "glass border-purple-500/5 text-theme-fg rounded-tl-none"
                      : "bg-purple-600 text-white rounded-tr-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                
                {/* Intent Tag Indicator for Admin Auditing */}
                {isAi && msg.intent && msg.intent !== "general" && (
                  <span className="text-[9px] text-purple-400 font-semibold tracking-wider uppercase mt-1.5 px-1 self-start flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-ping"></span>
                    Routed via: {msg.intent.replace("_", " ")}
                  </span>
                )}
              </div>

              {!isAi && (
                <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-theme-secondary border border-theme-border shadow-sm">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>
          );
        })}

        {/* Loading / Generating State */}
        {loading && (
          <div className="flex gap-4 justify-start animate-pulse">
            <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-purple-900/40 border border-purple-500/30 text-purple-400">
              <Bot className="h-5 w-5 animate-spin" />
            </div>
            <div className="flex flex-col max-w-[75%]">
              <div className="glass border-purple-500/5 p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                <span className="text-xs text-theme-secondary">Resolving telemetry and routing dossier...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error State Banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs shadow-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div className="flex-1">{error}</div>
            <button
              onClick={() => {
                setError(null);
                setLoading(false);
              }}
              className="p-1 hover:bg-red-500/10 rounded-md transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSend} className="p-4 border-t border-theme-border bg-theme-bg/60 backdrop-blur-md">
        <div className="relative flex items-center">
          <input
            type="text"
            required
            disabled={loading}
            placeholder={`Ask about employee logs, lab milestones, or architecture...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-3.5 pl-5 pr-14 text-sm text-theme-fg placeholder:text-theme-secondary focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 flex items-center justify-center h-10 w-10 rounded-lg bg-purple-600 text-white hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
