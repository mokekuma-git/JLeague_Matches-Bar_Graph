import { describe, test, expect } from 'vitest';
import type {
  SeasonMap, GroupEntry, CompetitionEntry, RawSeasonEntry,
} from '../../types/season';
import {
  getCsvFilename,
  findCompetition,
  resolveSeasonInfo,
} from '../../config/season-map';

// ---- Test fixtures --------------------------------------------------------

const sampleGroup: GroupEntry = {
  display_name: 'Jリーグ',
  css_files: ['team_style.css'],
  competitions: {
    J1: {
      league_display: 'J1リーグ',
      seasons: {
        '2025': [20, 3, 3, ['神戸', '広島']],
        '2024': [20, 3, 3, ['神戸', '横浜FM'], { rank_properties: { '3': 'promoted_playoff' } }],
        '2026East': [10, 1, 0, ['鹿島'], { group_display: 'EAST' }],
      },
    },
    J2: {
      league_display: 'J2リーグ',
      seasons: {
        '2026EastA': [10, 0, 0, [], { group_display: 'EAST-A', url_category: 'j2j3' }],
      },
    },
  },
};

const intlGroup: GroupEntry = {
  display_name: '国際大会',
  css_files: ['national_team_style.css'],
  competitions: {
    WC_GS: {
      league_display: 'FIFAワールドカップ グループステージ',
      team_rename_map: { 'オーストラリア': '豪州' },
      seasons: {
        '2022': [32, 0, 0, []],
      },
    },
    WC_AFC: {
      league_display: 'W杯アジア最終予選',
      seasons: { '2026': [6, 0, 0, []] },
    },
  },
};

const sampleMap: SeasonMap = {
  jleague: sampleGroup,
  international: intlGroup,
};

// ---- getCsvFilename -------------------------------------------------------

describe('getCsvFilename', () => {
  test('J-League competition includes J prefix from key', () => {
    expect(getCsvFilename('J1', '2025')).toBe('csv/2025_allmatch_result-J1.csv');
  });

  test('non-J-League competition uses key directly', () => {
    expect(getCsvFilename('WC_GS', '2022')).toBe('csv/2022_allmatch_result-WC_GS.csv');
  });

  test('youth competition', () => {
    expect(getCsvFilename('PrinceKanto', '2025')).toBe('csv/2025_allmatch_result-PrinceKanto.csv');
  });

  test('sub-season name', () => {
    expect(getCsvFilename('J1', '2026East')).toBe('csv/2026East_allmatch_result-J1.csv');
  });
});

// ---- findCompetition ------------------------------------------------------

describe('findCompetition', () => {
  test('finds J1 in jleague group', () => {
    const result = findCompetition(sampleMap, 'J1');
    expect(result).toBeDefined();
    expect(result!.groupKey).toBe('jleague');
    expect(result!.competition.league_display).toBe('J1リーグ');
  });

  test('finds WC_GS in international group', () => {
    const result = findCompetition(sampleMap, 'WC_GS');
    expect(result).toBeDefined();
    expect(result!.groupKey).toBe('international');
  });

  test('returns undefined for unknown competition', () => {
    expect(findCompetition(sampleMap, 'UNKNOWN')).toBeUndefined();
  });
});

// ---- resolveSeasonInfo ----------------------------------------------------

