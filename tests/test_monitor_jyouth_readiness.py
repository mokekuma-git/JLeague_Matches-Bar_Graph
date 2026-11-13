import json
import subprocess

import pytest
import yaml

import monitor_jyouth_readiness as monitor


def row(*, stage='2ndラウンドＡ', section='第１節', day='27/01/30(土)',
        home='仙台', away='秋田', season='2026/27', kickoff='未定'):
    return {'シーズン': season, '大会': f'Ｊユースカップ {stage}', '節': section,
            '試合日': day, 'K/O時刻': kickoff, 'ホーム': home, 'アウェイ': away}


def knockout_rows():
    # The open draw is concrete even though only one date and no kickoffs are published.
    return [row(stage='ノックアウトラウンド', section='ラウンド１６',
                home=f'クラブ{2*i}', away=f'クラブ{2*i+1}',
                day='27/06/05(土)' if i == 0 else '未定') for i in range(8)]


def outcomes(rows, season_map=None):
    return {result.stage: result for result in monitor.evaluate(rows, season_map or {})}


def test_a_single_dated_second_round_fixture_is_enough_without_all_groups_or_kickoffs():
    result = outcomes([row(), row(stage='2ndラウンドＢ', day='未定', home='浦和', away='柏')])['2nd']
    assert result.status == 'ready'
    assert result.groups == ('A', 'B')
    assert result.dated_rows == 1
    assert result.unknown_dates == 1
    assert result.unknown_times == 2


def test_group_names_are_observed_rather_than_assumed_from_the_2025_edition():
    result = outcomes([row(stage='2ndラウンド１２')])['2nd']
    assert result.status == 'ready'
    assert result.groups == ('12',)


@pytest.mark.parametrize('placeholder', ['', '未定', '未確定', '●未定●', 'ＴＢＤ', 'TBA', 'unknown',
                                         '[1]w', '[1]W', '[2]L',
                                         'No.1の勝者', 'グループＡ１位', '第２位'])
def test_dated_placeholders_are_not_concrete_second_round_fixtures(placeholder):
    result = outcomes([row(home=placeholder)])['2nd']
    assert result.status == 'partial'
    assert result.unknown_teams == 1


@pytest.mark.parametrize('day', ['未定', '', '27/02/30(火)', '2027/13/01', '2027年1月'])
def test_a_stage_name_and_teams_without_a_valid_date_do_not_trigger(day):
    assert outcomes([row(day=day)])['2nd'].status == 'partial'


def test_another_season_and_first_round_rows_do_not_trigger():
    results = outcomes([row(season='2025'), row(stage='1stラウンド１')])
    assert {result.status for result in results.values()} == {'waiting'}


def test_stage_configuration_is_independent_and_even_an_empty_entry_counts_as_configured():
    season_map = {'jyouth': {'competitions': {'JYouthCup_2nd': {'seasons': {'26-27': {}}}}}}
    results = outcomes([row(), *knockout_rows()], season_map)
    assert results['2nd'].status == 'configured'
    assert results['KO'].status == 'ready'


def test_the_complete_opening_knockout_draw_needs_only_one_published_date():
    result = outcomes(knockout_rows())['KO']
    assert result.status == 'ready'
    assert result.concrete_rows == 8
    assert result.dated_rows == 1
    assert result.unknown_dates == 7


def test_duplicate_or_partial_knockout_pairings_do_not_prove_the_open_draw():
    rows = knockout_rows()
    assert outcomes(rows[:-1])['KO'].status == 'partial'
    assert outcomes([*rows[:-1], rows[0]])['KO'].status == 'partial'
    rows[-1]['アウェイ'] = 'No.2の勝者'
    assert outcomes(rows)['KO'].status == 'partial'


def test_knockout_later_rounds_do_not_substitute_for_a_missing_round_of_16():
    rows = [row(stage='ノックアウトラウンド', section='準々決勝')]
    assert outcomes(rows)['KO'].status == 'partial'


