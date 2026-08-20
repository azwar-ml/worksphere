"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import { 
  Users, CalendarCheck, BarChart3, AlertOctagon, 
  Sparkles, FileText, Clock, AlertTriangle, Cpu, HelpCircle, ArrowRight
} from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface AttendanceRecord {
  id: string;
  full_name: string;
  email: string;
  check_in: string;
  check_out: string | null;
  check_in_image?: string | null;
  check_out_image?: string | null;
}

interface Report {
  id: string;
  full_name: string;
  email: string;
  report_text: string;
  summary: string | null;
  blockers: string[];
  metrics: Record<string, any>;
  created_at: string;
}

interface Employee {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface RAGSource {
  id: string;
  type: string;
  description: string;
  content: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, clearAuth } = useAuthStore();

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Employee[]>([]);
  const [employeesCount, setEmployeesCount] = useState(0);
  
  const [fetching, setFetching] = useState(true);

  // RAG Summarizer state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [summaryResult, setSummaryResult] = useState("");
  const [summarySources, setSummarySources] = useState<RAGSource[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState("");

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
      
      // 1. Fetch attendance
      const attRes = await fetch(`${API_BASE}/admin/attendance`, { headers });
      if (attRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const attData = await attRes.json();
      setAttendance(Array.isArray(attData) ? attData : []);

      // 2. Fetch reports
      const repRes = await fetch(`${API_BASE}/admin/reports`, { headers });
      if (repRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const repData = await repRes.json();
      setReports(Array.isArray(repData) ? repData : []);

      // 3. Fetch employee profiles
      const empRes = await fetch(`${API_BASE}/admin/employees`, { headers });
      if (empRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const empData = await empRes.json();
      const empList = Array.isArray(empData) ? empData : [];
      setEmployees(empList.filter(emp => emp.role === "employee"));
      setPendingRequests(empList.filter(emp => emp.role === "pending"));
      setEmployeesCount(empList.filter(emp => emp.role === "employee" || emp.role === "admin" || emp.role === "superadmin").length);
      
      if (empList.length > 0) {
        // Default to first employee in list
        const firstEmployee = empList.find(emp => emp.role === "employee");
        if (firstEmployee) {
          setSelectedEmployeeId(firstEmployee.id);
        }
      }
    } catch (err) {
      console.error("Error loading admin data:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !searchQuery.trim() || !token) return;

    setSummarizing(true);
    setSummarizeError("");
    setSummaryResult("");
    setSummarySources([]);

    try {
      const res = await fetch(`${API_BASE}/admin/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          query: searchQuery
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSummaryResult(data.summary);
        setSummarySources(data.sources || []);
      } else {
        setSummarizeError(data.detail || "AI compilation failed.");
      }
    } catch (err) {
      setSummarizeError("Failed to fetch summary from NCAI RAG pipeline.");
    } finally {
      setSummarizing(false);
    }
  };

  const handleApprove = async (userId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/admin/employees/${userId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        await loadData();
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to approve researcher access.");
      }
    } catch (err) {
      console.error("Error approving researcher:", err);
      alert("Network error. Failed to approve researcher.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // Derived stats
  const checkedInToday = attendance.filter(log => !log.check_out).length;
  
  // Extract all blockers
  const allBlockers = reports
    .filter(r => r.blockers && r.blockers.length > 0)
    .map(r => ({
      reportId: r.id,
      fullName: r.full_name,
      blockers: r.blockers,
      created_at: r.created_at
    }));

  const presetQueries = [
    "Summarize research logs progress",
    "Identify bottlenecks or GPU errors",
    "Reconstruct work sessions timeline"
  ];

  return (
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-theme-fg flex items-center gap-2">
              Supervision Panel <Sparkles className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </h1>
            <p className="text-sm text-theme-secondary font-medium">Analyze lab progression metrics and resolve blocker flags.</p>
          </div>
        </div>

        {fetching ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="h-28 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="h-28 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="h-28 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="h-28 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
            </div>
            <div className="h-80 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border mt-8"></div>
          </div>
        ) : (
          <>
            {/* Access Requests Section */}
            {pendingRequests.length > 0 && (
              <div className="glass rounded-xl p-6 mb-8 border border-purple-500/30 shadow-lg shadow-purple-500/5">
                <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-450 animate-pulse" />
                  Access Requests (Pending Approval)
                </h3>
                <p className="text-xs text-theme-secondary mb-4 font-medium">The following researchers have registered and are requesting system access. Click approve to promote their role to employee and grant system entrance.</p>
                
                <div className="space-y-3">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="p-4 rounded-xl bg-purple-500/5 dark:bg-purple-950/10 border border-purple-500/20 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-purple-600/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm border border-purple-500/30">
                          {req.full_name ? req.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-theme-fg truncate">{req.full_name}</h4>
                          <p className="text-xs text-theme-secondary truncate mt-0.5">{req.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleApprove(req.id)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-purple-600/10"
                      >
                        Approve Access
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Card 1 */}
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-theme-secondary uppercase">Active Researchers</span>
              <Users className="h-5 w-5 text-purple-650 dark:text-purple-400" />
            </div>
            <h3 className="text-3xl font-extrabold text-theme-fg">{employeesCount}</h3>
            <p className="text-xs text-theme-secondary mt-1">Total database profiles</p>
          </div>

          {/* Card 2 */}
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-theme-secondary uppercase">Checked-In Today</span>
              <CalendarCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-3xl font-extrabold text-theme-fg">{checkedInToday}</h3>
            <p className="text-xs text-theme-secondary mt-1">Currently working in lab</p>
          </div>

          {/* Card 3 */}
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-theme-secondary uppercase">Reports Audited</span>
              <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-3xl font-extrabold text-theme-fg">{reports.length}</h3>
            <p className="text-xs text-theme-secondary mt-1">Total parsed updates</p>
          </div>

          {/* Card 4 */}
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-theme-secondary uppercase">Critical Blockers</span>
              <AlertOctagon className="h-5 w-5 text-red-500 dark:text-red-400" />
            </div>
            <h3 className="text-3xl font-extrabold text-theme-fg">
              {reports.filter(r => r.blockers && r.blockers.length > 0).length}
            </h3>
            <p className="text-xs text-theme-secondary mt-1">Reports reporting issues</p>
          </div>
        </div>

        {/* Registered Researchers Directory Section */}
        <div className="glass rounded-xl p-6 mb-8">
          <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            Registered Researchers Directory
          </h3>
          <p className="text-xs text-theme-secondary mb-4 font-medium">Click a researcher to view their check-in logs, uploaded reports, run AI vector RAG syntheses, or send direct messages.</p>
          
          {employees.length === 0 ? (
            <div className="text-center py-8 text-sm text-theme-secondary border border-dashed border-theme-border rounded-lg">
              No researchers registered in the database.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {employees.map(emp => (
                <div
                  key={emp.id}
                  onClick={() => router.push(`/admin/researchers/${emp.id}`)}
                  className="p-4 rounded-xl bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border hover:border-purple-500/40 hover:bg-purple-500/5 cursor-pointer transition-all flex items-center gap-3.5 group"
                >
                  <div className="h-10 w-10 rounded-full bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm border border-purple-500/25 group-hover:scale-105 transition-transform flex-shrink-0">
                    {emp.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-theme-fg truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{emp.full_name}</h4>
                    <p className="text-xs text-theme-secondary truncate mt-0.5">{emp.email}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-theme-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}
      </main>
    </div>
  );
}
