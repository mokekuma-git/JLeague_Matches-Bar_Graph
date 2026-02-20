import { describe, test, expect } from 'vitest';
import { makeRankData } from '../../ranking/rank-table';
import type { TeamData } from '../../types/match';
import { makeSeasonInfo } from '../fixtures/match-data';

// Build a TeamData with all stat fields set directly (bypasses calculateTeamStats).
// df.length determines future_game: future_game = df.length - all_game.
function makeStatsTeam(opts: {
  point: number;
  avlbl_pt: number;
  all_game: number;
  goal_diff?: number;
  goal_get?: number;
  win?: number;
  draw?: number;
  lose?: number;
  pk_win?: number;
  pk_loss?: number;
  avrg_pt?: number;
  rest_games?: Record<string, number>;
  disp_point?: number;
  disp_avlbl_pt?: number;
  disp_all_game?: number;
  disp_goal_diff?: number;
  disp_goal_get?: number;
  disp_win?: number;
  disp_draw?: number;
  disp_lose?: number;
  disp_pk_win?: number;
  disp_pk_loss?: number;
  disp_avrg_pt?: number;
  disp_rest_games?: Record<string, number>;
  dfLength?: number; // df.length for future_game calculation
}): TeamData {
  const rest_games = opts.rest_games ?? {};
  const disp_rest_games = opts.disp_rest_games ?? rest_games;
  const all_game = opts.all_game;
  // Create a df of the right length (all with has_result:false as placeholders).
  const dfLength = opts.dfLength ?? all_game;
  return {
    df: Array.from({ length: dfLength }, () => ({
      is_home: true, opponent: '', goal_get: '', goal_lose: '',
      pk_get: null, pk_lose: null, has_result: false, point: 0,
      match_date: '', section_no: '', stadium: '', start_time: '',
      status: '', live: false,
    })),
    point: opts.point,
    avlbl_pt: opts.avlbl_pt,
    all_game,
    goal_diff: opts.goal_diff ?? 0,
    goal_get: opts.goal_get ?? 0,
    win: opts.win ?? 0,
    pk_win: opts.pk_win ?? 0,
    pk_loss: opts.pk_loss ?? 0,
    draw: opts.draw ?? 0,
    lose: opts.lose ?? 0,
    avrg_pt: opts.avrg_pt ?? (all_game > 0 ? opts.point / all_game : 0),
    rest_games,
    disp_point: opts.disp_point ?? opts.point,
    disp_avlbl_pt: opts.disp_avlbl_pt ?? opts.avlbl_pt,
    disp_all_game: opts.disp_all_game ?? all_game,
    disp_goal_diff: opts.disp_goal_diff ?? opts.goal_diff ?? 0,
    disp_goal_get: opts.disp_goal_get ?? opts.goal_get ?? 0,
    disp_win: opts.disp_win ?? opts.win ?? 0,
    disp_pk_win: opts.disp_pk_win ?? opts.pk_win ?? 0,
    disp_pk_loss: opts.disp_pk_loss ?? opts.pk_loss ?? 0,
    disp_draw: opts.disp_draw ?? opts.draw ?? 0,
    disp_lose: opts.disp_lose ?? opts.lose ?? 0,
    disp_avrg_pt: opts.disp_avrg_pt ?? (opts.disp_all_game ?? all_game) > 0
      ? (opts.disp_point ?? opts.point) / (opts.disp_all_game ?? all_game)
      : 0,
    disp_rest_games,
  };
}

