"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import {
  Users, Bell, AlertTriangle, ShieldCheck, Clock, Check, Trash2, Edit2, Plus, Sparkles, Send, Eye, RefreshCw, X, AlertOctagon, MessageSquare, Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  lab_id: string | null;
  status: string;
  created_at: string;
}

export default function SuperadminDashboard() {
  const router = useRouter();
  const { token, refreshToken, isAuthenticated, initialize, isLoading, role, status, userId, clearAuth } = useAuthStore();

  const [activeTab, setActiveTab] = useState<string>("global");
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [fetching, setFetching] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Labs dynamic state
  const [labs, setLabs] = useState<{ id: string; name: string; description?: string }[]>([]);
  const [sessionReady, setSessionReady] = useState(false);

  // New Lab Modal state
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);
  const [newLabName, setNewLabName] = useState("");
  const [newLabDesc, setNewLabDesc] = useState("");
  const [creatingLab, setCreatingLab] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Transfer Lab Modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferringUser, setTransferringUser] = useState<User | null>(null);
  const [selectedTransferLabId, setSelectedTransferLabId] = useState("");
  const [updatingTransfer, setUpdatingTransfer] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Dynamic Lab Name mapping
  const getLabName = (labId: string | null) => {
    if (!labId) return "System Global";
    const found = labs.find(l => l.id === labId);
    if (found) return found.name;
    const fallbackMap: Record<string, string> = {
      gen_ai: "Generative AI Lab",
      ai: "Artificial Intelligence Lab",
      web_dev: "Web Development Lab",
      cyber_sec: "Cyber Security Lab",
    };
    return fallbackMap[labId] || labId;
  };

  // Lab Admin Drawer details scoping
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<User | null>(null);

  // Alert Modal state
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertContent, setAlertContent] = useState("");
  const [alertPriority, setAlertPriority] = useState("normal");
  const [alertTargetType, setAlertTargetType] = useState("global");
  const [alertTargetLab, setAlertTargetLab] = useState("");
  const [sendingAlert, setSendingAlert] = useState(false);

  // Role Assignment Modal state
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState("employee");
  const [editLabId, setEditLabId] = useState("");
  const [updatingUser, setUpdatingUser] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Bind JWT Session Token to Supabase client for RLS
  useEffect(() => {
    if (token) {
      supabase.auth.setSession({
        access_token: token,
        refresh_token: refreshToken || "",
      }).then(() => {
        setSessionReady(true);
      }).catch(err => {
        console.error("Failed to set Supabase session:", err);
        setSessionReady(false);
      });
    } else {
      setSessionReady(false);
    }
  }, [token, refreshToken]);

  // Fetch Dynamic Labs from Supabase
  useEffect(() => {
    if (!token || !sessionReady) return;
    const fetchLabs = async () => {
      try {
        const { data, error } = await supabase
          .from("labs")
          .select("*")
          .order("name", { ascending: true });
        if (error) throw error;
        setLabs(data || []);
        if (data && data.length > 0 && !alertTargetLab) {
          setAlertTargetLab(data[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch labs:", err);
      }
    };
    fetchLabs();
  }, [token, sessionReady, alertTargetLab]);

  // Fetch profiles directly via Supabase client
  useEffect(() => {
    if (!token || !sessionReady) return;
    const fetchProfiles = async () => {
      try {
        const { data: users, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        if (users) {
          setAllUsers(users);
        }
      } catch (err) {
        console.error("Failed to fetch profiles via Supabase:", err);
      }
    };
    fetchProfiles();
  }, [token, sessionReady]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/");
      } else if (status === "pending") {
        router.push("/pending");
      } else if (role !== "superadmin") {
        if (role === "admin") {
          router.push("/admin/dashboard");
        } else {
          router.push("/dashboard");
        }
      }
    }
  }, [isAuthenticated, isLoading, role, status, router]);

  const loadData = async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch all users
      const empRes = await fetch(`${API_BASE}/admin/employees`, { headers });
      if (empRes.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }
      const empData = await empRes.json();
      setAllUsers(Array.isArray(empData) ? empData : []);

      // Fetch all pending requests system-wide
      const penRes = await fetch(`${API_BASE}/admin/pending`, { headers });
      const penData = await penRes.json();
      setPendingUsers(Array.isArray(penData) ? penData : []);

      // Fetch active alerts
      try {
        const alertRes = await fetch(`${API_BASE}/admin/alerts`, { headers });
        if (alertRes.ok) {
          const alertData = await alertRes.json();
          setAlerts(Array.isArray(alertData) ? alertData : []);
        }
      } catch (err) {
        console.error("Error loading alerts:", err);
      }
    } catch (err) {
      console.error("Error loading superadmin data:", err);
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
      setPendingUsers(prev => prev.filter(req => req.id !== userId));

      const res = await fetch(`${API_BASE}/admin/approve/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        loadData();
      } else {
        const errData = await res.json();
        alert(errData.detail || "Approval failed.");
        loadData();
      }
    } catch (err) {
      console.error("Error approving user:", err);
      loadData();
    }
  };

  const handleDispatchAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !alertTitle.trim() || !alertContent.trim()) return;

    setSendingAlert(true);
    try {
      const payload = {
        title: alertTitle,
        content: alertContent,
        priority: alertPriority,
        target_type: alertTargetType,
        target_lab: alertTargetType === "lab" ? alertTargetLab : null
      };

      const res = await fetch(`${API_BASE}/admin/alerts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert("Alert dispatched successfully system-wide.");
        setIsAlertModalOpen(false);
        setAlertTitle("");
        setAlertContent("");
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to dispatch alert.");
      }
    } catch (err) {
      console.error("Error dispatching alert:", err);
      alert("Network error.");
    } finally {
      setSendingAlert(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingUser) return;

    setUpdatingUser(true);
    try {
      const payload = {
        role: editRole,
        lab_id: editLabId || null
      };

      const res = await fetch(`${API_BASE}/admin/profiles/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsEditUserModalOpen(false);
        setEditingUser(null);
        showToast("Profile settings updated successfully.", "success");
        await loadData();
      } else {
        const errData = await res.json();
        showToast(errData.detail || "Failed to update profile settings.", "error");
      }
    } catch (err) {
      console.error("Error updating user profile:", err);
      showToast("Network error updating profile.", "error");
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleCreateLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newLabName.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) return;

    setCreatingLab(true);
    const newLabId = newLabName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '');
    try {
      const res = await fetch("/api/admin/create-lab-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          labId: newLabId,
          labName: newLabName.trim(),
          labDesc: newLabDesc.trim(),
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim(),
          adminPassword: adminPassword.trim()
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Failed to create Lab and Admin");
      }

      showToast("New Lab and Admin created successfully!", "success");
      setLabs(prev => [...prev, { id: newLabId, name: newLabName.trim(), description: newLabDesc.trim() }].sort((a, b) => a.name.localeCompare(b.name)));
      setIsLabModalOpen(false);
      setNewLabName("");
      setNewLabDesc("");
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      await loadData();
    } catch (err: any) {
      console.error("Create lab/admin error:", err);
      showToast(err.message || "Failed to create lab and admin.", "error");
    } finally {
      setCreatingLab(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !transferringUser || !sessionReady) return;

    setUpdatingTransfer(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ lab_id: selectedTransferLabId || null })
        .eq('id', transferringUser.id);

      if (error) throw error;

      showToast("Employee transferred successfully!", "success");
      setIsTransferModalOpen(false);
      setTransferringUser(null);
      await loadData();
    } catch (err: any) {
      console.error("Transfer error:", err);
      showToast(err.message || "Failed to transfer employee.", "error");
    } finally {
      setUpdatingTransfer(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0F19]">
        <Clock className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // Filtered lists based on active tab
  const getFilteredUsers = (list: User[]) => {
    if (activeTab === "global") return list;
    return list.filter(u => u.lab_id === activeTab);
  };

  const filteredAllUsers = getFilteredUsers(allUsers);
  const filteredPending = getFilteredUsers(pendingUsers);

  // Scoped lists of Lab Admins
  const labAdmins = allUsers.filter(u => u.role === "admin");
  const filteredAdmins = getFilteredUsers(labAdmins);

  // Analytics calculations
  const activeEmployees = allUsers.filter(u => u.status === "approved" && u.role === "employee").map(emp => ({
    ...emp,
    lab_name: getLabName(emp.lab_id)
  }));

  const totalActive = activeEmployees?.length || 0;
  const genAiCount = activeEmployees?.filter(emp => emp.lab_name === 'Generative AI Lab').length || 0;
  const aiCount = activeEmployees?.filter(emp => emp.lab_name === 'Artificial Intelligence Lab').length || 0;
  const webDevCount = activeEmployees?.filter(emp => emp.lab_name === 'Web Development Lab').length || 0;
  const cyberSecCount = activeEmployees?.filter(emp => emp.lab_name === 'Cyber Security Lab').length || 0;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white transition-colors duration-300 flex overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8 md:ml-64">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-purple-500" />
              NCAI Superadmin God-View
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Cross-lab global control, Lab Admin management, pending access, and network-wide alerts dispatch.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsLabModalOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add New Lab
            </button>
            <button
              type="button"
              onClick={() => setIsAlertModalOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <Bell className="h-4 w-4" />
              Dispatch Global Alert
            </button>
          </div>
        </div>


        {/* SYSTEM ANALYTICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Active Employees</span>
              <Users className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </div>
            <h3 className="text-2xl font-extrabold">{totalActive}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Total active lab researchers</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Gen AI Lab</span>
              <Sparkles className="h-5 w-5 text-indigo-500" />
            </div>
            <h3 className="text-2xl font-extrabold">{genAiCount}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Generative AI specialists</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">AI Lab</span>
              <ShieldCheck className="h-5 w-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-extrabold">{aiCount}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Core AI/ML researchers</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Web Dev Lab</span>
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <h3 className="text-2xl font-extrabold">{webDevCount}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Full stack engineers</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Cyber Sec Lab</span>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <h3 className="text-2xl font-extrabold">{cyberSecCount}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Security analysts</p>
          </div>
        </div>

        {/* Top-Level Lab Filter Tabs & Search Bar Container */}
        <div className="flex items-center justify-between gap-4 mb-8 w-full">
          <div className="flex bg-slate-100 dark:bg-slate-900/60 p-1 border border-slate-200 dark:border-slate-800 rounded-xl gap-1 max-w-4xl flex-1">
            <button
              type="button"
              onClick={() => setActiveTab("global")}
              className={`py-2 px-4 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                activeTab === "global"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              Global Overview
            </button>
            {labs.map(lab => (
              <button
                type="button"
                key={lab.id}
                onClick={() => setActiveTab(lab.id)}
                className={`py-2 px-4 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                  activeTab === lab.id
                    ? "bg-purple-600 text-white shadow-md"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                }`}
              >
                {lab.name.replace(" Lab", "")}
              </button>
            ))}
          </div>

          {/* Global Search Bar */}
          <div className="relative w-72 shrink-0">
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
          <div className="space-y-6 animate-pulse">
            <div className="h-44 rounded-xl bg-slate-200 dark:bg-slate-900 border border-slate-250 dark:border-slate-800"></div>
            <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-900 border border-slate-250 dark:border-slate-800"></div>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in text-slate-900 dark:text-white">

            {/* System-wide Pending Requests */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-purple-500 dark:text-purple-400" />
                Pending Requests {activeTab !== "global" && `(${getLabName(activeTab)})`}
              </h3>
              {filteredPending.filter(user => (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || user.email?.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 ? (
                <p className="text-xs text-slate-500 py-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center font-medium">No pending access requests in this scope.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                        <th className="pb-3">Name</th>
                        <th className="pb-3">Email</th>
                        <th className="pb-3">Target Lab</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredPending
                        .filter(user =>
                        (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                        )
                        .map(user => (
                          <tr key={user.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-900/20">
                            <td className="py-3 font-semibold">{user.full_name}</td>
                            <td className="py-3 text-slate-500 dark:text-slate-400">{user.email}</td>
                            <td className="py-3">
                              <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-200 dark:border-slate-700/50">
                                {getLabName(user.lab_id)}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleApprove(user.id)}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg font-bold transition-all text-[11px]"
                              >
                                Approve
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Manage Lab Admins */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-purple-500 dark:text-purple-400" />
                Lab Administrators {activeTab !== "global" && `(${getLabName(activeTab)})`}
              </h3>
              {filteredAdmins.filter(admin => (admin.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || admin.email?.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 ? (
                <p className="text-xs text-slate-500 py-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center font-medium">No Lab Admins configured in this scope.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                        <th className="pb-3">Name</th>
                        <th className="pb-3">Email</th>
                        <th className="pb-3">Assigned Lab Scoping</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredAdmins
                        .filter(admin =>
                        (admin.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          admin.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                        )
                        .map(admin => (
                          <tr
                            key={admin.id}
                            onClick={() => {
                              setSelectedAdmin(admin);
                              setIsDrawerOpen(true);
                            }}
                            className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <td className="py-3 font-semibold">{admin.full_name}</td>
                            <td className="py-3 text-slate-500 dark:text-slate-400">{admin.email}</td>
                            <td className="py-3">
                              <span className="bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded text-[10px] font-semibold border border-purple-200 dark:border-purple-500/20">
                                {getLabName(admin.lab_id)}
                              </span>
                            </td>
                            <td className="py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUser(admin);
                                  setEditRole(admin.role);
                                  setEditLabId(admin.lab_id || "");
                                  setIsEditUserModalOpen(true);
                                }}
                                className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all inline-block cursor-pointer"
                                title="Edit Permissions"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferringUser(admin);
                                  setSelectedTransferLabId(admin.lab_id || "");
                                  setIsTransferModalOpen(true);
                                }}
                                className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all inline-block cursor-pointer"
                                title="Transfer Lab"
                              >
                                <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Active Researchers System-wide */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-purple-500 dark:text-purple-400" />
                Active Researchers Directory {activeTab !== "global" && `(${getLabName(activeTab)})`}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Role</th>
                      <th className="pb-3">Assigned Lab</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredAllUsers
                      .filter(u => u.status === "approved")
                      .filter(user =>
                      (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        user.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                      .map(user => (
                        <tr key={user.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-900/20">
                          <td className="py-3 font-semibold">{user.full_name}</td>
                          <td className="py-3 text-slate-500 dark:text-slate-400">{user.email}</td>
                          <td className="py-3 capitalize text-slate-650 dark:text-slate-300">{user.role}</td>
                          <td className="py-3">
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-200 dark:border-slate-700/50">
                              {getLabName(user.lab_id)}
                            </span>
                          </td>
                          <td className="py-3 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUser(user);
                                setEditRole(user.role);
                                setEditLabId(user.lab_id || "");
                                setIsEditUserModalOpen(true);
                              }}
                              className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all inline-block"
                              title="Manage Permissions"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTransferringUser(user);
                                setSelectedTransferLabId(user.lab_id || "");
                                setIsTransferModalOpen(true);
                              }}
                              className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all inline-block"
                              title="Transfer Lab"
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* DISPATCH GLOBAL/LAB ALERT MODAL */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-900 dark:text-white">
            <button
              type="button"
              onClick={() => setIsAlertModalOpen(false)}
              className="absolute top-4 right-4 text-slate-800 dark:text-slate-100 bg-slate-200 dark:bg-slate-700 p-2 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors z-50"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <Bell className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
              Dispatch Security Alert
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 font-medium">Broadcast notices system-wide or route them to specific lab boundaries.</p>

            <form onSubmit={handleDispatchAlert} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Alert Scope</label>
                <select
                  value={alertTargetType}
                  onChange={(e) => setAlertTargetType(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="global" className="bg-white dark:bg-slate-900">Global (All Labs)</option>
                  <option value="lab" className="bg-white dark:bg-slate-900">Lab-Specific Scoping</option>
                </select>
              </div>

              {alertTargetType === "lab" && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Target Lab</label>
                  <select
                    value={alertTargetLab}
                    onChange={(e) => setAlertTargetLab(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                  >
                    {labs.map(lab => (
                      <option key={lab.id} value={lab.id} className="bg-white dark:bg-slate-900">{lab.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Priority Level</label>
                <select
                  value={alertPriority}
                  onChange={(e) => setAlertPriority(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="low" className="bg-white dark:bg-slate-900">Low Notice</option>
                  <option value="normal" className="bg-white dark:bg-slate-900">Normal Priority</option>
                  <option value="high" className="bg-white dark:bg-slate-900">High Warning</option>
                  <option value="critical" className="bg-white dark:bg-slate-900">Critical Alarm</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Alert Title</label>
                <input
                  type="text"
                  required
                  placeholder="System Maintenance Scheduled"
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Alert Body Content</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Dispatch details regarding GPU cluster restart or security boundaries updates..."
                  value={alertContent}
                  onChange={(e) => setAlertContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAlertModalOpen(false)}
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                >
                  Dispatch Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER PROFILE / LAB ROLE ASSIGNMENT MODAL */}
      {isEditUserModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-900 dark:text-white">
            <button
              type="button"
              onClick={() => {
                setIsEditUserModalOpen(false);
                setEditingUser(null);
              }}
              className="absolute top-4 right-4 text-slate-800 dark:text-slate-100 bg-slate-200 dark:bg-slate-700 p-2 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors z-50"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              Manage Security Profile
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 font-medium">Reconfigure permission role and lab scoping for {editingUser.full_name}.</p>

            <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Access Permission Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="employee" className="bg-white dark:bg-slate-900">Employee / Researcher</option>
                  <option value="admin" className="bg-white dark:bg-slate-900">Lab Administrator</option>
                  <option value="superadmin" className="bg-white dark:bg-slate-900">Superadministrator</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Lab Assignment Scoping</label>
                <select
                  value={editLabId}
                  onChange={(e) => setEditLabId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="" className="bg-white dark:bg-slate-900">System Global / No Scoping</option>
                  {labs.map(lab => (
                    <option key={lab.id} value={lab.id} className="bg-white dark:bg-slate-900">{lab.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditUserModalOpen(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingUser}
                  className="px-4 py-2 bg-purple-650 hover:bg-purple-600 text-white rounded-lg font-bold flex items-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {updatingUser ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LAB ADMIN DRAWER COMPONENT */}
      <AnimatePresence>
        {isDrawerOpen && selectedAdmin && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />

            {/* Drawer Content */}
            <motion.div
              initial={{ translateX: "100%" }}
              animate={{ translateX: 0 }}
              exit={{ translateX: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative z-10 w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex flex-col text-slate-900 dark:text-white"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="absolute top-4 right-4 text-slate-800 dark:text-slate-100 bg-slate-200 dark:bg-slate-700 p-2 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors z-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              <h3 className="text-lg font-bold mb-1 flex items-center gap-2 pt-2">
                <ShieldCheck className="h-5 w-5 text-purple-650 dark:text-purple-400" />
                Admin Profile Details
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-6 font-medium">Drill-down review of the assigned Lab Administrator.</p>

              {/* Profile Card */}
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-850 rounded-xl p-4 mb-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-600/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-sm">
                    {selectedAdmin.full_name ? selectedAdmin.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "A"}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">{selectedAdmin.full_name}</h4>
                    <span className="text-[10px] uppercase font-bold text-purple-650 dark:text-purple-400">{getLabName(selectedAdmin.lab_id)}</span>
                  </div>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3 text-xs space-y-2 text-slate-600 dark:text-slate-350">
                  <div>
                    <span className="font-semibold block text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email Address</span>
                    <span className="text-slate-900 dark:text-white font-medium">{selectedAdmin.email}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Permission Role</span>
                    <span className="text-slate-900 dark:text-white font-medium">Lab Administrator</span>
                  </div>
                </div>
              </div>

              {/* Message Admin Button */}
              <button
                type="button"
                onClick={() => {
                  router.push(`/admin/chat?userId=${selectedAdmin.id}`);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-650 hover:bg-purple-650 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-purple-600/10 cursor-pointer active:scale-[0.98] mb-6"
              >
                <MessageSquare className="h-4 w-4" />
                Message Admin
              </button>

              {/* Scoped Approved Employees List */}
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400 mb-3 pl-1">Approved Employees in Lab</h4>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-950/20">
                {allUsers.filter(u => u.lab_id === selectedAdmin.lab_id && u.role === "employee" && u.status === "approved").length === 0 ? (
                  <p className="text-xs text-slate-455 text-center py-8">No approved employees in this lab.</p>
                ) : (
                  allUsers.filter(u => u.lab_id === selectedAdmin.lab_id && u.role === "employee" && u.status === "approved").map((emp) => (
                    <div key={emp.id} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold">{emp.full_name}</h5>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5">{emp.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/chat?userId=${emp.id}`)}
                        className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-500/10 cursor-pointer transition-colors"
                        title="Message Employee"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD NEW LAB MODAL */}
      {isLabModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-900 dark:text-white max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setIsLabModalOpen(false);
                setAdminName("");
                setAdminEmail("");
                setAdminPassword("");
              }}
              className="absolute top-4 right-4 text-slate-800 dark:text-slate-100 bg-slate-200 dark:bg-slate-700 p-2 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors z-50 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <Plus className="h-5 w-5 text-purple-650 dark:text-purple-400" />
              Add New Research Lab
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 font-medium">Create a new laboratory workspace partition dynamically in the system.</p>

            <form onSubmit={handleCreateLab} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Lab Name</label>
                <input
                  type="text"
                  required
                  placeholder="Quantum Computing Lab"
                  value={newLabName}
                  onChange={(e) => setNewLabName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the research direction and capabilities of this lab partition..."
                  value={newLabDesc}
                  onChange={(e) => setNewLabDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 mt-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-purple-650 dark:text-purple-400 mb-2">Create Lab Administrator</h4>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Admin Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Dr. Eleanor Vance"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Admin Email</label>
                <input
                  type="email"
                  required
                  placeholder="eleanor.vance@ncai.gov"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Admin Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsLabModalOpen(false);
                    setAdminName("");
                    setAdminEmail("");
                    setAdminPassword("");
                  }}
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLab}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold flex items-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {creatingLab ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>Create Lab</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSFER EMPLOYEE LAB MODAL */}
      {isTransferModalOpen && transferringUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-900 dark:text-white">
            <button
              type="button"
              onClick={() => {
                setIsTransferModalOpen(false);
                setTransferringUser(null);
              }}
              className="absolute top-4 right-4 text-slate-800 dark:text-slate-100 bg-slate-200 dark:bg-slate-700 p-2 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors z-50 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-purple-650 dark:text-purple-400" />
              Transfer Research Lab
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 font-medium">Re-assign {transferringUser.full_name} to a different operational laboratory partition.</p>

            <form onSubmit={handleTransferSubmit} className="space-y-4 text-xs">
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-850 rounded-xl p-4 space-y-2">
                <div>
                  <span className="text-[10px] text-slate-550 dark:text-slate-400 font-semibold uppercase tracking-wider block">Full Name</span>
                  <span className="text-slate-900 dark:text-white font-medium text-xs">{transferringUser.full_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-550 dark:text-slate-400 font-semibold uppercase tracking-wider block">Current Lab Scope</span>
                  <span className="text-purple-650 dark:text-purple-400 font-semibold text-xs">{getLabName(transferringUser.lab_id)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Select New Target Lab</label>
                <select
                  value={selectedTransferLabId}
                  onChange={(e) => setSelectedTransferLabId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="" className="bg-white dark:bg-slate-900">System Global / No Scoping</option>
                  {labs.map(lab => (
                    <option key={lab.id} value={lab.id} className="bg-white dark:bg-slate-900">{lab.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setTransferringUser(null);
                  }}
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-350 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingTransfer}
                  className="px-4 py-2 bg-purple-650 hover:bg-purple-655 text-white rounded-lg font-bold flex items-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {updatingTransfer ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span>Execute Transfer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ${toast.type === "success"
          ? "bg-green-950/80 border-green-500 text-green-200"
          : "bg-red-950/80 border-red-500 text-red-200"
          }`}>
          <Check className="h-5 w-5 text-green-400" />
          <span className="text-xs font-medium">{toast.message}</span>
        </div>
      )}

    </div>
  );
}
