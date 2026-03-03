"""Read ACL / ACL Elite match data from Japanese Wikipedia and save as CSV.

Two operating modes, selected by --mode:

  acl_gs   -- ACL 2023/24 Group Stage
               https://ja.wikipedia.org/wiki/AFCチャンピオンズリーグ2023/24_グループリーグ
               Page structure (mw-parser-output direct children):
                 div.mw-heading h2: グループステージ
                   div.mw-heading h3: グループA … グループJ  (10 groups)
                     12 div.footballbox per group
                       (6 matchdays × 2 matches; section_no = (idx // 2) + 1)

  acle_ls  -- ACL Elite 2024/25 League Stage
               https://ja.wikipedia.org/wiki/AFCチャンピオンズリーグエリート2024/25_リーグステージ
               Page structure:
                 div.mw-heading h2: 西地区  →  group = "WEST"
                   div.mw-heading h3: 第1節 … 第8節
                     6 div.footballbox per section
                 div.mw-heading h2: 東地区  →  group = "EAST"
                   (same)

Each div.footballbox contains:
  div[0]: "YYYY年M月D日 (YYYY-MM-DD)HH:MM UTC{+/-}N"  — date + time + TZ
  table:  Row 0 = home | "N - M" | away;  Row 1 = scorers (ignored)
  div[-1]: "Stadium (City)観客数: N人主審: ..."          — stadium info

Voided / cancelled matches (score not "N - M") are skipped.
Start times are converted to JST (UTC+9).
"""
import argparse
import logging
import os
import re
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, Tag
import pandas as pd
import requests

from match_utils import mu, CSV_COLUMN_SCHEMA

logger = logging.getLogger(__name__)

_HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; research bot)'}

# Wikipedia zone heading → CSV group value
_ZONE_MAP = {'西地区': 'WEST', '東地区': 'EAST'}


# ---------------------------------------------------------------------------
# Date / time helpers
# ---------------------------------------------------------------------------

def _parse_pre_div(text: str) -> tuple[str, str]:
    """Parse pre-match div → (match_date, start_time_jst).

    Input:  "YYYY年M月D日\\xa0(YYYY-MM-DD)HH:MM\\xa0UTC{+/-}N[:MM]"
    Output: (match_date: "YYYY-MM-DD", start_time_jst: "HH:MM:00")

    The time in the div is local venue time; this converts it to JST (UTC+9).
    """
    # Extract ISO date (most reliable part)
    date_m = re.search(r'\((\d{4}-\d{2}-\d{2})\)', text)
    if not date_m:
        return '', ''
    match_date = date_m.group(1)

    # Extract local time and UTC offset: "HH:MM UTC+N" or "HH:MM UTC+N:MM"
    time_m = re.search(r'\([\d-]+\)(\d{2}:\d{2})\s*UTC([+\-]\d+(?::\d{2})?)', text)
    if not time_m:
        return match_date, ''

    local_time_str = time_m.group(1)
    offset_str = time_m.group(2)

    # Parse local time to minutes
    lh, lm = map(int, local_time_str.split(':'))

    # Parse UTC offset
    sign = -1 if offset_str.startswith('-') else 1
    offset_parts = offset_str.lstrip('+-').split(':')
    off_h = sign * int(offset_parts[0])
    off_m = sign * int(offset_parts[1]) if len(offset_parts) > 1 else 0

    # local → UTC → JST (UTC+9)
    total_min = lh * 60 + lm - (off_h * 60 + off_m) + 9 * 60
    total_min %= 24 * 60  # normalise (date overflow is accepted)
    jst_h, jst_m = divmod(total_min, 60)
    return match_date, f'{jst_h:02d}:{jst_m:02d}:00'


def _parse_post_div(text: str) -> str:
    """Parse post-match div → stadium name.

    Input:  "Stadium（英語版）[注釈 1] (City)観客数: N人主審: ..."
    Output: "Stadium (City)"
    """
    # Strip Wikipedia annotations and footnotes
    text = re.sub(r'\[.*?\]', '', text)        # [注釈 N]
    text = re.sub(r'（[^）]*版）', '', text)    # （英語版）etc.
    # Take text up to 観客数 or 主審
    for sep in ('観客数', '主審'):
        idx = text.find(sep)
        if idx != -1:
            text = text[:idx]
    return text.strip()


# ---------------------------------------------------------------------------
# footballbox parser
# ---------------------------------------------------------------------------

def _parse_footballbox(box: Tag) -> dict[str, Any] | None:
    """Parse a div.footballbox → match record, or None if invalid/voided."""
    child_divs = box.find_all('div', recursive=False)
    table = box.find('table', recursive=False)

    if table is None or len(child_divs) < 2:
        return None

    match_date, start_time = _parse_pre_div(child_divs[0].text.strip())
    stadium = _parse_post_div(child_divs[-1].text.strip())

    rows = table.find_all('tr')
    if not rows:
        return None
    cells = [c.text.strip() for c in rows[0].find_all(['th', 'td'])]
    if len(cells) != 3:
        return None

    home_team, score_raw, away_team = cells

    # Strip footnotes from score cell before checking ("0 - 3[注釈 2]" → "0 - 3")
    score_raw = re.sub(r'\[.*?\]', '', score_raw).strip()

    # Must contain digit-dash-digit to be a valid score
    if not re.search(r'\d\s*-\s*\d', score_raw):
        logger.debug('Skipping non-standard score: %r (%s vs %s)',
                     score_raw, home_team, away_team)
        return None

    # Normalise spacing around '-', then split
    score_raw = re.sub(r'\s*-\s*', ' - ', score_raw)
    parts = score_raw.split(' - ')
    try:
        home_goal = int(parts[0].strip())
        away_goal = int(parts[1].strip())
    except (IndexError, ValueError):
        logger.debug('Cannot parse score: %r (%s vs %s)',
                     score_raw, home_team, away_team)
        return None

    return {
        'match_date': match_date,
        'start_time': start_time,
        'stadium': stadium,
        'home_team': home_team,
        'away_team': away_team,
        'home_goal': home_goal,
        'away_goal': away_goal,
        'status': '試合終了',
    }