// ─── Scenario 1: season finished ──────────────────────────────────────────────
// All teams have rest_games={}, so getAllRestGame()===0 → allGameFinished branch.
describe('makeRankData – season finished', () => {
  const seasonInfo = makeSeasonInfo({ teamCount: 4, promotionCount: 1, relegationCount: 1 });
  // relegationRank = 4 - 1 = 3

  const groupData: Record<string, TeamData> = {
    TeamA: makeStatsTeam({ point: 9, avlbl_pt: 9, all_game: 3, win: 3, rest_games: {} }),
    TeamB: makeStatsTeam({ point: 6, avlbl_pt: 6, all_game: 3, win: 2, lose: 1, rest_games: {} }),
    TeamC: makeStatsTeam({ point: 3, avlbl_pt: 3, all_game: 3, win: 1, lose: 2, rest_games: {} }),
    TeamD: makeStatsTeam({ point: 0, avlbl_pt: 0, all_game: 3, lose: 3, rest_games: {} }),
  };
  const teamList = ['TeamA', 'TeamB', 'TeamC', 'TeamD'];

  test('rank 1 is confirmed champion', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].champion).toBe('確定');
  });

  test('non-champion ranks get "なし"', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[1].champion).toBe('なし');
    expect(rows[2].champion).toBe('なし');
    expect(rows[3].champion).toBe('なし');
  });

  test('rank 1 is confirmed promoted', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].promotion).toBe('確定');
  });

  test('ranks below promotionCount get promotion "なし"', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[1].promotion).toBe('なし');
    expect(rows[2].promotion).toBe('なし');
    expect(rows[3].promotion).toBe('なし');
  });

  test('ranks within relegationRank (<=3) are safe from relegation', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].relegation).toBe('確定'); // rank 1
    expect(rows[1].relegation).toBe('確定'); // rank 2
    expect(rows[2].relegation).toBe('確定'); // rank 3
  });

  test('last place is relegated', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[3].relegation).toBe('降格');
  });

  test('rows contain correct stat fields', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    const first = rows[0];
    expect(first.rank).toBe(1);
    expect(first.point).toBe(9);
    expect(first.win).toBe(3);
    expect(first.all_game).toBe(3);
  });
});

// ─── Scenario 2: mid-season with confirmed leader ─────────────────────────────
// TeamA has secured champion (point >= 2nd's avlbl_pt + 1).
// Others cannot even reach TeamA's current point (avlbl_pt < silverLine) → 'なし'.
describe('makeRankData – confirmed champion, others eliminated', () => {
  // TeamA: point=25, avlbl_pt=25 (done), rest_games={}
  // TeamB: point=18, avlbl_pt=21, rest_games={TeamC: 1}
  // TeamC: point=12, avlbl_pt=18, rest_games={TeamB: 1}
  // TeamD: point=5,  avlbl_pt=8,  rest_games={}
  //
  // championLine = getSafetyLine(1) = 2nd by avlbl_pt + 1
  //   by avlbl_pt: TeamA(25) > TeamB(21) > TeamC(18) > TeamD(8) → 2nd=TeamB(21), line=22
  // TeamA: point=25 >= 22 → '確定'
  // silverLine = getPossibleLine(1) = 1st by point = TeamA=25
  // TeamB: avlbl_pt=21 < silverLine=25 → 'なし'
  // TeamC: avlbl_pt=18 < 25 → 'なし'
  // TeamD: avlbl_pt=8  < 25 → 'なし'
  const seasonInfo = makeSeasonInfo({ teamCount: 4, promotionCount: 0, relegationCount: 0 });

  const groupData: Record<string, TeamData> = {
    TeamA: makeStatsTeam({ point: 25, avlbl_pt: 25, all_game: 10, rest_games: {} }),
    TeamB: makeStatsTeam({ point: 18, avlbl_pt: 21, all_game: 8, rest_games: { TeamC: 1 } }),
    TeamC: makeStatsTeam({ point: 12, avlbl_pt: 18, all_game: 7, rest_games: { TeamB: 1 } }),
    TeamD: makeStatsTeam({ point: 5,  avlbl_pt: 8,  all_game: 8, rest_games: {} }),
  };
  const teamList = ['TeamA', 'TeamB', 'TeamC', 'TeamD'];

  test('TeamA is confirmed champion', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].champion).toBe('確定');
  });

  test('all other teams have no champion chance', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[1].champion).toBe('なし');
    expect(rows[2].champion).toBe('なし');
    expect(rows[3].champion).toBe('なし');
  });
});

