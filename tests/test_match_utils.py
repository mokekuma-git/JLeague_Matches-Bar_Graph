import pandas as pd
from types import SimpleNamespace

from match_utils import mu


def test_read_allmatches_csv_allows_missing_section_columns(tmp_path, monkeypatch):
    csv_path = tmp_path / 'matches.csv'
    df = pd.DataFrame([
        {
            'match_date': '2025-03-15',
            'start_time': '15:00',
            'stadium': 'Test Stadium',
            'home_team': 'A',
            'home_goal': '2',
            'away_goal': '1',
            'away_team': 'B',
            'status': '試合終了',
            'round': '決勝',
        }
    ])
    df.to_csv(csv_path)
    monkeypatch.setattr(mu, 'config', SimpleNamespace(standard_date_format='%Y/%m/%d'))

    loaded = mu.read_allmatches_csv(str(csv_path))

    assert 'section_no' not in loaded.columns
    assert 'match_index_in_section' not in loaded.columns
    assert loaded.iloc[0]['match_date'] == '2025/03/15'


def test_matches_differ_handles_missing_match_index_and_section_columns():
    foo = pd.DataFrame([
        {
            'match_date': '2025/03/15',
            'home_team': 'A',
            'away_team': 'B',
            'round': '決勝',
        }
    ])
    bar = pd.DataFrame([
        {
            'away_team': 'B',
            'home_team': 'A',
            'match_date': '2025/03/15',
            'round': '決勝',
        }
    ])

    assert mu.matches_differ(foo, bar) is False
