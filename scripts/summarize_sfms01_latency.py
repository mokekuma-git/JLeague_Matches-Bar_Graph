"""Summarise a probe log: is SFMS01 live during matches, or only final results?"""
import argparse
import json
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

JST = ZoneInfo('Asia/Tokyo')


def parse_ko(day: str, hhmm: str) -> datetime | None:
    """Combine the log's 日付 (YY/MM/DD) and K/O時刻 into a JST datetime."""
    try:
        return datetime.strptime(f'20{day} {hhmm}', '%y/%m/%d %H:%M').replace(tzinfo=JST)
    except ValueError:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('logfile')
    ap.add_argument('--full-time-minutes', type=int, default=105,
                    help='assumed minutes from kick-off to full time')
    args = ap.parse_args()

    events = defaultdict(list)
    with open(args.logfile, encoding='utf-8') as fh:
        for line in fh:
            rec = json.loads(line)
            events[rec['match']].append(rec)

    live_evidence = 0
    latencies = []
    print(f'{"match":<46} {"KO":>5} {"first score":>12} {"final":>8} {"vs FT":>8}  path')
    print('-' * 110)
    for match, recs in sorted(events.items()):
        recs.sort(key=lambda r: r['observed_at'])
        scored = [r for r in recs if r['score'] and not r['score'].lower().startswith('vs')]
        if not scored:
            continue
        _, day, home, away = match.split('|')
        ko = parse_ko(day, recs[-1]['start_time'])
        first, final = scored[0], scored[-1]
        first_at = datetime.fromisoformat(first['observed_at'])

        # Distinct score values seen -> more than one means in-match updates.
        path = []
        for r in scored:
            if not path or path[-1] != r['score']:
                path.append(r['score'])
        if len(path) > 1:
            live_evidence += 1

        if ko:
            ft = ko + timedelta(minutes=args.full_time_minutes)
            delta = (first_at - ft).total_seconds() / 60
            delta_s = f'{delta:+.0f}m'
            latencies.append(delta)
        else:
            delta_s = 'n/a'
        label = f'{home} vs {away}'
        print(f'{label:<46} {recs[-1]["start_time"]:>5} {first["observed_at"][11:16]:>12} '
              f'{final["score"]:>8} {delta_s:>8}  {" -> ".join(path[:6])}')

    print()
    print(f'matches with a score: {len(latencies)}')
    if latencies:
        latencies.sort()
        print(f'first score vs assumed full time ({args.full_time_minutes}min): '
              f'min {latencies[0]:+.0f}m / median {latencies[len(latencies)//2]:+.0f}m / '
              f'max {latencies[-1]:+.0f}m')
    print(f'matches showing more than one score value (live in-match updates): {live_evidence}')
    print()
    if live_evidence:
        print('=> SFMS01 updates DURING matches: near real-time. SPA scraping unnecessary.')
    else:
        print('=> Only final results observed: SFMS01 is a post-match feed.')
        print('   Check the "vs FT" column for how long after full time results land.')


if __name__ == '__main__':
    main()
