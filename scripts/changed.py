"""Turn changed repository paths into a read-only verification checklist."""

from __future__ import annotations

import subprocess
from pathlib import Path

from repo_read import ROOT


def changed_paths() -> list[str]:
    commands = (
        ["git", "diff", "--name-only"],
        ["git", "diff", "--cached", "--name-only"],
    )
    paths: set[str] = set()
    for command in commands:
        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
        if result.returncode == 0:
            paths.update(line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip())
    return sorted(paths, key=str.lower)


def next_steps(path: str) -> list[str]:
    value = Path(path)
    suffix = value.suffix.lower()
    parts = value.parts
    if parts and parts[0].upper() == "NEWS":
        folder = "/".join(parts[:2]) if len(parts) > 1 else path
        return [
            f"python scripts/news-workflow.py plan {folder}",
            f"python scripts/news-workflow.py doctor {folder}",
        ]
    if path in {"index.html", "news.html"}:
        return [
            f"python scripts/site-maintenance.py doctor {path}",
            "python scripts/news-workflow.py self-test",
        ]
    if suffix in {".html", ".json"}:
        return [f"python scripts/site-maintenance.py doctor {path}"]
    if suffix in {".css", ".js"}:
        return [
            f"python scripts/site-maintenance.py whitespace check {path}",
            "python scripts/site-maintenance.py git diff-check",
        ]
    if suffix == ".py":
        return [
            f"python -m py_compile {path}",
            "python scripts/site-maintenance.py git diff-check",
        ]
    return ["python scripts/site-maintenance.py git diff-check"]


def main() -> int:
    paths = changed_paths()
    if not paths:
        print("No tracked staged or unstaged changes.")
        return 0
    for path in paths:
        print(path)
        for command in next_steps(path):
            print(f"  -> {command}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
