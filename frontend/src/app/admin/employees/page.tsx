"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import { 
  Users, Trash2, Plus, Calendar, ShieldCheck, 
  Layers, CheckSquare, BellRing, Clock, AlertOctagon, CheckCircle2,
  X, Send, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

const labNameMap: Record<string, string> = {
  gen_ai: "Generative AI Lab",
  ai: "Artificial Intelligence Lab",
  web_dev: "Web Development Lab",
  cyber_sec: "Cyber Security Lab",
};

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

  const [activeTab, setActiveTab] = useState<"workspaces" | "milestones" | "broadcasts">("workspaces");
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
  const [assignmentType, setAssignmentType] = useState<"employee" | "workspace">("employee");

  // Alert State
  const [alertTargetType, setAlertTargetType] = useState("global");
  const [alertTargetId, setAlertTargetId] = useState("");
  const [alertTargetLab, setAlertTargetLab] = useState("gen_ai");
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
        showToast("Workspace created successfully!", "success");
        await loadData();
      } else {
        const errData = await res.json();
        showToast(errData.detail || "Failed to create workspace.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error. Failed to create workspace.", "error");
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
        showToast("Member added to workspace.", "success");
        await loadWorkspaceMembers();
      } else {
        const errData = await res.json();
        showToast(errData.detail || "Failed to add member.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error. Failed to add member.", "error");
    }
  };

  const handleRemoveWorkspaceMember = async (userId: string) => {
    if (!selectedWorkspaceId) return;
    try {
      // Optimistic local state update
      setWorkspaceMembers(prev => prev.filter(m => m.user_id !== userId));
      
      const res = await fetch(`${API_BASE}/admin/workspaces/${selectedWorkspaceId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast("Member removed from workspace.", "success");
        await loadWorkspaceMembers();
      } else {
        showToast("Failed to remove member.", "error");
        await loadWorkspaceMembers();
      }
    } catch (err) {
      console.error(err);
      showToast("Network error. Failed to remove member.", "error");
      await loadWorkspaceMembers();
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    try {
      const payload = {
        title: taskTitle,
        description: taskDesc,
        assigned_to: assignmentType === "employee" ? (taskAssignedTo || null) : null,
        workspace_id: assignmentType === "workspace" ? (taskWorkspaceId || null) : null,
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
        showToast("Milestone target created!", "success");
        await loadData();
      } else {
        showToast("Failed to create milestone target.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error. Failed to create milestone target.", "error");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      // Optimistic local state update
      setTasks(prev => prev.filter(t => t.id !== taskId));

      const res = await fetch(`${API_BASE}/admin/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast("Milestone target deleted.", "success");
        await loadData();
      } else {
        showToast("Failed to delete milestone.", "error");
        await loadData();
      }
    } catch (err) {
      console.error(err);
      showToast("Network error. Failed to delete milestone.", "error");
      await loadData();
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle.trim() || !alertContent.trim()) return;

    try {
      const payload = {
        target_type: alertTargetType,
        target_id: alertTargetType === "workspace" || alertTargetType === "user" ? (alertTargetId || null) : null,
        target_lab: alertTargetType === "lab" ? alertTargetLab : null,
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
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white transition-colors duration-300 flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8 md:ml-64">
        {/* Page Title Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Workspace & Team Control <Users className="h-5 w-5 text-purple-500" />
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Assemble groups, delegate goals, and manage emergency notifications.</p>
          </div>
        </div>

        {/* STEP 2: SLEEK HORIZONTAL TABS */}
        <div className="flex bg-slate-200/60 dark:bg-slate-900/60 p-1 border border-slate-200 dark:border-slate-800 rounded-xl gap-1 mb-8 max-w-2xl">
          <button
            type="button"
            onClick={() => setActiveTab("workspaces")}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
              activeTab === "workspaces"
                ? "bg-purple-600 text-white shadow-md font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Workspaces
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("milestones")}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
              activeTab === "milestones"
                ? "bg-purple-600 text-white shadow-md font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Milestones & Targets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("broadcasts")}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
              activeTab === "broadcasts"
                ? "bg-purple-600 text-white shadow-md font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Emergency Broadcasts
          </button>
        </div>

        {/* Tab Content Wrapper */}
        <div className="relative w-full">
          <AnimatePresence mode="wait">
            {activeTab === "workspaces" && (
              <motion.div
                key="workspaces"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 xl:grid-cols-2 gap-8"
              >
                {/* Left Side: Create and select workspace */}
                <div className="backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-slate-800/60 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                    <Layers className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                    Workspaces Management
                  </h3>

                  <form onSubmit={handleCreateWorkspace} className="space-y-4 mb-6 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900/60 rounded-lg p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        placeholder="Workspace Name (e.g. NLP-Team)"
                        value={wsName}
                        onChange={(e) => setWsName(e.target.value)}
                        className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={wsDesc}
                        onChange={(e) => setWsDesc(e.target.value)}
                        className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-purple-650 hover:bg-purple-600 py-2.5 text-xs font-semibold text-white cursor-pointer shadow-md shadow-purple-600/10 transition-colors"
                    >
                      <Plus className="h-4.5 w-4.5" /> Create Workspace
                    </button>
                  </form>

                  {/* List Workspaces */}
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {workspaces.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center font-medium">No workspaces configured.</p>
                    ) : (
                      workspaces.map(ws => (
                        <div 
                          key={ws.id}
                          onClick={() => setSelectedWorkspaceId(ws.id)}
                          className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                            selectedWorkspaceId === ws.id 
                              ? "bg-purple-650/15 border-purple-500/45 dark:border-purple-500/30"
                              : "bg-slate-100/50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-900/50"
                          }`}
                        >
                          <h4 className="text-xs font-bold">{ws.name}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{ws.description || "No description provided."}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Side: Workspace Members Control */}
                <div className="backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-slate-800/60 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                    <Users className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                    Workspace Members Control
                  </h3>

                  {selectedWorkspaceId ? (
                    <>
                      <form onSubmit={handleAddWorkspaceMember} className="space-y-3 mb-6 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900/60 rounded-lg p-4">
                        <div className="flex gap-3">
                          <select
                            required
                            value={addMemberUserId}
                            onChange={(e) => setAddMemberUserId(e.target.value)}
                            className="flex-1 rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                          >
                            <option value="" className="bg-white dark:bg-slate-900">Select Employee to Add</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id} className="bg-white dark:bg-slate-900">{emp.full_name} ({emp.email})</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="flex items-center justify-center gap-1 rounded-lg bg-purple-655 hover:bg-purple-600 px-5 py-2 text-xs font-semibold text-white cursor-pointer shadow-md shadow-purple-600/10 transition-colors"
                          >
                            Add
                          </button>
                        </div>
                      </form>

                      {/* Member list */}
                      <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                        {workspaceMembers.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">No members in this workspace yet.</p>
                        ) : (
                          workspaceMembers.map(m => (
                            <div key={m.id} className="p-3 rounded-lg bg-slate-100/30 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                              <div>
                                <h4 className="text-xs font-bold">{m.full_name}</h4>
                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">{m.email}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveWorkspaceMember(m.user_id)}
                                className="text-slate-400 dark:text-slate-500 hover:text-red-500 p-1.5 rounded transition-all hover:bg-red-500/10 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">Please select or create a workspace first.</p>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "milestones" && (
              <motion.div
                key="milestones"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 xl:grid-cols-2 gap-8"
              >
                {/* Milestone Targets assignment */}
                <div className="backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-slate-800/60 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                    <CheckSquare className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                    Assign Milestone Targets
                  </h3>

                  <form onSubmit={handleCreateTask} className="space-y-4 mb-6 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900/60 rounded-lg p-4">
                    <input
                      type="text"
                      required
                      placeholder="Target Title (e.g. Fine-tune Llama-3 model)"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                    />
                    <textarea
                      placeholder="Target Description"
                      rows={2}
                      value={taskDesc}
                      onChange={(e) => setTaskDesc(e.target.value)}
                      className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                    ></textarea>

                    {/* STEP 4: TOGGLE SWITCHER FOR ASSIGNMENT */}
                    <div className="space-y-3">
                      <div className="flex rounded-lg bg-slate-200/50 dark:bg-slate-950/60 p-0.5 border border-slate-200 dark:border-slate-850 w-full">
                        <button
                          type="button"
                          onClick={() => setAssignmentType("employee")}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer text-center ${
                            assignmentType === "employee" 
                              ? "bg-purple-650 text-white shadow-sm" 
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          }`}
                        >
                          Assign to Employee
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignmentType("workspace")}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer text-center ${
                            assignmentType === "workspace" 
                              ? "bg-purple-655 text-white shadow-sm" 
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          }`}
                        >
                          Assign to Workspace
                        </button>
                      </div>

                      {assignmentType === "employee" ? (
                        <select
                          value={taskAssignedTo}
                          onChange={(e) => setTaskAssignedTo(e.target.value)}
                          className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                        >
                          <option value="" className="bg-white dark:bg-slate-900 text-slate-950">Select Employee</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id} className="bg-white dark:bg-slate-900 text-slate-950">{emp.full_name}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={taskWorkspaceId}
                          onChange={(e) => setTaskWorkspaceId(e.target.value)}
                          className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                        >
                          <option value="" className="bg-white dark:bg-slate-900 text-slate-950">Select Workspace</option>
                          {workspaces.map(ws => (
                            <option key={ws.id} value={ws.id} className="bg-white dark:bg-slate-900 text-slate-950">{ws.name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col">
                        <label className="text-[9px] text-slate-505 dark:text-slate-400 uppercase tracking-widest mb-1 pl-1">Due Date</label>
                        <input
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-purple-650 hover:bg-purple-600 py-2.5 text-xs font-semibold text-white cursor-pointer shadow-md shadow-purple-600/10 transition-colors"
                        >
                          <Plus className="h-4.5 w-4.5" /> Assign Target
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* Right Side: Active Targets List */}
                <div className="backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-slate-800/60 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                    <CheckSquare className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                    Active Milestone Targets
                  </h3>
                  <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                    {tasks.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">No targets defined.</p>
                    ) : (
                      tasks.map(task => (
                        <div key={task.id} className="p-4 rounded-xl bg-slate-100/30 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-bold">{task.title}</h4>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{task.description}</p>
                            <div className="flex gap-3 mt-2.5 text-[9px] text-slate-500 dark:text-slate-400">
                              <span className="uppercase">Status: <strong className="text-purple-600 dark:text-purple-400 font-bold">{task.status}</strong></span>
                              {task.due_date && <span>Deadline: {new Date(task.due_date).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-slate-400 dark:text-slate-500 hover:text-red-500 p-1.5 rounded transition-all hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "broadcasts" && (
              <motion.div
                key="broadcasts"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="max-w-3xl mx-auto"
              >
                {/* STEP 4: EMERGENCY BROADCAST TAB WITH WARNING AESTHETIC */}
                <div className="backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-xl p-6 shadow-sm shadow-red-500/5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                  
                  <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500 animate-pulse" />
                    Emergency Override Broadcast Panel
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 font-medium">Issue security warning notices, system-wide alerts, or targeted laboratory warnings directly.</p>

                  <form onSubmit={handleSendAlert} className="space-y-4 bg-red-500/5 dark:bg-red-950/5 border border-red-200/50 dark:border-red-900/20 rounded-lg p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1.5 pl-1">Scope</label>
                        <select
                          value={alertTargetType}
                          onChange={(e) => {
                            setAlertTargetType(e.target.value);
                            setAlertTargetId("");
                          }}
                          className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                        >
                          <option value="global" className="bg-white dark:bg-slate-900 text-slate-905">Global Broadcast (All Labs)</option>
                          <option value="lab" className="bg-white dark:bg-slate-900 text-slate-905">Lab-Specific (Tenant Scope)</option>
                          <option value="workspace" className="bg-white dark:bg-slate-900 text-slate-905">Workspace Specific</option>
                          <option value="user" className="bg-white dark:bg-slate-900 text-slate-905">Individual Employee</option>
                        </select>
                      </div>

                      {/* Conditional selects */}
                      {alertTargetType === "lab" && (
                        <div className="flex flex-col">
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1.5 pl-1">Target Lab</label>
                          <select
                            required
                            value={alertTargetLab}
                            onChange={(e) => setAlertTargetLab(e.target.value)}
                            className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                          >
                            <option value="gen_ai" className="bg-white dark:bg-slate-900 text-slate-905">Generative AI Lab</option>
                            <option value="ai" className="bg-white dark:bg-slate-900 text-slate-905">Artificial Intelligence Lab</option>
                            <option value="web_dev" className="bg-white dark:bg-slate-900 text-slate-905">Web Development Lab</option>
                            <option value="cyber_sec" className="bg-white dark:bg-slate-900 text-slate-905">Cyber Security Lab</option>
                          </select>
                        </div>
                      )}

                      {(alertTargetType === "workspace" || alertTargetType === "user") && (
                        <div className="flex flex-col">
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1.5 pl-1">Target Selection</label>
                          <select
                            required
                            value={alertTargetId}
                            onChange={(e) => setAlertTargetId(e.target.value)}
                            className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                          >
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-905">Select Target</option>
                            {alertTargetType === "workspace" 
                              ? workspaces.map(ws => <option key={ws.id} value={ws.id} className="bg-white dark:bg-slate-900 text-slate-905">{ws.name}</option>)
                              : employees.map(emp => <option key={emp.id} value={emp.id} className="bg-white dark:bg-slate-900 text-slate-905">{emp.full_name}</option>)
                            }
                          </select>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1.5 pl-1">Alert Title</label>
                      <input
                        type="text"
                        required
                        placeholder="Alert Title (e.g. Critical Server Outage)"
                        value={alertTitle}
                        onChange={(e) => setAlertTitle(e.target.value)}
                        className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-450 dark:placeholder-slate-550 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1.5 pl-1">Detail Text</label>
                      <textarea
                        required
                        placeholder="Detail alert descriptions..."
                        rows={3}
                        value={alertContent}
                        onChange={(e) => setAlertContent(e.target.value)}
                        className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-450 dark:placeholder-slate-550 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                      ></textarea>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1.5 pl-1">Severity Priority</label>
                        <select
                          value={alertPriority}
                          onChange={(e) => setAlertPriority(e.target.value)}
                          className="w-full rounded-lg bg-white/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                        >
                          <option value="low" className="bg-white dark:bg-slate-900 text-slate-905">Low Priority</option>
                          <option value="normal" className="bg-white dark:bg-slate-900 text-slate-905">Normal</option>
                          <option value="high" className="bg-white dark:bg-slate-900 text-slate-905">High Warning</option>
                          <option value="critical" className="bg-white dark:bg-slate-900 text-slate-905">Critical Severity</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit"
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-650 hover:bg-red-600 text-white py-2.5 text-xs font-semibold cursor-pointer border border-red-500/20 shadow-md shadow-red-650/10 active:scale-[0.98] transition-all"
                        >
                          <BellRing className="h-4 w-4 text-white animate-pulse" />
                          Broadcast Warning
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Global Toast System */}
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
