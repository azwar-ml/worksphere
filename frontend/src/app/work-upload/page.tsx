"use client";

import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { createClient } from "@supabase/supabase-js";
import { 
  CloudUpload, 
  Clock, 
  FileText, 
  Sparkles, 
  AlertCircle, 
  FileUp, 
  CheckCircle, 
  Info, 
  Trash2, 
  Plus, 
  X, 
  Calendar,
  Layers,
  FileCheck
} from "lucide-react";

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface TimelineBlock {
  startTime: string;
  endTime: string;
  description: string;
}

interface Report {
  id: string;
  user_id: string;
  report_text: string;
  timeline_data: TimelineBlock[];
  file_url: string | null;
  created_at: string;
}

export default function WorkUploadPage() {
  const router = useRouter();
  const { token, refreshToken, isAuthenticated, initialize, isLoading, role, status, userId, clearAuth } = useAuthStore();

  const [history, setHistory] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);

  // Form states
  const [timeline, setTimeline] = useState<TimelineBlock[]>([
    { startTime: "09:00", endTime: "10:00", description: "" }
  ]);
  const [reportText, setReportText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Status states
  const [fetching, setFetching] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
      if (status === "pending") {
        router.push("/pending");
        return;
      }
    }
  }, [isAuthenticated, isLoading, status, router]);

  const [sessionReady, setSessionReady] = useState(false);

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

  const loadHistory = async () => {
    if (!userId) return;
    setFetching(true);
    try {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback to work_uploads if daily_reports migration is not run yet
        console.warn("daily_reports table query failed, trying fallback to work_uploads...", error);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("work_uploads")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        
        if (fallbackError) throw fallbackError;
        
        // Map work_uploads format to Report format
        const mappedData: Report[] = (fallbackData || []).map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          report_text: row.report_text,
          timeline_data: Array.isArray(row.blockers) ? row.blockers.map((b: any) => ({
            startTime: "09:00",
            endTime: "17:00",
            description: typeof b === 'string' ? b : (b.description || "")
          })) : [],
          file_url: row.metrics?.file_url || null,
          created_at: row.created_at
        }));
        setHistory(mappedData);
      } else {
        setHistory(data || []);
      }
    } catch (err) {
      console.error("Failed to load submission history:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (userId && sessionReady) {
      loadHistory();
    }
  }, [userId, token, sessionReady]);

  // Dynamic Timeline Actions
  const handleAddTimelineBlock = () => {
    // Propose default time as 1 hour after the last block's end time
    let nextStart = "09:00";
    let nextEnd = "10:00";
    if (timeline.length > 0) {
      const lastBlock = timeline[timeline.length - 1];
      nextStart = lastBlock.endTime;
      // Add 1 hour to end time
      const [hour, min] = lastBlock.endTime.split(":").map(Number);
      const endHour = (hour + 1) % 24;
      nextEnd = `${endHour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
    }
    setTimeline([...timeline, { startTime: nextStart, endTime: nextEnd, description: "" }]);
  };

  const handleRemoveTimelineBlock = (index: number) => {
    if (timeline.length === 1) return; // Keep at least one block
    setTimeline(timeline.filter((_, i) => i !== index));
  };

  const handleTimelineChange = (index: number, field: keyof TimelineBlock, value: string) => {
    const updated = [...timeline];
    updated[index] = { ...updated[index], [field]: value };
    setTimeline(updated);
  };

  // Drag and Drop Validation
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
    if (ext === "pdf" || ext === "docx" || ext === "txt" || ext === "png" || ext === "jpg" || ext === "jpeg") {
      return true;
    }
    setErrorMsg("Unsupported file type. Please upload a PDF, DOCX, TXT, PNG, or JPG file.");
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

  // Submit Handler
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !sessionReady) return;
    if (!reportText.trim()) {
      setErrorMsg("Please write a detailed summary for your daily report.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // Step 1: Force-fetch the active session to guarantee fresh token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("Authentication token missing. Please refresh the page.");
      }

      let fileUrl = null;
      let originalFileName = null;

      // Step 2: Upload attachment file to storage if present
      if (selectedFile) {
        originalFileName = selectedFile.name;
        // Sanitize the file name to prevent illegal characters in path
        const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        // Ensure path does NOT start with a forward slash
        const storageFileName = `${session.user.id}/${Date.now()}-${sanitizedFileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("work_attachments")
          .upload(storageFileName, selectedFile, {
            cacheControl: "3600",
            upsert: false,
            headers: {
              Authorization: `Bearer ${session.access_token}` // FORCES AUTHENTICATION
            }
          });

        if (uploadError) {
          throw new Error(`Attachment upload failed: ${uploadError.message}`);
        }

        if (uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from("work_attachments")
            .getPublicUrl(storageFileName);
          fileUrl = publicUrlData.publicUrl;
        }
      }

      // Step 3: Insert daily progress report into the Supabase database
      const reportPayload = {
        user_id: session.user.id,
        report_text: reportText,
        timeline_data: timeline,
        file_url: fileUrl
      };

      const { data: insertData, error: insertError } = await supabase
        .from("daily_reports")
        .insert(reportPayload)
        .select();

      if (insertError) {
        // Fallback: If daily_reports table does not exist, insert into work_uploads
        console.warn("Failed to insert into daily_reports table, falling back to work_uploads...", insertError);
        
        const fallbackPayload = {
          user_id: session.user.id,
          report_text: reportText,
          blockers: timeline.map(block => `${block.startTime}-${block.endTime}: ${block.description}`),
          summary: reportText.substring(0, 150) + (reportText.length > 150 ? "..." : ""),
          metrics: {
            timeline_data: timeline,
            file_url: fileUrl,
            file_name: originalFileName || null
          }
        };

        const { data: fallbackData, error: fallbackError } = await supabase
          .from("work_uploads")
          .insert(fallbackPayload)
          .select();

        if (fallbackError) throw fallbackError;

        if (fallbackData && fallbackData.length > 0) {
          const mappedReport: Report = {
            id: fallbackData[0].id,
            user_id: fallbackData[0].user_id,
            report_text: fallbackData[0].report_text,
            timeline_data: timeline,
            file_url: fileUrl,
            created_at: fallbackData[0].created_at
          };
          setSuccessMsg("Daily Progress Report submitted successfully via fallback storage!");
          setActiveReport(mappedReport);
        }
      } else {
        if (insertData && insertData.length > 0) {
          setSuccessMsg("Daily Progress Report has been submitted successfully to the secure repository!");
          setActiveReport(insertData[0]);
        }
      }

      // Step 4: Reset form
      setReportText("");
      setTimeline([{ startTime: "09:00", endTime: "10:00", description: "" }]);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Step 5: Refresh historical list
      await loadHistory();
    } catch (err: any) {
      console.error("Submission failed:", err);
      setErrorMsg(err.message || "Failed to submit Daily Progress Report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm("Are you sure you want to delete this Daily Progress Report?")) return;

    const previousHistory = [...history];
    setHistory(history.filter(r => r.id !== reportId));
    if (activeReport?.id === reportId) {
      setActiveReport(null);
    }

    try {
      const reportToDelete = history.find(r => r.id === reportId);
      
      // Delete attachment file from storage if it exists
      if (reportToDelete && reportToDelete.file_url) {
        const urlParts = reportToDelete.file_url.split("/work_attachments/");
        if (urlParts.length > 1) {
          const storageFileName = decodeURIComponent(urlParts[1]);
          await supabase.storage.from("work_attachments").remove([storageFileName]);
        }
      }

      // Try deleting from daily_reports
      const { error } = await supabase
        .from("daily_reports")
        .delete()
        .eq("id", reportId);

      if (error) {
        // Fallback delete from work_uploads
        const { error: fallbackError } = await supabase
          .from("work_uploads")
          .delete()
          .eq("id", reportId);
        
        if (fallbackError) throw fallbackError;
      }

      await loadHistory();
    } catch (err) {
      console.error("Failed to delete report:", err);
      alert("Error: Failed to delete report submission.");
      setHistory(previousHistory);
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

      <main className="flex-1 overflow-y-auto px-8 py-8 flex flex-col md:ml-64">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-theme-fg flex items-center gap-2">
              Daily Progress Report <FileCheck className="h-5 w-5 text-purple-500 dark:text-purple-400 animate-pulse" />
            </h1>
            <p className="text-xs text-theme-secondary font-medium">Log your daily progress, timeline block, and files directly to Supabase.</p>
          </div>
        </div>

        {fetching && history.length === 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              <div className="xl:col-span-7 h-[650px] rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
              <div className="xl:col-span-5 h-[650px] rounded-xl bg-zinc-200/20 dark:bg-zinc-800/20 animate-pulse border border-theme-border"></div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 flex-1 items-start">
            
            {/* Left Column: Submission Form & Active Details */}
            <div className="xl:col-span-7 space-y-6">
              <div className="glass rounded-xl p-6 text-theme-fg shadow-lg">
                <h3 className="text-sm font-bold uppercase tracking-wider text-theme-fg mb-4 flex items-center gap-2">
                  <ClipboardListIcon /> Submit Daily Log
                </h3>

                {errorMsg && (
                  <div className="mb-4 rounded-xl bg-red-500/5 border border-red-500/20 p-4 text-xs text-red-655 dark:text-red-400 flex items-center gap-2.5 animate-fade-up">
                    <AlertCircle className="h-4.5 w-4.5 text-red-500" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="mb-4 rounded-xl bg-green-500/5 border border-green-500/20 p-4 text-xs text-green-600 dark:text-green-400 flex items-center gap-2.5 animate-fade-up">
                    <CheckCircle className="h-4.5 w-4.5 text-green-500" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitReport} className="space-y-6">
                  
                  {/* SECTION A: THE TIMELINE */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-theme-border pb-2">
                      <label className="text-xs font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Clock className="h-4 w-4" /> Section A: Work Timeline
                      </label>
                      <button
                        type="button"
                        onClick={handleAddTimelineBlock}
                        className="flex items-center gap-1 text-[11px] font-bold text-white bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg transition-all shadow-md shadow-purple-600/10 active:scale-95 cursor-pointer"
                      >
                        <Plus className="h-3 w-3" /> Add Timeline Block
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {timeline.map((block, index) => (
                        <div 
                          key={index} 
                          className="flex items-center gap-3 p-3 bg-zinc-900/5 dark:bg-zinc-950/20 border border-theme-border rounded-xl transition-all duration-300 hover:border-purple-500/20"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              required
                              value={block.startTime}
                              onChange={(e) => handleTimelineChange(index, "startTime", e.target.value)}
                              className="rounded-lg border border-theme-border bg-zinc-100 dark:bg-zinc-900 p-2 text-xs text-theme-fg focus:ring-1 focus:ring-purple-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-theme-secondary font-bold">to</span>
                            <input
                              type="time"
                              required
                              value={block.endTime}
                              onChange={(e) => handleTimelineChange(index, "endTime", e.target.value)}
                              className="rounded-lg border border-theme-border bg-zinc-100 dark:bg-zinc-900 p-2 text-xs text-theme-fg focus:ring-1 focus:ring-purple-500 focus:outline-none"
                            />
                          </div>

                          <input
                            type="text"
                            required
                            placeholder="Enter task completed in this time block..."
                            value={block.description}
                            onChange={(e) => handleTimelineChange(index, "description", e.target.value)}
                            className="flex-1 rounded-lg border border-theme-border bg-zinc-100 dark:bg-zinc-900 p-2 text-xs text-theme-fg placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                          />

                          <button
                            type="button"
                            disabled={timeline.length === 1}
                            onClick={() => handleRemoveTimelineBlock(index)}
                            className="p-2 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 rounded-lg hover:bg-red-500/5 transition-colors cursor-pointer"
                            title="Remove timeline block"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SECTION B: DAILY REPORT */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-theme-border pb-2">
                      <FileText className="h-4 w-4" /> Section B: Summary of Daily Deliverables
                    </label>
                    <textarea
                      required
                      rows={5}
                      placeholder="Write a thorough, professional summary of research accomplishments, deliverables, and blockers..."
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      className="w-full rounded-xl border border-theme-border bg-zinc-100 dark:bg-zinc-900 p-3.5 text-xs text-theme-fg leading-relaxed placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-1 focus:ring-purple-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* SECTION C: ATTACHMENTS */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-theme-border pb-2">
                      <CloudUpload className="h-4 w-4" /> Section C: Supporting Attachments
                    </label>

                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative flex flex-col items-center justify-center border border-dashed rounded-xl py-6 px-4 cursor-pointer transition-all duration-200 ${
                        dragActive 
                          ? "border-purple-500 bg-purple-600/5 dark:bg-purple-500/5" 
                          : "border-theme-border hover:border-purple-500/40 bg-zinc-900/5 dark:bg-zinc-900/10 hover:bg-zinc-900/10"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                        onChange={handleFileChange}
                      />
                      <FileUp className="h-8 w-8 text-theme-secondary mb-2" />
                      <p className="text-xs font-semibold text-theme-fg text-center">
                        {selectedFile ? `Selected: ${selectedFile.name}` : "Drag & drop attachment here, or click to browse"}
                      </p>
                      <p className="text-[10px] text-theme-secondary mt-1 text-center">
                        PDF, DOCX, TXT, PNG, or JPG (up to 15MB)
                      </p>
                    </div>

                    {selectedFile && (
                      <div className="p-3 bg-purple-600/5 border border-purple-500/20 rounded-lg flex items-center justify-between text-xs text-theme-fg animate-fade-up">
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
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 py-3 text-xs font-bold text-white transition-all shadow-lg shadow-purple-600/10 active:scale-[0.98] cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Clock className="h-4 w-4 animate-spin" />
                        Transmitting Report & Files to Supabase...
                      </>
                    ) : (
                      <>
                        <span>Submit Progress Report</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Ingested Repository History */}
            <div className="xl:col-span-5 space-y-6">
              <div className="glass rounded-xl p-6 h-[685px] flex flex-col shadow-lg">
                <h3 className="text-sm font-bold text-theme-fg mb-4 flex items-center gap-2 border-b border-theme-border pb-3 uppercase tracking-wider">
                  <Calendar className="h-4.5 w-4.5 text-theme-secondary animate-pulse" />
                  Submission Archive
                </h3>

                {history.length === 0 ? (
                  <div className="text-center py-20 text-xs text-theme-secondary border border-dashed border-theme-border rounded-xl flex-1 flex flex-col items-center justify-center">
                    <Layers className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-2" />
                    No daily logs recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                    {history.map((report) => {
                      const isSelected = activeReport?.id === report.id;
                      return (
                        <div 
                          key={report.id}
                          onClick={() => setActiveReport(report)}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? "bg-purple-600/10 border-purple-500/40 shadow-inner"
                              : "bg-zinc-900/5 dark:bg-zinc-900/30 border-theme-border hover:border-purple-500/20"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-theme-secondary">
                              {new Date(report.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {report.file_url && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest bg-purple-600/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                                  File
                                </span>
                              )}
                              <button
                                onClick={() => handleDeleteReport(report.id)}
                                className="p-1 rounded text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                title="Delete Log"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          <p className="text-xs text-theme-fg line-clamp-3 leading-relaxed font-medium">
                            {report.report_text}
                          </p>

                          {/* Quick timeline count summary */}
                          {report.timeline_data && report.timeline_data.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                              <span className="text-[9px] text-theme-secondary font-bold uppercase tracking-wider">
                                {report.timeline_data.length} Timeline Blocks Logged
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Selected Report Modal or Overlay Info (Premium Detail View) */}
        {activeReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="glass w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-theme-border animate-in zoom-in-95 duration-200">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-theme-border px-6 py-4 bg-zinc-900/40 dark:bg-zinc-950/40">
                <div className="flex items-center gap-2">
                  <FileText className="h-4.5 w-4.5 text-purple-500" />
                  <h3 className="text-sm font-bold text-theme-fg uppercase tracking-wider">Daily Report Detail</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveReport(null)}
                  className="text-zinc-500 hover:text-theme-fg p-1 rounded-lg hover:bg-zinc-800/40 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between text-xs text-theme-secondary font-bold">
                  <span>Submitted on: {new Date(activeReport.created_at).toLocaleString([], { dateStyle: "long", timeStyle: "short" })}</span>
                  <span>ID: {activeReport.id.substring(0, 8)}...</span>
                </div>

                {/* Section B Summary details */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest border-b border-theme-border pb-1">
                    Daily deliverables summary
                  </h4>
                  <p className="text-xs leading-relaxed text-theme-fg whitespace-pre-wrap font-medium">
                    {activeReport.report_text}
                  </p>
                </div>

                {/* Section A Timeline Details */}
                {activeReport.timeline_data && activeReport.timeline_data.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest border-b border-theme-border pb-1">
                      Reported timeline log
                    </h4>
                    <div className="relative pl-4 border-l-2 border-purple-500/20 space-y-4 py-1">
                      {activeReport.timeline_data.map((block, idx) => (
                        <div key={idx} className="relative">
                          {/* Dot on line */}
                          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-purple-500 bg-theme-bg shrink-0"></span>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                              {block.startTime} — {block.endTime}
                            </span>
                            <span className="text-xs text-theme-fg font-medium">
                              {block.description}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section C Attachment */}
                {activeReport.file_url && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-purple-650 dark:text-purple-400 uppercase tracking-widest border-b border-theme-border pb-1">
                      Supporting Attachment
                    </h4>
                    <div className="flex items-center justify-between p-3.5 bg-zinc-900/10 dark:bg-zinc-950/20 border border-theme-border rounded-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-5 w-5 text-purple-500 shrink-0" />
                        <span className="text-xs text-theme-fg font-semibold truncate">
                          {decodeURIComponent(activeReport.file_url.split("/").pop() || "Attached File")}
                        </span>
                      </div>
                      <a
                        href={activeReport.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg transition-all shadow-md shadow-purple-600/10 cursor-pointer"
                      >
                        Download File
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end border-t border-theme-border px-6 py-4 bg-zinc-900/40 dark:bg-zinc-950/40">
                <button
                  type="button"
                  onClick={() => setActiveReport(null)}
                  className="text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 px-5 py-2.5 rounded-lg transition-all cursor-pointer"
                >
                  Close details
                </button>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Icon Components
function ClipboardListIcon() {
  return (
    <svg 
      className="h-4.5 w-4.5 text-theme-secondary" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" 
      />
    </svg>
  );
}
