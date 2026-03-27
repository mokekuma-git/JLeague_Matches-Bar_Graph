from pathlib import Path

import pandas as pd
import pytest
import yaml


FIXTURE_PATH = Path(__file__).parent / 'test_data' / 'emperorscup_bracket_inference_expected.yaml'
CSV_DIR = Path(__file__).resolve().parent.parent / 'docs' / 'csv'


def _load_fixture() -> dict:
    return yaml.safe_load(FIXTURE_PATH.read_text(encoding='utf-8'))


def _infer_bracket_order(rows: list[dict]) -> list[str | None] | None:
    numbered_rows: list[tuple[int, int, dict]] = []
    for row in rows:
        match_number = row.get('match_number')
        section_no = row.get('section_no')
        if pd.isna(match_number) or pd.isna(section_no):
            continue

        try:
            match_number = int(match_number)
            section_no = int(section_no)
        except (TypeError, ValueError):
            continue

        if section_no >= 0:
            continue
        numbered_rows.append((match_number, abs(section_no), row))

    numbered_rows.sort(key=lambda item: item[0])
    if not numbered_rows:
        return None

    max_depth = max(depth for _, depth, _ in numbered_rows)
    rows_by_match_number = {
        match_number: row for match_number, _, row in numbered_rows
    }
    match_history: dict[str, list[int]] = {}
    for match_number, _, row in numbered_rows:
        for team_key in ('home_team', 'away_team'):
            team = row[team_key]
            match_history.setdefault(team, []).append(match_number)

    final_match_number = numbered_rows[-1][0]

    def build_seed_subtree(team: str, side_size: int) -> list[str | None]:
        return [team, *([None] * max(0, side_size - 1))]

    def expand_team(team: str, current_match_number: int, side_size: int) -> list[str | None]:
        history = match_history.get(team, [])
        feeder_match_number = next(
            (match_number for match_number in reversed(history) if match_number < current_match_number),
            None,
        )
        if feeder_match_number is None:
            return build_seed_subtree(team, side_size)

        feeder_row = rows_by_match_number.get(feeder_match_number)
        if feeder_row is None:
            return build_seed_subtree(team, side_size)
        return expand_match(feeder_row, feeder_match_number)

    def expand_match(row: dict, match_number: int) -> list[str | None]:
        bracket_depth = abs(int(row['section_no']))
        side_size = 2 ** (max_depth - bracket_depth)
        return [
            *expand_team(row['home_team'], match_number, side_size),
            *expand_team(row['away_team'], match_number, side_size),
        ]

    return expand_match(rows_by_match_number[final_match_number], final_match_number)


def _extract_teams(bracket_order: list[str | None]) -> list[str]:
    return [team for team in bracket_order if team is not None]


@pytest.mark.parametrize(
    'season,expected',
    _load_fixture()['EmperorsCup'].items(),
)
def test_emperorscup_bracket_inference_fixture(season: str, expected: dict):
    df = pd.read_csv(CSV_DIR / f'{season}_allmatch_result-EmperorsCup.csv')
    inferred_bracket_order = _infer_bracket_order(df.to_dict(orient='records'))

    assert inferred_bracket_order == expected['bracket_order']
    assert _extract_teams(inferred_bracket_order) == expected['teams']
    assert len(expected['teams']) == expected['team_count']
    assert next(round_name for round_name in df['round'].dropna() if str(round_name).strip()) == expected['bracket_round_start']
