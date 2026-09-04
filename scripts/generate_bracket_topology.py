"""Generate a bracket_topology block for season_map.yaml from a KO CSV.

Bracket topology (which match feeds which) is a competition rule fixed before
the draw. It used to be derived at runtime from the CSV's "No.Xの勝者" feeder
references, but those references are overwritten with real team names as
matches are played -- so a fully played tournament lost its topology entirely
(#307). This script moves that derivation offline: run it once, paste the
result into season_map.yaml, and the topology stops depending on mutable data.

Two derivation passes, matching what the runtime used to do:

1. Feeder references -- while a match is unplayed, its slots still read
   "No.74の勝者". Parent/child links come straight from that text.
2. Winner names -- once played, the reference is gone, so a match's real team
   names are matched against the computed winners of the round below.

Pass 2 alone cannot tell which entry-round match belongs to which bracket_order
pair (the entry round has no round below it). When the references are already
gone, pass --leaf-order with the entry-round match numbers in bracket position
order.

Usage:
    # All blocks of one season, reading round_filter/bracket_order from season_map
    uv run python scripts/generate_bracket_topology.py --competition WC_KO --season 2026

    # Supply the entry-round order when feeder references are gone
    uv run python scripts/generate_bracket_topology.py --competition WC_KO --season 2026 \
        --leaf-order 74,77,73,75,83,84,81,82,76,78,79,80,86,88,85,87

    # Standalone CSV, rounds given explicitly
    uv run python scripts/generate_bracket_topology.py --csv docs/csv/2026_allmatch_result-WC_KO.csv \
        --rounds ラウンド32 ラウンド16 準々決勝 準決勝 決勝戦
"""
import argparse
import csv
import re
import sys
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SEASON_MAP_PATH = PROJECT_ROOT / 'docs' / 'yaml' / 'season_map.yaml'
CSV_DIR = PROJECT_ROOT / 'docs' / 'csv'

SLOT_REFERENCE = re.compile(r'^No\.(\d+)の(勝者|敗者)$')


def parse_slot_reference(name):
    """Parse a feeder placeholder like "No.74の勝者" into (match_number, role)."""
    if not name:
        return None
    matched = SLOT_REFERENCE.match(name)
    if not matched:
        return None
    return int(matched.group(1)), ('winner' if matched.group(2) == '勝者' else 'loser')


def winner_of(row):
    """Winner team name of a played KO row, or None when undecided.

    Mirrors determineWinner() in bracket-reference-graph.ts: home_goal/away_goal
    already include extra time, and penalties break a draw.
    """
    home_goal, away_goal = row.get('home_goal', ''), row.get('away_goal', '')
    if home_goal == '' or away_goal == '':
        return None
    home_goal, away_goal = int(home_goal), int(away_goal)
    home_pk, away_pk = row.get('home_pk_score', ''), row.get('away_pk_score', '')
    if home_pk != '' and away_pk != '':
        return row['home_team'] if int(home_pk) > int(away_pk) else row['away_team']
    if home_goal != away_goal:
        return row['home_team'] if home_goal > away_goal else row['away_team']
    return None


