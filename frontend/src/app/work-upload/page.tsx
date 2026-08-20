"use client";

import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { CloudUpload, Clock, FileText, Sparkles, AlertCircle, FileUp, CheckCircle, Info, Trash2 } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

interface Report {
  id: string;
  report_text: string;
  summary: string | null;
  blockers: string[];
  metrics: Record<string, any>;
  created_at: string;
}

export default function WorkUploadPage() {
  const router = useRouter();
  const { token, isAuthenticated, initialize, isLoading, role, clearAuth } = useAuthStore();

  const [history, setHistory] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);

  const [fetching, setFetching] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      const res = await fetch(`${API_BASE}/user/work/history`, {
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
      }
    } catch (err) {
      console.error("Failed to load work uploads:", err);
    } finally {
      setFetching(false);
    }
  };

  const handleDelete = async (uploadId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to delete this report submission?")) return;

    // Optimistically update the UI
    const previousHistory = [...history];
    setHistory(history.filter(report => report.id !== uploadId));
    if (activeReport?.id === uploadId) {
      setActiveReport(null);
    }

    try {
      const res = await fetch(`${API_BASE}/user/employee/work-uploads/${uploadId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to delete work report");
      }
      
      await loadHistory();
    } catch (err) {
      console.error("Failed to delete report submission:", err);
      alert("Error: Failed to delete report submission.");
      setHistory(previousHistory);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [token]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): boolean => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "pdf" || ext === "docx" || ext === "txt") {
      return true;
    }
    setErrorMsg("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
    setSelectedFile(null);
    return false;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMsg("");
    setSuccessMsg("");

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg("");
    setSuccessMsg("");
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !token) return;
    
    setUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${API_BASE}/user/work/upload-file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.status === 401) {
        clearAuth();
        router.push("/");
        return;
      }

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Research document "${selectedFile.name}" has been uploaded successfully and indexed into the vector DB.`);
        setSelectedFile(null);
        setActiveReport(data);
        await loadHistory();
      } else {
        setErrorMsg(data.detail || "File upload failed.");
      }
    } catch (err) {
      setErrorMsg("Failed to upload research log. Please check your network connection.");
    } finally {
      setUploading(false);
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
    <div className="flex h-screen bg-theme-bg text-theme-fg overflow-hidden transition-colors duration-200">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-theme-fg flex items-center gap-2">
              Work & Research Upload <CloudUpload className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </h1>
            <p className="text-sm text-theme-secondary font-medium">Submit your research logs, drafts, and lab notes directly to the secure vector repository.</p>
          </div>
        </div>

        {fetching ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="h-96 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="h-96 rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1 items-start">
              {/* Submission Form */}
              <div className="glass rounded-xl p-6 text-theme-fg">
            <h3 className="text-base font-bold text-theme-fg mb-4">Upload Research Documents</h3>
            
            {/* Info Note: AI Parse notification removed */}
            <div className="mb-5 rounded-lg bg-purple-500/5 border border-purple-500/10 p-3.5 text-xs text-purple-750 dark:text-purple-300 flex items-start gap-2.5">
              <Info className="h-4.5 w-4.5 text-purple-500 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Workspace Ingestion Active:</strong> Research uploads are automatically chunked and vectorized locally. Only Admins can run AI parsing and syntheses.
              </span>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-lg bg-red-500/5 border border-red-500/20 p-3 text-xs text-red-650 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4.5 w-4.5 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 rounded-lg bg-green-500/5 border border-green-500/20 p-3 text-xs text-green-600 dark:text-green-400 flex items-center gap-2">
                <CheckCircle className="h-4.5 w-4.5 text-green-500" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleUpload} className="space-y-6">
              {/* Drag and Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-12 px-6 cursor-pointer transition-all duration-200 ${
                  dragActive 
                    ? "border-purple-500 bg-purple-600/5 dark:bg-purple-500/5 scale-[1.01]" 
                    : "border-theme-border hover:border-purple-500/40 bg-zinc-900/5 dark:bg-zinc-900/10 hover:bg-zinc-900/10"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileChange}
                />
                
                <FileUp className="h-10 w-10 text-theme-secondary mb-3" />
                <p className="text-sm font-semibold text-theme-fg text-center">
                  {selectedFile ? `Selected: ${selectedFile.name}` : "Drag & drop your file here, or click to browse"}
                </p>
                <p className="text-xs text-theme-secondary mt-1.5 text-center">
                  Supports PDF, DOCX, or TXT (up to 15MB)
                </p>
              </div>

              {selectedFile && (
                <div className="p-3 bg-purple-600/5 border border-purple-500/20 rounded-lg flex items-center justify-between text-xs text-theme-fg">
                  <span className="truncate font-medium">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  <button 
                    type="button" 
                    onClick={() => setSelectedFile(null)} 
                    className="text-theme-secondary hover:text-red-500 font-semibold"
                  >
                    Remove
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={!selectedFile || uploading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Clock className="h-4.5 w-4.5 animate-spin" />
                    Vectorizing Research Log...
                  </>
                ) : (
                  <>
                    <span>Upload to Research Repository</span>
                  </>
                )}
              </button>
            </form>

            {/* Ingestion results detail */}
            {activeReport && (
              <div className="mt-8 border-t border-theme-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="h-4.5 w-4.5 text-purple-500" />
                  <h4 className="text-sm font-bold text-theme-fg">Ingestion Success Overview</h4>
                </div>

                <div className="space-y-4 text-xs">
                  {/* File Metadata */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border rounded-lg">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Filename</span>
                      <span className="text-theme-fg font-semibold truncate block">{activeReport.metrics?.file_name || "N/A"}</span>
                    </div>
                    <div className="p-3 bg-zinc-900/10 dark:bg-zinc-900/40 border border-theme-border rounded-lg">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Vector Chunks Indexed</span>
                      <span className="text-purple-600 dark:text-purple-400 font-bold text-sm block">
                        {Math.ceil((activeReport.metrics?.char_count || 1) / 520)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* History Column */}
          <div className="glass rounded-xl p-6 h-full flex flex-col max-h-[600px]">
            <h3 className="text-base font-bold text-theme-fg mb-4 flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-theme-secondary" />
              Ingested Repository History
            </h3>

            {history.length === 0 ? (
              <div className="text-center py-16 text-sm text-theme-secondary border border-dashed border-theme-border rounded-lg flex-1 flex flex-col items-center justify-center">
                No past document submissions.
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                {history.map((report) => {
                  const isFile = report.metrics && report.metrics.file_name;
                  return (
                    <div 
                      key={report.id}
                      onClick={() => setActiveReport(report)}
                      className={`p-4 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                        activeReport?.id === report.id
                          ? "bg-purple-600/5 dark:bg-purple-950/20 border-purple-500/40"
                          : "bg-zinc-900/5 dark:bg-zinc-900/40 border-theme-border hover:border-purple-500/30"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold text-theme-secondary">
                          {new Date(report.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {isFile ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest bg-purple-600/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                              Document
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-theme-border">
                              Text update
                            </span>
                          )}
                          <button
                            onClick={() => handleDelete(report.id)}
                            className="p-1 rounded text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete Submission"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-theme-fg line-clamp-2 leading-relaxed font-medium">
                        {isFile ? `File: ${report.metrics.file_name}` : report.report_text}
                      </p>
                      {isFile && report.metrics.file_size_bytes && (
                        <span className="text-[10px] text-theme-secondary block mt-1.5">
                          Size: {(report.metrics.file_size_bytes / 1024).toFixed(1)} KB | Chars: {report.metrics.char_count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
