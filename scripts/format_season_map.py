#!/usr/bin/env python3
"""Custom formatter for season_map.json.

Formats the 4-tier season_map.json with readable indentation for the outer
structure, while keeping season entry arrays compact.

Rules:
- Outer dicts (group, competition, seasons key) use indent=2 formatting
- Season entry arrays: always break after scalars
    "2025": [20, 3, 3,
      ["team1", "team2", ...]]
- With optional dict: one more line
    "2026East": [10, 1, 0,
      ["team1", "team2", ...],
      {"group_display": "EAST"}]
- Short arrays (e.g. css_files) are inlined
"""
import json
import sys
from pathlib import Path


def compact_json(obj):
    """Serialize obj as a single-line JSON string."""
    return json.dumps(obj, ensure_ascii=False, separators=(", ", ": "))


def is_season_entry(obj):
    """Check if obj looks like a season entry array: [int, int, int, [...], ...]."""
    return (isinstance(obj, list)
            and len(obj) >= 4
            and isinstance(obj[0], int)
            and isinstance(obj[1], int)
            and isinstance(obj[2], int)
            and isinstance(obj[3], list))


def format_season_entry(entry, cont_indent):
    """Format a season entry array.

    Always break after scalars:
      [20, 3, 3,
        ["team1", "team2", ...]]

    With optional dict, one more line:
      [10, 1, 0,
        ["team1", "team2", ...],
        {"group_display": "EAST"}]
    """
    scalars = entry[:3]  # [teamCount, promo, releg]
    teams = entry[3]
    scalars_str = ", ".join(str(s) for s in scalars)
    teams_str = compact_json(teams)

    if len(entry) <= 4:
        return (f"[{scalars_str},\n"
                f"{cont_indent}{teams_str}]")

    opt_str = compact_json(entry[4])
    return (f"[{scalars_str},\n"
            f"{cont_indent}{teams_str},\n"
            f"{cont_indent}{opt_str}]")


def format_value(obj, depth, key_context=None):
    """Recursively format a JSON value with custom rules.

    key_context: the dict key under which this value appears (e.g. "seasons")
    """
    indent = "  " * depth
    child_indent = "  " * (depth + 1)

    # Season entry: compact format
    if key_context == "_season_value" and is_season_entry(obj):
        return format_season_entry(obj, child_indent)

    # Short arrays (non-season-entry lists with simple scalar elements)
    if isinstance(obj, list) and all(isinstance(v, str) for v in obj):
        one_line = compact_json(obj)
        if len(one_line) <= 80:
            return one_line

    if isinstance(obj, dict):
        if not obj:
            return "{}"
        lines = ["{"]
        items = list(obj.items())
        for i, (k, v) in enumerate(items):
            comma = "," if i < len(items) - 1 else ""
            k_str = json.dumps(k, ensure_ascii=False)

            # Determine context for child formatting
            if k == "seasons":
                # seasons dict: keys get normal indent, values get season_value context
                v_str = format_seasons_dict(v, depth + 1)
                lines.append(f"{child_indent}{k_str}: {v_str}{comma}")
            else:
                v_str = format_value(v, depth + 1, key_context=k)
                if "\n" in v_str:
                    lines.append(f"{child_indent}{k_str}: {v_str}{comma}")
                else:
                    lines.append(f"{child_indent}{k_str}: {v_str}{comma}")
        lines.append(f"{indent}}}")
        return "\n".join(lines)

    if isinstance(obj, list):
        if not obj:
            return "[]"
        # Default: expand vertically
        lines = ["["]
        for i, item in enumerate(obj):
            comma = "," if i < len(obj) - 1 else ""
            item_str = format_value(item, depth + 1)
            lines.append(f"{child_indent}{item_str}{comma}")
        lines.append(f"{indent}]")
        return "\n".join(lines)

    return json.dumps(obj, ensure_ascii=False)


def format_seasons_dict(seasons, depth):
    """Format the seasons dict with compact entry values."""
    indent = "  " * depth
    child_indent = "  " * (depth + 1)

    if not seasons:
        return "{}"

    lines = ["{"]
    items = list(seasons.items())
    for i, (season_key, entry) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        k_str = json.dumps(season_key, ensure_ascii=False)
        v_str = format_value(entry, depth + 1, key_context="_season_value")
        lines.append(f"{child_indent}{k_str}: {v_str}{comma}")
    lines.append(f"{indent}}}")
    return "\n".join(lines)


def main():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        path = Path(__file__).resolve().parent.parent / "docs" / "json" / "season_map.json"

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    formatted = format_value(data, 0) + "\n"

    with open(path, "w", encoding="utf-8") as f:
        f.write(formatted)

    line_count = formatted.count("\n")
    print(f"Formatted {path} ({line_count} lines)")


if __name__ == "__main__":
    main()