# ---------------------------------------------------------------------------
# Page walker
# ---------------------------------------------------------------------------

def _heading_text(div: Tag) -> tuple[str, str]:
    """Return (tag_name, text) for a div.mw-heading wrapper, or ('', '')."""
    h = div.find(['h2', 'h3'])
    if not h:
        return '', ''
    return h.name, h.text.strip()


def _parse_page(soup: BeautifulSoup, mode: str) -> list[dict[str, Any]]:
    """Walk mw-parser-output direct children and extract matches.

    Works for both 'acl_gs' and 'acle_ls' modes using the heading hierarchy
    and div.footballbox elements.
    """
    content = soup.find('div', {'id': 'mw-content-text'})
    parser_output = content.find('div', class_='mw-parser-output')

    results: list[dict[str, Any]] = []
    current_h2 = ''
    current_h3 = ''
    box_idx = 0   # index within current h3 block (resets on each h3)

    for el in parser_output.children:
        if not isinstance(el, Tag):
            continue

        # ── heading wrapper ──────────────────────────────────────────────
        if el.name == 'div' and 'mw-heading' in (el.get('class') or []):
            level, text = _heading_text(el)
            if level == 'h2':
                current_h2 = text
                current_h3 = ''
                box_idx = 0
            elif level == 'h3':
                current_h3 = text
                box_idx = 0
            continue

        # ── match box ───────────────────────────────────────────────────
        if el.name != 'div' or 'footballbox' not in (el.get('class') or []):
            continue

        # ── resolve group / section_no by mode ──────────────────────────
        if mode == 'acle_ls':
            group = _ZONE_MAP.get(current_h2, '')
            if not group:
                box_idx += 1
                continue
            sec_m = re.search(r'第(\d+)節', current_h3)
            if not sec_m:
                box_idx += 1
                continue
            section_no = sec_m.group(1)
            match_idx = box_idx

        elif mode == 'acl_gs':
            if current_h2 != 'グループステージ':
                box_idx += 1
                continue
            if 'グループ' not in current_h3:
                box_idx += 1
                continue
            group = current_h3.replace('グループ', '').strip()
            section_no = str((box_idx // 2) + 1)
            match_idx = box_idx % 2

        else:
            box_idx += 1
            continue

        # ── parse the footballbox ────────────────────────────────────────
        record = _parse_footballbox(el)
        box_idx += 1
        if record is None:
            continue

        record['group'] = group
        record['section_no'] = section_no
        record['match_index_in_section'] = match_idx
        results.append(record)

    logger.info('Parsed %d matches (mode=%s)', len(results), mode)
    return results


# ---------------------------------------------------------------------------
# Top-level fetch + parse
# ---------------------------------------------------------------------------

def fetch_and_parse(url: str, mode: str) -> list[dict[str, Any]]:
    """Fetch *url*, parse according to *mode*, and return match records."""
    logger.info('GET %s', url)
    resp = requests.get(url, headers=_HEADERS, timeout=60)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'lxml')
    return _parse_page(soup, mode)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def make_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Read ACL/ACL Elite match data from Wikipedia and save as CSV'
    )
    parser.add_argument(
        '--mode', choices=['acl_gs', 'acle_ls'], required=True,
        help='"acl_gs" for ACL GS, "acle_ls" for ACL Elite LS',
    )
    parser.add_argument(
        '--url', required=True,
        help='Wikipedia page URL',
    )
    parser.add_argument(
        '--csv', required=True,
        help='Output CSV path (relative to src/ working dir, e.g. ../docs/csv/...)',
    )
    parser.add_argument('-d', '--debug', action='store_true')
    return parser.parse_args()


if __name__ == '__main__':
    # Change to src/ so that relative paths in acle.yaml (e.g. "../docs/csv/")
    # resolve correctly, consistent with read_acle_matches.py.
    os.chdir(Path(__file__).parent)

    _args = make_args()
    logging.basicConfig(
        level=logging.DEBUG if _args.debug else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )

    # Use acle.yaml for timestamp tracking (both ACL competitions share the
    # same docs/csv/ directory and csv_timestamp.csv file).
    mu.init_config(Path(__file__).parent / '../config/acle.yaml')

    records = fetch_and_parse(url=_args.url, mode=_args.mode)

    _df = pd.DataFrame(records)
    _ordered = [c for c in CSV_COLUMN_SCHEMA if c in _df.columns]
    _extras = [c for c in _df.columns if c not in CSV_COLUMN_SCHEMA]
    _df = _df[_ordered + _extras]
    _df = _df.sort_values(['section_no', 'match_index_in_section']).reset_index(drop=True)
    logger.info('Total %d matches', len(_df))

    mu.update_if_diff(_df, _args.csv)