def test_a_match_against_the_same_team_is_not_actionable():
    assert outcomes([row(home='仙台', away='仙台')])['2nd'].status == 'partial'


def test_comment_describes_partial_publication_and_the_official_chart_check():
    result = outcomes(knockout_rows())['KO']
    body = monitor.comment_body(result, 'https://github.com/example/repo/actions/runs/1')
    assert body.startswith(result.marker)
    assert '全データ・全日時の確定を示す通知ではありません' in body
    assert '開催日未定: 7件' in body
    assert '公式のオープンドロー図' in body
    assert '16全8カード' in body


class FakeGitHub:
    def __init__(self, *, state='open', comments=None):
        self.state = state
        self.comments = list(comments or [])
        self.posts = []
        self.calls = []

    def __call__(self, endpoint, *, method='GET', data=None, paginate=False):
        self.calls.append((endpoint, method, paginate))
        if method == 'POST':
            assert endpoint.endswith('/comments')
            self.posts.append(data['body'])
            self.comments.append({'body': data['body']})
            return {'id': len(self.comments)}
        if '/comments?' in endpoint:
            assert paginate
            return list(self.comments)
        return {'state': self.state}


def test_notifies_each_ready_stage_once_even_when_fixture_dates_change():
    api = FakeGitHub()
    results = monitor.evaluate([row(), *knockout_rows()], {})
    assert monitor.notify(results, 'owner/repo', 352, api=api) == 2
    changed = monitor.evaluate([row(day='27/02/01(月)'), *knockout_rows()], {})
    assert monitor.notify(changed, 'owner/repo', 352, api=api) == 0
    assert len(api.posts) == 2


def test_an_already_notified_stage_does_not_hide_the_other_ready_stage():
    results = monitor.evaluate([row(), *knockout_rows()], {})
    api = FakeGitHub(comments=[{'body': 'User added a note\n' + results[0].marker + '\nprevious notification'}])
    assert monitor.notify(results, 'owner/repo', 352, api=api) == 1
    assert api.posts[0].startswith(results[1].marker)


def test_retry_after_one_stage_post_fails_does_not_repeat_the_other_stage():
    results = monitor.evaluate([row(), *knockout_rows()], {})
    api = FakeGitHub()

    def fail_second_post(endpoint, **kwargs):
        if kwargs.get('method') == 'POST' and results[1].marker in kwargs['data']['body']:
            raise subprocess.CalledProcessError(1, ['gh', 'api'])
        return api(endpoint, **kwargs)

    with pytest.raises(subprocess.CalledProcessError):
        monitor.notify(results, 'owner/repo', 352, api=fail_second_post)
    assert len(api.posts) == 1
    assert monitor.notify(results, 'owner/repo', 352, api=api) == 1
    assert len(api.posts) == 2


def test_closed_issue_is_not_reopened_or_commented_on():
    api = FakeGitHub(state='closed')
    assert monitor.notify(monitor.evaluate([row()], {}), 'owner/repo', 352, api=api) == 0
    assert len(api.calls) == 1
    assert not api.posts


def test_no_network_requests_when_nothing_is_ready():
    api = FakeGitHub()
    assert monitor.notify(monitor.evaluate([], {}), 'owner/repo', 352, api=api) == 0
    assert not api.calls


def test_github_comment_markers_are_loaded_from_all_pages(monkeypatch):
    def fake_run(command, **kwargs):
        assert '--paginate' in command
        assert '--slurp' in command
        return subprocess.CompletedProcess(command, 0, json.dumps([
            [{'body': 'ordinary comment'}], [{'body': '<!-- older notification -->'}],
        ]), '')
    monkeypatch.setattr(monitor.subprocess, 'run', fake_run)
    assert len(monitor.github_api('repos/owner/repo/issues/352/comments', paginate=True)) == 2


