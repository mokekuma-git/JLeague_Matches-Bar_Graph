"""Tests for read_we_league.py"""
import logging
import unittest
from unittest import mock

import bs4

import read_we_league as rw

# Labels as weleague.jp shows them (2026-09 survey).
LEAGUE = '2025/26 SOMPO WEリーグ 第17節'
CUP = '2025/26 WEリーグ クラシエカップ グループステージ グループB 第6節'
AWCL = 'AFC女子チャンピオンズリーグ 2025/26 準々決勝'
# From 2026/27 the site writes its labels in full-width (#332).
LEAGUE_FW = '２０２６／２７ＷＥリーグ 第1節'
CUP_FW = '２０２６／２７ＷＥリーグクラシエカップ リーグステージ 第1節'


def _match(label: str, home: str, away: str, score: str = '<span>1</span>－<span>0</span>') -> str:
    """One <li> of the AJAX day page, reduced to what the reader looks at."""
    return f"""
    <li class="matchContainer"><div class="match-inner">
      <div class="date"><p>{label}</p>
        <span class="stadium"><span class="time">14:00</span>会場</span></div>
      <div class="teams"><a href="/matches/2026032820/"></a>
        <div class="team"><span class="name">{home}</span></div>
        <div class="point">{score}</div>
        <div class="team"><span class="name">{away}</span></div>
      </div>
    </div></li>"""


def _day(*matches: str) -> bs4.BeautifulSoup:
    return bs4.BeautifulSoup(f'<ul>{"".join(matches)}</ul>', 'lxml')


class _WithWeConfig(unittest.TestCase):
    """Load the WE League config for each test and put the previous one back.

    `mu` is shared by every reader, so loading it once at import time was undone
    by whichever reader the test run imported next.
    """

    def setUp(self):
        saved = rw.mu.config
        self.addCleanup(setattr, rw.mu, 'config', saved)
        rw.init()


class TestOtherCompetitionsAreLeftOut(_WithWeConfig):
    """The site lists every fixture of its clubs on one schedule (#328).

    An AFC Women's Champions League match carries no "カップ", so it used to be
    read as a league match -- the knockout round words even gave it one of the
    97-99 section numbers -- and three foreign clubs showed up in the table.
    """

    def _read(self, *matches: str):
        with mock.patch.object(rw, '_get', return_value=_day(*matches)):
            return rw._read_day(2025, 2026, 3, 28)

    def test_a_continental_match_is_left_out(self):
        matches, skipped = self._read(_match(LEAGUE, '新潟L', 'AC長野'),
                                      _match(AWCL, '東京NB', 'スタリオン'))

        self.assertEqual([record['home_team'] for _, record in matches], ['新潟L'])
        self.assertEqual(skipped, [AWCL])

    def test_league_and_cup_matches_are_still_read(self):
        matches, skipped = self._read(_match(LEAGUE, '新潟L', 'AC長野'),
                                      _match(CUP, 'マイ仙台', 'AC長野'))

        self.assertEqual([is_cup for is_cup, _ in matches], [False, True])
        self.assertEqual(skipped, [])

    def test_every_season_label_counts_as_ours(self):
        """Re-reading an old season must not drop its matches, nor may the
        current season's full-width labels (#332)."""
        for label, is_cup in (('2021-22 Yogibo WEリーグ 第1節', False),
                              ('2023-24 WEリーグ 第1節', False),
                              ('2024-25 WEリーグ クラシエカップ グループステージ グループA 第1節', True),
                              (LEAGUE_FW, False),
                              (CUP_FW, True)):
            with self.subTest(label=label):
                matches, skipped = self._read(_match(label, '浦和', 'Ⅰ神戸'))
                self.assertEqual([cup for cup, _ in matches], [is_cup])
                self.assertEqual(skipped, [])

    def test_a_full_width_label_still_gives_its_section(self):
        matches, _ = self._read(_match('２０２６／２７ＷＥリーグ 第１２節', '浦和', 'Ⅰ神戸'))

        self.assertEqual(matches[0][1]['section_no'], 12)


class TestSeasonSummary(_WithWeConfig):
    """What read_season() says about the matches it left out."""

    def _season(self, day_result):
        with mock.patch.object(rw, '_get_match_days', return_value=[1]), \
                mock.patch.object(rw, '_read_day', return_value=day_result):
            return rw.read_season('25-26')

    def test_left_out_matches_do_not_reach_either_csv(self):
        record = {'section_no': 1, 'home_team': '浦和', 'away_team': 'I神戸'}
        we, cup = self._season(([(False, dict(record))], [AWCL]))

        self.assertTrue(all(r['home_team'] == '浦和' for r in we))
        self.assertEqual(cup, [])

    def test_a_season_with_only_left_out_matches_fails(self):
        """A label change on the site reads every match as someone else's;
        that is a broken reader, so the run must fail rather than log (#332)."""
        with self.assertRaisesRegex(RuntimeError, 'WEリーグ'):
            self._season(([], [LEAGUE_FW]))

    def test_an_ordinary_season_raises_no_warning(self):
        record = {'section_no': 1, 'home_team': '浦和', 'away_team': 'I神戸'}
        with self.assertNoLogs(rw.logger, level=logging.WARNING):
            self._season(([(False, dict(record))], [AWCL]))


class TestEmptySeasonLeavesTheCsvsAlone(_WithWeConfig):
    """A season with nothing listed must not blank the CSVs already written.

    Writing an empty frame used to fail half-way with a KeyError (#332); it must
    not be tried at all.
    """

    def test_nothing_is_written(self):
        with mock.patch.object(rw.os, 'chdir'), \
                mock.patch.object(rw, 'make_args',
                                  return_value=mock.Mock(season='26-27', debug=False)), \
                mock.patch.object(rw, 'read_season', return_value=([], [])), \
                mock.patch.object(rw.mu, 'update_if_diff') as write:
            self.assertEqual(rw.main(), 0)

        write.assert_not_called()


if __name__ == '__main__':
    unittest.main()
