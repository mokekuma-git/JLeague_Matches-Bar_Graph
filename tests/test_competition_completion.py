import csv
from datetime import datetime
from pathlib import Path

import pytest
import yaml

from competition_completion import (
    REPO_ROOT,
    CompletionPolicy,
    ConfigurationError,
    check_completion,
    evaluate_rows,
    load_policy,
    main,
)


def fixture_rows(count=65, final_round='決勝'):
    rows = []
    for index in range(count):
        rows.append({
            'match_number': str(index + 1),
            'match_date': '2027/05/08', 'start_time': '14:00',
            'home_team': f'ホーム{index}', 'away_team': f'アウェイ{index}',
            'home_goal': '2', 'away_goal': '0', 'status': '試合終了',
            'round': final_round if index == count - 1 else '準々決勝', 'leg': '',
            'home_pk_score': '', 'away_pk_score': '',
        })
    return rows


@pytest.mark.parametrize(('count', 'final_round'), [(87, '決勝戦'), (65, '決勝')])
def test_complete_tournament_can_retire_after_its_actual_fixture_times(count, final_round):
    policy = CompletionPolicy(Path('unused.csv'), count, (final_round,))
    result = evaluate_rows(fixture_rows(count, final_round), policy,
                           datetime.fromisoformat('2027-05-08T08:00:00+00:00'))
    assert result.completed, result.reason


def test_completed_home_and_away_draws_do_not_require_pk_per_leg():
    rows = fixture_rows(3)
    rows[0].update(home_team='A', away_team='B', home_goal='0', away_goal='0', leg='1')
    rows[1].update(home_team='B', away_team='A', home_goal='1', away_goal='1', leg='2')
    result = evaluate_rows(rows, CompletionPolicy(Path('unused.csv'), 3, ('決勝',)),
                           datetime.fromisoformat('2027-05-08T18:00:00+09:00'))
    assert result.completed, result.reason


@pytest.mark.parametrize('leg', ['1', '2'])
def test_lone_leg_cannot_bypass_the_single_match_draw_decision(leg):
    rows = fixture_rows(1)
    rows[0].update(home_goal='0', away_goal='0', leg=leg)
    result = evaluate_rows(rows, CompletionPolicy(Path('unused.csv'), 1, ('決勝',)),
                           datetime.fromisoformat('2028-01-01T00:00:00+09:00'))
    assert not result.completed, result.reason


@pytest.mark.parametrize('same_orientation', [True, False])
def test_home_and_away_legs_must_share_round_and_reverse_venue_sides(same_orientation):
    rows = fixture_rows(3)
    rows[0].update(home_team='A', away_team='B', leg='1')
    rows[1].update(home_team='A' if same_orientation else 'B',
                   away_team='B' if same_orientation else 'A', leg='2',
                   round='準々決勝' if same_orientation else '準決勝')
    result = evaluate_rows(rows, CompletionPolicy(Path('unused.csv'), 3, ('決勝',)),
                           datetime.fromisoformat('2028-01-01T00:00:00+09:00'))
    assert not result.completed, result.reason


def test_current_cup_csvs_stay_active_even_after_their_last_known_date():
    # The clock is fixed so automatic future CSV updates cannot flip this test.
    for competition in ('EmperorsCup', 'JLeagueCup'):
        result = check_completion(competition,
                                  now=datetime.fromisoformat('2026-11-06T12:00:00+00:00'))
        assert not result.completed, result.reason


def test_all_60_levain_rows_finished_does_not_mean_the_tournament_has_finished():
    rows = fixture_rows(60)
    for row in rows:
        row['round'] = '準々決勝'
    result = evaluate_rows(rows, CompletionPolicy(Path('unused.csv'), 65, ('決勝',)),
                           datetime.fromisoformat('2028-01-01T00:00:00+09:00'))
    assert not result.completed
    assert 'coverage 60/65' in result.reason


@pytest.mark.parametrize('count', [0, 64, 66])
def test_empty_truncated_or_extra_rows_do_not_retire(count):
    result = evaluate_rows(fixture_rows(count), CompletionPolicy(Path('unused.csv'), 65, ('決勝',)))
    assert not result.completed
    assert 'coverage' in result.reason


