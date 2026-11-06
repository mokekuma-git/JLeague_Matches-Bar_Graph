import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import yaml from 'js-yaml';
import Papa from 'papaparse';
import { buildBracket } from '../../bracket/bracket-data';
import { __testables } from '../../bracket-view';
import type { BracketNode } from '../../bracket/bracket-types';
import type { RawMatchRow } from '../../types/match';
import type { SeasonMap } from '../../types/season';

const seasonMap = yaml.load(readFileSync(
  new URL('../../../../docs/yaml/season_map.yaml', import.meta.url), 'utf8',
)) as SeasonMap;

// Official outcomes, independently checked against SFMS01 results and the
// league's published promotion/relegation records (historical_playoffs.md).
const outcomes: [string, string, string[]][] = [
  ['J1PO', '1998', ['福岡', '市原', '神戸', '福岡']],
  ['J1PO', '2004', ['柏']], ['J1PO', '2005', ['甲府']],
  ['J1PO', '2006', ['神戸']], ['J1PO', '2007', ['京都']], ['J1PO', '2008', ['磐田']],
  ['J1PO', '2012', ['大分']], ['J1PO', '2013', ['徳島']], ['J1PO', '2014', ['山形']],
  ['J1PO', '2015', ['福岡']], ['J1PO', '2016', ['Ｃ大阪']], ['J1PO', '2017', ['名古屋']],
  ['J1PO', '2018', ['磐田']], ['J1PO', '2019', ['湘南']], ['J1PO', '2022', ['京都']],
  ['J1PO', '2023', ['東京Ｖ']], ['J1PO', '2024', ['岡山']], ['J1PO', '2025', ['千葉']],
  ['J2PO', '2013', ['讃岐']], ['J2PO', '2014', ['讃岐']], ['J2PO', '2015', ['町田']],
  ['J2PO', '2016', ['金沢']], ['J2PO', '2024', ['富山']], ['J2PO', '2025', ['宮崎']],
  ['J3PO', '2024', ['高知']], ['J3PO', '2025', ['滋賀']],
];

function nodes(root: BracketNode): BracketNode[] {
  return [root, ...root.children.flatMap(child => child ? nodes(child) : [])];
}

describe('historical J.League promotion/relegation playoffs', () => {
  test.each(outcomes)('%s %s preserves every fixture and the official winner(s)', (key, year, winners) => {
    const competition = seasonMap.jleague.competitions[key];
    const entry = competition.seasons[year];
    const rows = Papa.parse<RawMatchRow>(readFileSync(new URL(
      `../../../../docs/csv/${year}_allmatch_result-${key}.csv`, import.meta.url,
    ), 'utf8'), { header: true, skipEmptyLines: 'greedy' }).data;
    const represented = new Set<string>();
    const roots = (entry.bracket_blocks ?? []).flatMap(block => {
      const selected = block.round_filter
        ? __testables.filterRowsByRounds(rows, block.round_filter) : rows;
      const order = block.bracket_order!;
      const orders = block.matchup_pairs
        ? Array.from({ length: order.length / 2 }, (_, i) => order.slice(i * 2, i * 2 + 2))
        : [order];
      return orders.map(teams => buildBracket(selected, teams,
        entry.aggregate_tiebreak_order ?? competition.aggregate_tiebreak_order));
    });
    expect(roots.map(root => root.winner)).toEqual(winners);
    for (const node of roots.flatMap(nodes)) {
      if (node.legs) {
        for (const leg of node.legs) {
          const original = rows.find(row => row.match_date === leg.matchDate
            && row.home_team === leg.homeTeam && row.away_team === leg.awayTeam)!;
          expect(original).toBeTruthy();
          expect(leg.homeGoal).toBe(Number(original.home_goal));
          expect(leg.awayGoal).toBe(Number(original.away_goal));
          represented.add(original.match_number!);
        }
      } else if (node.matchNumber != null) {
        const original = rows.find(row => Number(row.match_number) === node.matchNumber)!;
        expect(original).toBeTruthy();
        const same = node.homeTeam === original.home_team;
        expect(node.homeGoal).toBe(Number(same ? original.home_goal : original.away_goal));
        expect(node.awayGoal).toBe(Number(same ? original.away_goal : original.home_goal));
        represented.add(original.match_number!);
      }
    }
    expect([...represented].sort()).toEqual(rows.map(row => row.match_number!).sort());
    expect(roots.flatMap(nodes).filter(node => node.matchNumber != null || node.legs)
      .every(node => node.winner != null)).toBe(true);
  });
});
