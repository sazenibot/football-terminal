import { useState } from "react";
import { useNavigate } from "../i18n/router";
import { useAccess } from "../access/AccessContext";
import { Frame } from "../cat/kit";
import { t } from "../i18n/locale";
import { Seg } from "../mc2/kit";

/* Zatím neposílá nic nikam. Až bude přihlášení (Supabase), nahradí se onSubmit. */
export function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const { setTier } = useAccess();
  const navigate = useNavigate();
  const input = "mt-1 w-full rounded-xl border border-(--c-line) bg-(--c-page) px-3 py-2 text-sm outline-none focus:border-(--c-accent)";
  return (
    <Frame>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">{mode === "up" ? t("login.titleUp") : t("login.titleIn")}</h1>
        <p className="mt-1 text-[14px] text-(--c-muted)">{t("login.lead")}</p>
        <div className="mt-4">
          <Seg
            label={t("login.modeLabel")}
            value={mode}
            onChange={setMode}
            options={[
              { id: "up", label: t("login.modeUp") },
              { id: "in", label: t("login.modeIn") },
            ]}
          />
        </div>
        <form
          className="mt-4 space-y-3 rounded-2xl border border-(--c-line) bg-(--c-surface) p-5"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <label className="block text-[13px]">
            {t("login.email")}
            <input type="email" disabled placeholder={t("login.emailPh")} className={input} />
          </label>
          <label className="block text-[13px]">
            {t("login.password")}
            <input type="password" disabled placeholder="••••••••" className={input} />
          </label>
          <button type="submit" disabled className="min-h-10 w-full cursor-not-allowed rounded-xl bg-(--c-raised) text-sm font-semibold text-(--c-faint)">
            {mode === "up" ? t("login.submitUp") : t("login.submitIn")}
          </button>
          <p className="text-[12px] leading-snug text-(--c-faint)">{t("login.note")}</p>
        </form>
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
      </div>
    </Frame>
  );
}
