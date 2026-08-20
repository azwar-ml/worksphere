"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import WebcamModal from "../../components/WebcamModal";
import { CalendarRange, Clock, ArrowDownLeft, ArrowUpRight, Award, Trash2 } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface AttendanceRecord {
  id: string;
  check_in: string;
  check_out: string | null;
  created_at: string;
  check_in_image?: string | null;
  check_out_image?: string | null;
}

export default function AttendancePage() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, clearAuth } = useAuthStore();

  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [activeLog, setActiveLog] = useState<AttendanceRecord | null>(null);
  
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
      if (role === "pending") {
        router.push("/pending");
        return;
      }
    }
  }, [isAuthenticated, isLoading, role, router]);

  const loadHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/user/attendance/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
        const active = data.find(log => !log.check_out);
        setIsCheckedIn(!!active);
        setActiveLog(active || null);
      }
    } catch (err) {
      console.error("Failed to load attendance logs", err);
    } finally {
      setFetching(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to delete this attendance record?")) return;

    // Optimistically update the UI
    const previousHistory = [...history];
    setHistory(history.filter(record => record.id !== recordId));
    if (activeLog && activeLog.id === recordId) {
      setIsCheckedIn(false);
      setActiveLog(null);
    }

    try {
      const res = await fetch(`${API_BASE}/user/employee/attendance/${recordId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to delete attendance record");
      }
      
      await loadHistory();
    } catch (err) {
      console.error("Failed to delete record", err);
      alert("Error: Failed to delete attendance record.");
      setHistory(previousHistory);
    }
  };

  useEffect(() => {
    loadHistory();
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
      
      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      
      if (res.ok) {
        setIsWebcamOpen(false);
        await loadHistory();
      } else {
        const data = await res.json();
        throw new Error(data.detail || "Verification failed.");
      }
    } catch (err: any) {
      console.error(err);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const calculateDuration = (checkInStr: string, checkOutStr: string | null) => {
    if (!checkOutStr) return "In Progress";
    const diff = new Date(checkOutStr).getTime() - new Date(checkInStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    return `${hours}h ${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-theme-fg flex items-center gap-2">
              Attendance Portal <CalendarRange className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </h1>
            <p className="text-sm text-theme-secondary">Track and log your daily researcher work sessions.</p>
          </div>
        </div>

        {fetching ? (
          <div className="space-y-6">
            <div className="h-44 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
            <div className="h-64 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border mt-8"></div>
          </div>
        ) : (
          <>
            {/* Action Panel */}
            <div className="glass rounded-xl p-8 mb-8 text-center max-w-2xl">
          <h2 className="text-xl font-semibold text-theme-fg">Daily Logger</h2>
          <p className="text-sm text-theme-secondary mt-2">
            Log your research sessions. Check-in logs your entry time, check-out completes the work log.
          </p>

          <div className="mt-8 flex justify-center items-center gap-8">
            <div className="text-left">
              <span className="text-xs font-semibold text-theme-secondary uppercase tracking-widest block">Check In Time</span>
              <span className="text-lg font-bold text-theme-fg mt-1 block">
                {activeLog 
                  ? new Date(activeLog.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : "--:--"
                }
              </span>
            </div>
            <div className="h-10 w-px bg-theme-border"></div>
            <button
              onClick={() => setIsWebcamOpen(true)}
              disabled={actionLoading}
              className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                isCheckedIn 
                  ? "bg-red-950/40 text-red-400 border border-red-500/30 hover:bg-red-950/60" 
                  : "bg-purple-600 text-white hover:bg-purple-500"
              }`}
            >
              {isCheckedIn ? "Log Check Out" : "Log Check In"}
            </button>
          </div>
        </div>

        {/* History Table */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-base font-bold text-theme-fg mb-6">Work Session Logs</h3>
          
          {history.length === 0 ? (
            <div className="text-center py-16 text-sm text-theme-secondary border border-dashed border-theme-border rounded-lg">
              No session history found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-theme-secondary">
                <thead className="text-xs uppercase text-theme-secondary border-b border-theme-border">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Check In</th>
                    <th className="py-3 px-4">Check Out</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border">
                  {history.map((record) => (
                    <tr key={record.id} className="hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="py-4 px-4 font-semibold text-theme-fg">
                        {new Date(record.check_in).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          {record.check_in_image && (
                            <img 
                              src={record.check_in_image} 
                              alt="Check-in biometric face log" 
                              className="h-8 w-8 rounded-full border border-purple-500/30 object-cover flex-shrink-0" 
                            />
                          )}
                          <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                            {new Date(record.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {record.check_out ? (
                          <div className="flex items-center gap-3">
                            {record.check_out_image && (
                              <img 
                                src={record.check_out_image} 
                                alt="Check-out biometric face log" 
                                className="h-8 w-8 rounded-full border border-purple-500/30 object-cover flex-shrink-0" 
                              />
                            )}
                            <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              {new Date(record.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-theme-secondary">--:--</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-theme-fg">
                        {calculateDuration(record.check_in, record.check_out)}
                      </td>
                      <td className="py-4 px-4">
                        {record.check_out ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-500 dark:text-green-400">
                            <Award className="h-3 w-3" /> Complete
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400 animate-pulse">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="p-1.5 rounded-lg text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}
      </main>

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
