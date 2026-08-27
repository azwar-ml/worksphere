"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, X } from "lucide-react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Alert {
  id: string;
  sender_id: string;
  target_type: string;
  target_lab?: string;
  title: string;
  content: string;
  priority: "low" | "normal" | "high" | "critical";
  created_at: string;
}

export default function AlertsWidget() {
  const { token, isAuthenticated, userId, role } = useAuthStore();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Bind JWT Session Token to Supabase client for RLS
  useEffect(() => {
    if (token) {
      supabase.auth.setSession({
        access_token: token,
        refresh_token: "",
      });
    }
  }, [token]);

  // Fetch active alerts
  const fetchAlerts = async () => {
    if (!token || !isAuthenticated) return;
    try {
      if (role === "admin" || role === "superadmin") {
        const res = await fetch(`${API_BASE}/admin/alerts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Filter out self-sent alerts
            const filtered = data.filter((a: Alert) => a.sender_id !== userId);
            setAlerts(filtered);
          }
        }
      } else {
        // Query Supabase directly for standard employees
        const { data, error } = await supabase
          .from("alerts")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data) {
          const filtered = data.filter((a: Alert) => a.sender_id !== userId);
          setAlerts(filtered);
        }
      }
    } catch (err) {
      console.error("Failed to load widget alerts:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchAlerts();
    } else {
      setAlerts([]);
    }
  }, [isAuthenticated, token, role]);

  // Real-time listener for alerts table
  useEffect(() => {
    if (!isAuthenticated || !token || !userId) return;

    const channel = supabase
      .channel("realtime-alerts-widget")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alerts"
        },
        (payload) => {
          const newAlert = payload.new as Alert;
          if (newAlert.sender_id !== userId) {
            setAlerts((prev) => {
              if (prev.some(a => a.id === newAlert.id)) return prev;
              return [newAlert, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, token, userId]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (!isAuthenticated || !token || alerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-55 flex flex-col gap-3 max-w-sm w-full pointer-events-none select-none">
      <AnimatePresence>
        {alerts.map((alert) => {
          const isCritical = alert.priority === "critical" || alert.priority === "high";
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              layout
              className="pointer-events-auto bg-white/95 dark:bg-slate-905/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl rounded-xl p-4 flex items-start gap-3 relative group"
            >
              <AlertOctagon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isCritical ? "text-red-500 animate-pulse" : "text-amber-500"}`} />
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                    isCritical ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}>
                    {alert.priority}
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">Scoping: {alert.target_type}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{alert.title}</h4>
                <p className="text-[11px] text-slate-650 dark:text-slate-300 mt-1 leading-relaxed break-words">{alert.content}</p>
              </div>

              {/* Close/Dismiss Button */}
              <button
                type="button"
                onClick={() => dismissAlert(alert.id)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full p-1 cursor-pointer transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Dismiss Alert"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
