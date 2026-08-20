"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import { 
  Users, Trash2, Plus, Calendar, ShieldCheck, 
  Layers, CheckSquare, BellRing, Clock, AlertOctagon, CheckCircle2 
} from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface Workspace {
  id: string;
  name: string;
  description: string;
}

interface Member {
  id: string;
  workspace_id: string;
  user_id: string;
  full_name: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string | null;
  workspace_id: string | null;
  due_date: string | null;
  status: string;
}

export default function AdminEmployeesPage() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, clearAuth } = useAuthStore();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Workspace Creation State
  const [wsName, setWsName] = useState("");
  const [wsDesc, setWsDesc] = useState("");

  // Member Association State
  const [addMemberUserId, setAddMemberUserId] = useState("");

  // Task Assignment State
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState("");
  const [taskWorkspaceId, setTaskWorkspaceId] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");

  // Alert State
  const [alertTargetType, setAlertTargetType] = useState("global");
  const [alertTargetId, setAlertTargetId] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [alertContent, setAlertContent] = useState("");
  const [alertPriority, setAlertPriority] = useState("normal");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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
      
      // Load employees
      const empRes = await fetch(`${API_BASE}/admin/employees`, { headers });
      if (empRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const empData = await empRes.json();
      setEmployees(Array.isArray(empData) ? empData : []);

      // Load workspaces
      const wsRes = await fetch(`${API_BASE}/user/workspaces`, { headers });
      if (wsRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const wsData = await wsRes.json();
      const wsList = Array.isArray(wsData) ? wsData : [];
      setWorkspaces(wsList);
      if (wsList.length > 0 && !selectedWorkspaceId) {
        setSelectedWorkspaceId(wsList[0].id);
      }

      // Load tasks
      const taskRes = await fetch(`${API_BASE}/admin/tasks`, { headers });
      if (taskRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const taskData = await taskRes.json();
      setTasks(Array.isArray(taskData) ? taskData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Load selected workspace members
  const loadWorkspaceMembers = async () => {
    if (!token || !selectedWorkspaceId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/workspaces/${selectedWorkspaceId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setWorkspaceMembers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadWorkspaceMembers();
  }, [selectedWorkspaceId, token]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/admin/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: wsName, description: wsDesc })
      });
      if (res.ok) {
        setWsName("");
        setWsDesc("");
        await loadData();
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to create workspace.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddWorkspaceMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspaceId || !addMemberUserId) return;

    try {
      const res = await fetch(`${API_BASE}/admin/workspaces/${selectedWorkspaceId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ user_id: addMemberUserId })
      });
      if (res.ok) {
        setAddMemberUserId("");
        await loadWorkspaceMembers();
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to add member.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveWorkspaceMember = async (userId: string) => {
    if (!selectedWorkspaceId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/workspaces/${selectedWorkspaceId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await loadWorkspaceMembers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    try {
      const payload = {
        title: taskTitle,
        description: taskDesc,
        assigned_to: taskAssignedTo || null,
        workspace_id: taskWorkspaceId || null,
        due_date: taskDueDate ? new Date(taskDueDate).toISOString() : null
      };

      const res = await fetch(`${API_BASE}/admin/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setTaskTitle("");
        setTaskDesc("");
        setTaskAssignedTo("");
        setTaskWorkspaceId("");
        setTaskDueDate("");
        await loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle.trim() || !alertContent.trim()) return;

    try {
      const payload = {
        target_type: alertTargetType,
        target_id: alertTargetId || null,
        title: alertTitle,
        content: alertContent,
        priority: alertPriority
      };

      const res = await fetch(`${API_BASE}/admin/alerts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (res.ok) {
        setAlertTitle("");
        setAlertContent("");
        setAlertTargetId("");
        setAlertPriority("normal");
        showToast("Alert broadcasted successfully!", "success");
      } else {
        showToast(data.detail || "Failed to broadcast alert.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "An unexpected network error occurred.", "error");
    }
  };

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

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-theme-fg flex items-center gap-2">
              Workspace & Team Control <Users className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </h1>
            <p className="text-sm text-theme-secondary font-medium">Assemble groups, delegate goals, and manage notifications.</p>
          </div>
        </div>

        {/* Section 1: Workspaces and memberships */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
          {/* Create and list workspaces */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-theme-secondary" />
              Workspaces Management
            </h3>

            <form onSubmit={handleCreateWorkspace} className="space-y-3 mb-6 bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Workspace Name (e.g. NLP-Team)"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={wsDesc}
                  onChange={(e) => setWsDesc(e.target.value)}
                  className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 rounded bg-purple-600 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
              >
                <Plus className="h-4.5 w-4.5" /> Create Workspace
              </button>
            </form>

            {/* List Workspaces */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {workspaces.map(ws => (
                <div 
                  key={ws.id}
                  onClick={() => setSelectedWorkspaceId(ws.id)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    selectedWorkspaceId === ws.id 
                      ? "bg-purple-600/10 border-purple-500/30"
                      : "bg-zinc-900/5 dark:bg-zinc-900/30 border-theme-border hover:bg-zinc-200/50 dark:hover:bg-zinc-900/50"
                  }`}
                >
                  <h4 className="text-xs font-bold text-theme-fg">{ws.name}</h4>
                  <p className="text-[10px] text-theme-secondary mt-1">{ws.description || "No description provided."}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Members of selected workspace */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-theme-secondary" />
              Workspace Members Control
            </h3>

            {selectedWorkspaceId ? (
              <>
                <form onSubmit={handleAddWorkspaceMember} className="space-y-3 mb-6 bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border rounded-lg p-4">
                  <div className="flex gap-3">
                    <select
                      required
                      value={addMemberUserId}
                      onChange={(e) => setAddMemberUserId(e.target.value)}
                      className="flex-1 rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="" className="bg-theme-bg">Select Employee to Add</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id} className="bg-theme-bg text-theme-fg">{emp.full_name} ({emp.email})</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="flex items-center justify-center gap-1 rounded bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </form>

                {/* Member lists */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {workspaceMembers.length === 0 ? (
                    <p className="text-xs text-theme-secondary py-6 text-center">No members in this workspace yet.</p>
                  ) : (
                    workspaceMembers.map(m => (
                      <div key={m.id} className="p-3 rounded bg-zinc-900/5 dark:bg-zinc-900/40 border border-theme-border flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-theme-fg">{m.full_name}</h4>
                          <span className="text-[9px] text-theme-secondary block">{m.email}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveWorkspaceMember(m.user_id)}
                          className="text-zinc-500 hover:text-red-500 p-1.5 rounded transition-all hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-theme-secondary py-8 text-center">Please select or create a workspace first.</p>
            )}
          </div>
        </div>

        {/* Section 2: Task Creation & alerts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Milestone assignments */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
              <CheckSquare className="h-4.5 w-4.5 text-theme-secondary" />
              Assign Milestone Targets
            </h3>

            <form onSubmit={handleCreateTask} className="space-y-3 mb-6 bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border rounded-lg p-4">
              <input
                type="text"
                required
                placeholder="Target Title (e.g. Fine-tune Llama-3 model)"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="w-full rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <textarea
                placeholder="Target Description"
                rows={2}
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                className="w-full rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              ></textarea>

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={taskAssignedTo}
                  onChange={(e) => setTaskAssignedTo(e.target.value)}
                  className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="" className="bg-theme-bg">Assign to Employee (Optional)</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id} className="bg-theme-bg text-theme-fg">{emp.full_name}</option>
                  ))}
                </select>
                <select
                  value={taskWorkspaceId}
                  onChange={(e) => setTaskWorkspaceId(e.target.value)}
                  className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="" className="bg-theme-bg">Assign to Workspace (Optional)</option>
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.id} className="bg-theme-bg text-theme-fg">{ws.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-[9px] text-theme-secondary uppercase tracking-widest mb-1 pl-1">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-1.5 rounded bg-purple-600 py-2 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
                  >
                    <Plus className="h-4.5 w-4.5" /> Assign Target
                  </button>
                </div>
              </div>
            </form>

            {/* List Active Tasks */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {tasks.length === 0 ? (
                <p className="text-xs text-theme-secondary py-6 text-center">No targets defined.</p>
              ) : (
                tasks.map(task => (
                  <div key={task.id} className="p-3 rounded bg-zinc-900/5 dark:bg-zinc-900/40 border border-theme-border flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-theme-fg">{task.title}</h4>
                      <p className="text-[10px] text-theme-secondary mt-0.5">{task.description}</p>
                      <div className="flex gap-3 mt-2 text-[9px] text-theme-secondary">
                        <span className="uppercase">Status: <strong className="text-purple-600 dark:text-purple-400">{task.status}</strong></span>
                        {task.due_date && <span>Deadline: {new Date(task.due_date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-zinc-500 hover:text-red-500 p-1.5 rounded transition-all hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Alert broadcast system */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
              <BellRing className="h-4.5 w-4.5 text-theme-secondary" />
              Broadcast Emergency Alerts
            </h3>

            <form onSubmit={handleSendAlert} className="space-y-3 bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-[9px] text-theme-secondary uppercase tracking-widest mb-1 pl-1">Scope</label>
                  <select
                    value={alertTargetType}
                    onChange={(e) => {
                      setAlertTargetType(e.target.value);
                      setAlertTargetId("");
                    }}
                    className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="global" className="bg-theme-bg text-theme-fg">Global Broadcast</option>
                    <option value="workspace" className="bg-theme-bg text-theme-fg">Workspace Specific</option>
                    <option value="user" className="bg-theme-bg text-theme-fg">Individual Employee</option>
                  </select>
                </div>

                {alertTargetType !== "global" && (
                  <div className="flex flex-col">
                    <label className="text-[9px] text-theme-secondary uppercase tracking-widest mb-1 pl-1">Target</label>
                    <select
                      required
                      value={alertTargetId}
                      onChange={(e) => setAlertTargetId(e.target.value)}
                      className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="" className="bg-theme-bg">Select Target</option>
                      {alertTargetType === "workspace" 
                        ? workspaces.map(ws => <option key={ws.id} value={ws.id} className="bg-theme-bg text-theme-fg">{ws.name}</option>)
                        : employees.map(emp => <option key={emp.id} value={emp.id} className="bg-theme-bg text-theme-fg">{emp.full_name}</option>)
                      }
                    </select>
                  </div>
                )}
              </div>

              <div>
                <input
                  type="text"
                  required
                  placeholder="Alert Title (e.g. Critical Server Outage)"
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                  className="w-full rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <textarea
                  required
                  placeholder="Detail text..."
                  rows={2}
                  value={alertContent}
                  onChange={(e) => setAlertContent(e.target.value)}
                  className="w-full rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-[9px] text-theme-secondary uppercase tracking-widest mb-1 pl-1">Severity</label>
                  <select
                    value={alertPriority}
                    onChange={(e) => setAlertPriority(e.target.value)}
                    className="rounded bg-theme-bg border border-theme-border px-3 py-1.5 text-xs text-theme-fg focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="low" className="bg-theme-bg">Low Priority</option>
                    <option value="normal" className="bg-theme-bg">Normal</option>
                    <option value="high" className="bg-theme-bg">High Priority</option>
                    <option value="critical" className="bg-theme-bg">Critical Severity</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-1.5 rounded bg-purple-600 py-2 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer animate-pulse"
                  >
                    Broadcast Warning
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>

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
