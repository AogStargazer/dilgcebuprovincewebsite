"""Print a read-only inventory of every dated NEWS folder."""

from __future__ import annotations

from repo_read import discover_news


def main() -> int:
    rows = []
    for item in discover_news():
        rows.append(
            (
                item.folder.name,
                f"{item.date.strftime('%B')} {item.date.day}, {item.date.year}",
                item.kicker,
                str(item.slider_count),
                str(item.main_count),
                "yes" if item.in_index else "no",
                "yes" if item.in_news else "no",
            )
        )

    headers = ("folder", "date", "kicker", "slider", "main", "in-index", "in-news")
    widths = [
        max(len(headers[index]), *(len(row[index]) for row in rows))
        for index in range(len(headers))
    ]
    print("  ".join(value.ljust(widths[index]) for index, value in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(value.ljust(widths[index]) for index, value in enumerate(row)))
    print(f"\n{len(rows)} dated NEWS folder(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