def test_semifinal_label_is_not_mistaken_for_the_final():
    rows = fixture_rows()
    rows[-1]['round'] = '準決勝'
    result = evaluate_rows(rows, CompletionPolicy(Path('unused.csv'), 65, ('決勝',)),
                           datetime.fromisoformat('2028-01-01T00:00:00+09:00'))
    assert not result.completed
    assert 'final round missing' in result.reason


def test_duplicate_identifiers_or_logical_fixtures_cannot_fill_missing_coverage():
    rows = fixture_rows()
    policy = CompletionPolicy(Path('unused.csv'), 65, ('決勝',))
    clock = datetime.fromisoformat('2028-01-01T00:00:00+09:00')
    rows[1]['match_number'] = rows[0]['match_number']
    assert 'duplicate match_number' in evaluate_rows(rows, policy, clock).reason
    # A new ID and a different date do not turn the same fixture into a new match.
    rows[1] = {**rows[0], 'match_number': '9999', 'match_date': '2027/05/09'}
    assert 'duplicate logical fixture' in evaluate_rows(rows, policy, clock).reason


def test_missing_match_ids_use_logical_fixture_keys():
    rows = fixture_rows()
    for row in rows:
        del row['match_number']
    policy = CompletionPolicy(Path('unused.csv'), 65, ('決勝',))
    clock = datetime.fromisoformat('2028-01-01T00:00:00+09:00')
    assert evaluate_rows(rows, policy, clock).completed
    rows[1] = dict(rows[0])
    assert not evaluate_rows(rows, policy, clock).completed


@pytest.mark.parametrize('changes', [
    {'status': ''}, {'status': '速報中後半 45分'}, {'status': '試合中止'},
    {'status': '試合不実施'}, {'status': '延期'}, {'status': 'unknown'},
    {'home_goal': ''}, {'away_goal': ''}, {'home_goal': '-1'}, {'away_goal': 'NaN'},
    {'home_goal': '1.5'}, {'home_goal': '2', 'away_goal': '2'},
    {'home_goal': '1', 'away_goal': '1', 'home_pk_score': '3'},
    {'home_goal': '1', 'away_goal': '1', 'home_pk_score': '3', 'away_pk_score': '3'},
    {'home_goal': '1', 'away_goal': '1', 'home_pk_score': '-1', 'away_pk_score': '4'},
    {'match_date': '未定'}, {'match_date': '2027/02/30'}, {'start_time': '未定'},
    {'start_time': '24:00'}, {'match_date': '2029/01/01'},
    {'home_team': ''}, {'away_team': '未定'}, {'home_team': 'No.85の勝者'},
    {'away_team': '[39]w'}, {'away_team': 'TBD'}, {'away_team': 'ホーム0'},
    {'round': ''}, {'leg': '3'},
])
def test_incomplete_or_inconsistent_fixture_stays_active(changes):
    rows = fixture_rows()
    rows[0].update(changes)
    result = evaluate_rows(rows, CompletionPolicy(Path('unused.csv'), 65, ('決勝',)),
                           datetime.fromisoformat('2028-01-01T00:00:00+09:00'))
    assert not result.completed, result.reason


def test_drawn_final_retires_only_after_both_pk_scores_are_published():
    rows = fixture_rows()
    rows[-1].update(home_goal='1', away_goal='1', home_pk_score='4')
    policy = CompletionPolicy(Path('unused.csv'), 65, ('決勝',))
    clock = datetime.fromisoformat('2028-01-01T00:00:00+09:00')
    assert not evaluate_rows(rows, policy, clock).completed
    rows[-1]['away_pk_score'] = '3'
    assert evaluate_rows(rows, policy, clock).completed


def test_actual_kickoff_datetimes_use_jst_across_the_year_boundary():
    rows = fixture_rows(1, '決勝戦')
    rows[0].update(match_date='2027/01/01', start_time='00:30')
    policy = CompletionPolicy(Path('unused.csv'), 1, ('決勝戦',))
    assert not evaluate_rows(rows, policy,
                             datetime.fromisoformat('2026-12-31T15:29:59+00:00')).completed
    assert evaluate_rows(rows, policy,
                         datetime.fromisoformat('2026-12-31T15:30:00+00:00')).completed
    assert evaluate_rows(rows, policy, datetime(2027, 1, 1, 0, 30)).completed