def test_github_post_uses_structured_stdin_not_shell_interpolation(monkeypatch):
    def fake_run(command, **kwargs):
        assert command[-2:] == ['--input', '-']
        assert json.loads(kwargs['input']) == {'body': 'line1\n`literal` $value'}
        assert not kwargs.get('shell')
        return subprocess.CompletedProcess(command, 0, '{}', '')
    monkeypatch.setattr(monitor.subprocess, 'run', fake_run)
    monitor.github_api('repos/owner/repo/issues/352/comments', method='POST',
                       data={'body': 'line1\n`literal` $value'})


@pytest.mark.parametrize('fetch_flag', [None, 'false', 'False', '1'])
def test_notify_mode_needs_a_successful_fetch_even_if_a_ready_cache_exists(monkeypatch, fetch_flag):
    monkeypatch.setattr(monitor.sys, 'argv', ['monitor', '--notify', '--csv', 'cached-ready.csv'])
    if fetch_flag is None:
        monkeypatch.delenv('JYOUTH_FETCH_SUCCEEDED', raising=False)
    else:
        monkeypatch.setenv('JYOUTH_FETCH_SUCCEEDED', fetch_flag)
    monkeypatch.setattr(monitor, 'read_rows', lambda _: pytest.fail('must not even inspect a stale cache'))
    monkeypatch.setattr(monitor, 'github_api', lambda *a, **kw: pytest.fail('no real API calls'))
    assert monitor.main() == 0


def test_main_notifies_with_a_fresh_source_and_records_its_summary(tmp_path, monkeypatch):
    season_map = tmp_path / 'season.yaml'
    season_map.write_text('{}')
    summary = tmp_path / 'summary.md'
    api = FakeGitHub()
    monkeypatch.setattr(monitor.sys, 'argv', [
        'monitor', '--notify', '--repository', 'owner/repo', '--season-map', str(season_map),
    ])
    def read_rows(path):
        assert path == monitor.ROOT / 'csv/26_27_frame50.csv'
        return [row()]

    monkeypatch.setattr(monitor, 'read_rows', read_rows)
    monkeypatch.setattr(monitor, 'github_api', api)
    monkeypatch.setenv('JYOUTH_FETCH_SUCCEEDED', 'true')
    monkeypatch.setenv('GITHUB_STEP_SUMMARY', str(summary))
    assert monitor.main() == 0
    assert len(api.posts) == 1
    assert '| 2ndラウンド | ready |' in summary.read_text()


def test_source_schema_errors_fail_before_any_notification(tmp_path):
    path = tmp_path / 'wrong.csv'
    path.write_text('wrong,columns\na,b\n')
    with pytest.raises(ValueError, match='missing columns'):
        monitor.read_rows(path)


def test_checked_in_frame50_currently_has_no_next_stage():
    rows = monitor.read_rows(monitor.ROOT / 'csv/26_27_frame50.csv')
    # Time-independent: add only the snapshot's 1st round to this assertion so a
    # future daily update publishing next-stage rows does not break CI.
    first = [row for row in rows if '1stラウンド' in monitor.normalize(row['大会'])]
    assert all(result.status == 'waiting' for result in monitor.evaluate(first, {}))


def test_workflow_checks_successful_frame50_even_when_other_readers_failed():
    workflow = yaml.safe_load((monitor.ROOT / '.github/workflows/update-match-csv.yaml').read_text())
    job = workflow['jobs']['update-csv']
    assert job['permissions']['issues'] == 'write'
    step = next(step for step in job['steps'] if 'monitor_jyouth_readiness.py' in step.get('run', ''))
    assert '!cancelled()' in step['if']
    assert "steps.update_csv.outputs.jyouth_fetch_succeeded == 'true'" in step['if']
    assert step['env']['JYOUTH_FETCH_SUCCEEDED'] == '${{ steps.update_csv.outputs.jyouth_fetch_succeeded }}'
    assert '--notify' in step['run']
