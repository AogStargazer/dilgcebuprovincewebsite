"""Print the NEWS workflow hook line numbers."""

from __future__ import annotations

from repo_read import hook_lines


def main() -> int:
    for label, page, line in hook_lines():
        print(f"{page}:{line or 'missing'}  {label}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