def write_config(tmp_path, source_path, **overrides):
    path = tmp_path / 'completion.yaml'
    path.write_text(yaml.safe_dump({'competitions': {'TestCup': {
        'csv_path': str(source_path), 'expected_matches': 1, 'final_rounds': ['決勝'],
        **overrides,
    }}}, allow_unicode=True), encoding='utf-8')
    return path


def write_csv(path, rows):
    with path.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(fixture_rows(1)[0]))
        writer.writeheader()
        writer.writerows(rows)


def test_config_paths_and_exact_final_labels(tmp_path):
    path = write_config(tmp_path, 'docs/csv/test.csv', final_rounds=[' 決勝 ', '決勝戦'])
    policy = load_policy('TestCup', path)
    assert policy.csv_path == REPO_ROOT / 'docs/csv/test.csv'
    assert policy.final_rounds == ('決勝', '決勝戦')
    assert load_policy('EmperorsCup').expected_matches == 87
    assert load_policy('JLeagueCup').expected_matches == 65


@pytest.mark.parametrize('overrides', [
    {'expected_matches': 0}, {'expected_matches': True}, {'expected_matches': 1.5},
    {'csv_path': ''}, {'final_rounds': []}, {'final_rounds': '決勝'},
    {'final_rounds': ['決勝', ' 決勝 ']}, {'unexpected': 1},
])
def test_invalid_policy_is_a_configuration_error(tmp_path, overrides):
    path = write_config(tmp_path, 'unused.csv', **overrides)
    with pytest.raises(ConfigurationError):
        load_policy('TestCup', path)
    assert main(['TestCup', '--config', str(path)]) == 2


def test_unknown_competition_and_unreadable_or_malformed_config_exit_two(tmp_path):
    path = write_config(tmp_path, 'unused.csv')
    assert main(['Unknown', '--config', str(path)]) == 2
    assert main(['TestCup', '--config', str(tmp_path / 'missing.yaml')]) == 2
    path.write_text('competitions: [\n', encoding='utf-8')
    assert main(['TestCup', '--config', str(path)]) == 2


@pytest.mark.parametrize('contents', [
    '', 'invalid,header\n1,2\n',
    'match_date,start_time,home_team,away_team,home_goal,away_goal,status,round\n"unterminated',
    'match_date,start_time,home_team,away_team,home_goal,away_goal,status,round\n1,2,3,4,5,6,7,8,extra\n',
    'match_date,start_time,home_team,away_team,home_goal,away_goal,status,round,round\n',
])
def test_bad_csv_remains_active_for_refetch_instead_of_becoming_checker_error(tmp_path, contents):
    csv_path = tmp_path / 'cup.csv'
    csv_path.write_text(contents, encoding='utf-8')
    path = write_config(tmp_path, csv_path)
    result = check_completion('TestCup', path)
    assert not result.completed
    assert main(['TestCup', '--config', str(path)]) == 1


def test_missing_csv_remains_active(tmp_path):
    path = write_config(tmp_path, tmp_path / 'missing.csv')
    assert not check_completion('TestCup', path).completed
    assert main(['TestCup', '--config', str(path)]) == 1


def test_cli_reports_completion_and_supports_aware_or_naive_clock(tmp_path, capsys):
    csv_path = tmp_path / 'cup.csv'
    write_csv(csv_path, fixture_rows(1))
    config = write_config(tmp_path, csv_path)
    args = ['TestCup', '--config', str(config)]
    assert main([*args, '--now', '2027-05-08T04:59:59+00:00']) == 1
    assert main([*args, '--now', '2027-05-08T05:00:00+00:00']) == 0
    assert main([*args, '--now', '2027-05-08T14:00:00']) == 0
    assert 'completed: all 1 matches finished' in capsys.readouterr().out
    assert main([*args, '--now', 'not-a-datetime']) == 2