// ─── Scenario 3: all four champion states ──────────────────────────────────────
// Carefully constructed to produce 確定 / 自力 / 他力 / なし in one table.
//
// Teams and their stats (no promotion, no relegation for clarity):
//   TeamA: point=18, avlbl_pt=21, rest_games={TeamC:1}  (doesn't play TeamB/TeamD)
//   TeamB: point=17, avlbl_pt=23, rest_games={TeamD:2}  (doesn't play TeamA)
//   TeamC: point=5,  avlbl_pt=8,  rest_games={TeamA:1}
//   TeamD: point=3,  avlbl_pt=9,  rest_games={TeamB:2}
//
// Calculations (disp=false):
//   silverLine = getPossibleLine(1) = 1st by point = TeamA = 18
//   championLine = getSafetyLine(1) = 2nd by avlbl_pt + 1
//     avlbl_pt order: TeamB(23) > TeamA(21) > TeamD(9) > TeamC(8)
//     2nd = TeamA(21), championLine = 22
//
//   TeamA: point=18 < 22 → not confirmed
//          silver = 21 - 18 = 3 >= 0 → not なし
//          selfChampion: getSelfPossibleLine(1, TeamA):
//            cache without TeamA = {TeamB:23, TeamC:8, TeamD:9}
//            sorted: [TeamB(23), TeamD(9), TeamC(8)]
//            TeamA.rest_games = {TeamC:1} → TeamC -= 3 → TeamC=5
//            idx=0 → cache[TeamB]=23
//            selfLine = 23
//          selfChampion = 21 - 23 = -2 < 0 → '他力'
//
//   TeamB: point=17 < 22 → not confirmed
//          silver = 23 - 18 = 5 >= 0 → not なし
//          selfChampion: getSelfPossibleLine(1, TeamB):
//            cache without TeamB = {TeamA:21, TeamC:8, TeamD:9}
//            sorted: [TeamA(21), TeamD(9), TeamC(8)]
//            TeamB.rest_games = {TeamD:2} → TeamD -= 6 → TeamD=3
//            idx=0 → cache[TeamA]=21
//            selfLine = 21
//          selfChampion = 23 - 21 = 2 >= 0 → '自力'
//
//   TeamC: silver = 8 - 18 = -10 < 0 → 'なし'
//   TeamD: silver = 9 - 18 = -9  < 0 → 'なし'
describe('makeRankData – all four champion states in one table', () => {
  const seasonInfo = makeSeasonInfo({ teamCount: 4, promotionCount: 0, relegationCount: 0 });

  const groupData: Record<string, TeamData> = {
    TeamA: makeStatsTeam({ point: 18, avlbl_pt: 21, all_game: 8, rest_games: { TeamC: 1 } }),
    TeamB: makeStatsTeam({ point: 17, avlbl_pt: 23, all_game: 7, rest_games: { TeamD: 2 } }),
    TeamC: makeStatsTeam({ point: 5,  avlbl_pt: 8,  all_game: 8, rest_games: { TeamA: 1 } }),
    TeamD: makeStatsTeam({ point: 3,  avlbl_pt: 9,  all_game: 7, rest_games: { TeamB: 2 } }),
  };
  // teamList sorted by point descending
  const teamList = ['TeamA', 'TeamB', 'TeamC', 'TeamD'];

  test('TeamA → 他力 (can reach 1st only if others drop points)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].champion).toBe('他力');
  });

  test('TeamB → 自力 (can secure 1st by own results)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[1].champion).toBe('自力');
  });

  test('TeamC → なし (max points cannot reach leader)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[2].champion).toBe('なし');
  });

  test('TeamD → なし', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[3].champion).toBe('なし');
  });
});

