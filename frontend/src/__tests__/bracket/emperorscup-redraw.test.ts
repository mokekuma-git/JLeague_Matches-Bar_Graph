import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import yaml from 'js-yaml';
import Papa from 'papaparse';
import { __testables } from '../../bracket-view';
import { buildBracket } from '../../bracket/bracket-data';
import type { BracketNode } from '../../bracket/bracket-types';
import type { RawMatchRow } from '../../types/match';
import type { BracketBlock, SeasonMap } from '../../types/season';

const seasonMap = yaml.load(readFileSync(
  new URL('../../../../docs/yaml/season_map.yaml', import.meta.url), 'utf8',
)) as SeasonMap;
const entry = seasonMap.jleague.competitions.EmperorsCup.seasons['2026'];
const rows = Papa.parse<RawMatchRow>(readFileSync(
  new URL('../../../../docs/csv/2026_allmatch_result-EmperorsCup.csv', import.meta.url), 'utf8',
), { header: true, skipEmptyLines: 'greedy' }).data;

function buildBlock(block: BracketBlock): BracketNode {
  return buildBracket(
    __testables.filterRowsByRounds(rows, block.round_filter ?? []),
    block.bracket_order ?? [],
    undefined,
    undefined,
    block.bracket_topology,
    block.topology_source,
  );
}

function collectMatches(node: BracketNode): BracketNode[] {
  return [
    ...(node.matchNumber != null ? [node] : []),
    ...node.children.flatMap(child => child ? collectMatches(child) : []),
  ];
}

describe('EmperorsCup 2026 redraw', () => {
  test('uses independent early-round sections and a separate round-of-16 draw', () => {
    // A single inferred tree cannot represent the new draw: collapsing its
    // unresolved upper levels used to replace the visible results with nulls.
    expect(entry.bracket_round_start).toBe('__multi_section__');
    expect(entry.round_start_options).toEqual(['__multi_section__']);
    const blocks = entry.bracket_blocks ?? [];
    expect(blocks).toHaveLength(17);
    expect(__testables.resolveMainBlockOrder(blocks)).toBeUndefined();

    const later = blocks.filter(block => block.round_filter?.includes('ラウンド16'));
    expect(later).toHaveLength(1);
    expect(later[0].bracket_order).toHaveLength(16);
    const final = buildBlock(later[0]);
    expect(final.matchNumber).toBe(87);
    expect(collectMatches(final).map(node => node.matchNumber).sort((a, b) => a! - b!))
      .toEqual(Array.from({ length: 15 }, (_, index) => index + 73));

    const early = blocks.filter(block => !block.round_filter?.includes('ラウンド16'));
    for (const block of early) {
      const root = buildBlock(block);
      expect(root.round).toBe('３回戦');
      expect(root.winner).toBeTruthy();
      expect(collectMatches(root).every(node => node.matchNumber! <= 72)).toBe(true);
    }
  });

  test('preserves every match and its scores across the independent sections', () => {
    const matches = (entry.bracket_blocks ?? []).flatMap(block => collectMatches(buildBlock(block)));
    const numbers = matches.map(node => node.matchNumber!).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 87 }, (_, index) => index + 1));

    const rowsByNumber = new Map(rows.map(row => [Number(row.match_number), row]));
    for (const node of matches) {
      const row = rowsByNumber.get(node.matchNumber!)!;
      expect([node.homeTeam, node.awayTeam].sort()).toEqual([row.home_team, row.away_team].sort());
      expect(node.matchDate).toBe(row.match_date);
      if (row.home_goal && row.away_goal) {
        const isSameOrientation = node.homeTeam === row.home_team;
        expect(node.homeGoal).toBe(Number(isSameOrientation ? row.home_goal : row.away_goal));
        expect(node.awayGoal).toBe(Number(isSameOrientation ? row.away_goal : row.home_goal));
        expect(node.winner).toBeTruthy();
      }
    }
  });
});