describe('resolveSeasonInfo', () => {
  test('basic J1 season without optional dict', () => {
    const entry: RawSeasonEntry = [20, 3, 3, ['神戸', '広島']];
    const info = resolveSeasonInfo(sampleGroup, sampleGroup.competitions.J1, entry);

    expect(info.teamCount).toBe(20);
    expect(info.promotionCount).toBe(3);
    expect(info.relegationCount).toBe(3);
    expect(info.teams).toEqual(['神戸', '広島']);
    expect(info.rankClass).toEqual({});
    expect(info.leagueDisplay).toBe('J1リーグ');
    expect(info.pointSystem).toBe('standard');
    expect(info.cssFiles).toEqual(['team_style.css']);
    expect(info.teamRenameMap).toEqual({});
    expect(info.groupDisplay).toBeUndefined();
    expect(info.seasonStartMonth).toBe(7);
  });

  test('season with rank_properties', () => {
    const entry: RawSeasonEntry = [20, 3, 3, [], { rank_properties: { '3': 'promoted_playoff' } }];
    const info = resolveSeasonInfo(sampleGroup, sampleGroup.competitions.J1, entry);

    expect(info.rankClass).toEqual({ '3': 'promoted_playoff' });
  });

  test('season with group_display and url_category', () => {
    const entry: RawSeasonEntry = [10, 0, 0, [], { group_display: 'EAST-A', url_category: 'j2j3' }];
    const info = resolveSeasonInfo(sampleGroup, sampleGroup.competitions.J2, entry);

    expect(info.groupDisplay).toBe('EAST-A');
    expect(info.urlCategory).toBe('j2j3');
    expect(info.leagueDisplay).toBe('J2リーグ');
  });

  test('cascade: league_display in season overrides competition', () => {
    const entry: RawSeasonEntry = [10, 0, 0, [], { league_display: 'Jリーグ 1993' }];
    const info = resolveSeasonInfo(sampleGroup, sampleGroup.competitions.J1, entry);

    expect(info.leagueDisplay).toBe('Jリーグ 1993');
  });

  test('cascade: point_system from season overrides default', () => {
    const entry: RawSeasonEntry = [10, 0, 0, [], { point_system: 'old-two-points' }];
    const info = resolveSeasonInfo(sampleGroup, sampleGroup.competitions.J1, entry);

    expect(info.pointSystem).toBe('old-two-points');
  });

  test('cascade: css_files union and deduplication', () => {
    const compWithCss: CompetitionEntry = {
      league_display: 'Test',
      css_files: ['team_style.css', 'extra.css'],
      seasons: {},
    };
    const groupWithCss: GroupEntry = {
      display_name: 'Test',
      css_files: ['team_style.css'],
      competitions: {},
    };
    const entry: RawSeasonEntry = [10, 0, 0, [], { css_files: ['season.css'] }];
    const info = resolveSeasonInfo(groupWithCss, compWithCss, entry);

    expect(info.cssFiles).toEqual(['team_style.css', 'extra.css', 'season.css']);
  });

  test('cascade: team_rename_map merge with season override', () => {
    const comp: CompetitionEntry = {
      league_display: 'WC GS',
      team_rename_map: { 'オーストラリア': '豪州', 'アメリカ': '米国' },
      seasons: {},
    };
    const entry: RawSeasonEntry = [32, 0, 0, [], { team_rename_map: { 'アメリカ': 'USA' } }];
    const info = resolveSeasonInfo(intlGroup, comp, entry);

    expect(info.teamRenameMap).toEqual({ 'オーストラリア': '豪州', 'アメリカ': 'USA' });
  });

  test('international group inherits national CSS', () => {
    const entry: RawSeasonEntry = [32, 0, 0, []];
    const info = resolveSeasonInfo(intlGroup, intlGroup.competitions.WC_GS, entry);

    expect(info.cssFiles).toEqual(['national_team_style.css']);
    expect(info.leagueDisplay).toBe('FIFAワールドカップ グループステージ');
    expect(info.teamRenameMap).toEqual({ 'オーストラリア': '豪州' });
  });

  test('fallback to group display_name when no league_display', () => {
    const comp: CompetitionEntry = { seasons: {} };
    const group: GroupEntry = { display_name: 'Test Group', competitions: {} };
    const entry: RawSeasonEntry = [10, 0, 0, []];
    const info = resolveSeasonInfo(group, comp, entry);

    expect(info.leagueDisplay).toBe('Test Group');
  });

  test('fallback to groupKey when no display_name and no league_display', () => {
    const comp: CompetitionEntry = { seasons: {} };
    const group: GroupEntry = { competitions: {} };
    const entry: RawSeasonEntry = [10, 0, 0, []];
    const info = resolveSeasonInfo(group, comp, entry, 'my_group');

    expect(info.leagueDisplay).toBe('my_group');
  });

  test('tiebreakOrder defaults to ["goal_diff", "goal_get"]', () => {
    const entry: RawSeasonEntry = [20, 3, 3, []];
    const info = resolveSeasonInfo(sampleGroup, sampleGroup.competitions.J1, entry);

    expect(info.tiebreakOrder).toEqual(['goal_diff', 'goal_get']);
  });

  test('cascade: tiebreak_order from competition level', () => {
    const comp: CompetitionEntry = {
      league_display: 'ACL GS',
      tiebreak_order: ['head_to_head', 'goal_diff', 'goal_get'],
      seasons: {},
    };
    const entry: RawSeasonEntry = [8, 0, 0, []];
    const info = resolveSeasonInfo(sampleGroup, comp, entry);

    expect(info.tiebreakOrder).toEqual(['head_to_head', 'goal_diff', 'goal_get']);
  });

  test('cascade: tiebreak_order from season overrides competition', () => {
    const comp: CompetitionEntry = {
      league_display: 'ACL GS',
      tiebreak_order: ['head_to_head', 'goal_diff', 'goal_get'],
      seasons: {},
    };
    const entry: RawSeasonEntry = [8, 0, 0, [], { tiebreak_order: ['goal_diff', 'wins'] }];
    const info = resolveSeasonInfo(sampleGroup, comp, entry);

    expect(info.tiebreakOrder).toEqual(['goal_diff', 'wins']);
  });

  test('seasonStartMonth defaults to 7 when not set anywhere', () => {
    const group: GroupEntry = { display_name: 'Test', competitions: {} };
    const comp: CompetitionEntry = { seasons: {} };
    const entry: RawSeasonEntry = [10, 0, 0, []];
    const info = resolveSeasonInfo(group, comp, entry);

    expect(info.seasonStartMonth).toBe(7);
  });

  test('cascade: season_start_month from group level', () => {
    const group: GroupEntry = {
      display_name: 'Jリーグ',
      season_start_month: 1,
      competitions: {},
    };
    const comp: CompetitionEntry = { seasons: {} };
    const entry: RawSeasonEntry = [20, 3, 3, []];
    const info = resolveSeasonInfo(group, comp, entry);

    expect(info.seasonStartMonth).toBe(1);
  });

  test('cascade: season_start_month from competition overrides group', () => {
    const group: GroupEntry = {
      display_name: 'Test',
      season_start_month: 1,
      competitions: {},
    };
    const comp: CompetitionEntry = { season_start_month: 8, seasons: {} };
    const entry: RawSeasonEntry = [10, 0, 0, []];
    const info = resolveSeasonInfo(group, comp, entry);

    expect(info.seasonStartMonth).toBe(8);
  });

  test('cascade: season_start_month from season overrides competition', () => {
    const comp: CompetitionEntry = { season_start_month: 1, seasons: {} };
    const entry: RawSeasonEntry = [10, 0, 0, [], { season_start_month: 7 }];
    const info = resolveSeasonInfo(sampleGroup, comp, entry);

    expect(info.seasonStartMonth).toBe(7);
  });
});
