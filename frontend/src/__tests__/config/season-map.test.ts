import { describe, test, expect } from 'vitest';
import type {
  SeasonMap, CompetitionFamilyEntry, CompetitionEntry, RawSeasonEntry,
} from '../../types/season';
import {
  getCsvFilename,
  findCompetition,
  resolveSeasonInfo,
} from '../../config/season-map';

// ---- Test fixtures --------------------------------------------------------

const sampleFamily: CompetitionFamilyEntry = {
  display_name: 'Jリーグ',
  css_files: ['team_style.css'],
  competitions: {
    J1: {
      league_display: 'J1リーグ',
      seasons: {
        '2025': { team_count: 20, promotion_count: 3, relegation_count: 3, teams: ['神戸', '広島'] },
        '2024': { team_count: 20, promotion_count: 3, relegation_count: 3, teams: ['神戸', '横浜FM'], rank_properties: { '3': 'promoted_playoff' } },
        '2026East': { team_count: 10, promotion_count: 1, relegation_count: 0, teams: ['鹿島'], group_display: 'EAST' },
      },
    },
    J2: {
      league_display: 'J2リーグ',
      seasons: {
        '2026EastA': { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [], group_display: 'EAST-A', url_category: 'j2j3' },
      },
    },
  },
};

const nationalFamily: CompetitionFamilyEntry = {
  display_name: '国際大会',
  css_files: ['national_team_style.css'],
  competitions: {
    WC_GS: {
      league_display: 'FIFAワールドカップ グループステージ',
      team_rename_map: { 'オーストラリア': '豪州' },
      seasons: {
        '2022': { team_count: 32, promotion_count: 0, relegation_count: 0, teams: [] },
      },
    },
    WC_AFC: {
      league_display: 'W杯アジア最終予選',
      seasons: { '2026': { team_count: 6, promotion_count: 0, relegation_count: 0, teams: [] } },
    },
  },
};

const sampleMap: SeasonMap = {
  jleague: sampleFamily,
  national: nationalFamily,
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
  test('finds J1 in jleague family', () => {
    const result = findCompetition(sampleMap, 'J1');
    expect(result).toBeDefined();
    expect(result!.familyKey).toBe('jleague');
    expect(result!.competition.league_display).toBe('J1リーグ');
  });

  test('finds WC_GS in national family', () => {
    const result = findCompetition(sampleMap, 'WC_GS');
    expect(result).toBeDefined();
    expect(result!.familyKey).toBe('national');
  });

  test('returns undefined for unknown competition', () => {
    expect(findCompetition(sampleMap, 'UNKNOWN')).toBeUndefined();
  });
});

// ---- resolveSeasonInfo ----------------------------------------------------

