"""Tests for scripts/call_update_csv.sh"""
import os
import csv
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).resolve().parent.parent
_SCRIPT = _REPO_ROOT / 'scripts' / 'call_update_csv.sh'

# The nightly full update's own slot.
DAILY_CRON = '0 16 * * *'
# A spare slot that only steps in when the day's update has not happened.
SPARE_CRON = '17 20 * * *'
# A slot pinned to a date, as the retired per-match entries were (#321, #330).
DATED_CRON = '30 5 27 6 *'

# Readers of competitions that have finished and left the schedule (#321).
FINISHED = ('WC2026', 'read_openfootball_wc.py')

_PREFIX = '--- Running: '


def _run(*args, summary_path: Path = None, daily_done: bool = None,
         output_path: Path = None, completion_config: Path = None,
         completion_now: str = '2026-11-06T12:00:00+00:00') -> subprocess.CompletedProcess:
    """Run the dispatcher with the readers stubbed out.

    Runs from the repository root so that an unquoted argument would glob into
    real file names, which is what the glob test looks for.

    Args:
        daily_done: What the workflow's lookup found; None leaves it unset,
            as a local run does.
    """
    env = {**os.environ, 'UPDATE_CSV_DRY_RUN': '1'}
    for name in ('GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'DAILY_DONE',
                 'COMPETITION_COMPLETION_CONFIG', 'COMPETITION_COMPLETION_NOW'):
        env.pop(name, None)
    # Freeze completion checks even as production CSVs acquire future results.
    env['COMPETITION_COMPLETION_NOW'] = completion_now
    if completion_config is not None:
        env['COMPETITION_COMPLETION_CONFIG'] = str(completion_config)
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
        for cron in (DAILY_CRON, SPARE_CRON):
            with self.subTest(cron=cron):
                self.assertIn('Trigger: Daily', _run(cron, daily_done=False).stdout)

    def test_a_later_slot_stands_down_once_the_day_is_done(self):
        for cron in (DAILY_CRON, SPARE_CRON):
            with self.subTest(cron=cron):
                result = _run(cron, daily_done=True)
                self.assertEqual(result.returncode, 0)
                self.assertIn('Trigger: Skip', result.stdout)
                self.assertEqual(_readers(result.stdout), [])

    def test_no_slot_takes_a_per_match_path(self):
        """The live watcher owns matches in play; a date-pinned slot, should
        one come back, is just another slot (#330)."""
        result = _run(DATED_CRON, daily_done=True)
        self.assertIn('Trigger: Skip', result.stdout)
        self.assertEqual(_readers(result.stdout), [])

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
        self.assertIn('read_jfamatch.py EmperorsCup', joined)
        self.assertIn('read_older2020_matches.py -y 2026 --frame 11', joined)
        self.assertIn('make_old_matches_csv.py --competition JLeagueCup -y 2026', joined)
        self.assertIn('read_older2020_matches.py -y 2026 --frame 50', joined)
        self.assertIn('make_old_matches_csv.py --competition JYouthCup -y 2026', joined)

    def test_sfms01_cups_are_fetched_before_they_are_built(self):
        readers = _readers(_run(DAILY_CRON).stdout)
        for frame, competition in (('11', 'JLeagueCup'), ('50', 'JYouthCup')):
            with self.subTest(competition=competition):
                fetch = next(i for i, r in enumerate(readers)
                             if 'read_older2020_matches.py' in r and f'--frame {frame}' in r)
                build = next(i for i, r in enumerate(readers)
                             if f'--competition {competition}' in r)
                self.assertLess(fetch, build)

    def test_finished_competitions_are_not_fetched(self):
        """WC2026 closed on 2026-07-19; running its readers daily only made the
        JFA and openfootball readers rewrite each other's columns (#321)."""
        joined = '\n'.join(_readers(_run(DAILY_CRON, daily_done=False).stdout))
        for reader in FINISHED:
            self.assertNotIn(reader, joined)


