#!/usr/bin/env bash
# Jedno tlačítko: commitne lokální změny (kromě .env) a pushne na GitHub.
# Vercel, pokud je projekt napojený na repo, se zbuildí sám.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Tato složka ještě není git repo. Spusť nejdřív: git init"
  exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "Žádné změny k odeslání."
  git push -u origin HEAD
  exit 0
fi

msg="${1:-Update Football Terminal}"
git commit -m "$msg"
git push -u origin HEAD
echo "Odesláno. Vercel by měl začít nový deploy sám."