def load_rows(csv_path, rounds=None):
    """Read KO rows indexed by match_number, optionally filtered to given rounds."""
    with open(csv_path, encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
    if rounds:
        allowed = set(rounds)
        rows = [r for r in rows if r.get('round') in allowed]
    indexed = {}
    for row in rows:
        number = row.get('match_number', '')
        if number == '':
            continue
        indexed[int(number)] = row
    return indexed


def rounds_in_order(indexed):
    """Group match numbers by section_no, entry round (most negative) first."""
    sections = {}
    for number, row in indexed.items():
        section = int(row['section_no'])
        sections.setdefault(section, []).append(number)
    return [sorted(sections[s]) for s in sorted(sections)]


def children_from_references(indexed):
    """Map parent match_number -> (child, child) for every winner-reference row."""
    children = {}
    for number, row in indexed.items():
        home = parse_slot_reference(row['home_team'])
        away = parse_slot_reference(row['away_team'])
        if home and away and home[1] == 'winner' and away[1] == 'winner':
            children[number] = (home[0], away[0])
    return children


def leaf_order_from_references(children):
    """Derive entry-round order from feeder references, or None if unavailable.

    Walks the winner-reference tree down from the root (the only internal match
    nobody references) so leaves come out in bracket position order.
    """
    if not children:
        return None
    referenced = {c for pair in children.values() for c in pair}
    roots = [n for n in children if n not in referenced]
    if len(roots) != 1:
        return None
    order = []

    def visit(number):
        pair = children.get(number)
        if pair is None:
            order.append(number)
            return
        visit(pair[0])
        visit(pair[1])

    visit(roots[0])
    return order


def build_topology(indexed, leaf_order=None):
    """Build the per-round match_number lists for one bracket block.

    Returns (topology, notes). Raises ValueError when a round cannot be linked.
    """
    levels = rounds_in_order(indexed)
    if not levels:
        raise ValueError('no rows with a match_number')
    notes = []
    children = children_from_references(indexed)
    parent_by_pair = {tuple(sorted(pair)): parent for parent, pair in children.items()}

    if leaf_order is None:
        leaf_order = leaf_order_from_references(children)
        if leaf_order is not None:
            notes.append('entry round derived from feeder references')
    else:
        notes.append('entry round taken from --leaf-order')

    if leaf_order is None:
        if len(levels) == 1 and len(levels[0]) == 1:
            # Single-match block (e.g. a third-place playoff) needs no ordering.
            return [levels[0]], ['single match block']
        raise ValueError(
            'entry round order is unknown: no feeder references remain. '
            'Re-run with --leaf-order giving the entry-round match numbers '
            'in bracket position order.')

    if sorted(leaf_order) != levels[0]:
        raise ValueError(
            f'entry round order {leaf_order} does not cover the entry round '
            f'{levels[0]}')

    topology = [list(leaf_order)]
    current = list(leaf_order)
    for level in levels[1:]:
        if len(current) == 1:
            break
        parents, remaining, error = link_round(indexed, parent_by_pair, current, level)
        if error is not None:
            # A section that cannot supply a parent for every pair is not a
            # round of this tree -- a third-place playoff sits between the
            # semi-finals and the final, for instance.
            notes.append(
                f'round {indexed[level[0]]["round"]}: skipped, not a round of '
                f'this tree ({error})')
            continue
        if remaining:
            notes.append(
                f'round {indexed[level[0]]["round"]}: {remaining} not part of this '
                'tree (likely a separate block such as a third-place playoff)')
        topology.append(parents)
        current = parents
    if len(current) != 1:
        raise ValueError(
            f'the tree does not converge to a single final: {current} remain. '
            'Check that every round of this block is present in the CSV.')
    return topology, notes


def link_round(indexed, parent_by_pair, current, level):
    """Link one round to the round below it.

    Returns (parents, unused_match_numbers, error). error is a message when this
    round cannot supply a parent for every pair, in which case parents is None.
    """
    remaining = list(level)
    parents = []
    for i in range(0, len(current), 2):
        pair = (current[i], current[i + 1])
        # Pass 1: the parent still carries "No.Xの勝者" for both slots.
        parent = parent_by_pair.get(tuple(sorted(pair)))
        if parent is not None and parent in remaining:
            parents.append(parent)
            remaining.remove(parent)
            continue
        # Pass 2: the reference is gone, so match real names against winners.
        winners = {winner_of(indexed[pair[0]]), winner_of(indexed[pair[1]])}
        if None in winners:
            return None, remaining, (
                f'matches {pair[0]} and {pair[1]} carry no feeder reference and '
                'are not both played')
        hits = [
            n for n in remaining
            if {indexed[n]['home_team'], indexed[n]['away_team']} == winners
        ]
        if len(hits) != 1:
            return None, remaining, (
                f'winners {sorted(winners)} of matches {pair[0]}/{pair[1]} '
                f'matched {len(hits)} rows')
        parents.append(hits[0])
        remaining.remove(hits[0])
    return parents, remaining, None


def resolve_block_rows(indexed, block):
    """Filter indexed rows to one bracket block using its round_filter."""
    rounds = block.get('round_filter')
    if not rounds:
        return indexed
    allowed = set(rounds)
    return {n: r for n, r in indexed.items() if r.get('round') in allowed}


def find_season(season_map, competition, season):
    """Locate a season entry and its CSV stem across all competition families."""
    for family_key, family in season_map.items():
        if not isinstance(family, dict):
            continue
        competitions = family.get('competitions', {})
        if competition in competitions:
            seasons = competitions[competition].get('seasons', {})
            if season in seasons:
                return seasons[season]
    raise SystemExit(f'competition/season not found in season_map: {competition}/{season}')


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--competition', help='competition key in season_map (e.g. WC_KO)')
    parser.add_argument('--season', help='season key in season_map (e.g. 2026)')
    parser.add_argument('--csv', help='KO CSV path (default: derived from competition/season)')
    parser.add_argument('--rounds', nargs='+',
                        help='round names to include (standalone mode)')
    parser.add_argument('--leaf-order',
                        help='comma separated entry-round match numbers in bracket '
                             'position order, used when feeder references are gone')
    args = parser.parse_args()

    leaf_order = None
    if args.leaf_order:
        leaf_order = [int(n) for n in args.leaf_order.split(',')]

    if args.csv:
        csv_path = Path(args.csv)
    elif args.competition and args.season:
        csv_path = CSV_DIR / f'{args.season}_allmatch_result-{args.competition}.csv'
    else:
        parser.error('give either --csv or both --competition and --season')

    if not csv_path.exists():
        raise SystemExit(f'CSV not found: {csv_path}')

    indexed = load_rows(csv_path, args.rounds)
    if not indexed:
        raise SystemExit(f'no rows with a match_number in {csv_path}')

    blocks = None
    if args.competition and args.season and not args.rounds:
        season_map = yaml.safe_load(SEASON_MAP_PATH.read_text(encoding='utf-8'))
        entry = find_season(season_map, args.competition, args.season)
        blocks = entry.get('bracket_blocks')

    if not blocks:
        blocks = [{'label': csv_path.stem}]

    print(f'# generated from {csv_path.name}')
    failures = 0
    for index, block in enumerate(blocks):
        label = block.get('label', f'block {index}')
        block_rows = resolve_block_rows(indexed, block)
        if not block_rows:
            print(f'# {label}: no matching rows, skipped')
            continue
        # Only the entry round of the main tree needs an explicit order.
        block_leaf_order = leaf_order if index == 0 else None
        try:
            topology, notes = build_topology(block_rows, block_leaf_order)
        except ValueError as error:
            failures += 1
            print(f'# {label}: FAILED -- {error}', file=sys.stderr)
            continue
        order = block.get('bracket_order')
        if order and len(topology[0]) != len(order) // 2:
            failures += 1
            print(f'# {label}: FAILED -- entry round has {len(topology[0])} matches '
                  f'but bracket_order has {len(order)} slots', file=sys.stderr)
            continue
        for note in notes:
            print(f'#   note: {note}')
        print(f'# --- {label} ---')
        print(yaml.dump({'bracket_topology': topology},
                        default_flow_style=None, sort_keys=False, allow_unicode=True))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
