#!/usr/bin/env python3
"""Custom formatter for season_map.json.

Formats the 4-tier season_map.json with readable indentation for the outer
structure, while keeping season entry objects compact.

Rules:
- Outer dicts (group, competition, seasons key) use indent=2 formatting
- Season entry objects: scalars on the first line, teams on the next,
  then any extra options on a third line
    "2025": {"team_count": 20, "promotion_count": 3, "relegation_count": 3,
      "teams": ["team1", "team2", ...]}
- With extra options:
    "2026East": {"team_count": 10, "promotion_count": 1, "relegation_count": 0,
      "teams": ["team1", "team2", ...],
      "group_display": "EAST", "point_system": "pk-win2-loss1"}
- Short arrays (e.g. css_files) are inlined
"""
import json
import sys
from pathlib import Path

SEASON_ENTRY_REQUIRED_KEYS = ('team_count', 'promotion_count', 'relegation_count', 'teams')


def compact_json(obj):
    """Serialize obj as a single-line JSON string."""
    return json.dumps(obj, ensure_ascii=False, separators=(", ", ": "))


def is_season_entry(obj):
    """Check if obj looks like a season entry object."""
    return (isinstance(obj, dict)
            and all(k in obj for k in SEASON_ENTRY_REQUIRED_KEYS)
            and isinstance(obj.get('teams'), list))


def format_season_entry(entry, cont_indent):
    """Format a season entry object compactly.

    Scalars on the first line, teams on the next, extras on a third:
      {"team_count": 20, "promotion_count": 3, "relegation_count": 3,
        "teams": ["team1", "team2", ...]}

    With extra options:
      {"team_count": 10, "promotion_count": 1, "relegation_count": 0,
        "teams": ["team1", "team2", ...],
        "group_display": "EAST", "point_system": "pk-win2-loss1"}
    """
    scalars_str = (
        f'"team_count": {entry["team_count"]}, '
        f'"promotion_count": {entry["promotion_count"]}, '
        f'"relegation_count": {entry["relegation_count"]}'
    )
    teams_str = f'"teams": {compact_json(entry["teams"])}'

    extras = {k: v for k, v in entry.items() if k not in SEASON_ENTRY_REQUIRED_KEYS}

    if not extras:
        return (f"{{{scalars_str},\n"
                f"{cont_indent}{teams_str}}}")

    extras_str = ", ".join(
        f"{json.dumps(k, ensure_ascii=False)}: {compact_json(v)}"
        for k, v in extras.items()
    )
    return (f"{{{scalars_str},\n"
            f"{cont_indent}{teams_str},\n"
            f"{cont_indent}{extras_str}}}")


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
