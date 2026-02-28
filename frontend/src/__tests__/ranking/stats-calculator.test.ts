import { describe, test, expect } from 'vitest';
import { calculateTeamStats, classifyResult, sortTeamMatches } from '../../ranking/stats-calculator';
import { makeMatch, makeTeamData } from '../fixtures/match-data';

const TARGET = '2025/03/31';

describe('calculateTeamStats', () => {
  describe('basic accumulation', () => {
    test('win: point=3, win=1, goal counts', () => {
      const td = makeTeamData([makeMatch({ goal_get: 2, goal_lose: 0, point: 3 })]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.point).toBe(3);
      expect(td.latestStats.resultCounts.win).toBe(1);
      expect(td.latestStats.resultCounts.draw).toBe(0);
      expect(td.latestStats.resultCounts.loss).toBe(0);
      expect(td.latestStats.all_game).toBe(1);
      expect(td.latestStats.goal_diff).toBe(2);
      expect(td.latestStats.goal_get).toBe(2);
    });

    test('draw: point=1, draw=1', () => {
      const td = makeTeamData([makeMatch({ goal_get: 1, goal_lose: 1, point: 1 })]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.point).toBe(1);
      expect(td.latestStats.resultCounts.draw).toBe(1);
      expect(td.latestStats.resultCounts.win).toBe(0);
    });

    test('loss: point=0, loss=1', () => {
      const td = makeTeamData([makeMatch({ goal_get: 0, goal_lose: 2, point: 0 })]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.point).toBe(0);
      expect(td.latestStats.resultCounts.loss).toBe(1);
      expect(td.latestStats.resultCounts.win).toBe(0);
    });

    test('PK win: pk_win=1 (not win)', () => {
      const td = makeTeamData([makeMatch({ goal_get: 1, goal_lose: 1, pk_get: 5, pk_lose: 4, point: 2 })]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.resultCounts.pk_win).toBe(1);
      expect(td.latestStats.resultCounts.win).toBe(0);
      expect(td.latestStats.resultCounts.draw).toBe(0);
      expect(td.latestStats.point).toBe(2);
    });

    test('PK loss: pk_loss=1 (not draw)', () => {
      const td = makeTeamData([makeMatch({ goal_get: 1, goal_lose: 1, pk_get: 3, pk_lose: 5, point: 1 })]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.resultCounts.pk_loss).toBe(1);
      expect(td.latestStats.resultCounts.draw).toBe(0);
      expect(td.latestStats.point).toBe(1);
    });

    test('unplayed match: avlbl_pt += 3, added to rest_games', () => {
      const td = makeTeamData([
        makeMatch({ has_result: false, goal_get: null, goal_lose: null, point: 0, opponent: 'TeamC' }),
      ]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.point).toBe(0);
      expect(td.latestStats.avlbl_pt).toBe(3);
      expect(td.latestStats.all_game).toBe(0);
      expect(td.latestStats.rest_games).toEqual({ TeamC: 1 });
    });

    test('multiple matches accumulate correctly', () => {
      const td = makeTeamData([
        makeMatch({ goal_get: 2, goal_lose: 1, point: 3, match_date: '2025/03/01' }),
        makeMatch({ goal_get: 1, goal_lose: 1, point: 1, match_date: '2025/03/08' }),
        makeMatch({ has_result: false, goal_get: null, goal_lose: null, point: 0, opponent: 'TeamC', match_date: '2025/04/05' }),
      ]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.point).toBe(4);
      expect(td.latestStats.avlbl_pt).toBe(7); // 3 + 1 + 3 (future)
      expect(td.latestStats.resultCounts.win).toBe(1);
      expect(td.latestStats.resultCounts.draw).toBe(1);
      expect(td.latestStats.all_game).toBe(2);
    });

    test('avrg_pt = point / all_game', () => {
      const td = makeTeamData([
        makeMatch({ goal_get: 3, goal_lose: 0, point: 3 }),
        makeMatch({ goal_get: 0, goal_lose: 1, point: 0 }),
      ]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.avrg_pt).toBe(1.5);
    });

    test('avrg_pt = 0 when no games played', () => {
      const td = makeTeamData([
        makeMatch({ has_result: false, goal_get: null, goal_lose: null, point: 0 }),
      ]);
      calculateTeamStats(td, TARGET, 'section_no');
      expect(td.latestStats.avrg_pt).toBe(0);
    });
  });

  describe('date cutoff: displayStats vs latestStats', () => {
    // Scenario:
    //   Match 1: 2025/03/01 (win)  → within targetDate='2025/03/31'
    //   Match 2: 2025/04/15 (win)  → after targetDate
    //   Match 3: unplayed (future)
    test('displayStats.point includes only matches up to targetDate', () => {
      const td = makeTeamData([
        makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/03/01', section_no: 1 }),
        makeMatch({ goal_get: 1, goal_lose: 0, point: 3, match_date: '2025/04/15', section_no: 2 }),
        makeMatch({ has_result: false, goal_get: null, goal_lose: null, point: 0, match_date: '2025/05/10', section_no: 3, opponent: 'TeamC' }),
      ]);
      calculateTeamStats(td, '2025/03/31', 'section_no');

      // Latest stats (all completed matches)
      expect(td.latestStats.point).toBe(6);
      expect(td.latestStats.all_game).toBe(2);
      expect(td.latestStats.avlbl_pt).toBe(9); // 3 + 3 + 3 (future)

      // Display stats (only March match counts)
      expect(td.displayStats.point).toBe(3);
      expect(td.displayStats.all_game).toBe(1);
      // displayStats.avlbl_pt: 3 (March win) + 3 (April treated as future) + 3 (May future) = 9
      expect(td.displayStats.avlbl_pt).toBe(9);
    });

    test('displayStats.rest_games includes matches after targetDate', () => {
      const td = makeTeamData([
        makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/04/15', section_no: 1, opponent: 'TeamB' }),
      ]);
      calculateTeamStats(td, '2025/03/31', 'section_no');
      // April match is after cutoff → treated as future in display
      expect(td.displayStats.rest_games).toEqual({ TeamB: 1 });
      expect(td.latestStats.rest_games).toEqual({}); // completed in latest view
    });

    test('displayStats result counts only count within cutoff', () => {
      const td = makeTeamData([
        makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/03/01', section_no: 1 }), // win, in range
        makeMatch({ goal_get: 0, goal_lose: 1, point: 0, match_date: '2025/04/01', section_no: 2 }), // loss, out of range
      ]);
      calculateTeamStats(td, '2025/03/31', 'section_no');
      expect(td.displayStats.resultCounts.win).toBe(1);
      expect(td.displayStats.resultCounts.loss).toBe(0);
      expect(td.latestStats.resultCounts.win).toBe(1);
      expect(td.latestStats.resultCounts.loss).toBe(1);
    });

    test('displayStats.avrg_pt differs from latestStats.avrg_pt when games span the cutoff date', () => {
      // 3 wins in March (in display window), 2 losses in April (after cutoff)
      const td = makeTeamData([
        makeMatch({ goal_get: 1, goal_lose: 0, point: 3, match_date: '2025/03/01', section_no: 1 }),
        makeMatch({ goal_get: 1, goal_lose: 0, point: 3, match_date: '2025/03/08', section_no: 2 }),
        makeMatch({ goal_get: 1, goal_lose: 0, point: 3, match_date: '2025/03/15', section_no: 3 }),
        makeMatch({ goal_get: 0, goal_lose: 1, point: 0, match_date: '2025/04/01', section_no: 4 }),
        makeMatch({ goal_get: 0, goal_lose: 1, point: 0, match_date: '2025/04/08', section_no: 5 }),
      ]);
      calculateTeamStats(td, '2025/03/31', 'section_no');
      // avrg_pt = 9 / 5 = 1.8 (all 5 completed games)
      expect(td.latestStats.avrg_pt).toBeCloseTo(1.8);
      // displayStats.avrg_pt = 9 / 3 = 3.0 (only 3 March games)
      expect(td.displayStats.avrg_pt).toBe(3.0);
    });

    test('displayStats.avrg_pt = 0 when all completed games are after targetDate', () => {
      const td = makeTeamData([
        makeMatch({ goal_get: 1, goal_lose: 0, point: 3, match_date: '2025/04/01', section_no: 1 }),
      ]);
      calculateTeamStats(td, '2025/03/31', 'section_no');
      expect(td.displayStats.all_game).toBe(0);
      expect(td.displayStats.avrg_pt).toBe(0);
      expect(td.latestStats.avrg_pt).toBe(3); // 3 / 1 in latest view
    });
  });
});

