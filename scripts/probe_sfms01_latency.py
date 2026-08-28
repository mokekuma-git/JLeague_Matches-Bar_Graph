"""Measure how quickly data.j-league.or.jp (SFMS01) publishes match results.

Polls the Data Site during a match window and appends one JSONL record every
time a match's score, kick-off time or attendance changes.  The resulting log
answers two questions:

  * Does SFMS01 show live in-match scores, or only the final result?
  * How long after full time does the result appear?

Usage:
    python probe_sfms01.py --from 17:50 --until 23:30 --interval 60 J1 J2 J3
    python probe_sfms01.py --from 17:50 --until 22:30 --out j3_0830.jsonl J3
"""
import argparse
import json
import random
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

JST = ZoneInfo('Asia/Tokyo')
URL = ('https://data.j-league.or.jp/SFMS01/search'
       '?competition_years={year}&competition_frame_ids={frame}')
FRAME_IDS = {'J1': 1, 'J2': 2, 'J3': 3}
COLUMNS = ['season', 'competition', 'section', 'match_date', 'start_time',
           'home_team', 'score', 'away_team', 'stadium', 'attendance', 'broadcast']
HEADERS = {'User-Agent': 'Mozilla/5.0 (latency probe; personal research)'}


def fetch(competition: str, year: int) -> dict[str, dict]:
    """Return {match_key: {watched fields}} for one competition."""
    url = URL.format(year=year, frame=FRAME_IDS[competition])
    html = requests.get(url, timeout=60, headers=HEADERS).text
    table = BeautifulSoup(html, 'lxml').find('table', class_='search-table')
    if table is None:
        raise RuntimeError(f'no result table for {competition}')

    out = {}
    for tr in table.find_all('tr'):
        cells = [td.get_text(strip=True) for td in tr.find_all('td')]
        if not cells:
            continue
        row = dict(zip(COLUMNS, (cells + [''] * len(COLUMNS))[:len(COLUMNS)]))
        key = f"{competition}|{row['match_date']}|{row['home_team']}|{row['away_team']}"
        out[key] = {'score': row['score'], 'start_time': row['start_time'],
                    'attendance': row['attendance'], 'section': row['section']}
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('competitions', nargs='+', choices=list(FRAME_IDS))
    ap.add_argument('--from', dest='start', default=None,
                    help='wait until this HH:MM JST before polling (default: start now)')
    ap.add_argument('--until', required=True, help='stop time today, HH:MM JST')
    ap.add_argument('--interval', type=int, default=90, help='seconds between polls')
    ap.add_argument('--year', type=int, default=2026, help='competition_years value')
    ap.add_argument('--date', default=None,
                    help='only watch matches on this 日付 (YY/MM/DD); default = today')
    ap.add_argument('--out', default='sfms01_latency.jsonl')
    args = ap.parse_args()

    now = datetime.now(JST)

    def at_time(hhmm: str, after: datetime) -> datetime:
        hh, mm = (int(x) for x in hhmm.split(':'))
        when = after.replace(hour=hh, minute=mm, second=0, microsecond=0)
        return when + timedelta(days=1) if when <= after else when

    begin = at_time(args.start, now) if args.start else now
    deadline = at_time(args.until, begin)

    watch_date = args.date or now.strftime('%y/%m/%d')
    out_path = Path(args.out)
    print(f'watching {args.competitions} for matches on {watch_date}')
    print(f'from {begin:%Y-%m-%d %H:%M} until {deadline:%Y-%m-%d %H:%M} JST, '
          f'every {args.interval}s -> {out_path}', flush=True)

    if begin > now:
        wait = (begin - now).total_seconds()
        print(f'sleeping {wait / 3600:.1f}h until {begin:%Y-%m-%d %H:%M} JST', flush=True)
        time.sleep(wait)

    state: dict[str, dict] = {}
    polls = 0
    while datetime.now(JST) < deadline:
        stamp = datetime.now(JST).isoformat(timespec='seconds')
        for comp in args.competitions:
            try:
                current = fetch(comp, args.year)
            except Exception as exc:                      # keep probing on transient errors
                print(f'{stamp} {comp}: fetch failed: {exc}')
                continue
            for key, fields in current.items():
                if watch_date not in key:
                    continue
                if state.get(key) == fields:
                    continue
                record = {'observed_at': stamp, 'match': key,
                          'first_seen': key not in state, **fields}
                with out_path.open('a', encoding='utf-8') as fh:
                    fh.write(json.dumps(record, ensure_ascii=False) + '\n')
                if key in state:
                    print(f'{stamp} CHANGE {key}: '
                          f'{state[key]["score"]!r} -> {fields["score"]!r} '
                          f'(ko={fields["start_time"]}, att={fields["attendance"]!r})')
                state[key] = fields
        polls += 1
        if polls % 10 == 0:
            print(f'{stamp} ... {polls} polls, {len(state)} matches tracked')
        time.sleep(args.interval + random.uniform(0, 5))

    print(f'done: {polls} polls, log at {out_path.resolve()}')


if __name__ == '__main__':
    main()
