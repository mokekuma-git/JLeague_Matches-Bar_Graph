import { describe, test, expect } from 'vitest';
import { makeHtmlColumn } from '../../graph/bar-column';
import { calculateTeamStats } from '../../ranking/stats-calculator';
import { makeMatch, makeTeamData } from '../fixtures/match-data';

const TARGET = '2025/03/31';
const TEAM = 'TeamA';

// Helper: build a TeamData with stats computed, then return the column result.
function buildColumn(
  matches: ReturnType<typeof makeMatch>[],
  disp = false,
  target = TARGET,
) {
  const td = makeTeamData(matches);
  calculateTeamStats(td, target, 'section_no');
  return { result: makeHtmlColumn(TEAM, td, target, disp), td };
}

// ─── box class per result type ─────────────────────────────────────────────────

describe('makeHtmlColumn – box class per result type', () => {
  test('win (3 pt, within cutoff) → tall box in graph', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/15' }),
    ]);
    expect(result.graph).toHaveLength(1);
    expect(result.graph[0]).toContain('"tall box"');
    expect(result.lossBox).toHaveLength(0);
  });

  test('win box contains team CSS class', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/15' }),
    ]);
    expect(result.graph[0]).toContain(TEAM);
  });

  test('win (3 pt, tall) → tooltiptext does NOT include stadium', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/15', stadium: 'BigStadium' }),
    ]);
    const tooltiptext = result.graph[0].match(/<span class="tooltiptext[^"]*">(.*?)<\/span>/s);
    expect(tooltiptext).not.toBeNull();
    expect(tooltiptext![1]).not.toContain('BigStadium');
  });

  test('PK win (2 pt) → medium box in graph', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '1', goal_lose: '1', pk_get: 5, pk_lose: 3, point: 2, match_date: '2025/03/15' }),
    ]);
    expect(result.graph[0]).toContain('"medium box"');
  });

  test('draw (1 pt, no PK) → short box in graph', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '1', goal_lose: '1', pk_get: null, pk_lose: null, point: 1, match_date: '2025/03/15' }),
    ]);
    expect(result.graph[0]).toContain('"short box"');
  });

  test('loss (0 pt) → no graph entry, one lossBox entry', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '0', goal_lose: '2', point: 0, match_date: '2025/03/15' }),
    ]);
    expect(result.graph).toHaveLength(0);
    expect(result.lossBox).toHaveLength(1);
  });
});

// ─── future / display-future matches ──────────────────────────────────────────

describe('makeHtmlColumn – future and display-future boxes', () => {
  test('unplayed match → tall box with "future bg" class', () => {
    const { result } = buildColumn([
      makeMatch({ has_result: false, goal_get: '', goal_lose: '', point: 0, match_date: '2025/05/01' }),
    ]);
    expect(result.graph).toHaveLength(1);
    expect(result.graph[0]).toContain('future bg');
  });

  test('completed match after targetDate → tall box with "future bg"', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/04/15' }),
    ]);
    expect(result.graph[0]).toContain('future bg');
  });

  test('future box does NOT have "live" class', () => {
    const { result } = buildColumn([
      makeMatch({ has_result: false, goal_get: '', goal_lose: '', point: 0, match_date: '2025/05/01' }),
    ]);
    expect(result.graph[0]).not.toContain('"tall box live"');
  });
});

// ─── live match flag ───────────────────────────────────────────────────────────

describe('makeHtmlColumn – live match styling', () => {
  test('live win → "tall box live" CSS class', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '1', goal_lose: '0', point: 3, match_date: '2025/03/15', live: true, status: '前半' }),
    ]);
    expect(result.graph[0]).toContain('"tall box live"');
  });

  test('live draw → "short box live" CSS class', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '1', goal_lose: '1', pk_get: null, pk_lose: null, point: 1, match_date: '2025/03/15', live: true }),
    ]);
    expect(result.graph[0]).toContain('"short box live"');
  });

  test('live loss → lossBox entry wrapped in <div class="live">', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '0', goal_lose: '1', point: 0, match_date: '2025/03/15', live: true }),
    ]);
    expect(result.lossBox[0]).toContain('<div class="live">');
  });
});

// ─── avlbl_pt always equals disp_avlbl_pt ──────────────────────────────────────

describe('makeHtmlColumn – avlbl_pt is always disp_avlbl_pt', () => {
  // Win in March (within cutoff) + loss in April (after cutoff):
  //   avlbl_pt     = 3   (win only; April loss contributes 0 to latest)
  //   disp_avlbl_pt = 6  (3 win + 3 potential for April gray box)
  //
  // The April match is displayed as a "future" gray box (3pt tall) regardless of
  // its actual result. avlbl_pt must match the visible column height = disp_avlbl_pt.
  const MATCHES = [
    makeMatch({ goal_get: '2', goal_lose: '0', point: 3, match_date: '2025/03/15', section_no: '1' }),
    makeMatch({ goal_get: '0', goal_lose: '1', point: 0, match_date: '2025/04/15', section_no: '2' }),
  ];

  test('disp=false → avlbl_pt equals disp_avlbl_pt (not latest avlbl_pt)', () => {
    const { result, td } = buildColumn(MATCHES, false);
    expect(result.avlbl_pt).toBe(td.disp_avlbl_pt); // 6
    expect(result.avlbl_pt).not.toBe(td.avlbl_pt);  // not 3
  });

  test('disp=true → avlbl_pt also equals disp_avlbl_pt', () => {
    const { result, td } = buildColumn(MATCHES, true);
    expect(result.avlbl_pt).toBe(td.disp_avlbl_pt); // 6
  });

  test('disp flag does not change avlbl_pt (both use disp_avlbl_pt)', () => {
    const td = makeTeamData(MATCHES);
    calculateTeamStats(td, TARGET, 'section_no');
    const latestAP = makeHtmlColumn(TEAM, td, TARGET, false).avlbl_pt;
    const dispAP   = makeHtmlColumn(TEAM, td, TARGET, true).avlbl_pt;
    expect(latestAP).toBe(dispAP); // both = disp_avlbl_pt = 6
  });
});

