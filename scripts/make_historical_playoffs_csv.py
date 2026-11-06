#!/usr/bin/env python3
"""Convert cached official J.League promotion/relegation playoffs (1998–2025).

Run ``uv run python scripts/make_historical_playoffs_csv.py``. The input is the
SFMS01 export in csv/{year}.csv, fetched by scripts/legacy/read_older2020_matches.py.
League-rank priority is explicit data, never inferred from the home team. Sources
and historical format differences are documented in docs/dev/historical_playoffs.md.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import unicodedata
from pathlib import Path

import pandas as pd

from make_old_matches_csv import _write_csv_if_changed

ROOT = Path(__file__).resolve().parent.parent

# SFMS01 short competition names, normalized with NFKC. Cup playoff stages must
# not be included: they belong to JLeagueCup, not promotion/relegation playoffs.
SOURCE_COMPETITIONS = {
    'J1参入': 'J1PO',
    'J1・J2入替': 'J1PO',
    'J1昇格PO': 'J1PO',
    'J1参入PO': 'J1PO',
    'J2・JFL入替': 'J2PO',
    'J2・J3入替': 'J2PO',
    'J2昇格PO': 'J2PO',
    'J3・JFL入替': 'J3PO',
}

# Official final league positions (SFRT01, latest/final section). Full source
# links and the licensing exclusions are in historical_playoffs.md. The rank
# number is the real league position, including gaps for ineligible clubs.
LEAGUE_RANKS = {
    ('J1PO', 2012): {'京都': 3, '横浜FC': 4, '千葉': 5, '大分': 6},
    ('J1PO', 2013): {'京都': 3, '徳島': 4, '千葉': 5, '長崎': 6},
    ('J1PO', 2014): {'千葉': 3, '磐田': 4, '山形': 6},
    ('J1PO', 2015): {'福岡': 3, 'Ｃ大阪': 4, '愛媛': 5, '長崎': 6},
    ('J1PO', 2016): {'松本': 3, 'Ｃ大阪': 4, '京都': 5, '岡山': 6},
    ('J1PO', 2017): {'名古屋': 3, '福岡': 4, '東京Ｖ': 5, '千葉': 6},
    ('J1PO', 2018): {'横浜FC': 3, '大宮': 5, '東京Ｖ': 6},
    ('J1PO', 2019): {'大宮': 3, '徳島': 4, '甲府': 5, '山形': 6},
    ('J1PO', 2022): {'岡山': 3, '熊本': 4, '大分': 5, '山形': 6},
    ('J1PO', 2023): {'東京Ｖ': 3, '清水': 4, '山形': 5, '千葉': 6},
    ('J1PO', 2024): {'長崎': 3, '山形': 4, '岡山': 5, '仙台': 6},
    ('J1PO', 2025): {'千葉': 3, '徳島': 4, '磐田': 5, '大宮': 6},
    ('J2PO', 2024): {'富山': 3, '松本': 4, '福島': 5, 'FC大阪': 6},
    ('J2PO', 2025): {'FC大阪': 3, '宮崎': 4, '鹿児島': 5, '金沢': 6},
}

# The J1 club has draw priority in the deciding match, independently of the
# J2 clubs' league positions. All three incumbents finished 16th in J1.
J1_INCUMBENTS = {2018: '磐田', 2019: '湘南', 2022: '京都'}

COLUMNS = [
    'match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
    'home_team', 'home_goal', 'away_goal', 'away_team', 'status', 'round',
    'home_pk_score', 'away_pk_score', 'home_score_ex', 'away_score_ex',
    'leg', 'match_number', 'advantage_team',
]


def _normalize(text: str) -> str:
    return unicodedata.normalize('NFKC', text).strip()


def _date(raw: str, year: int) -> str:
    text = re.sub(r'\(.*\)', '', raw).strip()
    if re.fullmatch(r'\d{2}/\d{2}', text):
        return f'{year}/{text}'
    if re.fullmatch(r'\d{2}/\d{2}/\d{2}', text):
        return f'{year // 100}{text}'
    if re.fullmatch(r'\d{4}/\d{2}/\d{2}', text):
        return text
    raise ValueError(f'Unexpected historical match date: {raw!r}')


def _round_and_leg(section: str, source: str, year: int) -> tuple[str, str]:
    text = _normalize(section)
    if year == 1998 and source == 'J1参入':
        stages = {
            '第1節第1日': ('予備戦', ''),
            '第2節第1日': ('第1・第2参入クラブ決定戦', '1'),
            '第3節第1日': ('第1・第2参入クラブ決定戦', '2'),
            '第4節第1日': ('第3参入クラブ決定戦', '1'),
            '第5節第1日': ('第3参入クラブ決定戦', '2'),
        }
        if text in stages:
            return stages[text]
    elif '入替' in source:
        if text in ('第1戦', '第2戦'):
            return '入れ替え戦', text[1]
    elif text in ('準決勝', '決勝', '1回戦', '2回戦', '決定戦'):
        return text, ''
    raise ValueError(f'Unexpected playoff round: {year} {source} {section!r}')


ROUND_ORDER = {
    '予備戦': 0, '第1・第2参入クラブ決定戦': 1, '第3参入クラブ決定戦': 2,
    '1回戦': 0, '2回戦': 1, '決定戦': 2,
    '準決勝': 0, '決勝': 1, '入れ替え戦': 0,
}


def _advantage(source: str, competition: str, year: int, home: str, away: str) -> str:
    if source not in ('J1昇格PO', 'J1参入PO', 'J2昇格PO'):
        return ''
    ranks = LEAGUE_RANKS[(competition, year)]
    incumbent = J1_INCUMBENTS.get(year) if competition == 'J1PO' else None
    participants = set(ranks) | ({incumbent} if incumbent else set())
    if home not in participants or away not in participants:
        raise ValueError(f'Playoff participant missing an official rank: {year} {home} / {away}')
    if incumbent in (home, away):
        return incumbent
    return home if ranks[home] < ranks[away] else away


def convert_playoff_rows(rows: list[dict[str, str]], year: int) -> dict[str, list[dict]]:
    """Select only promotion/relegation rows and preserve official scores and IDs."""
    output: dict[str, list[dict]] = {}
    for raw in rows:
        source = _normalize(raw['大会'])
        competition = SOURCE_COMPETITIONS.get(source)
        if competition is None:
            continue
        score = re.fullmatch(r'(\d+)-(\d+)(?:\s*\(PK(\d+)-(\d+)\))?', raw['スコア'].strip())
        if not score:
            raise ValueError(f'Historical playoff without a final score: {raw!r}')
        round_name, leg = _round_and_leg(raw['節'], source, year)
        home, away = raw['ホーム'], raw['アウェイ']
        number = raw['match_card_id']
        if not number.isdigit():
            raise ValueError(f'Historical playoff without match_card_id: {raw!r}')
        result = {
            'match_date': _date(raw['試合日'], year), 'start_time': raw['K/O時刻'],
            'stadium': raw['スタジアム'], 'home_team': home, 'away_team': away,
            'home_goal': score[1], 'away_goal': score[2], 'status': '試合終了',
            'home_pk_score': score[3] or '', 'away_pk_score': score[4] or '',
            'home_score_ex': raw.get('home_score_ex', ''),
            'away_score_ex': raw.get('away_score_ex', ''),
            'round': round_name, 'leg': leg, 'match_number': number,
            'advantage_team': _advantage(source, competition, year, home, away),
        }
        for col in ('home_score_ex', 'away_score_ex'):
            result[col] = str(int(float(result[col]))) if result[col] else ''
        output.setdefault(competition, []).append(result)

    for matches in output.values():
        matches.sort(key=lambda r: (r['match_date'], r['start_time'], int(r['match_number'])))
        rounds = sorted({r['round'] for r in matches}, key=ROUND_ORDER.__getitem__)
        section = {label: i - len(rounds) for i, label in enumerate(rounds)}
        pair_indexes: dict[str, dict[tuple[str, str], int]] = {}
        for match in matches:
            match['section_no'] = section[match['round']]
            pairs = pair_indexes.setdefault(match['round'], {})
            pair = tuple(sorted((match['home_team'], match['away_team'])))
            pairs.setdefault(pair, len(pairs) + 1)
            match['match_index_in_section'] = pairs[pair]
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--years', type=int, nargs='+', help='Convert only these cached years')
    args = parser.parse_args()
    paths = [ROOT / 'csv' / f'{y}.csv' for y in args.years] if args.years else sorted((ROOT / 'csv').glob('[0-9][0-9][0-9][0-9].csv'))
    # The shared writer's config paths are relative to src, as for the other converters.
    os.chdir(ROOT / 'src')
    total = 0
    for path in paths:
        year = int(path.stem)
        if year > 2025:
            continue
        with path.open(encoding='utf-8', newline='') as handle:
            converted = convert_playoff_rows(list(csv.DictReader(handle)), year)
        for competition, matches in converted.items():
            _write_csv_if_changed(pd.DataFrame(matches)[COLUMNS],
                                  f'../docs/csv/{year}_allmatch_result-{competition}.csv')
            total += len(matches)
    print(f'Converted {total} historical playoff matches')


if __name__ == '__main__':
    main()
