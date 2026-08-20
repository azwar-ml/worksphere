"use client";

import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../../../../store/authStore";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "../../../../components/Sidebar";
import { 
  Users, CalendarCheck, FileText, Sparkles, Clock, 
  ArrowLeft, Send, Cpu, CheckCircle2, AlertOctagon,
  AlertTriangle, ArrowRight, ShieldCheck, Tag, CheckSquare, Square
} from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Employee {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface AttendanceRecord {
  id: string;
  check_in: string;
  check_out: string | null;
  created_at: string;
  check_in_image?: string | null;
  check_out_image?: string | null;
}

interface Report {
  id: string;
  report_text: string;
  summary: string | null;
  blockers: string[];
  metrics: Record<string, any>;
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string | null;
  status: string;
  due_date: string | null;
}

interface RAGSource {
  id: string;
  type: string;
  description: string;
  content: string;
}

export default function ResearcherDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const { token, isAuthenticated, initialize, isLoading, role, clearAuth } = useAuthStore();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  const [fetching, setFetching] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // RAG Summarizer state
  const [searchQuery, setSearchQuery] = useState("");
  const [summaryResult, setSummaryResult] = useState("");
  const [summarySources, setSummarySources] = useState<RAGSource[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState("");

  // Direct Message state
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [fetchingChat, setFetchingChat] = useState(true);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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

  const loadChat = async () => {
    if (!token || !id) return;
    try {
      const res = await fetch(`${API_BASE}/admin/chat/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setChatMessages(data);
        }
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
    } finally {
      setFetchingChat(false);
    }
  };

  // Poll chat history every 4 seconds
  useEffect(() => {
    if (!token || !id) return;
    loadChat();
    const interval = setInterval(() => {
      loadChat();
    }, 4000);
    return () => clearInterval(interval);
  }, [token, id]);

  const loadData = async () => {
    if (!token || !id) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Fetch employee profiles
      const empRes = await fetch(`${API_BASE}/admin/employees`, { headers });
      if (empRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const empData = await empRes.json();
      if (Array.isArray(empData)) {
        const found = empData.find(emp => emp.id === id);
        if (found) {
          setEmployee(found);
        } else {
          showToast("Researcher profile not found.", "error");
        }
      }

      // 2. Fetch specific attendance
      const attRes = await fetch(`${API_BASE}/admin/employees/${id}/attendance`, { headers });
      const attData = await attRes.json();
      setAttendance(Array.isArray(attData) ? attData : []);

      // 3. Fetch specific reports
      const repRes = await fetch(`${API_BASE}/admin/employees/${id}/reports`, { headers });
      const repData = await repRes.json();
      setReports(Array.isArray(repData) ? repData : []);

      // 4. Fetch all tasks and filter for this employee
      const taskRes = await fetch(`${API_BASE}/admin/tasks`, { headers });
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        const filteredTasks = Array.isArray(taskData) 
          ? taskData.filter((t: Task) => t.assigned_to === id)
          : [];
        setTasks(filteredTasks);
      }

      // 5. Load chat messages
      await loadChat();

    } catch (err) {
      console.error("Error loading profile details:", err);
      showToast("Error synchronizing profile files.", "error");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, id]);

  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !searchQuery.trim() || !token) return;

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
          employee_id: id,
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !token || !id) return;

    setSendingMsg(true);
    const textToSend = messageText;
    const tempId = `temp-${Date.now()}`;

    // Optimistic UI update
    const tempMsg = {
      id: tempId,
      workspace_id: "",
      user_id: "admin-id",
      content: textToSend,
      created_at: new Date().toISOString(),
      full_name: "Admin"
    };
    setChatMessages(prev => [...prev, tempMsg]);
    setMessageText("");

    try {
      const res = await fetch(`${API_BASE}/admin/chat/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: textToSend })
      });

      const data = await res.json();
      if (res.ok) {
        setChatMessages(prev => prev.map(m => m.id === tempId ? data : m));
      } else {
        showToast(data.detail || "Failed to deliver message.", "error");
        setChatMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      showToast("Network failure. Message not sent.", "error");
      setChatMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSendingMsg(false);
    }
  };

  if (isLoading || fetching) {
    return (
      <div className="flex h-screen items-center justify-center bg-theme-bg">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // Derive current attendance status
  const latestLog = attendance.length > 0 ? attendance[0] : null;
  const isCurrentlyCheckedIn = latestLog && !latestLog.check_out;

  const presetQueries = [
    "Summarize research logs progress",
    "Identify bottlenecks or GPU errors",
    "Reconstruct work sessions timeline"
  ];

  return (
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8">
        {/* Back and Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin/researchers")}
              className="p-2 rounded-lg bg-zinc-900/10 dark:bg-zinc-900/50 border border-theme-border hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Back to Researchers Directory"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-theme-fg flex items-center gap-2">
                Researcher Dossier: {employee?.full_name || "Active Staff"}
                <ShieldCheck className="h-4.5 w-4.5 text-purple-500" />
              </h1>
              <p className="text-xs text-theme-secondary font-medium mt-0.5">{employee?.email}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              isCurrentlyCheckedIn
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                : "bg-zinc-500/10 text-theme-secondary border border-theme-border"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isCurrentlyCheckedIn ? "bg-green-500 animate-ping" : "bg-zinc-500"}`}></span>
              {isCurrentlyCheckedIn ? "Checked In" : "Offline"}
            </span>
            <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-3 py-1 text-xs text-purple-650 dark:text-purple-400 font-semibold flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {employee?.role || "employee"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* LEFT COLUMN: Attendance, Work uploads & Milestones checklist (col-span-2) */}
          <div className="xl:col-span-2 space-y-8">
            
            {/* Attendance Logs */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-sm font-bold text-theme-fg mb-4 flex items-center gap-2">
                <CalendarCheck className="h-4.5 w-4.5 text-green-500" />
                Work Log Attendance Snapshot History ({attendance.length})
              </h3>
              
              {attendance.length === 0 ? (
                <p className="text-xs text-theme-secondary text-center py-8 border border-dashed border-theme-border rounded-lg">No work session logs stored.</p>
              ) : (
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto pr-1">
                  <table className="w-full text-left text-xs text-theme-fg">
                    <thead className="text-[10px] uppercase text-theme-secondary border-b border-theme-border sticky top-0 bg-theme-bg/95 backdrop-blur-sm z-10">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Check-In</th>
                        <th className="py-2.5 px-3">Check-Out</th>
                        <th className="py-2.5 px-3">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border">
                      {attendance.map((log) => {
                        const duration = log.check_out 
                          ? `${Math.floor((new Date(log.check_out).getTime() - new Date(log.check_in).getTime()) / (1000 * 60 * 60))}h ${Math.floor(((new Date(log.check_out).getTime() - new Date(log.check_in).getTime()) / (1000 * 60)) % 60)}m`
                          : "In Progress";
                        return (
                          <tr key={log.id} className="hover:bg-zinc-200/20 dark:hover:bg-zinc-900/10 transition-colors">
                            <td className="py-3 px-3 font-semibold text-theme-fg">
                              {new Date(log.check_in).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                {log.check_in_image && (
                                  <img src={log.check_in_image} className="h-6 w-6 rounded-full object-cover border border-purple-500/20" alt="Face" />
                                )}
                                <span className="text-green-600 dark:text-green-400 font-medium">
                                  {new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              {log.check_out ? (
                                <div className="flex items-center gap-2">
                                  {log.check_out_image && (
                                    <img src={log.check_out_image} className="h-6 w-6 rounded-full object-cover border border-purple-500/20" alt="Face" />
                                  )}
                                  <span className="text-red-650 dark:text-red-400 font-medium">
                                    {new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-purple-600 animate-pulse font-medium">Working</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-theme-secondary font-medium">{duration}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reports Audit */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-sm font-bold text-theme-fg mb-4 flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-purple-500" />
                Submitted Research Reports & Ingested Uploads ({reports.length})
              </h3>
              
              {reports.length === 0 ? (
                <p className="text-xs text-theme-secondary text-center py-8 border border-dashed border-theme-border rounded-lg">No research documentation uploaded.</p>
              ) : (
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                  {reports.map((report) => (
                    <div key={report.id} className="p-4 rounded-lg bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-theme-fg">Report Log</span>
                        <span className="text-[10px] text-theme-secondary">
                          {new Date(report.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-theme-secondary leading-relaxed italic">"{report.report_text}"</p>
                        
                        {report.blockers && report.blockers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {report.blockers.map((b, bIdx) => (
                              <span key={bIdx} className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500 font-semibold flex items-center gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {b}
                              </span>
                            ))}
                          </div>
                        )}

                        {report.summary && (
                          <div className="pt-2 border-t border-theme-border/40">
                            <span className="font-bold text-purple-600 dark:text-purple-400 block mb-0.5">Parsed AI Summary</span>
                            <p className="text-theme-fg font-medium">{report.summary}</p>
                          </div>
                        )}

                        {report.metrics && Object.keys(report.metrics).length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {Object.entries(report.metrics).map(([k, v]) => (
                              <span key={k} className="text-[9px] text-theme-secondary bg-zinc-200/50 dark:bg-zinc-950 px-1.5 py-0.5 rounded border border-theme-border">
                                {k.replace(/_/g, " ")}: <strong className="text-purple-650 dark:text-purple-450">{String(v)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned Milestones / Targets Status */}
            <div className="glass rounded-xl p-6">
              <h3 className="text-sm font-bold text-theme-fg mb-4 flex items-center gap-2">
                <CheckSquare className="h-4.5 w-4.5 text-purple-550" />
                Assigned Tasks & Milestone Targets ({tasks.length})
              </h3>
              
              {tasks.length === 0 ? (
                <p className="text-xs text-theme-secondary text-center py-8 border border-dashed border-theme-border rounded-lg">No active milestones assigned to this researcher.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-1">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-4 rounded-lg bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        {task.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-purple-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-xs">
                        <h4 className={`font-bold truncate ${task.status === "completed" ? "text-theme-secondary line-through" : "text-theme-fg"}`}>{task.title}</h4>
                        <p className="text-theme-secondary mt-1 line-clamp-2">{task.description}</p>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-theme-secondary">
                          <span className={`font-semibold uppercase tracking-wider ${
                            task.status === "completed" ? "text-green-500" : "text-purple-500"
                          }`}>
                            Status: {task.status}
                          </span>
                          {task.due_date && (
                            <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: RAG AI Summarizer & Direct message inputs (col-span-1) */}
          <div className="xl:col-span-1 space-y-8">
            
            {/* RAG AI Summarizer Panel */}
            <div className="glass rounded-xl p-6 border border-purple-500/20 shadow-purple-500/5 shadow-md">
              <h3 className="text-sm font-bold text-theme-fg mb-4 flex items-center gap-2">
                <Cpu className="h-4.5 w-4.5 text-purple-500" />
                NCAI Vector RAG AI Summarizer
              </h3>
              <p className="text-[11px] text-theme-secondary mb-4">Run contextual search syntheses querying strictly this researcher's ingested notes.</p>
              
              <form onSubmit={handleSummarize} className="space-y-3.5">
                <div className="flex flex-col">
                  <input
                    type="text"
                    required
                    placeholder="Enter context query parameters..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg bg-zinc-900/10 dark:bg-zinc-900/50 border border-theme-border py-2 px-3 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-zinc-500"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={summarizing}
                  className="w-full rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs py-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  {summarizing ? (
                    <Clock className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>Query Dossier RAG</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>

                <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                  {presetQueries.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSearchQuery(q)}
                      className="rounded bg-zinc-200 dark:bg-zinc-800 border border-theme-border px-2 py-0.5 text-theme-secondary hover:text-purple-600 dark:hover:text-purple-400 font-medium transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </form>

              {(summaryResult || summarizeError) && (
                <div className="mt-4 border-t border-theme-border pt-4">
                  {summarizeError && (
                    <div className="rounded bg-red-500/5 border border-red-500/20 p-3 text-[11px] text-red-500">
                      {summarizeError}
                    </div>
                  )}

                  {summaryResult && (
                    <div className="space-y-3">
                      <div>
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">RAG Context Output Summary</span>
                        <div className="bg-zinc-900/10 dark:bg-zinc-900/40 rounded-lg p-3.5 border border-theme-border text-xs text-theme-fg leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {summaryResult}
                        </div>
                      </div>

                      {summarySources.length > 0 && (
                        <div>
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Dossier Chunks Audited</span>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {summarySources.map((src) => (
                              <div key={src.id} className="p-2 bg-zinc-200/50 dark:bg-zinc-950/40 border border-theme-border rounded text-[10px] text-theme-secondary">
                                <p className="line-clamp-2 italic">"{src.content}"</p>
                                <span className="font-semibold text-purple-600 dark:text-purple-400 text-[8px] uppercase tracking-widest block mt-1">{src.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Direct Message Console */}
            <div className="glass rounded-xl p-6 flex flex-col h-[400px]">
              <h3 className="text-sm font-bold text-theme-fg mb-3 flex items-center gap-2">
                <Send className="h-4.5 w-4.5 text-purple-500" />
                Two-Way Chat Log
              </h3>
              
              {/* Messages log */}
              <div className="flex-1 overflow-y-auto border border-theme-border rounded-lg p-3 bg-zinc-900/10 dark:bg-zinc-900/20 mb-3 space-y-3">
                {fetchingChat ? (
                  <div className="h-full flex items-center justify-center">
                    <Clock className="h-5 w-5 animate-spin text-purple-500" />
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[10px] text-theme-secondary">
                    No message history. Write your first update!
                  </div>
                ) : (
                  chatMessages.map((msg: any) => {
                    const isOwnMessage = msg.user_id === "admin-id" || msg.full_name === "Admin";
                    return (
                      <div 
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] ${isOwnMessage ? "ml-auto items-end" : "mr-auto items-start"}`}
                      >
                        <span className="text-[8px] text-theme-secondary mb-0.5 px-0.5">
                          {isOwnMessage ? "You" : msg.full_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className={`p-2.5 rounded-xl text-[11px] leading-relaxed ${
                          isOwnMessage 
                            ? "bg-purple-600 text-white rounded-tr-none" 
                            : "glass text-theme-fg rounded-tl-none"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>
              
              <form onSubmit={handleSendMessage} className="mt-auto">
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Type message to researcher..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="w-full rounded-lg bg-zinc-900/10 dark:bg-zinc-900/50 border border-theme-border py-2 pl-3 pr-10 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-zinc-500"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || !messageText.trim()}
                    className="absolute inset-y-1 right-1 flex items-center justify-center h-7 w-7 rounded-md bg-purple-600 text-white hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      </main>

      {/* Success/Error Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ${
          toast.type === "success" 
            ? "bg-green-950/80 border-green-500 text-green-200" 
            : "bg-red-950/80 border-red-500 text-red-200"
        }`}>
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          ) : (
            <AlertOctagon className="h-5 w-5 text-red-400" />
          )}
          <span className="text-xs font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