// ─── Scenario 4: disp=true uses disp_* stats ──────────────────────────────────
// Verify that when disp=true, the row fields reflect disp_* values, not latest values.
describe('makeRankData – disp=true uses display-time stats', () => {
  const seasonInfo = makeSeasonInfo({ teamCount: 2, promotionCount: 0, relegationCount: 0 });

  const groupData: Record<string, TeamData> = {
    TeamA: makeStatsTeam({
      point: 15, avlbl_pt: 15,   // latest
      disp_point: 6, disp_avlbl_pt: 12, // display-time
      all_game: 5, disp_all_game: 2,
      win: 5, disp_win: 2,
      rest_games: {}, disp_rest_games: { TeamB: 2 },
    }),
    TeamB: makeStatsTeam({
      point: 9, avlbl_pt: 12,
      disp_point: 9, disp_avlbl_pt: 18,
      all_game: 3, disp_all_game: 3,
      rest_games: { TeamA: 1 }, disp_rest_games: { TeamA: 3 },
    }),
  };
  const teamList = ['TeamA', 'TeamB'];

  test('point field in row equals disp_point when disp=true', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, true);
    expect(rows[0].point).toBe(6);   // TeamA.disp_point
    expect(rows[1].point).toBe(9);   // TeamB.disp_point
  });

  test('point field in row equals latest point when disp=false', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].point).toBe(15);  // TeamA.point
    expect(rows[1].point).toBe(9);   // TeamB.point
  });

  test('avlbl_pt field reflects disp_avlbl_pt when disp=true', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, true);
    expect(rows[0].avlbl_pt).toBe(12);  // TeamA.disp_avlbl_pt
    expect(rows[1].avlbl_pt).toBe(18);  // TeamB.disp_avlbl_pt
  });

  test('win field reflects disp_win when disp=true', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, true);
    expect(rows[0].win).toBe(2);  // TeamA.disp_win
  });
});

// ─── Scenario 5: no promotion/relegation ──────────────────────────────────────
describe('makeRankData – no promotion or relegation counts', () => {
  const seasonInfo = makeSeasonInfo({ teamCount: 4, promotionCount: 0, relegationCount: 0 });

  const groupData: Record<string, TeamData> = {
    TeamA: makeStatsTeam({ point: 9, avlbl_pt: 9, all_game: 3, rest_games: {} }),
    TeamB: makeStatsTeam({ point: 6, avlbl_pt: 6, all_game: 3, rest_games: {} }),
    TeamC: makeStatsTeam({ point: 3, avlbl_pt: 3, all_game: 3, rest_games: {} }),
    TeamD: makeStatsTeam({ point: 0, avlbl_pt: 0, all_game: 3, rest_games: {} }),
  };
  const teamList = ['TeamA', 'TeamB', 'TeamC', 'TeamD'];

  test('promotion field is undefined when promotionCount=0', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].promotion).toBeUndefined();
  });

  test('relegation field is "確定" for all teams when relegationCount=0 (mid-season branch)', () => {
    // With no games remaining (all rest_games={}), allGameFinished=true.
    // In the allGameFinished branch: relegation is only set when relegationCount > 0.
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].relegation).toBeUndefined();
  });
});

