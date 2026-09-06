"""Tests for scripts/watch_live_matches.py"""
from datetime import date, datetime, timedelta
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock

import pandas as pd
import pytz

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))

import watch_live_matches as wlm  # noqa: E402
from watch_live_matches import (  # noqa: E402
    LEAD_IN,
    RUN_OUT,
    all_settled,
    has_started_unfinished,
    is_live,
    match_window,
    stop_reason,
    trigger_pages_deploy,
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


class TestHasStartedUnfinished(unittest.TestCase):
    """Tells a genuine stall apart from the ordinary wait between fixtures."""

    def _check(self, matches, hour, minute=0):
        return has_started_unfinished(matches, TODAY, _at(hour, minute), tzinfo=JST)

    def test_a_live_match_counts(self):
        self.assertTrue(self._check(_matches(('18:00', '速報中後半 20分')), 19))

    def test_a_kicked_off_match_counts_even_without_the_live_marker(self):
        """The source can stall before it ever marks the match live."""
        self.assertTrue(self._check(_matches(('18:00', 'ＶＳ')), 19))

    def test_an_upcoming_match_does_not_count(self):
        """Waiting for the evening kick-off is not a stall."""
        self.assertFalse(self._check(_matches(('19:30', 'ＶＳ')), 16))

    def test_settled_matches_do_not_count(self):
        self.assertFalse(self._check(_matches(('18:00', '試合終了'),
                                              ('18:00', '試合中止')), 21))

    def test_an_undecided_kick_off_does_not_count(self):
        """A blank time says nothing about whether the match has started."""
        self.assertFalse(self._check(_matches(('未定', 'ＶＳ')), 21))

    def test_the_gap_between_two_fixtures_is_not_a_stall(self):
        """14:00 finished, 19:30 still to come -- nothing is under way at 16:00."""
        self.assertFalse(self._check(_matches(('14:00', '試合終了'),
                                              ('19:30', 'ＶＳ')), 16))


class TestStopReason(unittest.TestCase):
    """What ends the watch, now that the window's end no longer does."""

    LIVE = _matches(('18:00', '速報中後半 20分'))
    DONE = _matches(('18:00', '試合終了'))

    def test_every_match_final_stops_the_watch(self):
        self.assertIsNotNone(stop_reason(self.DONE, stale_polls=0, max_stale=12))

    def test_a_live_match_keeps_the_watch_going(self):
        self.assertIsNone(stop_reason(self.LIVE, stale_polls=0, max_stale=12))

    def test_a_stalled_source_gives_up(self):
        """An unexpected record must not hold the job open to its budget."""
        reason = stop_reason(self.LIVE, stale_polls=12, max_stale=12)
        self.assertIsNotNone(reason)
        self.assertIn('not moving', reason)

    def test_a_stall_short_of_the_limit_keeps_going(self):
        self.assertIsNone(stop_reason(self.LIVE, stale_polls=11, max_stale=12))


def _completed(returncode: int, stderr: str = '') -> subprocess.CompletedProcess:
    """Build a finished process for the deploy dispatch to inspect."""
    return subprocess.CompletedProcess(args=[], returncode=returncode,
                                       stdout='', stderr=stderr)


class TestPagesDeploy(unittest.TestCase):
    """A push made with GITHUB_TOKEN does not start a workflow of its own."""

    def test_dispatches_the_deploy_workflow(self):
        with mock.patch.object(wlm, 'run', return_value=_completed(0)) as run:
            self.assertTrue(trigger_pages_deploy())
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0],
                         ['gh', 'workflow', 'run', 'deploy-pages.yaml'])

    def test_a_failed_dispatch_does_not_end_the_watch(self):
        """The next poll pushes the same data and dispatches again."""
        with mock.patch.object(wlm, 'run', return_value=_completed(1, 'boom')):
            self.assertFalse(trigger_pages_deploy())


class _StopLoop(Exception):
    """Raised from the patched sleep to end the watch loop under test."""


class TestWatchDayIsFixed(unittest.TestCase):
    """The loop must re-read the day it started on, not whatever day it is now.

    Re-reading the current date emptied the frame at midnight, and an empty
    frame reads as "everything has finished" -- so a match still being played
    was abandoned the moment the date rolled (#311).
    """

    def test_the_watch_survives_midnight(self):
        """Reaching sleep means the loop went round again past midnight.

        Before the fix the loop reloaded 09/07, got nothing, and returned 0
        without ever sleeping.
        """
        before = JST.localize(datetime(2026, 9, 6, 23, 50))
        after = JST.localize(datetime(2026, 9, 7, 0, 5))
        live = _matches(('18:00', '速報中後半 20分'))

        class _Clock(datetime):
            """A clock that steps past midnight between the two now() calls."""

            _times = iter([before, after])

            @classmethod
            def now(cls, tz=None):
                # Never run dry: the loop must fail on the day it reads, not on
                # how many times it looks at the clock.
                return next(cls._times, after)

        def _load(day):
            return live if day == before.date() else pd.DataFrame()

        window = (before - timedelta(hours=1), before + timedelta(hours=2))

        with mock.patch.object(wlm, 'datetime', _Clock), \
                mock.patch.object(wlm, 'load_todays_matches', side_effect=_load), \
                mock.patch.object(wlm, 'match_window', return_value=window), \
                mock.patch.object(wlm, 'poll_once'), \
                mock.patch.object(wlm.time, 'sleep', side_effect=_StopLoop), \
                mock.patch.object(sys, 'argv', ['watch', '--no-push']):
            with self.assertRaises(_StopLoop):
                wlm.main()


class TestWindowBounds(unittest.TestCase):
    """The window must stay inside a single job's reach."""

    def test_run_out_covers_a_full_match(self):
        """90 minutes of play, half time, stoppage and the result being posted."""
        self.assertGreaterEqual(RUN_OUT, timedelta(minutes=120))


if __name__ == '__main__':
    unittest.main()
