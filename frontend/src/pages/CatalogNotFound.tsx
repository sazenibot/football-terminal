import { Link } from "react-router-dom";

export function CatalogNotFound({ kind }: { kind: string }) {
  return (
    <div className="max-w-6xl mx-auto py-16 px-4 pt-20">
      <Link to="/catalog" className="text-emerald-400 text-sm">
        ← zpět do katalogu
      </Link>
      <div className="card p-8 mt-6 text-center">
        <h1 className="text-xl font-semibold text-white light:text-slate-900">404</h1>
        <p className="text-slate-400 light:text-slate-500 mt-2">
          Tento {kind} v katalogu není. Nepodstrkáváme cizí klub ani mock profil.
        </p>
      </div>
    </div>
  );
}
