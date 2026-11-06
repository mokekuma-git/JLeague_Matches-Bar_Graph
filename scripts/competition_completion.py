"""Check whether a season-specific daily reader can stop fetching.

Exit status: 0 = completed, 1 = active or uncertain CSV, 2 = configuration or
program error. Dates alone never prove completion. Naive --now values use JST.
"""
from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
import sys
import unicodedata
from zoneinfo import ZoneInfo

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = REPO_ROOT / 'config' / 'competition_completion.yaml'
JST = ZoneInfo('Asia/Tokyo')
REQUIRED_COLUMNS = {
    'match_date', 'start_time', 'home_team', 'away_team',
    'home_goal', 'away_goal', 'status', 'round',
}


class ConfigurationError(ValueError):
    """An invalid completion policy must not silently retire a reader."""


@dataclass(frozen=True)
class CompletionPolicy:
    csv_path: Path
    expected_matches: int
    final_rounds: tuple[str, ...]


@dataclass(frozen=True)
class CompletionResult:
    completed: bool
    reason: str


def _text(value: object) -> str:
    return unicodedata.normalize('NFKC', '' if value is None else str(value)).strip()


def load_policy(competition: str, config_path: Path | str = DEFAULT_CONFIG) -> CompletionPolicy:
    """Load a policy; CSV paths are relative to the repository, not the config."""
    try:
        config = yaml.safe_load(Path(config_path).read_text(encoding='utf-8'))
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        raise ConfigurationError(f'cannot read config: {error}') from error
    if not isinstance(config, dict) or not isinstance(config.get('competitions'), dict):
        raise ConfigurationError('config must contain a competitions mapping')
    raw = config['competitions'].get(competition)
    if not isinstance(raw, dict):
        raise ConfigurationError(f'no completion policy for {competition}')
    required = {'csv_path', 'expected_matches', 'final_rounds'}
    if set(raw) != required:
        raise ConfigurationError(f'{competition}: policy keys must be {sorted(required)}')
    if not isinstance(raw['csv_path'], str) or not raw['csv_path'].strip():
        raise ConfigurationError(f'{competition}: csv_path must be a nonempty string')
    count = raw['expected_matches']
    if type(count) is not int or count <= 0:
        raise ConfigurationError(f'{competition}: expected_matches must be a positive integer')
    rounds = raw['final_rounds']
    if (not isinstance(rounds, list) or not rounds
            or any(not isinstance(label, str) or not _text(label) for label in rounds)):
        raise ConfigurationError(f'{competition}: final_rounds must be a nonempty list of labels')
    normalized = tuple(_text(label) for label in rounds)
    if len(set(normalized)) != len(normalized):
        raise ConfigurationError(f'{competition}: final_rounds must be unique')
    path = Path(raw['csv_path'])
    return CompletionPolicy((REPO_ROOT / path).resolve(), count, normalized)


def _resolved_team(team: str) -> bool:
    if team.casefold() in {'', '-', '--', '?', '未定', '未確定', '不明', 'tbd', 'tba', '●未定●'}:
        return False
    if re.fullmatch(r'\[\d+\][wl]', team, flags=re.IGNORECASE):
        return False
    return not (re.search(r'(?:勝者|敗者)$', team)
                or re.fullmatch(r'グループ.*\d+位', team))


def _score(value: str) -> int | None:
    return int(value) if re.fullmatch(r'[0-9]+', value) else None


