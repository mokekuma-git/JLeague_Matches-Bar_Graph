"""Tests for the "Update matches csv" step of .github/workflows/update-match-csv.yaml

The step's shell is run the way GitHub runs it -- `bash -e` on a script file --
inside a scratch repository with a bare remote, and with call_update_csv.sh
replaced by a stub that can change a CSV and fail on request.
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).resolve().parent.parent
_WORKFLOW = _REPO_ROOT / '.github' / 'workflows' / 'update-match-csv.yaml'

# Stands in for the reader dispatcher: optionally changes a CSV, then exits with
# the status it is told to, as call_update_csv.sh does once every reader has run.
_STUB = """#!/bin/bash
if [ "${STUB_CHANGE:-0}" = 1 ]; then
  echo "updated" >> docs/csv/sample.csv
fi
exit "${STUB_EXIT:-0}"
"""


def _step(**match) -> dict:
    """Find the job step whose keys equal `match` (e.g. id='update_csv')."""
    workflow = yaml.safe_load(_WORKFLOW.read_text(encoding='utf-8'))
    for step in workflow['jobs']['update-csv']['steps']:
        if all(step.get(key) == value for key, value in match.items()):
            return step
    raise KeyError(match)


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(['git', *args], cwd=cwd, env=_git_env(), check=True,
                          capture_output=True, text=True).stdout


def _git_env() -> dict:
    """Keep the developer's own git config (signing, hooks) out of the scratch repo."""
    return {**os.environ, 'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1'}


class TestUpdateStep(unittest.TestCase):
    """What reaches main when the readers run, and what the step reports."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.remote = root / 'remote.git'
        self.work = root / 'work'

        _git(root, 'init', '-q', '--bare', '-b', 'main', str(self.remote))
        self.work.mkdir()
        _git(self.work, 'init', '-q', '-b', 'main')
        _git(self.work, 'config', 'user.name', 'test')
        _git(self.work, 'config', 'user.email', 'test@example.com')
        (self.work / 'docs' / 'csv').mkdir(parents=True)
        (self.work / 'docs' / 'csv' / 'sample.csv').write_text('header\n')
        (self.work / 'scripts').mkdir()
        (self.work / 'scripts' / 'call_update_csv.sh').write_text(_STUB)
        _git(self.work, 'add', '.')
        _git(self.work, 'commit', '-q', '-m', 'initial')
        _git(self.work, 'remote', 'add', 'origin', str(self.remote))
        _git(self.work, 'push', '-q', 'origin', 'main')

    def tearDown(self):
        self._tmp.cleanup()

    def _run_step(self, change: bool, exit_status: int) -> tuple[int, str]:
        """Run the step's shell as a scheduled run would; return (status, outputs)."""
        script = _step(id='update_csv')['run'].replace('${{ github.event.schedule }}', '')
        self.assertNotIn('${{', script, 'an expression the test does not fill in')
        path = self.work.parent / 'step.sh'
        path.write_text(script)
        outputs = self.work.parent / 'github_output'
        outputs.write_text('')
        env = {**_git_env(), 'GITHUB_OUTPUT': str(outputs),
               'STUB_CHANGE': '1' if change else '0', 'STUB_EXIT': str(exit_status)}
        result = subprocess.run(['bash', '-e', str(path)], cwd=self.work, env=env,
                                capture_output=True, text=True, check=False)
        return result.returncode, outputs.read_text()

    def _commits_on_remote(self) -> int:
        return int(_git(self.remote, 'rev-list', '--count', 'main').strip())

    def test_a_failed_reader_does_not_hold_back_the_others(self):
        """The healthy readers' CSVs are pushed, and the step still fails (#322)."""
        status, outputs = self._run_step(change=True, exit_status=1)

        self.assertEqual(self._commits_on_remote(), 2)
        self.assertIn('committed=true', outputs)
        self.assertNotEqual(status, 0)

    def test_a_clean_run_commits_its_changes(self):
        status, outputs = self._run_step(change=True, exit_status=0)

        self.assertEqual(status, 0)
        self.assertEqual(self._commits_on_remote(), 2)
        self.assertIn('committed=true', outputs)

    def test_no_change_means_no_commit(self):
        status, outputs = self._run_step(change=False, exit_status=0)

        self.assertEqual(status, 0)
        self.assertEqual(self._commits_on_remote(), 1)
        self.assertNotIn('committed=true', outputs)

    def test_a_failed_reader_with_nothing_to_commit_still_fails(self):
        status, _ = self._run_step(change=False, exit_status=1)

        self.assertNotEqual(status, 0)
        self.assertEqual(self._commits_on_remote(), 1)


class TestFollowUpSteps(unittest.TestCase):
    """What runs after the update step, given how it ended."""

    def test_a_pushed_update_is_deployed_even_when_a_reader_failed(self):
        """A push made with GITHUB_TOKEN starts no workflow, so a skipped
        dispatch would leave the pushed CSVs off the site (#322)."""
        condition = _step(name='Trigger GitHub Pages deploy')['if']

        self.assertIn('!cancelled()', condition)
        self.assertIn("steps.update_csv.outputs.committed == 'true'", condition)

    def test_a_failed_day_is_not_recorded_as_done(self):
        """The record carries no status function, so it keeps the implicit
        success() and a failed full update is tried again by the next slot."""
        for name in ("Mark today's full update as done", "Record today's full update"):
            with self.subTest(step=name):
                condition = _step(name=name)['if']
                self.assertNotIn('always()', condition)
                self.assertNotIn('cancelled()', condition)
                self.assertNotIn('failure()', condition)


if __name__ == '__main__':
    unittest.main()
