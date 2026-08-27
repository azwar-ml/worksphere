"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/authStore";
import ThemeToggle from "../../components/ThemeToggle";
import { ShieldCheck, LogOut, Clock } from "lucide-react";

const labNameMap: Record<string, string> = {
  gen_ai: "Generative AI Lab",
  ai: "Artificial Intelligence Lab",
  web_dev: "Web Development Lab",
  cyber_sec: "Cyber Security Lab",
};

export default function PendingPage() {
  const router = useRouter();
  const { isAuthenticated, initialize, isLoading, role, status, labId, clearAuth } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/");
      } else if (status !== "pending") {
        // Automatically route approved users to their correct panel
        if (role === "superadmin") {
          router.push("/superadmin/dashboard");
        } else if (role === "admin") {
          router.push("/admin/dashboard");
        } else {
          router.push("/dashboard");
        }
      }
    }
  }, [isAuthenticated, isLoading, role, status, router]);

  const handleLogout = () => {
    clearAuth();
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Clock className="h-10 w-10 animate-spin text-purple-500" />
      </div>
    );
  }

  const labLabel = labId ? (labNameMap[labId] || "NCAI Research") : "NCAI";

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-[#0B0F19] text-white relative overflow-hidden px-4 select-none">
      
      {/* Decorative slowly-moving background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none animate-pulse duration-10000"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none animate-pulse duration-7000"></div>

      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-25">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg z-10">
        {/* Brand/Logo Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 shadow-lg shadow-purple-500/10 mb-3 animate-bounce">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide uppercase">
            WorkSphere <span className="text-purple-500">AI</span>
          </h2>
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block mt-0.5">
            National Center of Artificial Intelligence
          </span>
        </div>

        {/* Central Pending Message Card */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-8 sm:p-10 shadow-2xl relative text-center">
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-indigo-500/5 rounded-2xl pointer-events-none"></div>
          
          <h3 className="text-lg font-bold text-white mb-4 flex items-center justify-center gap-2">
            <Clock className="h-5 w-5 text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
            Approval Pending
          </h3>
          
          <p className="text-sm text-slate-300 leading-relaxed font-medium bg-zinc-900/40 p-5 rounded-xl border border-slate-800 text-center shadow-inner">
            Your request has been routed to the <span className="font-semibold text-purple-400">{labLabel}</span> Administration for review.
          </p>

          {/* Action Log Out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 py-3.5 text-sm font-semibold text-red-400 transition-all active:scale-[0.98] mt-8 cursor-pointer shadow-md"
          >
            <LogOut className="h-4.5 w-4.5" />
            <span>Sign Out from Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}