describe('resolveSeasonInfo', () => {
  test('basic J1 season without extra options', () => {
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: ['神戸', '広島'] };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J1, entry);

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

  test('team_count falls back to teams.length when omitted at season and competition levels', () => {
    const family: CompetitionFamilyEntry = { display_name: 'Test', competitions: {} };
    const comp: CompetitionEntry = { seasons: {} };
    const entry: RawSeasonEntry = {
      promotion_count: 0,
      relegation_count: 0,
      teams: ['A', 'B', 'C', 'D'],
    };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.teamCount).toBe(4);
  });

  test('season with rank_properties', () => {
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: [], rank_properties: { '3': 'promoted_playoff' } };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J1, entry);

    expect(info.rankClass).toEqual({ '3': 'promoted_playoff' });
  });

  test('season with group_display and url_category', () => {
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [], group_display: 'EAST-A', url_category: 'j2j3' };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J2, entry);

    expect(info.groupDisplay).toBe('EAST-A');
    expect(info.urlCategory).toBe('j2j3');
    expect(info.leagueDisplay).toBe('J2リーグ');
  });

  test('cascade: league_display in season overrides competition', () => {
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [], league_display: 'Jリーグ 1993' };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J1, entry);

    expect(info.leagueDisplay).toBe('Jリーグ 1993');
  });

  test('cascade: point_system from season overrides default', () => {
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [], point_system: 'victory-count' };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J1, entry);

    expect(info.pointSystem).toBe('victory-count');
  });

  test('cascade: css_files union and deduplication', () => {
    const compWithCss: CompetitionEntry = {
      league_display: 'Test',
      css_files: ['team_style.css', 'extra.css'],
      seasons: {},
    };
    const familyWithCss: CompetitionFamilyEntry = {
      display_name: 'Test',
      css_files: ['team_style.css'],
      competitions: {},
    };
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [], css_files: ['season.css'] };
    const info = resolveSeasonInfo(familyWithCss, compWithCss, entry);

    expect(info.cssFiles).toEqual(['team_style.css', 'extra.css', 'season.css']);
  });

  test('cascade: team_rename_map merge with season override', () => {
    const comp: CompetitionEntry = {
      league_display: 'WC GS',
      team_rename_map: { 'オーストラリア': '豪州', 'アメリカ': '米国' },
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 32, promotion_count: 0, relegation_count: 0, teams: [], team_rename_map: { 'アメリカ': 'USA' } };
    const info = resolveSeasonInfo(nationalFamily, comp, entry);

    expect(info.teamRenameMap).toEqual({ 'オーストラリア': '豪州', 'アメリカ': 'USA' });
  });

  test('cascade: team_rename_map does not inherit family-level entries', () => {
    const family: CompetitionFamilyEntry = {
      display_name: '国際大会',
      team_rename_map: { 'イングランド': 'ENG' },
      competitions: {},
    };
    const comp: CompetitionEntry = {
      league_display: 'WC GS',
      team_rename_map: { 'オーストラリア': '豪州' },
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 32, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.teamRenameMap).toEqual({ 'オーストラリア': '豪州' });
  });

  test('national family inherits national CSS', () => {
    const entry: RawSeasonEntry = { team_count: 32, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(nationalFamily, nationalFamily.competitions.WC_GS, entry);

    expect(info.cssFiles).toEqual(['national_team_style.css']);
    expect(info.leagueDisplay).toBe('FIFAワールドカップ グループステージ');
    expect(info.teamRenameMap).toEqual({ 'オーストラリア': '豪州' });
  });

  test('fallback to family display_name when no league_display', () => {
    const comp: CompetitionEntry = { seasons: {} };
    const family: CompetitionFamilyEntry = { display_name: 'Test Group', competitions: {} };
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.leagueDisplay).toBe('Test Group');
  });

  test('fallback to familyKey when no display_name and no league_display', () => {
    const comp: CompetitionEntry = { seasons: {} };
    const family: CompetitionFamilyEntry = { competitions: {} };
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(family, comp, entry, 'my_family');

    expect(info.leagueDisplay).toBe('my_family');
  });

  test('tiebreakOrder defaults to ["goal_diff", "goal_get"]', () => {
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: [] };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J1, entry);

    expect(info.tiebreakOrder).toEqual(['goal_diff', 'goal_get']);
  });

  test('cascade: tiebreak_order from competition level', () => {
    const comp: CompetitionEntry = {
      league_display: 'ACL GS',
      tiebreak_order: ['head_to_head', 'goal_diff', 'goal_get'],
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 8, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.tiebreakOrder).toEqual(['head_to_head', 'goal_diff', 'goal_get']);
  });

  test('cascade: tiebreak_order from season overrides competition', () => {
    const comp: CompetitionEntry = {
      league_display: 'ACL GS',
      tiebreak_order: ['head_to_head', 'goal_diff', 'goal_get'],
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 8, promotion_count: 0, relegation_count: 0, teams: [], tiebreak_order: ['goal_diff', 'wins'] };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.tiebreakOrder).toEqual(['goal_diff', 'wins']);
  });

  test('seasonStartMonth defaults to 7 when not set anywhere', () => {
    const family: CompetitionFamilyEntry = { display_name: 'Test', competitions: {} };
    const comp: CompetitionEntry = { seasons: {} };
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.seasonStartMonth).toBe(7);
  });

  test('cascade: season_start_month from family level', () => {
    const family: CompetitionFamilyEntry = {
      display_name: 'Jリーグ',
      season_start_month: 1,
      competitions: {},
    };
    const comp: CompetitionEntry = { seasons: {} };
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: [] };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.seasonStartMonth).toBe(1);
  });

  test('cascade: season_start_month from competition overrides family', () => {
    const family: CompetitionFamilyEntry = {
      display_name: 'Test',
      season_start_month: 1,
      competitions: {},
    };
    const comp: CompetitionEntry = { season_start_month: 8, seasons: {} };
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.seasonStartMonth).toBe(8);
  });

  test('cascade: season_start_month from season overrides competition', () => {
    const comp: CompetitionEntry = { season_start_month: 1, seasons: {} };
    const entry: RawSeasonEntry = { team_count: 10, promotion_count: 0, relegation_count: 0, teams: [], season_start_month: 7 };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.seasonStartMonth).toBe(7);
  });

  test('shownGroups undefined when not set at any level', () => {
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: [] };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J1, entry);

    expect(info.shownGroups).toBeUndefined();
  });

  test('cascade: shown_groups from competition level', () => {
    const comp: CompetitionEntry = {
      league_display: 'Olympic GS',
      shown_groups: ['A', 'B'],
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 16, promotion_count: 0, relegation_count: 0, teams: [] };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.shownGroups).toEqual(['A', 'B']);
  });

  test('cascade: shown_groups from season overrides competition', () => {
    const comp: CompetitionEntry = {
      league_display: 'WC AFC',
      shown_groups: ['A', 'B'],
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 6, promotion_count: 0, relegation_count: 0, teams: [], shown_groups: ['C'] };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.shownGroups).toEqual(['C']);
  });

  test('cascade: group_team_count merges competition and season only', () => {
    const family: CompetitionFamilyEntry = {
      display_name: 'Test',
      group_team_count: { A: 5 },
      competitions: {},
    };
    const comp: CompetitionEntry = {
      seasons: {},
      group_team_count: { B: 4, C: 4 },
    };
    const entry: RawSeasonEntry = { team_count: 16, promotion_count: 0, relegation_count: 0, teams: [], group_team_count: { C: 3, D: 4 } };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.groupTeamCount).toEqual({ B: 4, C: 3, D: 4 });
  });

  test('group_team_count scalar form expands using shown_groups', () => {
    const comp: CompetitionEntry = {
      shown_groups: ['A', 'B'],
      seasons: {},
    };
    const entry: RawSeasonEntry = {
      team_count: 16,
      promotion_count: 0,
      relegation_count: 0,
      teams: [],
      group_team_count: 4,
    };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.groupTeamCount).toEqual({ A: 4, B: 4 });
  });

  test('group_team_count scalar form can be overridden by season dict entries', () => {
    const comp: CompetitionEntry = {
      shown_groups: ['A', 'B'],
      group_team_count: 4,
      seasons: {},
    };
    const entry: RawSeasonEntry = {
      team_count: 16,
      promotion_count: 0,
      relegation_count: 0,
      teams: [],
      group_team_count: { B: 3 },
    };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.groupTeamCount).toEqual({ A: 4, B: 3 });
  });

  test('group_team_count scalar form throws without shown_groups', () => {
    const comp: CompetitionEntry = { seasons: {} };
    const entry: RawSeasonEntry = {
      team_count: 16,
      promotion_count: 0,
      relegation_count: 0,
      teams: [],
      group_team_count: 4,
    };

    expect(() => resolveSeasonInfo(sampleFamily, comp, entry)).toThrow(
      'group_team_count scalar form requires index keys to expand',
    );
  });

  test('cascade: notes append family, competition, season, and generated rule notes', () => {
    const family: CompetitionFamilyEntry = {
      display_name: 'Test',
      note: 'family note',
      aggregate_tiebreak_order: ['away_goals'],
      competitions: {},
    };
    const comp: CompetitionEntry = {
      seasons: {},
      note: ['competition note'],
      point_system: 'victory-count',
    };
    const entry: RawSeasonEntry = { team_count: 4, promotion_count: 0, relegation_count: 0, teams: [], note: 'season note' };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.notes.slice(0, 3)).toEqual(['family note', 'competition note', 'season note']);
    expect(info.notes.some((note) => note.includes('勝敗数のみカウント'))).toBe(true);
    expect(info.notes.some((note) => note.includes('アウェイゴール'))).toBe(true);
  });

  test('cascade: view_type unions all levels and defaults only when empty', () => {
    const family: CompetitionFamilyEntry = {
      display_name: 'Test',
      view_type: ['league'],
      competitions: {},
    };
    const comp: CompetitionEntry = {
      seasons: {},
      view_type: ['bracket'],
    };
    const entry: RawSeasonEntry = { team_count: 8, promotion_count: 0, relegation_count: 0, teams: [], view_type: ['league', 'bracket'] };
    const info = resolveSeasonInfo(family, comp, entry);

    expect(info.viewTypes).toEqual(['league', 'bracket']);
  });

  test('promotionLabel defaults to "昇格" when not set', () => {
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: [] };
    const info = resolveSeasonInfo(sampleFamily, sampleFamily.competitions.J1, entry);

    expect(info.promotionLabel).toBe('昇格');
  });

  test('cascade: promotion_label from competition level', () => {
    const comp: CompetitionEntry = {
      league_display: 'J1リーグ',
      promotion_label: '昇格<br/>ACL',
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: [] };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.promotionLabel).toBe('昇格<br/>ACL');
  });

  test('cascade: promotion_label from season overrides competition', () => {
    const comp: CompetitionEntry = {
      league_display: 'J1リーグ',
      promotion_label: '昇格<br/>ACL',
      seasons: {},
    };
    const entry: RawSeasonEntry = { team_count: 20, promotion_count: 3, relegation_count: 3, teams: [], promotion_label: 'W杯本選' };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.promotionLabel).toBe('W杯本選');
  });

  test('required count fields can default from competition level', () => {
    const comp: CompetitionEntry = {
      league_display: 'JLeagueCup',
      team_count: 8,
      promotion_count: 0,
      relegation_count: 0,
      seasons: {},
    };
    const entry: RawSeasonEntry = { teams: ['A', 'B'] };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.teamCount).toBe(8);
    expect(info.promotionCount).toBe(0);
    expect(info.relegationCount).toBe(0);
  });

  test('bracket view seasons can omit promotion and relegation counts', () => {
    const comp: CompetitionEntry = {
      league_display: 'JLeagueCup',
      view_type: ['bracket'],
      seasons: {},
    };
    const entry: RawSeasonEntry = {
      teams: ['A', 'B', 'C', 'D'],
    };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.teamCount).toBe(4);
    expect(info.promotionCount).toBe(0);
    expect(info.relegationCount).toBe(0);
  });

  test('season count fields override competition defaults', () => {
    const comp: CompetitionEntry = {
      league_display: 'J1リーグ',
      team_count: 18,
      promotion_count: 2,
      relegation_count: 2,
      seasons: {},
    };
    const entry: RawSeasonEntry = {
      team_count: 20,
      promotion_count: 3,
      relegation_count: 3,
      teams: [],
    };
    const info = resolveSeasonInfo(sampleFamily, comp, entry);

    expect(info.teamCount).toBe(20);
    expect(info.promotionCount).toBe(3);
    expect(info.relegationCount).toBe(3);
  });

  test('throws when required count fields are missing at both season and competition level', () => {
    const comp: CompetitionEntry = {
      league_display: 'Broken',
      seasons: {},
    };
    const entry: RawSeasonEntry = { teams: [] };

    expect(() => resolveSeasonInfo(sampleFamily, comp, entry)).toThrow(
      'Missing required season_map field: team_count',
    );
  });
});
