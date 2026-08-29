"""Tests for scripts/watch_live_matches.py"""
from datetime import date, datetime, timedelta
from pathlib import Path
import sys
import unittest

import pandas as pd
import pytz

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))

from watch_live_matches import (  # noqa: E402
    LEAD_IN,
    RUN_OUT,
    all_settled,
    is_live,
    match_window,
)

JST = pytz.timezone('Asia/Tokyo')
TODAY = date(2026, 8, 29)


def _matches(*rows) -> pd.DataFrame:
    """Build a match frame from (start_time, status) pairs."""
    return pd.DataFrame([{'start_time': s, 'status': st} for (s, st) in rows])


def _at(hour, minute=0) -> datetime:
    return JST.localize(datetime(2026, 8, 29, hour, minute))


class TestMatchWindow(unittest.TestCase):
    """Test for match_window function"""

    def test_no_matches_today(self):
        self.assertIsNone(match_window(pd.DataFrame(), TODAY, _at(12), tzinfo=JST))

    def test_window_spans_first_to_last_kickoff(self):
        frame = _matches(('18:00', 'ＶＳ'), ('19:00', 'ＶＳ'))

        start, end = match_window(frame, TODAY, _at(12), tzinfo=JST)

        self.assertEqual(start.strftime('%H:%M'),
                         (datetime(2026, 8, 29, 18, 0) - LEAD_IN).strftime('%H:%M'))
        self.assertEqual(end.strftime('%H:%M'),
                         (datetime(2026, 8, 29, 19, 0) + RUN_OUT).strftime('%H:%M'))

    def test_undecided_kickoff_is_ignored(self):
        """A blank time must not drag the window back to midnight."""
        frame = _matches(('', 'ＶＳ'), ('19:00', 'ＶＳ'))

        start, _ = match_window(frame, TODAY, _at(12), tzinfo=JST)

        self.assertEqual(start.strftime('%H:%M'), '18:55')

    def test_only_undecided_kickoffs_gives_no_window(self):
        self.assertIsNone(match_window(_matches(('', 'ＶＳ')), TODAY, _at(12), tzinfo=JST))

    def test_live_match_anchors_the_window_on_now(self):
        """A match under way has no kick-off time left on the page."""
        frame = _matches(('', '速報中前半 30分'))

        start, end = match_window(frame, TODAY, _at(19, 30), tzinfo=JST)

        self.assertEqual(start, _at(19, 30) - LEAD_IN)
        self.assertEqual(end, _at(19, 30) + RUN_OUT)

    def test_live_match_extends_a_window_built_from_kickoffs(self):
        frame = _matches(('', '速報中後半 10分'), ('19:00', 'ＶＳ'))

        _, end = match_window(frame, TODAY, _at(21, 0), tzinfo=JST)

        self.assertEqual(end, _at(21, 0) + RUN_OUT)


class TestAllSettled(unittest.TestCase):
    """Test for all_settled function"""

    def test_empty_is_settled(self):
        self.assertTrue(all_settled(pd.DataFrame()))

    def test_finished_and_cancelled_are_settled(self):
        self.assertTrue(all_settled(_matches(('18:00', '試合終了'), ('19:00', '試合中止'))))

    def test_scheduled_match_is_not_settled(self):
        self.assertFalse(all_settled(_matches(('18:00', '試合終了'), ('19:00', 'ＶＳ'))))

    def test_live_match_is_not_settled(self):
        self.assertFalse(all_settled(_matches(('', '速報中前半 30分'))))


class TestIsLive(unittest.TestCase):
    """Test for is_live function"""

    def test_detects_the_live_marker(self):
        self.assertTrue(is_live(_matches(('', '速報中後半 5分'))))

    def test_no_live_marker(self):
        self.assertFalse(is_live(_matches(('18:00', '試合終了'), ('19:00', 'ＶＳ'))))

    def test_empty_frame(self):
        self.assertFalse(is_live(pd.DataFrame()))


class TestWindowBounds(unittest.TestCase):
    """The window must stay inside a single job's reach."""

    def test_run_out_covers_a_full_match(self):
        """90 minutes of play, half time, stoppage and the result being posted."""
        self.assertGreaterEqual(RUN_OUT, timedelta(minutes=120))


if __name__ == '__main__':
    unittest.main()
