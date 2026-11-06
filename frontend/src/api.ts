import axios from "axios";
import { create } from "zustand";
export const useSession = create<{
  token: string | null;
  setToken: (token: string | null) => void;
}>((set) => ({
  token: sessionStorage.getItem("freshwise-token"),
  setToken: (token) => {
    token
      ? sessionStorage.setItem("freshwise-token", token)
      : sessionStorage.removeItem("freshwise-token");
    set({ token });
  },
}));
export const api = axios.create({ baseURL: "/api", timeout: 30000 });
api.interceptors.request.use((config) => {
  const token = useSession.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) useSession.getState().setToken(null);
    return Promise.reject(error);
  },
);
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data?.detail;
    return typeof d === "string"
      ? d
      : Array.isArray(d)
        ? d.map((x) => `${x.loc?.at(-1)}: ${x.msg}`).join("; ")
        : e.message;
  }
  return "Something went wrong. Please try again.";
}
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
