"""Detect published 26-27 J Youth Cup stages and notify #352 once per stage.

The default invocation only reports local data. --notify additionally requires
JYOUTH_FETCH_SUCCEEDED=true from this run's frame50 reader; cached rows alone
must never produce an Issue notification.
"""
import argparse
import csv
from dataclasses import dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import unicodedata

import yaml


ROOT = Path(__file__).resolve().parent.parent
SEASON = '26-27'
SOURCE_SEASON = '2026/27'
SOURCE_URL = ('https://data.j-league.or.jp/SFMS01/search?competition_years=2026'
              '&competition_frame_ids=50&tv_relay_station_name=')
OFFICIAL_URL = 'https://www.jleague.jp/special/jyouth/2026-27/'
REQUIRED_COLUMNS = {'シーズン', '大会', '節', '試合日', 'ホーム', 'アウェイ'}
STAGES = [('2nd', '2ndラウンド', 'JYouthCup_2nd'),
          ('KO', 'ノックアウトラウンド', 'JYouthCup_KO')]


@dataclass(frozen=True)
class Readiness:
    stage: str
    label: str
    status: str
    reason: str
    rows: int = 0
    concrete_rows: int = 0
    dated_rows: int = 0
    unknown_dates: int = 0
    unknown_times: int = 0
    unknown_teams: int = 0
    groups: tuple[str, ...] = ()
    example: str = ''

    @property
    def marker(self) -> str:
        return f'<!-- jyouth-readiness:{SEASON}:{self.stage} -->'


def normalize(value: str | None) -> str:
    return unicodedata.normalize('NFKC', value or '').strip()


def match_date(value: str) -> str | None:
    text = re.sub(r'\([^)]*\)', '', normalize(value)).strip()
    for pattern in ('%y/%m/%d', '%Y/%m/%d'):
        try:
            return datetime.strptime(text, pattern).strftime('%Y/%m/%d')
        except ValueError:
            pass
    return None


def concrete_team(value: str) -> bool:
    name = normalize(value)
    if name.casefold() in {'', 'tbd', 'tbc', 'tba', 'unknown', '-', '―', '—', '?'}:
        return False
    return not re.search(r'未定|未確定|勝者|敗者|グループ|\d+位|^\[\d+\][wl]$', name, re.IGNORECASE)


def concrete_match(row: dict[str, str]) -> bool:
    home, away = normalize(row['ホーム']), normalize(row['アウェイ'])
    return home != away and concrete_team(home) and concrete_team(away)


def known_time(value: str) -> bool:
    try:
        datetime.strptime(normalize(value), '%H:%M')
        return True
    except ValueError:
        return False


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f'{path}: missing columns: {sorted(missing)}')
        return list(reader)


def evaluate(rows: list[dict[str, str]], season_map: dict) -> list[Readiness]:
    rows = [row for row in rows if normalize(row['シーズン']) == SOURCE_SEASON]
    competitions = season_map.get('jyouth', {}).get('competitions', {})
    results = []
    for stage, label, competition in STAGES:
        if SEASON in competitions.get(competition, {}).get('seasons', {}):
            results.append(Readiness(stage, label, 'configured', 'season_mapに登録済み'))
            continue
        if stage == '2nd':
            selected = [row for row in rows if re.search(r'2ndラウンド.+$', normalize(row['大会']))]
        else:
            selected = [row for row in rows if 'ノックアウトラウンド' in normalize(row['大会'])]
        if not selected:
            results.append(Readiness(stage, label, 'waiting', '次段階の対戦データは未公表'))
            continue
        # The open draw has sixteen entrants. Later-round TBD rows do not prove
        # that the draw is known, and are not counted as opening-round fixtures.
        candidates = selected if stage == '2nd' else [
            row for row in selected if normalize(row['節']) == 'ラウンド16']
        concrete = [row for row in candidates if concrete_match(row)]
        dated = [row for row in concrete if match_date(row['試合日'])]
        groups = tuple(sorted({re.search(r'2ndラウンド(.+)$', normalize(row['大会']))[1].strip()
                               for row in candidates})) if stage == '2nd' else ()
        status, reason = 'partial', '実チーム同士の開催日付きカードを待機'
        if stage == '2nd' and dated:
            status, reason = 'ready', '実チーム同士の開催日付きカードを確認（部分公表を許容）'
        elif stage == 'KO':
            teams = [normalize(row[key]) for row in concrete for key in ('ホーム', 'アウェイ')]
            if len(candidates) == 8 and len(concrete) == 8 and len(set(teams)) == 16 and dated:
                status, reason = 'ready', 'ラウンド16全8カード・16チームと少なくとも1件の開催日を確認'
            else:
                reason = 'ラウンド16の実チーム16件・全8カードと少なくとも1件の開催日を待機'
        example = ''
        if dated:
            row = dated[0]
            example = f'{match_date(row["試合日"])} {row["ホーム"]} vs {row["アウェイ"]}'
        results.append(Readiness(
            stage, label, status, reason, len(candidates), len(concrete), len(dated),
            sum(match_date(row['試合日']) is None for row in candidates),
            sum(not known_time(row.get('K/O時刻', '')) for row in candidates),
            len(candidates) - len(concrete), groups, example,
        ))
    return results