describe('sortTeamMatches', () => {
  test('completed matches sort before postponed, postponed before future', () => {
    const past = makeMatch({
      has_result: false, goal_get: null, goal_lose: null, point: 0,
      match_date: '03/01', section_no: 2,
    });
    const future = makeMatch({
      has_result: false, goal_get: null, goal_lose: null, point: 0,
      match_date: '05/01', section_no: 3,
    });
    const completed = makeMatch({
      has_result: true, goal_get: 2, goal_lose: 0, point: 3,
      match_date: '03/15', section_no: 1,
    });
    const td = makeTeamData([future, past, completed]);
    sortTeamMatches(td, '2025/03/31', 'section_no');
    expect(td.df[0]).toBe(completed);  // priority 0
    expect(td.df[1]).toBe(past);       // priority 1 (postponed past)
    expect(td.df[2]).toBe(future);     // priority 2
  });

  test('within completed matches, section_no sort is numeric', () => {
    const m1 = makeMatch({ has_result: true, section_no: 10, match_date: '03/01', point: 3, goal_get: 1, goal_lose: 0 });
    const m2 = makeMatch({ has_result: true, section_no: 2,  match_date: '03/08', point: 3, goal_get: 1, goal_lose: 0 });
    const td = makeTeamData([m1, m2]);
    sortTeamMatches(td, '2025/12/31', 'section_no');
    expect(td.df[0]).toBe(m2); // section 2 comes before section 10 numerically
  });

  test('within completed matches, match_date sort is lexicographic', () => {
    const m1 = makeMatch({ has_result: true, section_no: 2, match_date: '04/01', point: 3, goal_get: 1, goal_lose: 0 });
    const m2 = makeMatch({ has_result: true, section_no: 1, match_date: '03/01', point: 3, goal_get: 1, goal_lose: 0 });
    const td = makeTeamData([m1, m2]);
    sortTeamMatches(td, '2025/12/31', 'match_date');
    expect(td.df[0]).toBe(m2); // 03/01 < 04/01
  });

  test('match with non-MM/DD date sorts after match with valid MM/DD date', () => {
    // Empty string does not match /\d\d\/\d\d$/ → sorts after valid date
    const validDate = makeMatch({ has_result: true, section_no: 2, match_date: '04/01', point: 3, goal_get: 1, goal_lose: 0 });
    const emptyDate = makeMatch({ has_result: true, section_no: 1, match_date: '', point: 0, goal_get: 0, goal_lose: 1 });
    const td = makeTeamData([emptyDate, validDate]);
    sortTeamMatches(td, '2025/12/31', 'match_date');
    expect(td.df[0]).toBe(validDate);  // valid MM/DD sorts first
    expect(td.df[1]).toBe(emptyDate);  // empty string sorts after
  });

  test('two completed matches with non-MM/DD dates maintain relative order', () => {
    // Both dates do not match /\d\d\/\d\d$/ → comparison returns 0 (stable)
    const m1 = makeMatch({ has_result: true, section_no: 2, match_date: '', point: 3, goal_get: 1, goal_lose: 0 });
    const m2 = makeMatch({ has_result: true, section_no: 1, match_date: 'TBD', point: 0, goal_get: 0, goal_lose: 1 });
    const td = makeTeamData([m1, m2]);
    sortTeamMatches(td, '2025/12/31', 'match_date');
    // comparison returns 0 for both invalid dates; stable sort preserves insertion order
    expect(td.df[0]).toBe(m1);
    expect(td.df[1]).toBe(m2);
  });
});

