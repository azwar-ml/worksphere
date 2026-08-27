import { create } from "zustand";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  role: string | null;
  status: string | null;
  labId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, refreshToken: string, userId: string, email: string, fullName: string, role: string, status: string, labId: string | null) => void;
  clearAuth: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  userId: null,
  email: null,
  fullName: null,
  role: null,
  status: null,
  labId: null,
  isAuthenticated: false,
  isLoading: true,
  setAuth: (token, refreshToken, userId, email, fullName, role, status, labId) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ws_token", token);
      localStorage.setItem("ws_refresh_token", refreshToken);
      localStorage.setItem("ws_user_id", userId);
      localStorage.setItem("ws_email", email);
      localStorage.setItem("ws_full_name", fullName);
      localStorage.setItem("ws_role", role);
      localStorage.setItem("ws_status", status);
      if (labId) localStorage.setItem("ws_lab_id", labId);
      else localStorage.removeItem("ws_lab_id");
    }
    set({
      token,
      refreshToken,
      userId,
      email,
      fullName,
      role,
      status,
      labId,
      isAuthenticated: true,
      isLoading: false,
    });
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ws_token");
      localStorage.removeItem("ws_refresh_token");
      localStorage.removeItem("ws_user_id");
      localStorage.removeItem("ws_email");
      localStorage.removeItem("ws_full_name");
      localStorage.removeItem("ws_role");
      localStorage.removeItem("ws_status");
      localStorage.removeItem("ws_lab_id");
    }
    set({
      token: null,
      refreshToken: null,
      userId: null,
      email: null,
      fullName: null,
      role: null,
      status: null,
      labId: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
  initialize: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("ws_token");
    const refreshToken = localStorage.getItem("ws_refresh_token");
    const userId = localStorage.getItem("ws_user_id");
    const email = localStorage.getItem("ws_email");
    const fullName = localStorage.getItem("ws_full_name");
    const role = localStorage.getItem("ws_role");
    const status = localStorage.getItem("ws_status");
    const labId = localStorage.getItem("ws_lab_id");

    if (token && userId && email && role && status) {
      set({
        token,
        refreshToken,
        userId,
        email,
        fullName,
        role,
        status,
        labId,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },
}));
