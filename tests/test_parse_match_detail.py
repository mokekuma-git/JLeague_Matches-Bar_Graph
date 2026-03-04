"""Tests for parse_match_detail module."""
from pathlib import Path

import pytest

from parse_match_detail import parse_match_detail

TEST_DATA = Path(__file__).parent / 'test_data'


def _load(name: str) -> str:
    return (TEST_DATA / name).read_text(encoding='utf-8')


class TestExtraTimeVgoalSecondHalf:
    """V-goal scored in extra-time 2nd half: G大阪 1-2 広島."""

    @pytest.fixture(autouse=True)
    def result(self):
        self.m = parse_match_detail(_load('match_detail_extra_time_vgoal_h2.html'))

    def test_teams(self):
        assert self.m.home_team == 'ガンバ大阪'
        assert self.m.away_team == 'サンフレッチェ広島'

    def test_total_score(self):
        assert self.m.home_goal == 1
        assert self.m.away_goal == 2

    def test_half_scores(self):
        assert len(self.m.half_scores) == 4
        assert self.m.half_scores[0].period == '前半'
        assert (self.m.half_scores[0].home, self.m.half_scores[0].away) == (1, 0)
        assert self.m.half_scores[2].period == '延長前半'
        assert self.m.half_scores[3].period == '延長後半'

    def test_extra_time_score(self):
        assert self.m.has_extra_time is True
        # 延長前半 0-0 + 延長後半 0-1 = 0-1
        assert self.m.home_score_ex == 0
        assert self.m.away_score_ex == 1

    def test_no_pk(self):
        assert self.m.home_pk is None
        assert self.m.away_pk is None


class TestExtraTimeVgoalFirstHalf:
    """V-goal scored in extra-time 1st half: 鹿島 3-2 G大阪."""

    @pytest.fixture(autouse=True)
    def result(self):
        self.m = parse_match_detail(_load('match_detail_extra_time_vgoal_h1.html'))

    def test_teams(self):
        assert self.m.home_team == '鹿島アントラーズ'
        assert self.m.away_team == 'ガンバ大阪'

    def test_total_score(self):
        assert self.m.home_goal == 3
        assert self.m.away_goal == 2

    def test_half_scores(self):
        # Only 3 halves: 前半, 後半, 延長前半 (no 延長後半 — V-goal)
        assert len(self.m.half_scores) == 3
        assert self.m.half_scores[2].period == '延長前半'
        assert (self.m.half_scores[2].home, self.m.half_scores[2].away) == (1, 0)

    def test_extra_time_score(self):
        assert self.m.has_extra_time is True
        # 延長前半 1-0 only
        assert self.m.home_score_ex == 1
        assert self.m.away_score_ex == 0

    def test_no_pk(self):
        assert self.m.home_pk is None
        assert self.m.away_pk is None


class TestPkShootout:
    """PK shootout after extra time: 広島 3-3 G大阪, PK 5-4."""

    @pytest.fixture(autouse=True)
    def result(self):
        self.m = parse_match_detail(_load('match_detail_pk.html'))

    def test_teams(self):
        assert self.m.home_team == 'サンフレッチェ広島'
        assert self.m.away_team == 'ガンバ大阪'

    def test_total_score(self):
        assert self.m.home_goal == 3
        assert self.m.away_goal == 3

    def test_extra_time_score(self):
        assert self.m.has_extra_time is True
        # 延長前半 0-0 + 延長後半 0-0 = 0-0
        assert self.m.home_score_ex == 0
        assert self.m.away_score_ex == 0

    def test_pk_score(self):
        assert self.m.home_pk == 5
        assert self.m.away_pk == 4


class TestNoExtraTime:
    """Regular 90-minute win: 鹿島 5-0 名古屋."""

    @pytest.fixture(autouse=True)
    def result(self):
        self.m = parse_match_detail(_load('match_detail_no_extra_time.html'))

    def test_teams(self):
        assert self.m.home_team == '鹿島アントラーズ'
        assert self.m.away_team == '名古屋グランパスエイト'

    def test_total_score(self):
        assert self.m.home_goal == 5
        assert self.m.away_goal == 0

    def test_half_scores(self):
        assert len(self.m.half_scores) == 2
        assert self.m.half_scores[0].period == '前半'
        assert self.m.half_scores[1].period == '後半'

    def test_no_extra_time(self):
        assert self.m.has_extra_time is False
        assert self.m.home_score_ex is None
        assert self.m.away_score_ex is None

    def test_no_pk(self):
        assert self.m.home_pk is None
        assert self.m.away_pk is None
