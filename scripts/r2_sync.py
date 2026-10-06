"""Synchronizace složky s Cloudflare R2 (S3 API). Přírůstkově: přenáší jen soubory, které se liší.

  python scripts/r2_sync.py up   frontend/public/data/catalog --bucket ft-public --prefix catalog
  python scripts/r2_sync.py down frontend/public/data/catalog --bucket ft-public --prefix catalog

up    nahraje nové a změněné soubory (porovnání velikosti a MD5). Nic nemaže, pokud není --delete.
down  stáhne chybějící a změněné soubory. Slouží k obnovení stavu na čistém runneru (denní job je
      přírůstkový a čte už uložená data, takže stav musí být někde, co není git).

Přístup z env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (GitHub Secrets, nikdy do gitu).
"""

from __future__ import annotations

import argparse
import hashlib
import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import boto3
from botocore.config import Config

# Katalog se mění jednou denně v noci. Deset minut stačí a po refreshi je vidět téměř hned.
CACHE_CONTROL = "public, max-age=600, stale-while-revalidate=86400"
WORKERS = 12


def client():
    account = os.environ.get("R2_ACCOUNT_ID")
    key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    if not (account and key and secret):
        raise SystemExit("Chybí R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY")
    cfg = dict(retries={"max_attempts": 5, "mode": "standard"}, max_pool_connections=WORKERS * 2)
    try:
        # Novější boto3 přidává kontrolní součty, které R2 u některých operací odmítne. Posílat je jen když je to nutné.
        config = Config(**cfg, request_checksum_calculation="when_required", response_checksum_validation="when_required")
    except TypeError:
        config = Config(**cfg)
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
        config=config,
    )


def remote_index(s3, bucket: str, prefix: str) -> dict[str, tuple[int, str]]:
    """key -> (velikost, etag). ETag je MD5 u souborů nahraných jedním požadavkem (naše jsou malé)."""
    out: dict[str, tuple[int, str]] = {}
    token = None
    while True:
        kw = {"Bucket": bucket, "Prefix": prefix + "/"}
        if token:
            kw["ContinuationToken"] = token
        resp = s3.list_objects_v2(**kw)
        for o in resp.get("Contents", []):
            out[o["Key"]] = (o["Size"], o["ETag"].strip('"'))
        if not resp.get("IsTruncated"):
            return out
        token = resp["NextContinuationToken"]


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def content_type(path: Path) -> str:
    if path.suffix == ".json":
        return "application/json"
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def run_parallel(fn, items) -> int:
    done = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        for _ in ex.map(fn, items):
            done += 1
    return done


def up(s3, root: Path, bucket: str, prefix: str, delete: bool) -> None:
    remote = remote_index(s3, bucket, prefix)
    local = {f"{prefix}/{p.relative_to(root).as_posix()}": p for p in root.rglob("*") if p.is_file() and p.name != ".DS_Store"}

    def changed(item):
        key, path = item
        r = remote.get(key)
        return r is None or r[0] != path.stat().st_size or r[1] != md5(path)

    with ThreadPoolExecutor(WORKERS) as ex:
        todo = [it for it, c in zip(local.items(), ex.map(changed, local.items())) if c]

    def put(item):
        key, path = item
        s3.upload_file(
            str(path),
            bucket,
            key,
            ExtraArgs={"ContentType": content_type(path), "CacheControl": CACHE_CONTROL},
        )

    n = run_parallel(put, todo)
    print(f"R2 up: {n} nahráno, {len(local) - n} beze změny ({bucket}/{prefix})")
    if delete:
        stale = [k for k in remote if k not in local]
        for i in range(0, len(stale), 1000):
            s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in stale[i : i + 1000]]})
        print(f"R2 up: {len(stale)} smazáno")


def down(s3, root: Path, bucket: str, prefix: str, require: bool) -> None:
    remote = remote_index(s3, bucket, prefix)
    if not remote and require:
        # Bez stavu by denní job začal od nuly a spálil kvótu API. Raději spadnout.
        sys.exit(f"R2 down: {bucket}/{prefix} je prázdný, ale stav je povinný. Zastavuji.")
    if not remote:
        print(f"R2 down: {bucket}/{prefix} je prázdný, nechávám lokální soubory")
        return

    def need(item):
        key, (size, etag) = item
        path = root / key[len(prefix) + 1 :]
        return not path.exists() or path.stat().st_size != size or md5(path) != etag

    with ThreadPoolExecutor(WORKERS) as ex:
        todo = [it for it, c in zip(remote.items(), ex.map(need, remote.items())) if c]

    def get(item):
        key = item[0]
        path = root / key[len(prefix) + 1 :]
        path.parent.mkdir(parents=True, exist_ok=True)
        s3.download_file(bucket, key, str(path))

    n = run_parallel(get, todo)
    print(f"R2 down: {n} staženo, {len(remote) - n} beze změny ({bucket}/{prefix})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["up", "down"])
    ap.add_argument("folder")
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--prefix", required=True, help="předpona v bucketu, např. catalog")
    ap.add_argument("--delete", action="store_true", help="u up: smaže v bucketu soubory, které lokálně nejsou")
    ap.add_argument("--require-nonempty", action="store_true", help="u down: selže, pokud je v bucketu prázdno")
    a = ap.parse_args()
    root = Path(a.folder)
    prefix = a.prefix.strip("/")
    s3 = client()
    try:
        s3.head_bucket(Bucket=a.bucket)
    except Exception as e:  # noqa: BLE001
        sys.exit(f"Bucket {a.bucket} se nepodařilo otevřít: {e}\nZkontroluj název bucketu, R2_ACCOUNT_ID, klíče a že token má k bucketu přístup.")
    if a.mode == "up":
        if not root.is_dir():
            sys.exit(f"Složka {root} neexistuje")
        up(s3, root, a.bucket, prefix, a.delete)
    else:
        root.mkdir(parents=True, exist_ok=True)
        down(s3, root, a.bucket, prefix, a.require_nonempty)


if __name__ == "__main__":
    main()
