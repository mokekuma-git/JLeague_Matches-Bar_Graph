#!/usr/bin/env python3
"""Fetch competition and section labels from data.j-league.or.jp/SFRT01.

This script queries the endpoints that populate the season-dependent
competition/section dropdowns on the J.League Data Site standings page.
It saves the raw catalog to local_data/tournament_research so the data can be
used for offline review without publishing it via GitHub Pages.

Examples:
    python3 scripts/fetch_jleague_competition_catalog.py
    python3 scripts/fetch_jleague_competition_catalog.py --start-year 1992 --end-year 2025
"""

from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import dataclass, asdict
from html import unescape
from pathlib import Path

import requests

BASE_URL = "https://data.j-league.or.jp"
COMPETITION_URL = f"{BASE_URL}/SFRT01/competition"
SECTION_URL = f"{BASE_URL}/SFRT01/competitionSection"
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parent.parent
    / "local_data"
    / "tournament_research"
    / "jleague_data_site_competitions_1992_2025.json"
)
USER_AGENT = "Mozilla/5.0"
OPTION_RE = re.compile(r'<option\s+value="([^"]*)">(.*?)</option>', re.DOTALL)


@dataclass
class Option:
    value: str
    label: str


def parse_options(html: str) -> list[Option]:
    """Parse <option> tags from an HTML fragment."""
    options: list[Option] = []
    for value, label in OPTION_RE.findall(html):
        clean_label = re.sub(r"\s+", " ", unescape(label)).strip()
        options.append(Option(value=value.strip(), label=clean_label))
    return options


def fetch_options(session: requests.Session, url: str, data: dict[str, str]) -> list[Option]:
    """POST to an endpoint and return parsed options."""
    response = session.post(url, data=data, timeout=60)
    response.raise_for_status()
    response.encoding = "utf-8"
    return parse_options(response.text)


def build_catalog(start_year: int, end_year: int, delay: float) -> dict[str, object]:
    """Fetch competition and section options for each year."""
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    years: list[dict[str, object]] = []
    for year in range(start_year, end_year + 1):
        year_id = str(year)
        competitions = fetch_options(session, COMPETITION_URL, {"yearId": year_id})
        competition_entries: list[dict[str, object]] = []

        for competition in competitions:
            if not competition.value:
                continue
            sections = fetch_options(
                session, SECTION_URL, {"competitionId": competition.value}
            )
            competition_entries.append(
                {
                    "competition_id": competition.value,
                    "competition_label": competition.label,
                    "sections": [asdict(option) for option in sections if option.value],
                }
            )
            if delay:
                time.sleep(delay)

        years.append(
            {
                "year_id": year_id,
                "competitions": competition_entries,
            }
        )
        if delay:
            time.sleep(delay)

    return {
        "source": "data.j-league.or.jp/SFRT01",
        "competition_endpoint": COMPETITION_URL,
        "section_endpoint": SECTION_URL,
        "start_year": start_year,
        "end_year": end_year,
        "years": years,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch competition and section labels from the J.League Data Site."
    )
    parser.add_argument("--start-year", type=int, default=1992)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--delay", type=float, default=0.1)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    catalog = build_catalog(args.start_year, args.end_year, args.delay)
    output_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    years = len(catalog["years"])
    competitions = sum(len(year["competitions"]) for year in catalog["years"])
    print(f"Saved {years} years / {competitions} competitions to {output_path}")


if __name__ == "__main__":
    main()
