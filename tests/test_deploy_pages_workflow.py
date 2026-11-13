"""Exercise the deployment workflow's branches with the remote action stubbed.

Evaluate the small expression subset used here and execute the real wait/result
shell steps. Build, upload and deploy actions are stubs; no site is published.
"""
import ast
import os
from pathlib import Path
import re
import subprocess

import pytest
import yaml


ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / '.github/workflows/deploy-pages.yaml'
URL = 'https://example.github.io/site/'
OK = ('success', URL)
FAIL = ('failure', '')


def _expression(value, steps, failed, cancelled):
    text = value.removeprefix('${{').removesuffix('}}').strip()

    def lookup(match):
        step = steps.get(match[1], {})
        value = (step.get('outcome', '') if match[2] == 'outcome'
                 else step.get('outputs', {}).get('page_url', ''))
        return repr(value)

    text = re.sub(r'steps\.([\w-]+)\.(outcome|outputs\.page_url)', lookup, text)
    text = text.replace('!cancelled()', repr(not cancelled))
    text = text.replace('success()', repr(not failed and not cancelled))
    text = text.replace('&&', ' and ').replace('||', ' or ')

    def evaluate(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.BoolOp):
            result = None
            for value in node.values:
                result = evaluate(value)
                if isinstance(node.op, ast.Or) and result:
                    break
                if isinstance(node.op, ast.And) and not result:
                    break
            return result
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            left, right = evaluate(node.left), evaluate(node.comparators[0])
            if isinstance(node.ops[0], ast.Eq):
                return left == right
            if isinstance(node.ops[0], ast.NotEq):
                return left != right
        raise AssertionError(f'Unsupported workflow expression: {ast.dump(node)}')

    return evaluate(ast.parse(text.strip(), mode='eval').body)


def _run(tmp_path, attempts, *, fail_step=None, cancel_after=None, sleep_exit=0):
    job = yaml.safe_load(WORKFLOW.read_text())['jobs']['deploy']
    steps, called = {}, []
    failed = cancelled = deployment_reached = False
    outputs = tmp_path / 'outputs'
    waits = tmp_path / 'waits'
    outputs.touch()
    (tmp_path / 'sleep').write_text(
        '#!/bin/sh\nprintf "%s\\n" "$1" >> "$WAIT_LOG"\nexit "$WAIT_EXIT"\n')
    (tmp_path / 'sleep').chmod(0o755)

    for index, step in enumerate(job['steps']):
        step_id = step.get('id', f'step_{index}')
        condition = step.get('if', 'success()')
        # GitHub implicitly requires success() unless an explicit status function is used.
        if not re.search(r'\b(success|cancelled)\(', condition):
            condition = f'success() && ({condition})'
        state = {'outcome': 'skipped', 'outputs': {}}
        if _expression(condition, steps, failed, cancelled):
            state['outcome'] = 'success'
            if step.get('uses') == 'actions/deploy-pages@v4':
                deployment_reached = True
                assert len(called) < len(attempts), 'An unexpected extra deployment was started'
                outcome, url = attempts[len(called)]
                called.append(outcome)
                state = {'outcome': outcome, 'outputs': {'page_url': url}}
                if len(called) == cancel_after:
                    cancelled = True
            elif fail_step is not None and step.get('name') == fail_step:
                state['outcome'] = 'failure'
            elif 'run' in step and deployment_reached:
                env = {**os.environ, 'PATH': f'{tmp_path}:{os.environ["PATH"]}',
                       'GITHUB_OUTPUT': str(outputs), 'WAIT_LOG': str(waits),
                       'WAIT_EXIT': str(sleep_exit)}
                for key, value in step.get('env', {}).items():
                    value = _expression(value, steps, failed, cancelled)
                    env[key] = str(value).lower() if isinstance(value, bool) else str(value)
                result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', step['run']],
                                        env=env, capture_output=True, text=True, check=False)
                if result.returncode:
                    state['outcome'] = 'failure'
                state['outputs'] = dict(line.split('=', 1) for line in outputs.read_text().splitlines())
            if state['outcome'] == 'failure' and not step.get('continue-on-error', False):
                failed = True
        steps[step_id] = state

    url = _expression(job['environment']['url'], steps, failed, cancelled)
    delays = [int(line) for line in waits.read_text().splitlines()] if waits.exists() else []
    return called, failed, cancelled, url, delays


@pytest.mark.parametrize('attempts,delays', [([OK], []), ([FAIL, OK], [10]),
                                           ([FAIL, FAIL, OK], [10, 30])])
def test_recovers_and_stops_after_the_first_success(tmp_path, attempts, delays):
    called, failed, cancelled, url, waits = _run(tmp_path, attempts)
    assert len(called) == len(attempts)
    assert not failed and not cancelled
    assert url == URL
    assert waits == delays


def test_three_failed_attempts_fail_the_job(tmp_path):
    called, failed, _, url, waits = _run(tmp_path, [FAIL] * 3)
    assert called == ['failure'] * 3
    assert failed
    assert not url
    assert waits == [10, 30]


@pytest.mark.parametrize('attempts,delays', [([('failure', URL)], []),
                                           ([FAIL, ('failure', URL)], [10])])
def test_an_already_started_deployment_is_not_started_again(tmp_path, attempts, delays):
    called, failed, _, _, waits = _run(tmp_path, attempts)
    assert len(called) == len(attempts)
    assert failed
    assert waits == delays


@pytest.mark.parametrize('fail_step', ['Build TypeScript', 'Upload Pages artifact'])
def test_failure_before_deployment_does_not_start_any_attempt(tmp_path, fail_step):
    called, failed, _, url, waits = _run(tmp_path, [], fail_step=fail_step)
    assert not called and not waits and not url
    assert failed


@pytest.mark.parametrize('cancel_after', [1, 2])
def test_cancellation_stops_retrying(tmp_path, cancel_after):
    called, _, cancelled, _, waits = _run(tmp_path, [FAIL] * cancel_after,
                                         cancel_after=cancel_after)
    assert len(called) == cancel_after
    assert cancelled
    assert waits == ([] if cancel_after == 1 else [10])


def test_a_failed_wait_does_not_start_a_retry(tmp_path):
    called, failed, _, _, waits = _run(tmp_path, [FAIL], sleep_exit=1)
    assert called == ['failure']
    assert failed
    assert waits == [10]
