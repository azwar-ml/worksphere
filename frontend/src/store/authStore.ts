import { create } from "zustand";

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, userId: string, email: string, fullName: string, role: string) => void;
  clearAuth: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  email: null,
  fullName: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  setAuth: (token, userId, email, fullName, role) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ws_token", token);
      localStorage.setItem("ws_user_id", userId);
      localStorage.setItem("ws_email", email);
      localStorage.setItem("ws_full_name", fullName);
      localStorage.setItem("ws_role", role);
    }
    set({
      token,
      userId,
      email,
      fullName,
      role,
      isAuthenticated: true,
      isLoading: false,
    });
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ws_token");
      localStorage.removeItem("ws_user_id");
      localStorage.removeItem("ws_email");
      localStorage.removeItem("ws_full_name");
      localStorage.removeItem("ws_role");
    }
    set({
      token: null,
      userId: null,
      email: null,
      fullName: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
  initialize: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("ws_token");
    const userId = localStorage.getItem("ws_user_id");
    const email = localStorage.getItem("ws_email");
    const fullName = localStorage.getItem("ws_full_name");
    const role = localStorage.getItem("ws_role");

    if (token && userId && email && role) {
      set({
        token,
        userId,
        email,
        fullName,
        role,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },
}));
