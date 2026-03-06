import { describe, test, expect } from 'vitest';
import {
  makeBoxBody, makeFullContent,
  makeTeamStats, joinLossBox, getRankClass,
} from '../../graph/tooltip';
import { getBright } from '../../graph/css-utils';
import { calculateTeamStats } from '../../ranking/stats-calculator';
import { makeMatch, makeTeamData, makeSeasonInfo } from '../fixtures/match-data';

// ─── makeBoxBody (height-based box content) ─────────────────────────────────

const WIN_ROW = makeMatch({
  opponent: 'TeamB', goal_get: 2, goal_lose: 1,
  stadium: 'TestStadium', section_no: 3, start_time: '14:00', status: '試合終了',
});
const MATCH_DATE = '2025/03/15';

describe('makeBoxBody – tall', () => {
  test('contains date, truncated opponent, score, and truncated stadium', () => {
    const html = makeBoxBody(WIN_ROW, MATCH_DATE, 'tall');
    expect(html).toContain('03/15');
    expect(html).toContain('Tea');     // opponent truncated to 3 chars
    expect(html).toContain('2-1');
    expect(html).toContain('TestSta'); // stadium truncated to 7 chars
  });

  test('does not include section number or time', () => {
    const html = makeBoxBody(WIN_ROW, MATCH_DATE, 'tall');
    expect(html).not.toContain('(3)');
    expect(html).not.toContain('14:00');
  });

  test('unplayed match (null goals) → omits score line', () => {
    const unplayed = makeMatch({
      opponent: 'TeamC', goal_get: null, goal_lose: null,
      stadium: 'FutureStadium', has_result: false,
    });
    const html = makeBoxBody(unplayed, MATCH_DATE, 'tall');
    expect(html).toContain('Tea');
    expect(html).toContain('FutureS');
    expect(html).not.toContain('null');
  });

  test('includes ET score when present and non-tied', () => {
    const etRow = makeMatch({
      opponent: 'TeamC', goal_get: 3, goal_lose: 2,
      score_ex_get: 1, score_ex_lose: 0, stadium: 'ETStadium',
    });
    const html = makeBoxBody(etRow, MATCH_DATE, 'tall');
    expect(html).toContain('3-2');
    expect(html).toContain('(ET1-0)');
    expect(html).toContain('ETStadi');
  });

  test('includes PK score when present', () => {
    const pkRow = makeMatch({
      opponent: 'TeamC', goal_get: 1, goal_lose: 1,
      pk_get: 5, pk_lose: 3, stadium: 'PkStadium',
    });
    const html = makeBoxBody(pkRow, MATCH_DATE, 'tall');
    expect(html).toContain('1-1');
    expect(html).toContain('(PK5-3)');
    expect(html).toContain('PkStadi');
  });
});

describe('makeBoxBody – medium', () => {
  test('contains date, opponent, score — no stadium', () => {
    const html = makeBoxBody(WIN_ROW, MATCH_DATE, 'medium');
    expect(html).toContain('03/15');
    expect(html).toContain('Tea');
    expect(html).toContain('2-1');
    expect(html).not.toContain('TestSta');
  });

  test('includes ET score in parentheses', () => {
    const etRow = makeMatch({
      opponent: 'TeamC', goal_get: 3, goal_lose: 2,
      score_ex_get: 1, score_ex_lose: 0, stadium: 'ETStadium',
    });
    const html = makeBoxBody(etRow, MATCH_DATE, 'medium');
    expect(html).toContain('(ET1-0)');
    expect(html).not.toContain('ETStadi');
  });

  test('includes PK score in parentheses', () => {
    const pkRow = makeMatch({
      opponent: 'TeamC', goal_get: 1, goal_lose: 1,
      pk_get: 5, pk_lose: 3, stadium: 'PkStadium',
    });
    const html = makeBoxBody(pkRow, MATCH_DATE, 'medium');
    expect(html).toContain('(PK5-3)');
    expect(html).not.toContain('PkStadi');
  });
});