// ─── matchDates collection ─────────────────────────────────────────────────────

describe('makeHtmlColumn – matchDates', () => {
  test('collects YYYY/MM/DD dates from played matches', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '1', goal_lose: '0', point: 3, match_date: '2025/03/01' }),
      makeMatch({ goal_get: '0', goal_lose: '1', point: 0, match_date: '2025/03/15' }),
    ]);
    expect(result.matchDates).toContain('2025/03/01');
    expect(result.matchDates).toContain('2025/03/15');
  });

  test('matchDates is sorted ascending', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '1', goal_lose: '0', point: 3, match_date: '2025/03/15', section_no: '2' }),
      makeMatch({ goal_get: '0', goal_lose: '1', point: 0, match_date: '2025/03/01', section_no: '1' }),
    ]);
    expect(result.matchDates[0]).toBe('2025/03/01');
    expect(result.matchDates[1]).toBe('2025/03/15');
  });

  test('empty match_date normalized to "未定" is excluded from matchDates', () => {
    const { result } = buildColumn([
      makeMatch({ has_result: false, goal_get: '', goal_lose: '', point: 0, match_date: '' }),
    ]);
    expect(result.matchDates).toHaveLength(0);
  });
});

// ─── lossBox content ───────────────────────────────────────────────────────────

describe('makeHtmlColumn – lossBox content', () => {
  test('lossBox entry contains match details from makeFullContent', () => {
    const { result } = buildColumn([
      makeMatch({
        goal_get: '0', goal_lose: '2', point: 0, match_date: '2025/03/15',
        opponent: 'TeamB', stadium: 'LossStadium', section_no: '4',
      }),
    ]);
    expect(result.lossBox[0]).toContain('TeamB');
    expect(result.lossBox[0]).toContain('LossStadium');
    expect(result.lossBox[0]).toContain('(4)');
  });

  test('multiple losses accumulate in lossBox order', () => {
    const { result } = buildColumn([
      makeMatch({ goal_get: '0', goal_lose: '1', point: 0, match_date: '2025/03/01', section_no: '1' }),
      makeMatch({ goal_get: '0', goal_lose: '2', point: 0, match_date: '2025/03/08', section_no: '2' }),
    ]);
    expect(result.lossBox).toHaveLength(2);
  });
});

// ─── old-two-points system ─────────────────────────────────────────────────────

describe('makeHtmlColumn – old-two-points system', () => {
  function buildOldColumn(matches: ReturnType<typeof makeMatch>[]) {
    const td = makeTeamData(matches);
    calculateTeamStats(td, TARGET, 'section_no', 'old-two-points');
    return { result: makeHtmlColumn(TEAM, td, TARGET, false, false, 'old-two-points'), td };
  }

  test('win (2 pt) → medium box', () => {
    const { result } = buildOldColumn([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 2, match_date: '2025/03/15' }),
    ]);
    expect(result.graph[0]).toContain('"medium box"');
  });

  test('win (2 pt, medium) → tooltiptext includes stadium', () => {
    const { result } = buildOldColumn([
      makeMatch({ goal_get: '2', goal_lose: '0', point: 2, match_date: '2025/03/15', stadium: 'OldStadium' }),
    ]);
    const tooltiptext = result.graph[0].match(/<span class="tooltiptext[^"]*">(.*?)<\/span>/s);
    expect(tooltiptext).not.toBeNull();
    expect(tooltiptext![1]).toContain('OldStadium');
  });

  test('draw (1 pt) → short box', () => {
    const { result } = buildOldColumn([
      makeMatch({ goal_get: '1', goal_lose: '1', point: 1, match_date: '2025/03/15' }),
    ]);
    expect(result.graph[0]).toContain('"short box"');
  });

  test('future match → medium box (max 2pt)', () => {
    const { result } = buildOldColumn([
      makeMatch({ has_result: false, goal_get: '', goal_lose: '', point: 0, match_date: '2025/05/01' }),
    ]);
    expect(result.graph[0]).toContain('future bg');
    expect(result.graph[0]).toContain('"medium box"');
  });

  test('loss (0 pt) → goes to lossBox', () => {
    const { result } = buildOldColumn([
      makeMatch({ goal_get: '0', goal_lose: '2', point: 0, match_date: '2025/03/15' }),
    ]);
    expect(result.graph).toHaveLength(0);
    expect(result.lossBox).toHaveLength(1);
  });
});
