from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pandas as pd
import pytest

from legacy import read_older2020_matches as reader


@pytest.mark.parametrize('year,frame,filename', [
    (1026, 50, '2026_frame50.csv'),
    (2026, 50, '26_27_frame50.csv'),
    (2025, 50, '2025_frame50.csv'),
    (2026, 11, '2026_frame11.csv'),
    (2020, None, '2020.csv'),
])
def test_fetch_keeps_source_code_in_query_and_season_in_filename(
        year, frame, filename, tmp_path, monkeypatch):
    for key in ('csv_path_format', 'csv_path_format_with_frame'):
        template = Path(getattr(reader.config.match_data, key)).name
        monkeypatch.setattr(reader.config.match_data, key, str(tmp_path / template))

    def request(method, url, **kwargs):
        query = parse_qs(urlparse(url).query)
        assert query['competition_years'] == [str(year)]
        assert query.get('competition_frame_ids') == ([str(frame)] if frame else None)
        return SimpleNamespace(text='''
            <table><tr><th>シーズン</th><th>スコア</th></tr>
            <tr><td>2026/27</td><td class="al-c">
            <a href="/SFMS02/?match_card_id=35203">2-4</a></td></tr></table>
        ''')

    monkeypatch.setattr(reader.requests, 'request', request)
    # Fetching the new 26-27 season must never replace the completed 2026 edition.
    protected = tmp_path / '2026_frame50.csv'
    if year == 2026 and frame == 50:
        protected.write_text('completed 2026 edition\n')

    reader.store_year_data(year, frame=frame)

    result = pd.read_csv(tmp_path / filename, index_col=0)
    assert result['match_card_id'].tolist() == [35203]
    assert result['スコア'].tolist() == ['2-4']
    if year == 2026 and frame == 50:
        assert protected.read_text() == 'completed 2026 edition\n'