describe('classifyResult', () => {
  test('standard: 3pt → win', () => {
    expect(classifyResult(3, null, 'standard')).toBe('win');
  });

  test('standard: 2pt with PK → pk_win', () => {
    expect(classifyResult(2, 5, 'standard')).toBe('pk_win');
  });

  test('standard: 1pt with PK → pk_loss', () => {
    expect(classifyResult(1, 3, 'standard')).toBe('pk_loss');
  });

  test('standard: 1pt without PK → draw', () => {
    expect(classifyResult(1, null, 'standard')).toBe('draw');
  });

  test('standard: 0pt → loss', () => {
    expect(classifyResult(0, null, 'standard')).toBe('loss');
  });

  test('old-two-points: 2pt → win', () => {
    expect(classifyResult(2, null, 'old-two-points')).toBe('win');
  });

  test('old-two-points: 1pt → draw', () => {
    expect(classifyResult(1, null, 'old-two-points')).toBe('draw');
  });

  test('old-two-points: 0pt → loss', () => {
    expect(classifyResult(0, null, 'old-two-points')).toBe('loss');
  });
});

describe('calculateTeamStats with old-two-points', () => {
  test('win earns 2pt, unplayed adds 2pt to avlbl_pt', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 2, goal_lose: 0, point: 2, match_date: '2025/03/01' }),
      makeMatch({ has_result: false, goal_get: null, goal_lose: null, point: 0, opponent: 'TeamC', match_date: '2025/05/01' }),
    ]);
    calculateTeamStats(td, TARGET, 'section_no', 'old-two-points');
    expect(td.latestStats.point).toBe(2);
    expect(td.latestStats.resultCounts.win).toBe(1);
    expect(td.latestStats.avlbl_pt).toBe(4); // 2 (win) + 2 (future max)
  });

  test('draw earns 1pt under old-two-points', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 1, goal_lose: 1, point: 1, match_date: '2025/03/01' }),
    ]);
    calculateTeamStats(td, TARGET, 'section_no', 'old-two-points');
    expect(td.latestStats.point).toBe(1);
    expect(td.latestStats.resultCounts.draw).toBe(1);
    expect(td.latestStats.avlbl_pt).toBe(1);
  });
});
