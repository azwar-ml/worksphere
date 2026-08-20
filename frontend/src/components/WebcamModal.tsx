"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw, AlertCircle } from "lucide-react";

interface WebcamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string) => Promise<void>;
  loading: boolean;
  title: string;
}

export default function WebcamModal({ isOpen, onClose, onCapture, loading, title }: WebcamModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError("");
      setVerifying(false);
      startWebcam();
    } else {
      stopWebcam();
    }
    return () => stopWebcam();
  }, [isOpen]);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Webcam access error:", err);
      setError("Unable to access camera. Please ensure permissions are granted.");
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || verifying) return;
    setError("");
    setVerifying(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      
      if (ctx && videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);
        await onCapture(imageBase64);
        stopWebcam();
      } else {
        throw new Error("Unable to capture frame.");
      }
    } catch (err: any) {
      setError(err.message || "Face validation failed. Try adjusting lighting.");
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-theme-border animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-theme-border px-6 py-4 bg-zinc-900/40 dark:bg-zinc-950/40">
          <h3 className="text-sm font-bold text-theme-fg uppercase tracking-wider">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-theme-fg p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center">
          {error && (
            <div className="w-full mb-4 rounded-xl bg-red-950/20 border border-red-500/20 p-4 text-xs text-red-450 dark:text-red-400 flex items-start gap-2.5">
              <AlertCircle className="h-4.5 w-4.5 text-red-455 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Camera Viewport */}
          <div className="relative w-full aspect-video rounded-xl bg-zinc-900 dark:bg-zinc-950 border border-theme-border overflow-hidden flex items-center justify-center">
            {error ? (
              <Camera className="h-12 w-12 text-zinc-700" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
            
            {(verifying || loading) && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
                <span className="text-xs font-semibold text-purple-200 uppercase tracking-widest animate-pulse">Running MediaPipe AI...</span>
              </div>
            )}
          </div>

          <p className="text-xs text-theme-secondary text-center mt-4 max-w-sm">
            Align your face inside the camera frame. The NCAI validation engine will verify your biometric profile.
          </p>

          {/* Footer Action */}
          <div className="w-full flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-theme-border hover:bg-zinc-200 dark:hover:bg-zinc-800 text-sm font-semibold text-theme-secondary hover:text-theme-fg transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCapture}
              disabled={!!error || verifying || loading}
              className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-semibold text-white shadow-lg shadow-purple-600/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="h-4.5 w-4.5" />
              <span>Verify & Log</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
