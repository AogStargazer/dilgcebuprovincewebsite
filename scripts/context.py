"""Print a compact read-only repository session briefing."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import date

from repo_read import ROOT, discover_news, git_status_paths, hook_lines


def doctor_status() -> tuple[str, str]:
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    result = subprocess.run(
        [sys.executable, "scripts/site-maintenance.py", "doctor"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env=environment,
        check=False,
    )
    details = next(
        (line for line in result.stdout.splitlines() if line.startswith("Found ") and not line.startswith("Found 0")),
        "",
    )
    return ("PASS" if result.returncode == 0 else "FAIL", details)


def main() -> int:
    news = discover_news()
    status, doctor_detail = doctor_status()
    changed = [
        (state, path)
        for state, path in git_status_paths()
        if path.lower().endswith((".html", ".css", ".js"))
    ]

    print("DILG Cebu Province session context")
    print(f"Root: {ROOT}")
    print(f"Date: {date.today().isoformat()}")
    print(f"Doctor: {status}" + (f" ({doctor_detail})" if doctor_detail else ""))
    print()
    print("Newest NEWS:")
    for item in news[:5]:
        flags = f"slider={item.slider_count} main={item.main_count}"
        print(f"- {item.date:%Y-%m-%d}  {item.folder.name}  [{flags}]")
        print(f"  {item.title}")
    print()
    print("Hooks:")
    for label, page, line in hook_lines():
        if label.endswith("begin") or label == "index main slider":
            print(f"- {page}:{line or 'missing'}  {label}")
    print()
    print("Uncommitted HTML/CSS/JS:")
    if changed:
        for state, path in changed:
            print(f"- {state} {path}")
    else:
        print("- none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
