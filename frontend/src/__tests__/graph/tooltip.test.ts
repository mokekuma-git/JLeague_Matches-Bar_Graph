import { describe, test, expect } from 'vitest';
import {
  makeWinContent, makePkWinContent, makeDrawContent, makeFullContent,
  makeTeamStats, joinLossBox, getRankClass, getBright,
} from '../../graph/tooltip';
import { calculateTeamStats } from '../../ranking/stats-calculator';
import { makeMatch, makeTeamData, makeSeasonInfo } from '../fixtures/match-data';

// ─── tooltip content functions ─────────────────────────────────────────────────

const WIN_ROW = makeMatch({
  opponent: 'TeamB', goal_get: '2', goal_lose: '1',
  stadium: 'TestStadium', section_no: '3', start_time: '14:00', status: '試合終了',
});
const MATCH_DATE = '2025/03/15';

describe('makeWinContent', () => {
  test('contains MM/DD date, opponent, score, and stadium', () => {
    const html = makeWinContent(WIN_ROW, MATCH_DATE);
    expect(html).toContain('03/15');   // dateOnly('2025/03/15')
    expect(html).toContain('TeamB');
    expect(html).toContain('2-1');
    expect(html).toContain('TestStadium');
  });

  test('does not include section number or time (that is in tooltip span)', () => {
    const html = makeWinContent(WIN_ROW, MATCH_DATE);
    expect(html).not.toContain('(3)');
    expect(html).not.toContain('14:00');
  });
});

describe('makePkWinContent', () => {
  const PK_ROW = makeMatch({
    opponent: 'TeamC', goal_get: '1', goal_lose: '1',
    pk_get: 5, pk_lose: 3,
    stadium: 'PkStadium', section_no: '5', start_time: '15:30',
  });

  test('includes PK scores in parentheses', () => {
    const html = makePkWinContent(PK_ROW, MATCH_DATE);
    expect(html).toContain('(5-3)');
  });

  test('includes regulation score and stadium', () => {
    const html = makePkWinContent(PK_ROW, MATCH_DATE);
    expect(html).toContain('1-1');
    expect(html).toContain('PkStadium');
  });
});

describe('makeDrawContent', () => {
  test('contains only date and opponent (no score, no stadium)', () => {
    const html = makeDrawContent(WIN_ROW, MATCH_DATE);
    expect(html).toContain('03/15');
    expect(html).toContain('TeamB');
    expect(html).not.toContain('TestStadium');
    expect(html).not.toContain('2-1');
  });
});

describe('makeFullContent', () => {
  test('contains section number, time, date, opponent, score, and stadium', () => {
    const html = makeFullContent(WIN_ROW, MATCH_DATE);
    expect(html).toContain('(3)');          // section_no
    expect(html).toContain('14:00');        // start_time
    expect(html).toContain('03/15');        // dateOnly
    expect(html).toContain('TeamB');
    expect(html).toContain('2-1');
    expect(html).toContain('TestStadium');
  });
});

// ─── makeTeamStats ─────────────────────────────────────────────────────────────

describe('makeTeamStats', () => {
  test('disp=false shows "最新の状態" with latest stats', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/01' }),
      makeMatch({ goal_get: '0', goal_lose: '1', point: 0, match_date: '2025/03/08' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no');
    const html = makeTeamStats(td, false);
    expect(html).toContain('最新の状態');
    expect(html).toContain('1勝');
    expect(html).toContain('1敗');
    expect(html).toContain('勝点3');
  });

  test('disp=true shows "表示時の状態" with disp_* stats', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/01' }),
      makeMatch({ goal_get: '0', goal_lose: '1', point: 0, match_date: '2025/04/15' }), // after cutoff
    ]);
    calculateTeamStats(td, '2025/03/31', 'section_no');
    const html = makeTeamStats(td, true);
    expect(html).toContain('表示時の状態');
    // Only the March win is within display window
    expect(html).toContain('1勝');
    expect(html).toContain('0敗');
    expect(html).toContain('勝点3');
  });

  test('hasPk=false (default) omits PK line', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/01' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no');
    const html = makeTeamStats(td, false);
    expect(html).not.toContain('PK勝');
    expect(html).not.toContain('PK負');
  });

  test('hasPk=true includes PK win/loss in the output', () => {
    const td = makeTeamData([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/01' }),
    ]);
    calculateTeamStats(td, '2025/12/31', 'section_no');
    const html = makeTeamStats(td, false, true);
    expect(html).toContain('PK勝');
    expect(html).toContain('PK負');
  });
});

// ─── joinLossBox ───────────────────────────────────────────────────────────────

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

// ─── getRankClass ──────────────────────────────────────────────────────────────

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

// ─── getBright ─────────────────────────────────────────────────────────────────

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
