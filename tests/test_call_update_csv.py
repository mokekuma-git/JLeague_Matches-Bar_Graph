"""Tests for scripts/call_update_csv.sh"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_SCRIPT = _REPO_ROOT / 'scripts' / 'call_update_csv.sh'

# The nightly full update's own slot.
DAILY_CRON = '0 16 * * *'
# A spare slot that only steps in when the day's update has not happened.
SPARE_CRON = '17 20 * * *'
# One of the WC2026 entries, pinned to a date.
DATED_CRON = '30 5 27 6 *'

_PREFIX = '--- Running: '


def _run(*args, summary_path: Path = None, daily_done: bool = None,
         output_path: Path = None) -> subprocess.CompletedProcess:
    """Run the dispatcher with the readers stubbed out.

    Runs from the repository root so that an unquoted argument would glob into
    real file names, which is what the glob test looks for.

    Args:
        daily_done: What the workflow's lookup found; None leaves it unset,
            as a local run does.
    """
    env = {**os.environ, 'UPDATE_CSV_DRY_RUN': '1'}
    for name in ('GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'DAILY_DONE'):
        env.pop(name, None)
    if summary_path is not None:
        env['GITHUB_STEP_SUMMARY'] = str(summary_path)
    if output_path is not None:
        env['GITHUB_OUTPUT'] = str(output_path)
    if daily_done is not None:
        env['DAILY_DONE'] = 'true' if daily_done else 'false'
    return subprocess.run(
        ['bash', str(_SCRIPT), *args],
        cwd=_REPO_ROOT, capture_output=True, text=True, check=False, env=env)


def _readers(output: str) -> list[str]:
    """Pull the reader command lines out of the script's output."""
    return [line[len(_PREFIX):].removesuffix(' ---')
            for line in output.splitlines() if line.startswith(_PREFIX)]


class TestTriggerSelection(unittest.TestCase):
    """The full update runs once per JST day, on whichever run gets there first.

    Choosing by wall-clock hour meant a delayed run silently skipped the daily
    readers, which is how #309 went unnoticed for three weeks.  Choosing by the
    cron line still tied the day's update to one slot; the record of the day
    being done lets any slot take it and the rest stand down (#315).
    """

    def test_the_first_run_of_the_day_does_the_full_update(self):
        for cron in (DAILY_CRON, SPARE_CRON, DATED_CRON):
            with self.subTest(cron=cron):
                self.assertIn('Trigger: Daily', _run(cron, daily_done=False).stdout)

    def test_a_later_slot_stands_down_once_the_day_is_done(self):
        for cron in (DAILY_CRON, SPARE_CRON):
            with self.subTest(cron=cron):
                result = _run(cron, daily_done=True)
                self.assertEqual(result.returncode, 0)
                self.assertIn('Trigger: Skip', result.stdout)
                self.assertEqual(_readers(result.stdout), [])

    def test_dated_cron_stays_on_the_per_match_path_once_the_day_is_done(self):
        result = _run(DATED_CRON, daily_done=True)
        self.assertIn('Trigger: OnGame', result.stdout)

    def test_an_unknown_state_errs_towards_the_full_update(self):
        """A local run or a failed lookup must not skip the day's readers."""
        self.assertIn('Trigger: Daily', _run(DAILY_CRON).stdout)

    def test_a_manual_run_is_a_full_update(self):
        """workflow_dispatch leaves github.event.schedule empty."""
        self.assertIn('Trigger: Daily', _run('').stdout)
        self.assertIn('Trigger: Daily', _run().stdout)
        self.assertIn('Trigger: Daily', _run('', daily_done=True).stdout)

    def test_the_branch_is_handed_to_the_workflow(self):
        """Only a full update may record the day as done."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'output'
            _run(DAILY_CRON, daily_done=False, output_path=path)
            self.assertIn('trigger=Daily', path.read_text())
            _run(DAILY_CRON, daily_done=True, output_path=path)
            self.assertIn('trigger=Skip', path.read_text())

    def test_the_schedule_is_not_globbed(self):
        """Unquoted, the cron '*'s expand into repository file names."""
        result = _run(DAILY_CRON)
        self.assertIn(f'Called by schedule: {DAILY_CRON}', result.stdout)
        self.assertNotIn('CLAUDE.md', result.stdout)


class TestReaderSelection(unittest.TestCase):
    """Which readers each branch runs."""

    def test_daily_runs_every_reader(self):
        readers = _readers(_run(DAILY_CRON).stdout)
        joined = '\n'.join(readers)
        self.assertIn('read_jleague_matches.py -f', joined)
        for competition in ('PrincePremierE', 'PrincePremierW', 'PrinceKanto'):
            self.assertIn(competition, joined)
        self.assertIn('read_we_league.py', joined)
        self.assertIn('read_openfootball_wc.py', joined)

    def test_per_match_runs_only_the_live_sources(self):
        readers = _readers(_run(DATED_CRON, daily_done=True).stdout)
        joined = '\n'.join(readers)
        self.assertIn('read_jleague_matches.py', joined)
        self.assertNotIn('-f', joined)
        for skipped in ('PrincePremierE', 'PrincePremierW', 'PrinceKanto',
                        'read_we_league.py'):
            self.assertNotIn(skipped, joined)


class TestJobSummary(unittest.TestCase):
    """Which readers ran has to be visible without opening the log (#309)."""

    def test_summary_names_the_branch_and_its_readers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'summary.md'
            _run(DAILY_CRON, summary_path=path)
            written = path.read_text()
        self.assertIn('### CSV update: Daily', written)
        self.assertIn('read_we_league.py', written)

    def test_a_per_match_run_says_so(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'summary.md'
            _run(DATED_CRON, summary_path=path, daily_done=True)
            written = path.read_text()
        self.assertIn('### CSV update: OnGame', written)
        self.assertNotIn('read_we_league.py', written)

    def test_summary_falls_back_to_stdout_off_ci(self):
        self.assertIn('### CSV update: Daily', _run(DAILY_CRON).stdout)

    def test_a_stood_down_slot_says_why(self):
        """A slot with nothing to do must not look like a silent failure (#309)."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'summary.md'
            _run(SPARE_CRON, summary_path=path, daily_done=True)
            written = path.read_text()
        self.assertIn('### CSV update: Skip', written)
        self.assertIn('already done', written)
        self.assertNotIn('| Reader |', written)


if __name__ == '__main__':
    unittest.main()