describe('makeBoxBody – short', () => {
  test('contains only date and opponent — no score, no stadium', () => {
    const html = makeBoxBody(WIN_ROW, MATCH_DATE, 'short');
    expect(html).toContain('03/15');
    expect(html).toContain('Tea');
    expect(html).not.toContain('2-1');
    expect(html).not.toContain('TestSta');
  });
});

// ─── makeFullContent ────────────────────────────────────────────────────────

describe('makeFullContent', () => {
  test('contains section number, time, date, truncated opponent, score, and truncated stadium', () => {
    const html = makeFullContent(WIN_ROW, MATCH_DATE);
    expect(html).toContain('(3)');
    expect(html).toContain('14:00');
    expect(html).toContain('03/15');
    expect(html).toContain('Tea');
    expect(html).toContain('2-1');
    expect(html).toContain('TestSta');
  });

  test('includes PK scores when present', () => {
    const pkRow = makeMatch({
      opponent: 'TeamD', goal_get: 1, goal_lose: 1,
      pk_get: 3, pk_lose: 5, score_ex_get: 0, score_ex_lose: 0,
      stadium: 'Arena', section_no: 7, start_time: '18:00',
    });
    const html = makeFullContent(pkRow, MATCH_DATE);
    expect(html).toContain('1-1');
    expect(html).toContain('(PK3-5)');
    expect(html).not.toContain('ET');  // ET 0-0 (tied) is omitted
  });

  test('includes ET scores when non-tied', () => {
    const etRow = makeMatch({
      opponent: 'TeamE', goal_get: 2, goal_lose: 3,
      score_ex_get: 0, score_ex_lose: 1,
      stadium: 'Ground', section_no: 8, start_time: '19:00',
    });
    const html = makeFullContent(etRow, MATCH_DATE);
    expect(html).toContain('2-3');
    expect(html).toContain('(ET0-1)');
  });
});

// ─── makeTeamStats ──────────────────────────────────────────────────────────

describe('makeTeamStats', () => {
  test('disp=false shows "最新の状態" with latest stats', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/03/01' }),
      makeMatch({ goal_get: 0, goal_lose: 1, point: 0, match_date: '2025/03/08' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no');
    const html = makeTeamStats(td.latestStats, false);
    expect(html).toContain('最新の状態');
    expect(html).toContain('1勝');
    expect(html).toContain('1敗');
    expect(html).toContain('勝点3');
  });

  test('disp=true shows "表示時の状態" with displayStats', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/03/01' }),
      makeMatch({ goal_get: 0, goal_lose: 1, point: 0, match_date: '2025/04/15' }), // after cutoff
    ]);
    calculateTeamStats(td, '2025/03/31', 'section_no');
    const html = makeTeamStats(td.displayStats, true);
    expect(html).toContain('表示時の状態');
    // Only the March win is within display window
    expect(html).toContain('1勝');
    expect(html).toContain('0敗');
    expect(html).toContain('勝点3');
  });

  test('hasPk=false (default) omits PK line', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/03/01' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no');
    const html = makeTeamStats(td.latestStats, false);
    expect(html).not.toContain('PK勝');
    expect(html).not.toContain('PK負');
  });

  test('hasPk=true includes PK win/loss in the output', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/03/01' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no');
    const html = makeTeamStats(td.latestStats, false, true);
    expect(html).toContain('PK勝');
    expect(html).toContain('PK負');
  });

  test('hasEx=false (default) omits ET line', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 3, goal_lose: 2, score_ex_get: 1, score_ex_lose: 0, point: 2, match_date: '2025/03/01' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no', 'graduated-win');
    const html = makeTeamStats(td.latestStats, false);
    expect(html).not.toContain('延勝');
    expect(html).not.toContain('延負');
  });

  test('hasEx=true includes ET win/loss in the output', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 3, goal_lose: 2, score_ex_get: 1, score_ex_lose: 0, point: 2, match_date: '2025/03/01' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no', 'graduated-win');
    const html = makeTeamStats(td.latestStats, false, false, true);
    expect(html).toContain('延勝');
    expect(html).toContain('延負');
  });

  test('wins/draws/losses are on a separate line from ET and PK', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: 2, goal_lose: 0, point: 3, match_date: '2025/03/01' }),
      makeMatch({ goal_get: 1, goal_lose: 1, pk_get: 3, pk_lose: 1, score_ex_get: 0, score_ex_lose: 0, point: 3, match_date: '2025/03/08' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no', 'win3all-pkloss1');
    const html = makeTeamStats(td.latestStats, false, true, true);
    const lines = html.split('<br/>');
    // Line 0: label, Line 1: W/D/L, Line 2: ET, Line 3: PK, Line 4+: points etc.
    expect(lines[1]).toMatch(/\d+勝 \/ \d+分 \/ \d+敗/);
    expect(lines[2]).toMatch(/\d+延勝 \/ \d+延負/);
    expect(lines[3]).toMatch(/\d+PK勝 \/ \d+PK負/);
  });
});

