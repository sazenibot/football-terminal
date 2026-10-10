import type { Tier } from "./tiers";

export type Session = {
  email: string;
  tier: Tier;
  period_end: string | null;
  free_fixture: number | null;
  email_verified: boolean;
  marketing_opt_in: boolean;
  locale?: string;
};

type ErrBody = { error?: string; ok?: boolean; needs_verify?: boolean; dev_verify_url?: string; dev_reset_url?: string; free_fixture?: number };

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const r = await fetch(path, { ...init, credentials: "include", headers });
  let data: ErrBody = {};
  try {
    data = await r.json();
  } catch {
    /* prázdné tělo */
  }
  if (!r.ok) throw new ApiError(data.error || "server", r.status);
  return data as T;
}

export async function fetchMe(): Promise<Session | null> {
  const data = await req<Session & { tier: string }>("/api/me");
  if (!data.email || data.tier === "anon") return null;
  return data;
}

export const register = (body: { email: string; password: string; locale: string; age18: boolean; marketing_opt_in: boolean }) =>
  req<ErrBody>("/api/auth/register", { method: "POST", body: JSON.stringify(body) });

export const login = (body: { email: string; password: string }) =>
  req<ErrBody>("/api/auth/login", { method: "POST", body: JSON.stringify(body) });

export const logout = () => req<ErrBody>("/api/auth/logout", { method: "POST" });

export const verifyEmail = (token: string) =>
  req<ErrBody>("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });

export const forgotPassword = (email: string) =>
  req<ErrBody>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });

export const resetPassword = (token: string, password: string) =>
  req<ErrBody>("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });

export const resendVerify = () => req<ErrBody>("/api/auth/resend-verify", { method: "POST" });

export const claimPick = (fixtureId: number) =>
  req<{ free_fixture: number }>("/api/me/free-fixture", { method: "POST", body: JSON.stringify({ fixture_id: fixtureId }) });
