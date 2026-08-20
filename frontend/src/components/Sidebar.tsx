"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../store/authStore";
import { 
  LayoutDashboard, CalendarRange, CloudUpload, MessageSquare, 
  Users, LogOut, ShieldCheck
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth, fullName, role, email } = useAuthStore();

  const handleLogout = () => {
    clearAuth();
    router.push("/");
  };

  const isAdmin = role === "admin" || role === "superadmin";

  // Define navigation items based on role
  const navItems = isAdmin 
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
    <div className="flex h-screen w-64 flex-col border-r border-theme-sidebar-border bg-theme-sidebar/80 backdrop-blur-md px-4 py-6 text-theme-secondary transition-colors duration-200">
      {/* Brand logo */}
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-500 dark:text-purple-400">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-theme-fg tracking-wider uppercase">WorkSphere</h2>
          <span className="text-[10px] font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-widest">{role}</span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? "bg-purple-600/10 text-purple-600 dark:text-purple-400 border-l-2 border-purple-500 pl-2.5" 
                  : "hover:bg-zinc-200/50 dark:hover:bg-zinc-900/60 hover:text-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className={`h-4.5 w-4.5 ${isActive ? "text-purple-600 dark:text-purple-400" : "text-zinc-500"}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Theme Toggle & Logout */}
      <div className="border-t border-theme-sidebar-border pt-6 mt-6">
        <div className="flex items-center justify-between gap-2 px-2 mb-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-sm font-semibold text-zinc-800 dark:text-white flex-shrink-0">
              {fullName ? fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
            </div>
            <div className="overflow-hidden">
              <h4 className="text-xs font-semibold text-theme-fg truncate">{fullName || "User"}</h4>
              <p className="text-[10px] text-theme-secondary truncate">{email}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-theme-secondary transition-all hover:bg-red-950/20 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
        >
          <LogOut className="h-4.5 w-4.5 text-zinc-500 group-hover:text-red-500" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