// ─── joinLossBox ────────────────────────────────────────────────────────────

describe('joinLossBox', () => {
  test('joins entries with <hr/>', () => {
    expect(joinLossBox(['loss1', 'loss2', 'loss3'])).toBe('loss1<hr/>loss2<hr/>loss3');
  });

  test('single entry: no <hr/>', () => {
    expect(joinLossBox(['only'])).toBe('only');
  });

  test('empty array: empty string', () => {
    expect(joinLossBox([])).toBe('');
  });
});

// ─── getRankClass ───────────────────────────────────────────────────────────

describe('getRankClass', () => {
  // 4 teams, promotion 1, relegation 1 → relegationRank = 3 (rank 4 relegated)
  const info = makeSeasonInfo({ teamCount: 4, promotionCount: 1, relegationCount: 1 });

  test('rank within promotion zone → "promoted"', () => {
    expect(getRankClass(1, info)).toBe('promoted');
  });

  test('middle rank → empty string', () => {
    expect(getRankClass(2, info)).toBe('');
    expect(getRankClass(3, info)).toBe(''); // rank 3 = relegationRank boundary (safe)
  });

  test('last rank → "relegated"', () => {
    expect(getRankClass(4, info)).toBe('relegated'); // rank 4 > 4-1=3
  });

  test('custom rankClass takes priority over promotion/relegation', () => {
    const custom = makeSeasonInfo({
      teamCount: 4, promotionCount: 1, relegationCount: 1,
      rankClass: { '1': 'champion', '3': 'promoted_playoff' },
    });
    expect(getRankClass(1, custom)).toBe('champion');        // custom overrides 'promoted'
    expect(getRankClass(3, custom)).toBe('promoted_playoff'); // custom on safe rank
  });
});

// ─── getBright ──────────────────────────────────────────────────────────────

describe('getBright', () => {
  test('white (#FFFFFF) → 1.0', () => {
    expect(getBright('#FFFFFF', {})).toBeCloseTo(1.0);
  });

  test('black (#000000) → 0.0', () => {
    expect(getBright('#000000', {})).toBeCloseTo(0.0);
  });

  test('pure red (#FF0000) without leading # → uses max channel', () => {
    expect(getBright('FF0000', {})).toBeCloseTo(1.0); // red channel = 255/255
  });

  test('RGB modifiers reduce effective brightness', () => {
    // With RGB_MOD = {r:0.9, g:0.8, b:0.4}, white → max(255*0.9, 255*0.8, 255*0.4)/255 = 0.9
    const bright = getBright('#FFFFFF', { r: 0.9, g: 0.8, b: 0.4 });
    expect(bright).toBeCloseTo(0.9);
  });

  test('empty colorcode (channelLen < 1) → 0', () => {
    expect(getBright('', {})).toBe(0);
    expect(getBright('#', {})).toBe(0);
  });
});
