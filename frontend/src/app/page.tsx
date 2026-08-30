"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../store/authStore";
import ThemeToggle from "../components/ThemeToggle";
import Image from "next/image";
import { motion } from "framer-motion";
import { 
  Mail, Lock, User, Briefcase, ArrowRight, 
  RefreshCw, Cpu, CheckCircle2, AlertCircle
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

export default function AuthPage() {
  const router = useRouter();
  const { setAuth, isAuthenticated, initialize, isLoading } = useAuthStore();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [labId, setLabId] = useState("gen_ai");
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  // Cinematic transition state (holds the route path to redirect to)
  const [isTransitioning, setIsTransitioning] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isAuthenticated && !isTransitioning) {
      router.push("/pending");
    }
  }, [isAuthenticated, router, isTransitioning]);

  useEffect(() => {
    const fetchLabs = async () => {
      try {
        const { data, error } = await supabase.from('labs').select('*').order('name', { ascending: true });
        if (error) throw error;
        if (data) {
          setLabs(data);
          if (data.length > 0) {
            setLabId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch labs for signup:", err);
      }
    };
    fetchLabs();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <RefreshCw className="h-10 w-10 animate-spin text-purple-500" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (isLogin) {
        // Login Flow
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Authentication failed. Incorrect email or password.");
        }

        setAuth(data.access_token, data.refresh_token, data.user_id, data.email, data.full_name, data.role, data.status, data.lab_id);
        setSuccessMsg("Authorized. Launching secure session...");
        
        // Trigger cinematic transition to /pending (which will redirect non-pending users)
        setIsTransitioning("/pending");
      } else {
        // Signup Flow
        const res = await fetch(`${API_BASE}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, full_name: fullName, lab_id: labId }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Registration failed.");
        }

        setErrorMsg("");

        // Auto-login after registration
        try {
          const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          if (loginRes.ok) {
            const loginData = await loginRes.json();
            setAuth(loginData.access_token, loginData.refresh_token, loginData.user_id, loginData.email, loginData.full_name, loginData.role, loginData.status, loginData.lab_id);
          }
        } catch (loginErr) {
          console.warn("Auto-login failed:", loginErr);
        }

        setSuccessMsg("Registration successful! Initiating pending review...");
        setIsTransitioning("/pending");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected network error occurred.");
      setSubmitting(false);
    }
  };

  // Cinematic Framer Motion Variants for Morphing
  const cardVariants = {
    initial: {
      scale: 1,
      borderRadius: "1rem", // 16px
      width: "100%",
      opacity: 1,
      filter: "blur(0px)",
    },
    animating: {
      scale: [1, 0.92, 0.88, 20],
      borderRadius: ["1rem", "9999px", "9999px", "9999px"],
      width: ["100%", "72px", "64px", "64px"],
      height: ["auto", "72px", "64px", "64px"],
      opacity: [1, 1, 0.95, 0],
      filter: ["blur(0px)", "blur(0px)", "blur(2px)", "blur(6px)"],
      transition: {
        duration: 1.2,
        times: [0, 0.35, 0.55, 1],
        ease: ["easeOut", "easeInOut", "easeIn"] as any,
      }
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 dark:bg-[#0B0F19] transition-colors duration-300 select-none relative overflow-x-hidden font-sans">
      
      {/* Floating Theme Switcher */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* LEFT COLUMN: Prestigious Branding */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 py-12 z-10">
        
        {/* Logos Flex Container */}
        <div className="flex items-center gap-5 mb-10">
          <div className="relative h-14 w-28 rounded-xl shadow-md bg-white p-1.5 transition-all duration-300 hover:scale-105 border border-slate-200">
            <Image 
              src="/logos/ncai.jpg" 
              alt="NCAI Logo" 
              fill
              sizes="112px"
              className="object-contain rounded-lg"
              unoptimized
            />
          </div>
          <div className="relative h-14 w-24 rounded-xl shadow-md bg-white p-1.5 transition-all duration-300 hover:scale-105 border border-slate-200">
            <Image 
              src="/logos/kics.png" 
              alt="KICS Logo" 
              fill
              sizes="96px"
              className="object-contain rounded-lg"
              unoptimized
            />
          </div>
          <div className="relative h-14 w-28 rounded-xl shadow-md bg-white p-1.5 transition-all duration-300 hover:scale-105 border border-slate-200">
            <Image 
              src="/logos/uet.png" 
              alt="UET Logo" 
              fill
              sizes="112px"
              className="object-contain rounded-lg"
              unoptimized
            />
          </div>
        </div>

        {/* Copywriting Section */}
        <div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-wide leading-relaxed text-slate-900 dark:text-white">
            National Center of <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-650 dark:from-purple-400 dark:to-indigo-400">
              Artificial Intelligence
            </span>
          </h1>
          <h2 className="text-[10px] sm:text-xs font-bold text-purple-650 dark:text-purple-400 uppercase tracking-[0.2em] mt-3.5 flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> NCAI LAB MANAGEMENT GATEWAY
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-6 max-w-md font-medium leading-relaxed tracking-wide">
            Advancing the frontiers of artificial intelligence through rigorous algorithmic research, autonomous agent architectures, and scalable deep learning ecosystems. Empowering the next generation of intelligent systems.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: Auth Card Portal */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-12 relative z-10 bg-slate-100/10 dark:bg-black/10 backdrop-blur-sm lg:backdrop-blur-none border-t lg:border-t-0 lg:border-l border-slate-200/30 dark:border-slate-800/30">
        
        {/* Ambient glow behind card */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 sm:w-96 h-72 sm:h-96 bg-gradient-to-tr from-purple-500/10 to-indigo-500/10 dark:from-purple-500/20 dark:to-indigo-500/20 rounded-full blur-3xl pointer-events-none animate-pulse duration-[6000ms]"></div>

        {/* Cinematic Card Wrapper */}
        <motion.div
          variants={cardVariants}
          initial="initial"
          animate={isTransitioning ? "animating" : "initial"}
          onAnimationComplete={() => {
            if (isTransitioning) {
              router.push(isTransitioning);
            }
          }}
          className="w-full max-w-md bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl p-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-indigo-500/5 rounded-2xl pointer-events-none"></div>
          
          <motion.div
            animate={{ opacity: isTransitioning ? 0 : 1 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full"
          >
            <div className="mb-6 text-center sm:text-left">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isLogin ? "Welcome back" : "Register Profile"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 font-medium leading-relaxed">
                {isLogin ? "Access the authorized KICS ecosystem." : "Submit an access request to NCAI Administration."}
              </p>
            </div>

            {/* High Contrast Segmented Toggle */}
            <div className="flex rounded-xl bg-slate-200 dark:bg-slate-800 p-1.5 border border-slate-300 dark:border-slate-700 mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                className={`transition-all duration-200 py-2.5 text-sm rounded-lg flex-1 text-center font-medium cursor-pointer ${
                  isLogin 
                    ? "bg-purple-600 text-white shadow-md font-semibold" 
                    : "text-slate-650 hover:text-slate-900 font-medium dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                className={`transition-all duration-200 py-2.5 text-sm rounded-lg flex-1 text-center font-medium cursor-pointer ${
                  !isLogin 
                    ? "bg-purple-600 text-white shadow-md font-semibold" 
                    : "text-slate-650 hover:text-slate-900 font-medium dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Response Alerts */}
            {errorMsg && (
              <div className="mb-5 rounded-xl bg-red-500/5 border border-red-500/20 p-4 text-xs text-red-600 dark:text-red-400 flex items-start gap-2.5">
                <AlertCircle className="h-4.5 w-4.5 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="mb-5 rounded-xl bg-green-500/5 border border-green-500/20 p-4 text-xs text-green-600 dark:text-green-400 flex items-start gap-2.5">
                <CheckCircle2 className="h-4.5 w-4.5 text-green-550 flex-shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                    Full Name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-zinc-500">
                      <User className="h-4.5 w-4.5" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Dr. Sarah Connor"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-lg bg-white/20 dark:bg-zinc-900/30 border border-slate-200/60 dark:border-zinc-800 py-2.5 pl-11 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-zinc-500">
                    <Mail className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="email"
                    required
                    placeholder="sconnor@ncai.gov"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg bg-white/20 dark:bg-zinc-900/30 border border-slate-200/60 dark:border-zinc-800 py-2.5 pl-11 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-zinc-500">
                    <Lock className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg bg-white/20 dark:bg-zinc-900/30 border border-slate-200/60 dark:border-zinc-850 py-2.5 pl-11 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
                  />
                </div>
              </div>

              {/* Lab Selector for Sign Up */}
              {!isLogin && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                    Research Lab Scoping
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-zinc-500">
                      <Briefcase className="h-4.5 w-4.5" />
                    </span>
                    <select
                      value={labId}
                      onChange={(e) => setLabId(e.target.value)}
                      className="w-full rounded-lg bg-white/20 dark:bg-zinc-900/30 border border-slate-200/60 dark:border-zinc-850 py-2.5 pl-11 pr-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 appearance-none transition-all"
                    >
                      {labs.length === 0 ? (
                        <>
                          <option value="gen_ai" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Generative AI Lab (GenAI)</option>
                          <option value="ai" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Artificial Intelligence Lab (AI)</option>
                          <option value="web_dev" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Web Development Lab (WebDev)</option>
                          <option value="cyber_sec" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Cyber Security Lab (CyberSec)</option>
                        </>
                      ) : (
                        labs.map(lab => (
                          <option key={lab.id} value={lab.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                            {lab.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-550 text-white py-3.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-6 cursor-pointer"
              >
                {submitting ? (
                  <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <>
                    <span>{isLogin ? "Sign In to System" : "Submit Access Request"}</span>
                    <ArrowRight className="h-4.5 w-4.5 text-purple-200" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
