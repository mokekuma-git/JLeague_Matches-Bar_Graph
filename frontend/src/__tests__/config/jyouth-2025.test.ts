import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import Papa from 'papaparse';
import { resolveLeagueSeasonInfo } from '../../config/season-map';
import { parseCsvResults } from '../../core/csv-parser';
import { prepareRenderData } from '../../core/prepare-render';
import { buildBracket } from '../../bracket/bracket-data';
import type { RawMatchRow } from '../../types/match';
import type { SeasonMap } from '../../types/season';

const seasonMap = yaml.load(readFileSync(
  new URL('../../../../docs/yaml/season_map.yaml', import.meta.url), 'utf8',
)) as SeasonMap;
const family = seasonMap.jyouth;

function loadRows(competition: string) {
  return Papa.parse<RawMatchRow>(readFileSync(
    new URL(`../../../../docs/csv/2025_allmatch_result-${competition}.csv`, import.meta.url), 'utf8',
  ), { header: true, skipEmptyLines: true });
}

// Official standings as published at the end of the knockout round (2025/11/16).
// https://www.jleague.jp/jyouth/2025/standings/{1st,2nd}_round.html
// The December 7 postponed lower-league match is not yet included in that table.
const officialFirst = [
  ['秋田', '山形', '岩手', '八戸'], ['仙台', '福島', '新潟', '塩釜'],
  ['柏', '鹿島', '水戸', 'いわき'], ['千葉', '町田', '札幌', 'YS横浜'],
  ['横浜FM', '横浜FC', '相模原', '琉球'], ['浦和', '養和', '甲府', '栃木SC'],
  ['東京Ｖ', '大宮', 'ＳＯＬ', '群馬'], ['川崎Ｆ', '湘南', 'FC東京', '栃木Ｃ'],
  ['金沢', '松本', '長野', '富山'], ['磐田', '清水', '沼津', '藤枝'],
  ['Ｇ大阪', '名古屋', 'Ｃ大阪', '岐阜'], ['京都', '奈良', '神戸', 'FC大阪'],
  ['岡山', '鳥取', '徳島', '讃岐'], ['広島', '愛媛', '山口', '今治'],
  ['鳥栖', '長崎', '大分', '北九州'], ['鹿児島', '熊本', '福岡', '宮崎'],
];
const officialSecond = [
  ['鹿島', '柏', '山形', '秋田'], ['仙台', '町田', '千葉', '福島'],
  ['浦和', '横浜FM', '横浜FC', '養和'], ['東京Ｖ', '大宮', '松本', '金沢'],
  ['川崎Ｆ', '湘南', '磐田', '清水'], ['奈良', '京都', 'Ｇ大阪', '名古屋'],
  ['鳥栖', '鳥取', '岡山', '長崎'], ['広島', '熊本', '鹿児島', '愛媛'],
  ['岩手', '塩釜', '新潟', '八戸'], ['札幌', '水戸', 'いわき', 'YS横浜'],
  ['相模原', '栃木SC', '甲府', '琉球'], ['ＳＯＬ', '長野', '群馬', '富山'],
  ['栃木Ｃ', '沼津', 'FC東京', '藤枝'], ['Ｃ大阪', '神戸', '岐阜', 'FC大阪'],
  ['讃岐', '今治', '徳島', '山口'], ['北九州', '大分', '福岡', '宮崎'],
];

function prepareStage(competitionKey: string, targetDate = '2025/11/16') {
  const comp = family.competitions[competitionKey];
  const info = resolveLeagueSeasonInfo(family, comp, comp.seasons['2025']);
  const csv = loadRows(competitionKey);
  const teamMap = parseCsvResults(csv.data, csv.meta.fields!, []);
  const groups = Object.fromEntries(Object.entries(teamMap).map(([key, groupData]) => [
    key, prepareRenderData({
      groupData, seasonInfo: info, targetDate, sortKey: 'disp_point', matchSortKey: 'section_no',
    }),
  ]));
  return { csv, info, groups };
}

describe('2025 J Youth Cup official data', () => {
  test.each([
    ['JYouthCup_1st', officialFirst, 96],
    ['JYouthCup_2nd', officialSecond, 64],
  ] as const)('%s matches all sixteen official group tables', (competition, expected, count) => {
    const { csv, info, groups } = prepareStage(competition);
    expect(csv.data).toHaveLength(count);
    expect(info.shownGroups).toHaveLength(16);
    for (const [index, key] of info.shownGroups!.entries()) {
      expect(groups[key].sortedTeams, `Group ${key}`).toEqual(expected[index]);
    }
  });

  test('the 2nd round counts two games only and uses 1st-round form for the complete tie', () => {
    const { groups, info } = prepareStage('JYouthCup_2nd', '2025/12/31');
    const tied = groups['14'];
    expect(tied.sortedTeams).toEqual(['Ｃ大阪', '神戸', '岐阜', 'FC大阪']);
    for (const name of ['Ｃ大阪', '神戸']) {
      expect(tied.groupData[name].latestStats.point).toBe(3);
      expect(tied.groupData[name].latestStats.goal_diff).toBe(1);
      expect(tied.groupData[name].latestStats.goal_get).toBe(4);
      expect(tied.groupData[name].df).toHaveLength(2);
    }
    for (const key of info.shownGroups!) {
      expect(info.groupPromotionCount?.[key] ?? info.promotionCount)
        .toBe(Number(key) <= 8 ? 1 : 0);
    }
    // SFMS01 includes the postponed 2025/12/07 result omitted from the old table.
    expect(groups['16'].sortedTeams).toEqual(['大分', '北九州', '福岡', '宮崎']);
    expect(groups['16'].groupData.大分.latestStats.goal_diff).toBe(11);
  });

  test('the fallback order follows 1st-round statistics for every possible same-group pair', () => {
    const first = prepareStage('JYouthCup_1st');
    const second = prepareStage('JYouthCup_2nd');
    const prior = Object.assign({}, ...Object.values(first.groups).map(group => group.groupData));
    const order = second.info.tiebreakTeamOrder!;
    expect(new Set(order).size).toBe(64);
    for (const group of Object.values(second.groups)) {
      for (const a of group.sortedTeams) {
        for (const b of group.sortedTeams) {
          if (a === b) continue;
          const statsA = prior[a].latestStats;
          const statsB = prior[b].latestStats;
          const difference = statsB.point - statsA.point
            || statsB.goal_diff - statsA.goal_diff || statsB.goal_get - statsA.goal_get;
          expect(Math.sign(order.indexOf(a) - order.indexOf(b))).toBe(Math.sign(difference));
        }
      }
    }
  });

  test('the official knockout draw reaches Kashima with all seven results connected', () => {
    const csv = loadRows('JYouthCup_KO');
    const entry = family.competitions.JYouthCup_KO.seasons['2025'];
    expect(csv.data).toHaveLength(7);
    const root = buildBracket(csv.data, entry.bracket_blocks![0].bracket_order!);
    expect(root.winner).toBe('鹿島');
    expect(root.homePkScore).toBe(17);
    expect(root.awayPkScore).toBe(18);
    expect(root.children.map(child => child?.winner)).toEqual(['広島', '鹿島']);
    expect(root.children.flatMap(child => child!.children.map(quarter => quarter?.winner)))
      .toEqual(['仙台', '広島', '鳥栖', '鹿島']);
  });
});
