import { Link } from "../i18n/router";
import { t } from "../i18n/locale";

export function NotFoundPage({ text }: { text?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 pt-20">
      <Link to="/" className="text-sm text-emerald-400 light:text-emerald-700">
        {t("nf.home")}
      </Link>
      <div className="card mt-6 p-8 text-center">
        <h1 className="text-xl font-semibold text-white light:text-slate-900">{t("nf.title")}</h1>
        <p className="mt-2 text-slate-400 light:text-slate-500">{text ?? t("nf.text")}</p>
      </div>
    </div>
  );
}