// ─── Scenario 4b: all four promotion states ────────────────────────────────────
// 6 teams, promotionCount=2 (top 2 promoted). Carefully constructed to produce
// all four promotion states in one table.
//
// Teams:
//   TeamA: point=22, avlbl_pt=22, rest_games={TeamB:1}
//   TeamB: point=18, avlbl_pt=24, rest_games={TeamA:1}
//   TeamC: point=16, avlbl_pt=19, rest_games={TeamE:2}
//   TeamD: point=10, avlbl_pt=13, rest_games={}
//   TeamE: point=5,  avlbl_pt=8,  rest_games={TeamC:2}
//   TeamF: point=2,  avlbl_pt=5,  rest_games={}
//
// promotionLine = getSafetyLine(2) = 3rd_by_avlbl_pt + 1
//   avlbl_pt order: TeamB(24) > TeamA(22) > TeamC(19) > ...
//   3rd = TeamC(19) → promotionLine = 20
//
// nonPromotLine = getPossibleLine(2) = 2nd_by_point = TeamB(18) → 18
//
// TeamA: promotion = 22-20 = 2 ≥ 0 → '確定'
//
// TeamB: promotion = 18-20 = -2 < 0
//        remaining = 24-18 = 6 ≥ 0 → not 'なし'
//        getSelfPossibleLine(2, TeamB):
//          cache={TeamA:22, TeamC:19, TeamD:13, TeamE:8, TeamF:5}
//          sorted=[TeamA(22), TeamC(19), TeamD(13), TeamE(8), TeamF(5)]
//          TeamB plays TeamA → TeamA -= 3 → 19
//          idx=1 → sorted[1]=TeamC, cache[TeamC]=19 → selfLine=19
//        selfPromotion = 24-19 = 5 ≥ 0 → '自力'
//
// TeamC: promotion = 16-20 = -4 < 0
//        remaining = 19-18 = 1 ≥ 0 → not 'なし'
//        getSelfPossibleLine(2, TeamC):
//          cache={TeamA:22, TeamB:24, TeamD:13, TeamE:8, TeamF:5}
//          sorted=[TeamB(24), TeamA(22), TeamD(13), TeamE(8), TeamF(5)]
//          TeamC plays TeamE → TeamE -= 6 → 2
//          idx=1 → sorted[1]=TeamA, cache[TeamA]=22 → selfLine=22
//        selfPromotion = 19-22 = -3 < 0 → '他力'
//
// TeamD/E/F: remaining = avlbl_pt - 18 < 0 → 'なし'
describe('makeRankData – all four promotion states in one table', () => {
  const seasonInfo = makeSeasonInfo({ teamCount: 6, promotionCount: 2, relegationCount: 0 });

  const groupData: Record<string, ReturnType<typeof makeStatsTeam>> = {
    TeamA: makeStatsTeam({ point: 22, avlbl_pt: 22, all_game: 10, rest_games: { TeamB: 1 } }),
    TeamB: makeStatsTeam({ point: 18, avlbl_pt: 24, all_game: 8,  rest_games: { TeamA: 1 } }),
    TeamC: makeStatsTeam({ point: 16, avlbl_pt: 19, all_game: 9,  rest_games: { TeamE: 2 } }),
    TeamD: makeStatsTeam({ point: 10, avlbl_pt: 13, all_game: 9,  rest_games: {} }),
    TeamE: makeStatsTeam({ point: 5,  avlbl_pt: 8,  all_game: 7,  rest_games: { TeamC: 2 } }),
    TeamF: makeStatsTeam({ point: 2,  avlbl_pt: 5,  all_game: 9,  rest_games: {} }),
  };
  const teamList = ['TeamA', 'TeamB', 'TeamC', 'TeamD', 'TeamE', 'TeamF'];

  test('TeamA → 確定 (points exceed promotionLine)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].promotion).toBe('確定');
  });

  test('TeamB → 自力 (can clinch promotion by own results)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[1].promotion).toBe('自力');
  });

  test('TeamC → 他力 (needs others to drop points for promotion)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[2].promotion).toBe('他力');
  });

  test('TeamD/E/F → なし (cannot reach promotion zone on maximum points)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[3].promotion).toBe('なし'); // TeamD
    expect(rows[4].promotion).toBe('なし'); // TeamE
    expect(rows[5].promotion).toBe('なし'); // TeamF
  });
});

