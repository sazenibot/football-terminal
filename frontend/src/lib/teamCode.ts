/** Unikátní zkratky týmů do os grafů. Stejné 3 znaky (SLO) se u Slovácka a Liberce nesmějí krýt. */
const PREFIX = /^(?:\d+\.\s*)?(?:FC|FK|SK|MFK|AC|AS|AFC|CF|CD|RCD|UD|SD|SC|SV|VfB|VfL|TSG|SS|US|RC|CA)\s+/i;

const OVERRIDE: Record<string, string> = {
  "1. FC Slovácko": "SLK",
  "FC Slovácko": "SLK",
  Slovácko: "SLK",
  "FC Slovan Liberec": "SLL",
  "Slovan Liberec": "SLL",
};

function baseCode(name: string): string {
  if (OVERRIDE[name]) return OVERRIDE[name];
  const clean = name.replace(PREFIX, "").trim();
  const parts = clean.split(/\s+/).filter((w) => !/^(praha|brno|ostrava|the)$/i.test(w));
  if (parts.length >= 2) return (parts[0].slice(0, 2) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
  return clean.slice(0, 3).toUpperCase();
}

export function uniqueTeamCodes(names: string[]): Map<string, string> {
  const assigned = new Map<string, string>();
  const taken = new Set<string>();
  for (const n of [...new Set(names)]) {
    let code = baseCode(n);
    if (taken.has(code)) {
      const extra = n.replace(PREFIX, "").replace(/\s+/g, "").slice(3).toUpperCase();
      let i = 0;
      let next = (code.slice(0, 2) + (extra[i] || "X")).toUpperCase();
      while (taken.has(next) && i < 12) {
        i += 1;
        next = (code.slice(0, 2) + (extra[i] || String(i))).toUpperCase();
      }
      code = next;
    }
    taken.add(code);
    assigned.set(n, code);
  }
  return assigned;
}
