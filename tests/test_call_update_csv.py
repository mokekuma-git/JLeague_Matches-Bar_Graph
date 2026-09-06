"""Tests for scripts/call_update_csv.sh"""
import os
import subprocess
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_SCRIPT = _REPO_ROOT / 'scripts' / 'call_update_csv.sh'

# The nightly full update: the only cron line leaving both day-of-month and
# month as '*'.
DAILY_CRON = '0 16 * * *'
# One of the WC2026 entries, pinned to a date.
DATED_CRON = '30 5 27 6 *'

_PREFIX = '--- Running: '


def _run(*args) -> subprocess.CompletedProcess:
    """Run the dispatcher with the readers stubbed out.

    Runs from the repository root so that an unquoted argument would glob into
    real file names, which is what the glob test looks for.
    """
    return subprocess.run(
        ['bash', str(_SCRIPT), *args],
        cwd=_REPO_ROOT, capture_output=True, text=True, check=False,
        env={**os.environ, 'UPDATE_CSV_DRY_RUN': '1'})


def _readers(output: str) -> list[str]:
    """Pull the reader command lines out of the script's output."""
    return [line[len(_PREFIX):].removesuffix(' ---')
            for line in output.splitlines() if line.startswith(_PREFIX)]


class TestTriggerSelection(unittest.TestCase):
    """The branch follows the cron line, not the hour the run happens to start.

    Choosing by wall-clock hour meant a delayed run silently skipped the daily
    readers, which is how #309 went unnoticed for three weeks.
    """

    def test_daily_cron_selects_the_full_update(self):
        result = _run(DAILY_CRON)
        self.assertIn('Trigger: Daily', result.stdout)

    def test_dated_cron_stays_on_the_per_match_path(self):
        result = _run(DATED_CRON)
        self.assertIn('Trigger: OnGame', result.stdout)

    def test_a_manual_run_is_a_full_update(self):
        """workflow_dispatch leaves github.event.schedule empty."""
        self.assertIn('Trigger: Daily', _run('').stdout)
        self.assertIn('Trigger: Daily', _run().stdout)

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
        readers = _readers(_run(DATED_CRON).stdout)
        joined = '\n'.join(readers)
        self.assertIn('read_jleague_matches.py', joined)
        self.assertNotIn('-f', joined)
        for skipped in ('PrincePremierE', 'PrincePremierW', 'PrinceKanto',
                        'read_we_league.py'):
            self.assertNotIn(skipped, joined)


if __name__ == '__main__':
    unittest.main()
