"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import WebcamModal from "../../components/WebcamModal";
import { CalendarRange, CheckCircle, Clock, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Task {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: string;
}

interface Alert {
  id: string;
  title: string;
  content: string;
  priority: string;
  created_at: string;
}

export default function EmployeeDashboard() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, status, clearAuth } = useAuthStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [activeLog, setActiveLog] = useState<any>(null);
  
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isWebcamOpen, setIsWebcamOpen] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/");
        return;
      }
      if (status === "pending") {
        router.push("/pending");
        return;
      }
    }
  }, [isAuthenticated, isLoading, status, router]);

  const loadData = async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // 1. Fetch attendance log history
      const attRes = await fetch(`${API_BASE}/user/attendance/history`, { headers });
      if (attRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const attData = await attRes.json();
      
      // Find if user is currently checked in (no checkout timestamp)
      const active = Array.isArray(attData) ? attData.find((log: any) => !log.check_out) : null;
      setIsCheckedIn(!!active);
      setActiveLog(active || null);

      // 2. Fetch tasks
      const tasksRes = await fetch(`${API_BASE}/user/tasks/my-tasks`, { headers });
      if (tasksRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const tasksData = await tasksRes.json();
      setTasks(Array.isArray(tasksData) ? tasksData : []);

      // 3. Fetch alerts
      const alertsRes = await fetch(`${API_BASE}/user/alerts`, { headers });
      if (alertsRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const alertsData = await alertsRes.json();
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleCaptureVerify = async (imageBase64: string) => {
    if (!token) return;
    setActionLoading(true);
    try {
      const endpoint = isCheckedIn ? "check-out" : "check-in";
      const res = await fetch(`${API_BASE}/user/attendance/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ image: imageBase64 })
      });
      const data = await res.json();
      
      if (res.ok) {
        setIsCheckedIn(!isCheckedIn);
        setActiveLog(isCheckedIn ? null : data);
        setIsWebcamOpen(false);
        await loadData();
      } else {
        throw new Error(data.detail || "Facial validation check failed.");
      }
    } catch (err: any) {
      console.error(err);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/user/tasks/${taskId}/status?status=${newStatus}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white transition-colors duration-300 flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8 md:ml-64">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-theme-fg flex items-center gap-2">
              Researcher Portal <Sparkles className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </h1>
            <p className="text-sm text-theme-secondary">Welcome to your NCAI Gen AI Research workspace.</p>
          </div>
        </div>

        {fetching ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-44 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="h-44 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="h-44 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
              <div className="h-80 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="h-80 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
            </div>
          </div>
        ) : (
          <>
            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Quick Attendance Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wider">Lab Session</span>
                <CalendarRange className="h-5 w-5 text-theme-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-theme-fg">Attendance Status</h3>
              <p className="text-sm text-theme-secondary mt-1">
                {isCheckedIn 
                  ? `Active check-in since: ${new Date(activeLog?.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : "You are currently off-duty."
                }
              </p>
              
              {/* Display Face verification photo if checked in */}
              {isCheckedIn && activeLog?.check_in_image && (
                <div className="mt-4 flex items-center gap-3 bg-zinc-900/10 dark:bg-black/10 p-2.5 rounded-lg border border-theme-border">
                  <img 
                    src={activeLog.check_in_image} 
                    alt="Check-in Face" 
                    className="h-10 w-10 rounded-full border border-purple-500 object-cover" 
                  />
                  <div>
                    <span className="text-[9px] font-bold text-purple-500 dark:text-purple-400 uppercase tracking-widest block">Biometric Record</span>
                    <span className="text-xs text-theme-fg font-medium">Face Match Verified</span>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsWebcamOpen(true)}
              disabled={actionLoading}
              className={`w-full mt-6 py-2.5 rounded-lg text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                isCheckedIn 
                  ? "bg-red-950/40 text-red-400 border border-red-500/30 hover:bg-red-950/60" 
                  : "bg-purple-600 text-white hover:bg-purple-500"
              }`}
            >
              {isCheckedIn ? "Check Out Session" : "Log Check In"}
            </button>
          </div>

          {/* Direct Tasks Counter */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wider">Research Targets</span>
              <CheckCircle className="h-5 w-5 text-theme-secondary" />
            </div>
            <h3 className="text-lg font-semibold text-theme-fg">Assigned Milestones</h3>
            <div className="mt-4 flex gap-4">
              <div>
                <span className="text-3xl font-extrabold text-theme-fg">
                  {tasks.filter(t => t.status !== "completed").length}
                </span>
                <p className="text-xs text-theme-secondary mt-1">Pending Milestones</p>
              </div>
              <div className="border-l border-theme-border pl-4">
                <span className="text-3xl font-extrabold text-theme-secondary">
                  {tasks.filter(t => t.status === "completed").length}
                </span>
                <p className="text-xs text-theme-secondary mt-1">Completed Goals</p>
              </div>
            </div>
          </div>

          {/* Active Alerts Indicator */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wider">Directives</span>
              <AlertCircle className="h-5 w-5 text-theme-secondary" />
            </div>
            <h3 className="text-lg font-semibold text-theme-fg">Broadcast Alerts</h3>
            <p className="text-3xl font-extrabold text-theme-fg mt-4">{alerts.length}</p>
            <p className="text-xs text-theme-secondary mt-1">Global & local alerts active.</p>
          </div>
        </div>

        {/* Tasks and Alerts split grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Milestone List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="text-base font-bold text-theme-fg mb-4">Your Milestones</h3>
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-sm text-theme-secondary border border-dashed border-theme-border rounded-lg">
                No active milestones assigned.
              </div>
            ) : (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                {tasks.map(task => (
                  <div key={task.id} className="p-4 rounded-lg bg-zinc-900/10 dark:bg-zinc-900/50 border border-theme-border flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-theme-fg">{task.title}</h4>
                      <p className="text-xs text-theme-secondary mt-1">{task.description || "No description provided."}</p>
                      {task.due_date && (
                        <p className="text-[10px] text-theme-secondary mt-2">
                          Deadline: {new Date(task.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <select
                      value={task.status}
                      onChange={(e) => handleTaskStatusChange(task.id, e.target.value)}
                      className="rounded bg-theme-bg border border-theme-border px-2 py-1 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Broadcasts */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="text-base font-bold text-theme-fg mb-4">Lab Notices</h3>
            {alerts.length === 0 ? (
              <div className="text-center py-12 text-sm text-theme-secondary border border-dashed border-theme-border rounded-lg">
                No active notices in your scope.
              </div>
            ) : (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                {alerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className={`p-4 rounded-lg border text-sm ${
                      alert.priority === "critical" || alert.priority === "high"
                        ? "bg-red-500/5 border-red-500/20 text-red-650 dark:text-red-300"
                        : "bg-zinc-900/10 dark:bg-zinc-900/50 border-theme-border text-theme-fg"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {(alert.priority === "critical" || alert.priority === "high") && (
                        <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
                      )}
                      <span>{alert.title}</span>
                    </div>
                    <p className="text-xs text-theme-secondary mt-1">{alert.content}</p>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-theme-secondary">
                      <span className="uppercase tracking-wider font-semibold text-purple-600 dark:text-purple-400">Priority: {alert.priority}</span>
                      <span>{new Date(alert.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </main>

      {/* Biometric Webcam verification modal */}
      <WebcamModal
        isOpen={isWebcamOpen}
        onClose={() => setIsWebcamOpen(false)}
        onCapture={handleCaptureVerify}
        loading={actionLoading}
        title={isCheckedIn ? "Verify Identity to Check-out" : "Verify Identity to Check-in"}
      />
    </div>
  );
}
