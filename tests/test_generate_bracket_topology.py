"""Tests for the offline bracket topology generator (#307).

The generator carries the derivation that used to run in the browser: reading
"No.Xの勝者" feeder references while they last, and falling back to matching
real team names against computed winners once those references are overwritten.
Both paths must agree, because that is what lets a topology generated mid
tournament stay correct after the tournament finishes.
"""
import importlib.util
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = PROJECT_ROOT / 'scripts' / 'generate_bracket_topology.py'
# Frozen snapshots of the same tournament at two points in time, shared with the
# frontend tests so both sides assert against identical input.
FIXTURE_DIR = PROJECT_ROOT / 'frontend' / 'src' / '__tests__' / 'fixtures' / 'csv'
IN_PROGRESS_CSV = FIXTURE_DIR / '2026_wc_ko_snapshot.csv'
COMPLETE_CSV = FIXTURE_DIR / '2026_wc_ko_complete.csv'

MAIN_ROUNDS = ['ラウンド32', 'ラウンド16', '準々決勝', '準決勝', '決勝戦']
EXPECTED_TOPOLOGY = [
    [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
    [89, 90, 93, 94, 91, 92, 95, 96],
    [97, 98, 99, 100],
    [101, 102],
    [104],
]


def _load_module():
    spec = importlib.util.spec_from_file_location('generate_bracket_topology', SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope='module')
def gen():
    return _load_module()


def test_parses_winner_and_loser_references(gen):
    assert gen.parse_slot_reference('No.74の勝者') == (74, 'winner')
    assert gen.parse_slot_reference('No.101の敗者') == (101, 'loser')
    assert gen.parse_slot_reference('グループA2位') is None
    assert gen.parse_slot_reference('') is None


def test_derives_topology_from_feeder_references(gen):
    """In-progress CSV: references alone give the whole tree, no hints needed."""
    rows = gen.load_rows(IN_PROGRESS_CSV, MAIN_ROUNDS)
    topology, notes = gen.build_topology(rows)
    assert topology == EXPECTED_TOPOLOGY
    assert any('feeder references' in note for note in notes)


def test_derives_topology_from_winner_names_after_completion(gen):
    """Finished CSV: references are gone, so winners are matched by name."""
    rows = gen.load_rows(COMPLETE_CSV, MAIN_ROUNDS)
    assert not any('の勝者' in r['home_team'] for r in rows.values())
    topology, _ = gen.build_topology(rows, leaf_order=EXPECTED_TOPOLOGY[0])
    assert topology == EXPECTED_TOPOLOGY


def test_both_derivations_agree(gen):
    """The whole point: a topology pinned mid-tournament stays right afterwards."""
    from_references, _ = gen.build_topology(gen.load_rows(IN_PROGRESS_CSV, MAIN_ROUNDS))
    from_names, _ = gen.build_topology(
        gen.load_rows(COMPLETE_CSV, MAIN_ROUNDS), leaf_order=EXPECTED_TOPOLOGY[0])
    assert from_references == from_names


def test_reports_when_entry_order_cannot_be_known(gen):
    """A finished CSV without --leaf-order cannot place entry-round matches."""
    rows = gen.load_rows(COMPLETE_CSV, MAIN_ROUNDS)
    with pytest.raises(ValueError, match='--leaf-order'):
        gen.build_topology(rows)


def test_single_match_block_needs_no_ordering(gen):
    """A third-place playoff is one match, so its topology is just that match."""
    rows = gen.load_rows(COMPLETE_CSV, ['３位決定戦'])
    topology, _ = gen.build_topology(rows)
    assert topology == [[103]]


def test_rejects_leaf_order_that_does_not_cover_the_entry_round(gen):
    rows = gen.load_rows(COMPLETE_CSV, MAIN_ROUNDS)
    with pytest.raises(ValueError, match='does not cover the entry round'):
        gen.build_topology(rows, leaf_order=[74, 77])


def test_skips_a_section_that_is_not_a_round_of_this_tree(gen):
    """The third-place playoff sits between the semi-finals and the final.

    Its section must not be mistaken for a round of the main tree, or the final
    can never be reached.
    """
    rows = gen.load_rows(COMPLETE_CSV, MAIN_ROUNDS + ['３位決定戦'])
    topology, notes = gen.build_topology(rows, leaf_order=EXPECTED_TOPOLOGY[0])
    assert topology == EXPECTED_TOPOLOGY
    assert any('３位決定戦' in note and 'skipped' in note for note in notes)


def test_reports_a_tree_that_never_reaches_a_final(gen):
    """Dropping the final must fail loudly rather than return a partial tree."""
    rows = gen.load_rows(COMPLETE_CSV, ['ラウンド32', 'ラウンド16', '準々決勝'])
    with pytest.raises(ValueError, match='does not converge to a single final'):
        gen.build_topology(rows, leaf_order=EXPECTED_TOPOLOGY[0])