class TestYouthFetchOutput(unittest.TestCase):
    """A cached next-stage CSV is not evidence that today's fetch succeeded."""

    def _run_stubbed(self, fetch_status: int, other_status: int = 0):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            uv = directory / 'uv'
            uv.write_text(
                '#!/bin/bash\n'
                'if [[ "$*" == *"read_older2020_matches.py -y 2026 --frame 50"* ]]; then\n'
                '  exit "$YOUTH_FETCH_EXIT"\n'
                'fi\n'
                'if [[ "$*" == *"read_jleague_matches.py"* ]]; then\n'
                '  exit "$OTHER_READER_EXIT"\n'
                'fi\n'
                'exit 0\n')
            uv.chmod(0o755)
            output = directory / 'output'
            env = {**os.environ, 'PATH': f'{directory}:{os.environ["PATH"]}',
                   'GITHUB_OUTPUT': str(output), 'DAILY_DONE': 'false',
                   'YOUTH_FETCH_EXIT': str(fetch_status), 'OTHER_READER_EXIT': str(other_status)}
            env.pop('UPDATE_CSV_DRY_RUN', None)
            env.pop('GITHUB_STEP_SUMMARY', None)
            result = subprocess.run(['bash', str(_SCRIPT)], cwd=_REPO_ROOT,
                                    capture_output=True, text=True, check=False, env=env)
            return result, output.read_text()

    def test_failed_frame50_fetch_never_claims_a_fresh_source(self):
        result, output = self._run_stubbed(fetch_status=1)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('jyouth_fetch_succeeded=false', output)

    def test_an_unrelated_failed_reader_does_not_hide_a_successful_frame50_fetch(self):
        result, output = self._run_stubbed(fetch_status=0, other_status=1)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('jyouth_fetch_succeeded=true', output)

    def test_a_dry_run_does_not_claim_to_have_fetched_anything(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'output'
            _run(output_path=output)
            self.assertIn('jyouth_fetch_succeeded=false', output.read_text())


class TestJobSummary(unittest.TestCase):
    """Which readers ran has to be visible without opening the log (#309)."""

    def test_summary_names_the_branch_and_its_readers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'summary.md'
            _run(DAILY_CRON, summary_path=path)
            written = path.read_text()
        self.assertIn('### CSV update: Daily', written)
        self.assertIn('read_we_league.py', written)

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


class TestCompetitionCompletion(unittest.TestCase):
    """The automatic retirement gate controls whole reader groups."""

    def _policies(self, directory: Path, *, cup_pending: bool = False) -> Path:
        policies = {}
        for name, final, count in [('EmperorsCup', '決勝戦', 2), ('JLeagueCup', '決勝', 3)]:
            path = directory / f'{name}.csv'
            rows = [{
                'match_date': '2026/01/01', 'start_time': '14:00',
                'home_team': f'Home{i}', 'away_team': f'Away{i}',
                'home_goal': '1', 'away_goal': '0', 'status': '試合終了',
                'round': final if i == count else '準決勝',
                'match_number': str(i), 'leg': '',
                'home_pk_score': '', 'away_pk_score': '',
            } for i in range(1, count + 1)]
            if name == 'JLeagueCup' and cup_pending:
                rows[-1].update(status='ＶＳ', home_goal='', away_goal='')
            with path.open('w', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            policies[name] = {'csv_path': str(path), 'expected_matches': count,
                              'final_rounds': [final]}
        config = directory / 'completion.yaml'
        config.write_text(yaml.safe_dump({'competitions': policies}, allow_unicode=True))
        return config

    def test_scheduled_completed_cups_skip_fetch_and_conversion_but_keep_other_readers(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self._policies(Path(tmp))
            result = _run(DAILY_CRON, completion_config=config)
        self.assertEqual(result.returncode, 0, result.stderr)
        readers = '\n'.join(_readers(result.stdout))
        self.assertNotIn('read_jfamatch.py EmperorsCup', readers)
        self.assertNotIn('--frame 11', readers)
        self.assertNotIn('--competition JLeagueCup', readers)
        for reader in ('read_jleague_matches.py -f', 'read_we_league.py', '--frame 50',
                       '--competition JYouthCup'):
            self.assertIn(reader, readers)
        self.assertIn('EmperorsCup', result.stdout)
        self.assertIn('completed', result.stdout)

    def test_only_the_completed_competition_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self._policies(Path(tmp), cup_pending=True)
            result = _run(DAILY_CRON, completion_config=config)
        self.assertEqual(result.returncode, 0, result.stderr)
        readers = '\n'.join(_readers(result.stdout))
        self.assertNotIn('read_jfamatch.py EmperorsCup', readers)
        self.assertIn('--frame 11', readers)
        self.assertIn('--competition JLeagueCup', readers)

    def test_manual_update_refreshes_completed_cups_for_result_corrections(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self._policies(Path(tmp))
            result = _run('', completion_config=config)
        self.assertEqual(result.returncode, 0, result.stderr)
        readers = '\n'.join(_readers(result.stdout))
        self.assertIn('read_jfamatch.py EmperorsCup', readers)
        self.assertIn('--frame 11', readers)
        self.assertIn('--competition JLeagueCup', readers)

    def test_missing_local_csvs_keep_collecting(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            config = self._policies(directory)
            for path in directory.glob('*.csv'):
                path.unlink()
            result = _run(DAILY_CRON, completion_config=config)
        self.assertEqual(result.returncode, 0, result.stderr)
        readers = '\n'.join(_readers(result.stdout))
        self.assertIn('read_jfamatch.py EmperorsCup', readers)
        self.assertIn('--frame 11', readers)

    def test_checker_errors_are_reported_without_stopping_healthy_readers(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'invalid.yaml'
            config.write_text('competitions: [')
            result = _run(DAILY_CRON, completion_config=config)
        self.assertNotEqual(result.returncode, 0)
        readers = '\n'.join(_readers(result.stdout))
        for reader in ('read_jfamatch.py EmperorsCup', '--frame 11',
                       '--competition JLeagueCup', '--frame 50'):
            self.assertIn(reader, readers)
        self.assertIn('::error::', result.stdout)

    def test_manual_update_does_not_depend_on_the_completion_checker(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run('', completion_config=Path(tmp) / 'missing.yaml')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--frame 11', '\n'.join(_readers(result.stdout)))


if __name__ == '__main__':
    unittest.main()