def evaluate_rows(rows: list[dict[str, str]], policy: CompletionPolicy,
                  now: datetime | None = None) -> CompletionResult:
    """Conservatively check coverage and actual completion of every fixture."""
    if len(rows) != policy.expected_matches:
        return CompletionResult(False, f'coverage {len(rows)}/{policy.expected_matches} matches')
    clock = now or datetime.now(JST)
    clock = clock.replace(tzinfo=JST) if clock.tzinfo is None else clock.astimezone(JST)
    ids: set[str] = set()
    fixtures: set[tuple[str, str, str, str]] = set()
    leg_pairs: dict[tuple[str, str, str], dict[str, tuple[str, str]]] = {}
    finals = 0
    for index, raw in enumerate(rows, start=1):
        if not REQUIRED_COLUMNS.issubset(raw):
            return CompletionResult(False, f'row {index}: required columns missing')
        row = {key: _text(value) for key, value in raw.items()}
        number = row.get('match_number', '')
        if number:
            if number in ids:
                return CompletionResult(False, f'duplicate match_number {number}')
            ids.add(number)
        home, away = row['home_team'], row['away_team']
        if not _resolved_team(home) or not _resolved_team(away) or home == away:
            return CompletionResult(False, f'row {index}: unresolved opponents')
        round_name, leg = row['round'], row.get('leg', '')
        if not round_name or leg not in ('', '1', '2'):
            return CompletionResult(False, f'row {index}: unknown round or leg')
        fixture = (round_name, leg, *sorted((home, away)))
        if fixture in fixtures:
            return CompletionResult(False, f'row {index}: duplicate logical fixture')
        fixtures.add(fixture)
        if leg:
            pair = (round_name, *sorted((home, away)))
            leg_pairs.setdefault(pair, {})[leg] = (home, away)
        if round_name in policy.final_rounds:
            finals += 1
        if row['status'] != '試合終了':
            return CompletionResult(False, f'row {index}: status {row["status"] or "unknown"}')
        home_goal, away_goal = _score(row['home_goal']), _score(row['away_goal'])
        if home_goal is None or away_goal is None:
            return CompletionResult(False, f'row {index}: final scores missing or invalid')
        home_pk, away_pk = row.get('home_pk_score', ''), row.get('away_pk_score', '')
        if home_pk or away_pk:
            hp, ap = _score(home_pk), _score(away_pk)
            if hp is None or ap is None or hp == ap:
                return CompletionResult(False, f'row {index}: PK scores missing or invalid')
        elif home_goal == away_goal and not leg:
            return CompletionResult(False, f'row {index}: single-match draw has no PK decision')
        try:
            kickoff = datetime.strptime(
                f'{row["match_date"]} {row["start_time"]}', '%Y/%m/%d %H:%M',
            ).replace(tzinfo=JST)
        except ValueError:
            return CompletionResult(False, f'row {index}: date/time unknown or invalid')
        if kickoff > clock:
            return CompletionResult(False, f'row {index}: fixture is still in the future')
    if not finals:
        return CompletionResult(False, f'final round missing: {", ".join(policy.final_rounds)}')
    # A stray leg marker must not exempt an undecided single match from its PK
    # requirement. Both legs belong to one round/tie and reverse home/away.
    for (round_name, home, away), legs in leg_pairs.items():
        if set(legs) != {'1', '2'}:
            return CompletionResult(False, f'incomplete H&A pair: {round_name} {home} / {away}')
        if legs['1'] != tuple(reversed(legs['2'])):
            return CompletionResult(False, f'H&A home/away not reversed: {round_name} {home} / {away}')
    return CompletionResult(True, f'all {len(rows)} matches finished, including the final')


def check_completion(competition: str, config_path: Path | str = DEFAULT_CONFIG,
                     now: datetime | None = None) -> CompletionResult:
    """Read a configured CSV; missing/malformed data remains eligible for repair."""
    policy = load_policy(competition, config_path)
    try:
        with policy.csv_path.open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle, strict=True)
            fields = reader.fieldnames
            if (not fields or not REQUIRED_COLUMNS.issubset(fields)
                    or len(fields) != len(set(fields))):
                return CompletionResult(False, 'CSV header missing or invalid')
            rows = list(reader)
            if any(None in row for row in rows):
                return CompletionResult(False, 'CSV row has unexpected extra fields')
    except (OSError, UnicodeError, csv.Error) as error:
        return CompletionResult(False, f'CSV unavailable or malformed: {error}')
    return evaluate_rows(rows, policy, now)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('competition')
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--now', help='ISO datetime; naive values are interpreted in JST')
    args = parser.parse_args(argv)
    try:
        now = datetime.fromisoformat(args.now) if args.now else None
        result = check_completion(args.competition, args.config, now)
    except Exception as error:
        print(f'{args.competition}: error: {error}', file=sys.stderr)
        return 2
    print(f'{args.competition}: {"completed" if result.completed else "active"}: {result.reason}')
    return 0 if result.completed else 1


if __name__ == '__main__':
    sys.exit(main())