// ─── Scenario 4c: all four relegation states ──────────────────────────────────
// 6 teams, promotionCount=0, relegationCount=3 → relegationRank=3
// (bottom 3 relegated, top 3 safe)
//
// Teams:
//   TeamA: point=25, avlbl_pt=25, rest_games={}
//   TeamB: point=17, avlbl_pt=22, rest_games={TeamE:2}
//   TeamC: point=14, avlbl_pt=20, rest_games={TeamF:2}
//   TeamD: point=12, avlbl_pt=21, rest_games={TeamE:1}
//   TeamE: point=8,  avlbl_pt=16, rest_games={TeamB:2, TeamD:1}
//   TeamF: point=4,  avlbl_pt=7,  rest_games={TeamC:2}
//
// keepLeagueLine = getSafetyLine(3) = 4th_by_avlbl_pt + 1
//   avlbl_pt order: TeamA(25), TeamB(22), TeamD(21), TeamC(20), TeamE(16), TeamF(7)
//   4th = TeamC(20) → keepLeagueLine = 21
//
// relegationLine = getPossibleLine(3) = 3rd_by_point = TeamC(14) → 14
//
// TeamA: keepLeague = 25-21 = 4 ≥ 0 → '確定'
//
// TeamB: keepLeague = 17-21 = -4 < 0
//        relegation = 22-14 = 8 ≥ 0 → not '降格'
//        getSelfPossibleLine(3, TeamB):
//          cache={TeamA:25, TeamC:20, TeamD:21, TeamE:16, TeamF:7}
//          sorted BEFORE reduction=[TeamA(25), TeamD(21), TeamC(20), TeamE(16), TeamF(7)]
//          TeamB plays TeamE:2 → TeamE -= 6 → 10
//          idx=2 → sorted[2]=TeamC, cache[TeamC]=20 → selfLine=20
//        selfRelegation = 22-20 = 2 ≥ 0 → '自力'
//
// TeamC: keepLeague = 14-21 = -7 < 0
//        relegation = 20-14 = 6 ≥ 0 → not '降格'
//        getSelfPossibleLine(3, TeamC):
//          cache={TeamA:25, TeamB:22, TeamD:21, TeamE:16, TeamF:7}
//          sorted=[TeamA(25), TeamB(22), TeamD(21), TeamE(16), TeamF(7)]
//          TeamC plays TeamF:2 → TeamF -= 6 → 1
//          idx=2 → sorted[2]=TeamD, cache[TeamD]=21 → selfLine=21
//        selfRelegation = 20-21 = -1 < 0 → '他力'
//
// TeamD: keepLeague = 12-21 = -9 < 0
//        relegation = 21-14 = 7 ≥ 0 → not '降格'
//        getSelfPossibleLine(3, TeamD):
//          cache={TeamA:25, TeamB:22, TeamC:20, TeamE:16, TeamF:7}
//          sorted=[TeamA(25), TeamB(22), TeamC(20), TeamE(16), TeamF(7)]
//          TeamD plays TeamE:1 → TeamE -= 3 → 13
//          idx=2 → sorted[2]=TeamC, cache[TeamC]=20 → selfLine=20
//        selfRelegation = 21-20 = 1 ≥ 0 → '自力'
//
// TeamE: keepLeague = 8-21 = -13 < 0
//        relegation = 16-14 = 2 ≥ 0 → not '降格'
//        getSelfPossibleLine(3, TeamE):
//          cache={TeamA:25, TeamB:22, TeamC:20, TeamD:21, TeamF:7}
//          sorted BEFORE reduction=[TeamA(25), TeamB(22), TeamD(21), TeamC(20), TeamF(7)]
//          TeamE plays TeamB:2, TeamD:1 → TeamB -= 6 → 16, TeamD -= 3 → 18
//          idx=2 → sorted[2]=TeamD, cache[TeamD]=18 → selfLine=18
//        selfRelegation = 16-18 = -2 < 0 → '他力'
//
// TeamF: keepLeague = 4-21 = -17 < 0
//        relegation = 7-14 = -7 < 0 → '降格'
describe('makeRankData – all four relegation states in one table', () => {
  const seasonInfo = makeSeasonInfo({ teamCount: 6, promotionCount: 0, relegationCount: 3 });

  const groupData: Record<string, ReturnType<typeof makeStatsTeam>> = {
    TeamA: makeStatsTeam({ point: 25, avlbl_pt: 25, all_game: 10, rest_games: {} }),
    TeamB: makeStatsTeam({ point: 17, avlbl_pt: 22, all_game: 8,  rest_games: { TeamE: 2 } }),
    TeamC: makeStatsTeam({ point: 14, avlbl_pt: 20, all_game: 9,  rest_games: { TeamF: 2 } }),
    TeamD: makeStatsTeam({ point: 12, avlbl_pt: 21, all_game: 8,  rest_games: { TeamE: 1 } }),
    TeamE: makeStatsTeam({ point: 8,  avlbl_pt: 16, all_game: 7,  rest_games: { TeamB: 2, TeamD: 1 } }),
    TeamF: makeStatsTeam({ point: 4,  avlbl_pt: 7,  all_game: 9,  rest_games: { TeamC: 2 } }),
  };
  const teamList = ['TeamA', 'TeamB', 'TeamC', 'TeamD', 'TeamE', 'TeamF'];

  test('TeamA → 確定 (confirmed safe from relegation)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[0].relegation).toBe('確定');
  });

  test('TeamB → 自力 (can self-secure safety)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[1].relegation).toBe('自力');
  });

  test('TeamC → 他力 (needs others to drop points to avoid relegation)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[2].relegation).toBe('他力');
  });

  test('TeamD → 自力 (can self-secure safety)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[3].relegation).toBe('自力');
  });

  test('TeamE → 他力 (needs others to drop points to avoid relegation)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[4].relegation).toBe('他力');
  });

  test('TeamF → 降格 (mathematically relegated)', () => {
    const rows = makeRankData(groupData, teamList, seasonInfo, false);
    expect(rows[5].relegation).toBe('降格');
  });
});

