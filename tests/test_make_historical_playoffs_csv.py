import csv
from pathlib import Path

import pytest

from make_historical_playoffs_csv import (
    SOURCE_COMPETITIONS,
    _normalize,
    convert_playoff_rows,
)

ROOT = Path(__file__).resolve().parent.parent


def load_year(year):
    with (ROOT / 'csv' / f'{year}.csv').open(newline='', encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def test_all_cached_promotion_relegation_matches_are_preserved_exactly():
    source_ids = set()
    output_ids = set()
    season_count = 0
    for path in sorted((ROOT / 'csv').glob('[0-9][0-9][0-9][0-9].csv')):
        year = int(path.stem)
        if year > 2025:
            continue
        raw = load_year(year)
        source = {
            r['match_card_id']: r for r in raw
            if _normalize(r['大会']) in SOURCE_COMPETITIONS
        }
        source_ids.update(source)
        converted = convert_playoff_rows(raw, year)
        for competition, rows in converted.items():
            season_count += 1
            filename = ROOT / 'docs' / 'csv' / f'{year}_allmatch_result-{competition}.csv'
            with filename.open(newline='', encoding='utf-8') as handle:
                stored = list(csv.DictReader(handle))
            assert len(stored) == len(rows)
            for row, published in zip(rows, stored):
                number = row['match_number']
                assert number not in output_ids
                output_ids.add(number)
                original = source[number]
                assert row['home_team'] == original['ホーム']
                assert row['away_team'] == original['アウェイ']
                assert f"{row['home_goal']}-{row['away_goal']}" == original['スコア']
                assert row['section_no'] < 0
                assert row['match_index_in_section'] >= 1
                assert row['status'] == '試合終了'
                assert {k: str(v) for k, v in row.items()} == {
                    k: published[k] for k in row
                }
    assert season_count == 26
    assert len(source_ids) == 72
    assert output_ids == source_ids


def test_1998_separates_the_loser_playoff_and_preserves_golden_goal_score():
    rows = convert_playoff_rows(load_year(1998), 1998)['J1PO']
    preliminary = rows[0]
    assert preliminary['round'] == '予備戦'
    assert preliminary['home_goal'] == '3'
    assert preliminary['away_goal'] == '2'
    assert preliminary['home_score_ex'] == '1'
    assert preliminary['away_score_ex'] == '0'
    assert preliminary['advantage_team'] == ''
    assert [r['leg'] for r in rows[-2:]] == ['1', '2']
    assert all(r['round'] == '第3参入クラブ決定戦' for r in rows[-2:])
    # Both legs in each two-legged tie share their round-local match index.
    assert rows[1]['match_index_in_section'] == rows[4]['match_index_in_section']
    assert rows[2]['match_index_in_section'] == rows[3]['match_index_in_section']


def test_advantage_comes_from_official_rank_even_when_home_and_away_are_reversed():
    source = next(r for r in load_year(2013) if r['match_card_id'] == '15621')
    source['ホーム'], source['アウェイ'] = source['アウェイ'], source['ホーム']
    row = convert_playoff_rows([source], 2013)['J1PO'][0]
    assert row['home_team'] == '長崎'
    assert row['away_team'] == '京都'
    assert row['advantage_team'] == '京都'


def test_j1_deciding_match_prioritizes_the_j1_club_independently_of_j2_rank():
    rows = convert_playoff_rows(load_year(2019), 2019)['J1PO']
    final = next(r for r in rows if r['round'] == '決定戦')
    assert final['advantage_team'] == '湘南'
    assert final['home_goal'] == final['away_goal'] == '1'


def test_unknown_playoff_participant_or_round_fails_loudly():
    source = next(r for r in load_year(2013) if r['match_card_id'] == '15621')
    with pytest.raises(ValueError, match='official rank'):
        convert_playoff_rows([{**source, 'ホーム': 'unknown'}], 2013)
    with pytest.raises(ValueError, match='round'):
        convert_playoff_rows([{**source, '節': 'unknown'}], 2013)


def test_pk_and_extra_time_fields_are_preserved_without_inventing_a_winner():
    source = next(r for r in load_year(2013) if r['match_card_id'] == '15621')
    row = convert_playoff_rows([{**source, 'スコア': '1-1 (PK3-4)',
                                'home_score_ex': '0', 'away_score_ex': '0'}], 2013)['J1PO'][0]
    assert row['home_goal'] == row['away_goal'] == '1'
    assert row['home_pk_score'] == '3'
    assert row['away_pk_score'] == '4'
    assert row['home_score_ex'] == row['away_score_ex'] == '0'
