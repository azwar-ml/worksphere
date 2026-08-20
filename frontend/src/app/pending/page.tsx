"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/authStore";
import ThemeToggle from "../../components/ThemeToggle";
import { ShieldCheck, LogOut, Clock } from "lucide-react";

export default function PendingPage() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, clearAuth } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/");
      } else if (role !== "pending") {
        if (role === "admin" || role === "superadmin") {
          router.push("/admin/dashboard");
        } else {
          router.push("/dashboard");
        }
      }
    }
  }, [isAuthenticated, isLoading, role, router]);

  const handleLogout = () => {
    clearAuth();
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-10 w-10 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-theme-bg text-theme-fg relative overflow-hidden px-4 select-none transition-colors duration-200">
      
      {/* Decorative slowly-moving background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/10 dark:bg-purple-900/20 blur-[120px] pointer-events-none animate-pulse duration-10000"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/10 dark:bg-indigo-900/20 blur-[120px] pointer-events-none animate-pulse duration-7000"></div>

      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-25">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg z-10">
        {/* Brand/Logo Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-650 dark:text-purple-400 shadow-lg shadow-purple-500/10 mb-3 animate-bounce duration-3000">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-theme-fg tracking-wide uppercase">
            WorkSphere <span className="text-purple-500">AI</span>
          </h2>
          <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest block mt-0.5">
            National Center of Artificial Intelligence
          </span>
        </div>

        {/* Central Pending Message Card */}
        <div className="glass rounded-2xl p-8 sm:p-10 shadow-2xl relative border border-theme-border text-center">
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-indigo-500/5 rounded-2xl pointer-events-none"></div>
          
          <h3 className="text-lg font-bold text-theme-fg mb-4 flex items-center justify-center gap-2">
            <Clock className="h-5 w-5 text-purple-550 dark:text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
            Approval Pending
          </h3>
          
          <p className="text-sm text-theme-fg leading-relaxed font-medium bg-zinc-900/5 dark:bg-zinc-900/40 p-5 rounded-xl border border-theme-border text-center shadow-inner">
            Your access request is currently under review by NCAI Administration. You will be granted access shortly.
          </p>

          {/* Action Log Out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 py-3.5 text-sm font-semibold text-red-650 dark:text-red-400 transition-all active:scale-[0.98] mt-8 cursor-pointer shadow-md"
          >
            <LogOut className="h-4.5 w-4.5" />
            <span>Sign Out from Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}
