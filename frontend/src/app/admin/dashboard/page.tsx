"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import { 
  Users, CalendarCheck, BarChart3, AlertOctagon, 
  Sparkles, Clock, ArrowRight, ShieldCheck, Mail, Search
} from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

const labNameMap: Record<string, string> = {
  gen_ai: "Generative AI Lab",
  ai: "Artificial Intelligence Lab",
  web_dev: "Web Development Lab",
  cyber_sec: "Cyber Security Lab",
};

interface AttendanceRecord {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  check_in: string;
  check_out: string | null;
}

interface Report {
  id: string;
  user_id: string;
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
  lab_id: string | null;
  status: string;
}

export default function LabAdminDashboard() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, status, labId, clearAuth } = useAuthStore();

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Employee[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/");
      } else if (status === "pending") {
        router.push("/pending");
      } else if (role === "superadmin") {
        router.push("/superadmin/dashboard");
      } else if (role !== "admin") {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, role, status, router]);

  const loadData = async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // 1. Fetch active researchers scoped to lab
      const resRes = await fetch(`${API_BASE}/admin/researchers`, { headers });
      if (resRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const resData = await resRes.json();
      const activeList = Array.isArray(resData) ? resData : [];
      setEmployees(activeList);

      // 2. Fetch pending requests scoped to lab
      const penRes = await fetch(`${API_BASE}/admin/pending`, { headers });
      const penData = await penRes.json();
      const pendingList = Array.isArray(penData) ? penData : [];
      setPendingRequests(pendingList);

      // 3. Fetch active alerts
      try {
        const alertRes = await fetch(`${API_BASE}/admin/alerts`, { headers });
        if (alertRes.ok) {
          const alertData = await alertRes.json();
          setAlerts(Array.isArray(alertData) ? alertData : []);
        }
      } catch (err) {
        console.error("Failed to load alerts:", err);
      }

      // 4. Fetch attendance logs and reports
      const attRes = await fetch(`${API_BASE}/admin/attendance`, { headers });
      const attData = await attRes.json();
      const rawAttendance = Array.isArray(attData) ? attData : [];

      const repRes = await fetch(`${API_BASE}/admin/reports`, { headers });
      const repData = await repRes.json();
      const rawReports = Array.isArray(repData) ? repData : [];

      // Filter attendance and reports to ONLY match active researchers of this lab
      const activeIds = new Set(activeList.map(e => e.id));
      
      setAttendance(rawAttendance.filter((att: any) => activeIds.has(att.user_id)));
      setReports(rawReports.filter((rep: any) => activeIds.has(rep.user_id)));

    } catch (err) {
      console.error("Error loading lab admin data:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleApprove = async (userId: string) => {
    if (!token) return;
    try {
      // Optimistically remove user from pending list immediately
      setPendingRequests(prev => prev.filter(req => req.id !== userId));

      const res = await fetch(`${API_BASE}/admin/approve/${userId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        // Refresh active list and ensure synchronization in background
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to approve researcher.");
        // Rollback state in case of failure
        loadData();
      }
    } catch (err) {
      console.error("Error approving researcher:", err);
      alert("Network error. Failed to approve researcher.");
      loadData();
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const labName = labId ? (labNameMap[labId] || "Research Lab") : "Research Lab";
  const checkedInToday = attendance.filter(log => !log.check_out).length;
  const criticalBlockers = reports.filter(r => r.blockers && r.blockers.length > 0).length;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white transition-colors duration-300 flex overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8 md:ml-64">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-purple-500" />
              {labName} Administration
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Manage personnel, review access registrations, and monitor research sessions for your assigned lab.</p>
          </div>
          
          {/* Global Search Bar */}
          <div className="relative w-full md:w-72">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              <Search className="h-4 w-4" />
            </div>
          </div>
        </div>


        {fetching ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-slate-200/50 dark:bg-slate-900/50 animate-pulse border border-slate-250 dark:border-slate-850"></div>
              ))}
            </div>
            <div className="h-80 rounded-xl bg-slate-200/50 dark:bg-slate-900/50 animate-pulse border border-slate-250 dark:border-slate-850 mt-8"></div>
          </div>
        ) : (
          <>
            {/* Scoped Pending Requests */}
            {pendingRequests.filter(req => (req.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || req.email?.toLowerCase().includes(searchQuery.toLowerCase()))).length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/30 rounded-xl p-6 mb-8 shadow-sm">
                <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
                  Pending Requests ({labName})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-medium">The following researchers have requested access to the {labName}. Click approve to activate their profiles.</p>
                
                <div className="space-y-3">
                  {pendingRequests
                    .filter(req => 
                      (req.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       req.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                    .map(req => (
                    <div key={req.id} className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/10 border border-purple-200 dark:border-purple-500/20 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-650/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm border border-purple-200 dark:border-purple-500/30">
                          {req.full_name ? req.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold truncate">{req.full_name}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{req.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Active Researchers</span>
                  <Users className="h-5 w-5 text-purple-500 dark:text-purple-400" />
                </div>
                <h3 className="text-3xl font-extrabold">{employees.length}</h3>
                <p className="text-xs text-slate-500 mt-1">Total active lab researchers</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Checked-In Today</span>
                  <CalendarCheck className="h-5 w-5 text-green-500 dark:text-green-400" />
                </div>
                <h3 className="text-3xl font-extrabold">{checkedInToday}</h3>
                <p className="text-xs text-slate-500 mt-1">Active working sessions</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Reports Audited</span>
                  <BarChart3 className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                </div>
                <h3 className="text-3xl font-extrabold">{reports.length}</h3>
                <p className="text-xs text-slate-500 mt-1">Total compiled logs</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Critical Blockers</span>
                  <AlertOctagon className="h-5 w-5 text-red-500 dark:text-red-400" />
                </div>
                <h3 className="text-3xl font-extrabold">{criticalBlockers}</h3>
                <p className="text-xs text-slate-500 mt-1">Identified operational flags</p>
              </div>
            </div>

            {/* Active Researchers Directory */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                Active Researchers ({labName})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-medium">Select a researcher to drill down into logs, track operational reports, or message them directly.</p>
              
              {employees.filter(emp => (emp.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || emp.email?.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  No active researchers in this lab.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {employees
                    .filter(emp => 
                      (emp.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       emp.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                    .map(emp => (
                    <div
                      key={emp.id}
                      onClick={() => router.push(`/admin/researchers/${emp.id}`)}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 hover:border-purple-500/40 hover:bg-purple-500/5 cursor-pointer transition-all flex items-center gap-3.5 group"
                    >
                      <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-650/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm border border-purple-250 dark:border-purple-500/25 group-hover:scale-105 transition-transform flex-shrink-0">
                        {emp.full_name ? emp.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{emp.full_name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1">
                          <Mail className="h-3 w-3 text-slate-400" />
                          {emp.email}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
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