def comment_body(result: Readiness, run_url: str = '') -> str:
    lines = [result.marker, f'## {SEASON} Jユースカップ {result.label}: 実装の着手材料を確認', '',
             '既存の日次取得で次段階の対戦データを確認しました。#352 の表示追加に着手できます。',
             '日程の部分公表を含み、全データ・全日時の確定を示す通知ではありません。', '',
             f'- 判定: {result.reason}',
             f'- 判定対象カード: {result.rows}件（実チーム同士 {result.concrete_rows}件、'
             f'実チーム同士で開催日あり {result.dated_rows}件）',
             f'- 開催日未定: {result.unknown_dates}件／キックオフ時刻未定: {result.unknown_times}件／'
             f'対戦枠未確定: {result.unknown_teams}件',
             f'- 公表例: {result.example}',
             f'- 取得元: [Jリーグデータサイト・2026/27 frame50]({SOURCE_URL})',
             f'- [大会公式ページ]({OFFICIAL_URL})']
    if run_url:
        lines.append(f'- [検出した日次更新]({run_url})')
    if result.stage == '2nd':
        lines.extend([f'- 確認できたグループ表記: {", ".join(result.groups)}', '',
                      '次の作業: データサイトのグループ表記を確認して `shown_groups` を決め、'
                      '`JYouthCup_2nd` の26-27を追加してください。26-27は各チーム3試合の1回戦総当たり、'
                      '上位リーグA〜Hの上位2チームがKO進出する方式です。'])
    else:
        lines.extend(['', '次の作業: 公式のオープンドロー図でブラケット順と接続を確認し、'
                      '`JYouthCup_KO` の26-27を追加してください。CSVの掲載順だけから接続は決めず、'
                      '3位決定戦も確認してください。上の件数はラウンド16が対象です。'])
    lines.extend(['', 'この段階の通知は一度だけです。表示実装と大会後のreader撤去は引き続き #352 で管理します。'])
    return '\n'.join(lines)


def github_api(endpoint: str, *, method: str = 'GET', data: dict | None = None,
               paginate: bool = False):
    command = ['gh', 'api', '--method', method, endpoint]
    if paginate:
        command.extend(['--paginate', '--slurp'])
    if data is not None:
        command.extend(['--input', '-'])
    response = subprocess.run(command, input=json.dumps(data) if data is not None else None,
                              text=True, capture_output=True, check=True)
    result = json.loads(response.stdout)
    return [comment for page in result for comment in page] if paginate else result


def notify(results: list[Readiness], repository: str, issue: int, run_url: str = '',
           api=None) -> int:
    ready = [result for result in results if result.status == 'ready']
    if not ready:
        return 0
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', repository) or issue <= 0:
        raise ValueError('A valid owner/repository and positive issue number are required')
    api = api or github_api
    endpoint = f'repos/{repository}/issues/{issue}'
    if api(endpoint)['state'] != 'open':
        print(f'Issue #{issue} is closed; no notification')
        return 0
    comments = api(f'{endpoint}/comments?per_page=100', paginate=True)
    sent = 0
    for result in ready:
        if any(result.marker in (comment.get('body') or '') for comment in comments):
            print(f'{result.stage}: already notified')
            continue
        body = comment_body(result, run_url)
        api(f'{endpoint}/comments', method='POST', data={'body': body})
        comments.append({'body': body})
        sent += 1
        print(f'{result.stage}: notified Issue #{issue}')
    return sent


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path, default=ROOT / 'csv/26_27_frame50.csv')
    parser.add_argument('--season-map', type=Path, default=ROOT / 'docs/yaml/season_map.yaml')
    parser.add_argument('--notify', action='store_true', help='Post one Issue comment per ready stage')
    parser.add_argument('--repository', default=os.environ.get('GITHUB_REPOSITORY', ''))
    parser.add_argument('--issue', type=int, default=352)
    parser.add_argument('--run-url', default='')
    args = parser.parse_args()
    if args.notify and os.environ.get('JYOUTH_FETCH_SUCCEEDED') != 'true':
        print('No fresh frame50 fetch in this run; no notification')
        return 0
    try:
        results = evaluate(read_rows(args.csv), yaml.safe_load(args.season_map.read_text(encoding='utf-8')))
        report = ['### Jユース26-27 次段階の監視', '', '| 段階 | 状態 | 根拠 |', '| --- | --- | --- |']
        for result in results:
            report.append(f'| {result.label} | {result.status} | {result.reason} |')
        summary = '\n'.join(report) + '\n'
        print(summary)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a', encoding='utf-8') as stream:
                stream.write(summary)
        if args.notify:
            notify(results, args.repository, args.issue, args.run_url)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Readiness monitoring failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
