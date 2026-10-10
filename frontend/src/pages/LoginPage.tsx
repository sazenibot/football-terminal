import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "../i18n/router";
import { useAccess } from "../access/AccessContext";
import { ApiError, forgotPassword, login, register, resendVerify, resetPassword, startPortal, verifyEmail } from "../access/api";
import { tierName } from "../access/tiers";
import { Frame } from "../cat/kit";
import { t, useLocale, type Key } from "../i18n";
import { DEV_TOOLS } from "../lib/flags";
import { Seg } from "../mc2/kit";

type Mode = "in" | "up" | "forgot";

function safeNext(raw: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  return raw;
}

function errText(code: string): string {
  const key = `login.err.${code}` as Key;
  const msg = t(key);
  return msg === String(key) ? t("login.err.server") : msg;
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [age18, setAge18] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const { session, ready, refresh, logout, setTier } = useAccess();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const [sp, setSp] = useSearchParams();
  const resetTok = sp.get("reset") || "";
  const verifyTok = sp.get("verify") || "";
  const nextTo = safeNext(sp.get("next") || "");
  const input = "mt-1 w-full rounded-xl border border-(--c-line) bg-(--c-page) px-3 py-2 text-sm outline-none focus:border-(--c-accent)";

  const afterLogin = () => navigate(nextTo || "/");

  useEffect(() => {
    if (!verifyTok) return;
    let cancel = false;
    void (async () => {
      try {
        await verifyEmail(verifyTok);
        if (cancel) return;
        setInfo(t("login.verified"));
        await refresh();
      } catch {
        if (!cancel) setError(errText("invalid_token"));
      } finally {
        setSp({}, { replace: true });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [verifyTok, refresh, setSp]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setDevLink(null);
    if (resetTok && password !== password2) {
      setError(t("login.err.mismatch"));
      return;
    }
    if (mode === "up" && password !== password2) {
      setError(t("login.err.mismatch"));
      return;
    }
    setBusy(true);
    try {
      if (resetTok) {
        await resetPassword(resetTok, password);
        await refresh();
        setSp({}, { replace: true });
        navigate("/");
        return;
      }
      if (mode === "forgot") {
        const out = await forgotPassword(email);
        setInfo(t("login.forgotSent"));
        if (out.dev_reset_url) setDevLink(out.dev_reset_url);
        return;
      }
      if (mode === "up") {
        const out = await register({ email, password, locale, age18, marketing_opt_in: marketing });
        await refresh();
        setInfo(t("login.verifySent"));
        if (out.dev_verify_url) setDevLink(out.dev_verify_url);
        return;
      }
        await login({ email, password });
        await refresh();
        afterLogin();
    } catch (err) {
      setError(errText(err instanceof ApiError ? err.code : "server"));
    } finally {
      setBusy(false);
    }
  };

  if (ready && session && !resetTok && !verifyTok && mode !== "forgot") {
    return (
      <Frame>
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-bold">{t("login.accountTitle")}</h1>
          <p className="mt-1 text-[14px] text-(--c-muted)">{session.email}</p>
          {!session.email_verified && (
            <div className="mt-4 rounded-xl border border-(--c-warn)/40 bg-(--c-warn)/10 px-4 py-3 text-[13px]">
              <p>{t("login.verifyPending")}</p>
              <button
                type="button"
                className="mt-2 text-(--c-accent) hover:underline"
                onClick={() => {
                  void resendVerify()
                    .then((out) => {
                      setInfo(t("login.verifySent"));
                      if (out.dev_verify_url) setDevLink(out.dev_verify_url);
                    })
                    .catch(() => setError(errText("server")));
                }}
              >
                {t("login.resendVerify")}
              </button>
            </div>
          )}
          {info && <p className="mt-3 text-[13px] text-(--c-accent)">{info}</p>}
          {devLink && (
            <p className="mt-2 break-all text-[12px] text-(--c-faint)">
              {t("login.devLink")}{" "}
              <a className="text-(--c-accent) underline" href={devLink}>
                {devLink}
              </a>
            </p>
          )}
          {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
          <p className="mt-4 text-[13px] text-(--c-muted)">{t("login.plan", { tier: tierName(session.tier) })}</p>
          {session.period_end && (
            <p className="text-[13px] text-(--c-muted)">{t("login.until", { date: new Date(session.period_end).toLocaleDateString(locale === "cs" ? "cs-CZ" : "en-GB") })}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {session.has_billing && (
              <button
                type="button"
                className="min-h-10 rounded-xl btn-accent px-4 text-sm font-semibold hover:opacity-90"
                onClick={() => {
                  void startPortal()
                    .then((out) => window.location.assign(out.url))
                    .catch(() => setError(errText("server")));
                }}
              >
                {t("login.billing")}
              </button>
            )}
            <Link to="/tarify" className="inline-flex min-h-10 items-center rounded-xl border border-(--c-line) px-4 text-sm font-medium hover:border-(--c-faint)">
              {t("gate.seePlans")}
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-10 rounded-xl border border-(--c-line) px-4 text-sm font-medium hover:border-(--c-faint)"
            >
              {t("login.logout")}
            </button>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">
          {resetTok ? t("login.titleReset") : mode === "forgot" ? t("login.titleForgot") : mode === "up" ? t("login.titleUp") : t("login.titleIn")}
        </h1>
        <p className="mt-1 text-[14px] text-(--c-muted)">
          {resetTok ? t("login.leadReset") : mode === "forgot" ? t("login.leadForgot") : t("login.lead")}
        </p>
        {!resetTok && (
          <div className="mt-4">
            <Seg
              label={t("login.modeLabel")}
              value={mode === "forgot" ? "in" : mode}
              onChange={(v) => {
                setMode(v);
                setError(null);
                setInfo(null);
              }}
              options={[
                { id: "up", label: t("login.modeUp") },
                { id: "in", label: t("login.modeIn") },
              ]}
            />
          </div>
        )}
        <form className="mt-4 space-y-3 rounded-2xl border border-(--c-line) bg-(--c-surface) p-5" onSubmit={(e) => void submit(e)}>
          {!resetTok && (
            <label className="block text-[13px]">
              {mode === "in" ? t("login.user") : t("login.email")}
              <input
                type={mode === "in" ? "text" : "email"}
                required
                autoComplete={mode === "in" ? "username" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "in" ? t("login.userPh") : t("login.emailPh")}
                className={input}
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="block text-[13px]">
              {resetTok ? t("login.passwordNew") : t("login.password")}
              <input
                type="password"
                required
                minLength={mode === "in" ? 1 : 8}
                autoComplete={mode === "up" || resetTok ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={input}
              />
            </label>
          )}
          {(mode === "up" || resetTok) && (
            <label className="block text-[13px]">
              {t("login.passwordAgain")}
              <input type="password" required minLength={8} autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" className={input} />
            </label>
          )}
          {mode === "up" && !resetTok && (
            <>
              <label className="flex items-start gap-2 text-[13px] leading-snug">
                <input type="checkbox" className="mt-0.5" checked={age18} onChange={(e) => setAge18(e.target.checked)} required />
                <span>{t("login.age18")}</span>
              </label>
              <label className="flex items-start gap-2 text-[13px] leading-snug">
                <input type="checkbox" className="mt-0.5" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                <span>{t("login.marketing")}</span>
              </label>
              <p className="text-[12px] leading-snug text-(--c-faint)">
                {t("login.legalBefore")}
                <Link to="/obchodni-podminky" className="text-(--c-accent) hover:underline">
                  {t("footer.terms")}
                </Link>
                {t("login.legalAnd")}
                <Link to="/ochrana-udaju" className="text-(--c-accent) hover:underline">
                  {t("footer.privacy")}
                </Link>
                {t("login.legalAfter")}
              </p>
            </>
          )}
          {error && <p className="text-[13px] text-red-500">{error}</p>}
          {info && <p className="text-[13px] text-(--c-accent)">{info}</p>}
          {devLink && (
            <p className="break-all text-[12px] text-(--c-faint)">
              {t("login.devLink")}{" "}
              <a className="text-(--c-accent) underline" href={devLink}>
                {devLink}
              </a>
            </p>
          )}
          <button type="submit" disabled={busy} className="min-h-10 w-full rounded-xl btn-accent text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {busy ? t("common.loading") : resetTok ? t("login.submitReset") : mode === "forgot" ? t("login.submitForgot") : mode === "up" ? t("login.submitUp") : t("login.submitIn")}
          </button>
          {mode === "in" && !resetTok && (
            <button type="button" className="w-full text-center text-[13px] text-(--c-accent) hover:underline" onClick={() => setMode("forgot")}>
              {t("login.forgotLink")}
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" className="w-full text-center text-[13px] text-(--c-accent) hover:underline" onClick={() => setMode("in")}>
              {t("login.backToIn")}
            </button>
          )}
        </form>
        {DEV_TOOLS && !session && (
          <div className="mt-4 rounded-2xl border border-dashed border-(--c-line) p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("login.preview")}</p>
            <button
              type="button"
              onClick={() => {
                setTier("account");
                navigate("/");
              }}
              className="mt-2 min-h-9 rounded-xl border border-(--c-line) px-4 text-[13px] font-medium hover:border-(--c-faint)"
            >
              {t("login.previewBtn")}
            </button>
          </div>
        )}
      </div>
    </Frame>
  );
}