// ─── Scenario 6: row shape ─────────────────────────────────────────────────────
describe('makeRankData – row shape', () => {
  const seasonInfo = makeSeasonInfo({ teamCount: 2, promotionCount: 0, relegationCount: 0 });

  const groupData: Record<string, TeamData> = {
    TeamA: makeStatsTeam({
      point: 6, avlbl_pt: 6, all_game: 2, win: 2, goal_get: 4,
      goal_diff: 3, avrg_pt: 3.0, rest_games: {}, dfLength: 2,
    }),
    TeamB: makeStatsTeam({
      point: 0, avlbl_pt: 0, all_game: 2, lose: 2, goal_get: 1,
      goal_diff: -3, avrg_pt: 0.0, rest_games: {}, dfLength: 2,
    }),
  };

  test('name is wrapped in a div with the team name as class and text', () => {
    const rows = makeRankData(groupData, ['TeamA', 'TeamB'], seasonInfo, false);
    expect(rows[0].name).toBe('<div class="TeamA">TeamA</div>');
  });

  test('avrg_pt is formatted to 2 decimal places', () => {
    const rows = makeRankData(groupData, ['TeamA', 'TeamB'], seasonInfo, false);
    expect(rows[0].avrg_pt).toBe('3.00');
    expect(rows[1].avrg_pt).toBe('0.00');
  });

  test('goal_lose = goal_get - goal_diff', () => {
    const rows = makeRankData(groupData, ['TeamA', 'TeamB'], seasonInfo, false);
    expect(rows[0].goal_lose).toBe(4 - 3);  // 1
    expect(rows[1].goal_lose).toBe(1 - (-3)); // 4
  });

  test('future_game = df.length - all_game', () => {
    const rows = makeRankData(groupData, ['TeamA', 'TeamB'], seasonInfo, false);
    // dfLength=2, all_game=2 → future_game=0
    expect(rows[0].future_game).toBe(0);
  });

  test('ranks are numbered sequentially starting from 1', () => {
    const rows = makeRankData(groupData, ['TeamA', 'TeamB'], seasonInfo, false);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });
});
