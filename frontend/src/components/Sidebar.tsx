"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../store/authStore";
import { 
  LayoutDashboard, CalendarRange, CloudUpload, MessageSquare, 
  Users, LogOut, ShieldCheck, Menu
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth, fullName, role, email } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    router.push("/");
  };

  const isAdmin = role === "admin" || role === "superadmin";

  // Define navigation items based on role
  const navItems = role === "superadmin"
    ? [
        { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
        { name: "Workspace & Team", href: "/admin/employees", icon: Users },
        { name: "Researchers", href: "/admin/researchers", icon: Users },
        { name: "Lab Chat", href: "/admin/chat", icon: MessageSquare },
        { name: "Superadmin DMs", href: "/superadmin/chat", icon: MessageSquare },
      ]
    : role === "admin"
    ? [
        { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
        { name: "Workspace & Team", href: "/admin/employees", icon: Users },
        { name: "Researchers", href: "/admin/researchers", icon: Users },
        { name: "Lab Chat", href: "/admin/chat", icon: MessageSquare },
      ]
    : [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Attendance", href: "/attendance", icon: CalendarRange },
        { name: "Work Upload", href: "/work-upload", icon: CloudUpload },
        { name: "Lab Chat", href: "/chat", icon: MessageSquare },
      ];

  return (
    <>
      {/* Mobile Hamburger Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-sm cursor-pointer focus:outline-none"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* FIXED SIDEBAR CONTAINER */}
      <div 
        className={`fixed top-0 left-0 h-screen w-64 flex flex-col bg-slate-50 dark:bg-[#0B0F19] border-r border-slate-200 dark:border-slate-800 z-40 transition-transform duration-300 md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand logo */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-650/20 border border-purple-500/30 text-purple-600 dark:text-purple-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-wider uppercase">WorkSphere</h2>
            <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-widest">{role}</span>
          </div>
        </div>

        {/* Scrollable Nav List */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? "bg-purple-600/10 text-purple-600 dark:text-purple-400 border-l-2 border-purple-500 pl-2.5" 
                      : "text-slate-500 dark:text-slate-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/60 hover:text-slate-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 ${isActive ? "text-purple-600 dark:text-purple-400" : "text-zinc-500"}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info, Theme Toggle & Logout - Anchored at the bottom */}
        <div className="mt-auto p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-100/50 dark:bg-slate-900/30">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-sm font-semibold text-zinc-800 dark:text-white flex-shrink-0">
              {fullName ? fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
            </div>
            <div className="overflow-hidden min-w-0">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-white truncate">{fullName || "User"}</h4>
              <p className="text-[9px] text-slate-550 dark:text-slate-400 truncate">{email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-500 hover:text-red-655 hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer transition-colors"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
