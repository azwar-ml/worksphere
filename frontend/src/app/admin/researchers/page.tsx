"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import { Users, Clock, ArrowRight, ShieldCheck, Tag } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export default function ResearchersPage() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, clearAuth } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fetching, setFetching] = useState(true);

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

  const loadData = async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${API_BASE}/admin/employees`, { headers });
      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const data = await res.json();
      const empList = Array.isArray(data) ? data : [];
      setEmployees(empList.filter(emp => emp.role === "employee"));
    } catch (err) {
      console.error("Error loading researchers:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  if (isLoading || fetching) {
    return (
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8 md:ml-64">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-theme-fg flex items-center gap-2">
            NCAI Lab Researchers Directory <ShieldCheck className="h-5 w-5 text-purple-500" />
          </h1>
          <p className="text-sm text-theme-secondary font-medium mt-1">Audit active profiles, examine check-in sheets, and launch AI semantic RAG reports.</p>
        </div>

        <div className="glass rounded-xl p-6">
          <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            Registered Researchers ({employees.length})
          </h3>
          
          {employees.length === 0 ? (
            <div className="text-center py-16 text-sm text-theme-secondary border border-dashed border-theme-border rounded-lg">
              No registered researchers found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {employees.map(emp => (
                <div
                  key={emp.id}
                  onClick={() => router.push(`/admin/researchers/${emp.id}`)}
                  className="p-5 rounded-xl bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border hover:border-purple-500/40 hover:bg-purple-500/5 cursor-pointer transition-all flex items-center justify-between group shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-12 w-12 rounded-full bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-base border border-purple-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
                      {emp.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-theme-fg truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{emp.full_name}</h4>
                      <p className="text-xs text-theme-secondary truncate mt-0.5">{emp.email}</p>
                      <span className="inline-block mt-2 rounded bg-purple-500/10 px-2 py-0.5 text-[9px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                        {emp.role ? (emp.role.charAt(0).toUpperCase() + emp.role.slice(1)) : ""}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-theme-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1.5 transition-all flex-shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
