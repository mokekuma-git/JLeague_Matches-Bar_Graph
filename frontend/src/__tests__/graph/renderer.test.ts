// @vitest-environment happy-dom

import { describe, test, expect } from 'vitest';
import {
  getScaleColumnPositions,
  makePointColumn,
  assembleTeamColumn,
  renderBarGraph,
  findSliderIndex,
  formatSliderDate,
} from '../../graph/renderer';
import { buildTeamColumn } from '../../graph/bar-column';
import { calculateTeamStats } from '../../ranking/stats-calculator';
import { makeMatch, makeTeamData, makeSeasonInfo } from '../fixtures/match-data';
import type { ColumnResult } from '../../graph/bar-column';

// ─── getScaleColumnPositions ──────────────────────────────────────────────────────

describe('getScaleColumnPositions', () => {
  test('promotion=0, relegation=0 → mid only', () => {
    const info = makeSeasonInfo({ teamCount: 10, promotionCount: 0, relegationCount: 0 });
    expect(getScaleColumnPositions(info)).toEqual([5]);
  });

  test('teamCount=4 with promotion=1, relegation=1 → [1, 2, 3]', () => {
    const info = makeSeasonInfo({ teamCount: 4, promotionCount: 1, relegationCount: 1 });
    expect(getScaleColumnPositions(info)).toEqual([1, 2, 3]);
  });

  test('teamCount=20, promotion=3, relegation=4 → [3, 10, 16]', () => {
    const info = makeSeasonInfo({ teamCount: 20, promotionCount: 3, relegationCount: 4 });
    expect(getScaleColumnPositions(info)).toEqual([3, 10, 16]);
  });

  test('promotion only (relegation=0) → [promotionCount, mid]', () => {
    const info = makeSeasonInfo({ teamCount: 10, promotionCount: 3, relegationCount: 0 });
    expect(getScaleColumnPositions(info)).toEqual([3, 5]);
  });

  test('relegation only (promotion=0) → [mid, relegationCutoff]', () => {
    const info = makeSeasonInfo({ teamCount: 10, promotionCount: 0, relegationCount: 2 });
    expect(getScaleColumnPositions(info)).toEqual([5, 8]);
  });

  test('odd teamCount uses floor: teamCount=11 → mid=5', () => {
    const info = makeSeasonInfo({ teamCount: 11, promotionCount: 0, relegationCount: 0 });
    expect(getScaleColumnPositions(info)).toEqual([5]);
  });
});

// ─── makePointColumn ────────────────────────────────────────────────────────

describe('makePointColumn', () => {
  test('maxAvblPt=3 → contains boxes 1, 2, 3', () => {
    const col = makePointColumn(3, false);
    const texts = Array.from(col.querySelectorAll('.point.box')).map(b => b.textContent);
    expect(texts).toContain('1');
    expect(texts).toContain('2');
    expect(texts).toContain('3');
  });

  test('contains header cells 順位 and 勝点', () => {
    const col = makePointColumn(5, false);
    const texts = Array.from(col.querySelectorAll('.point.box')).map(b => b.textContent);
    expect(texts).toContain('順位');
    expect(texts).toContain('勝点');
  });

  test('bottomFirst=false → ascending order in HTML (1 appears before 3)', () => {
    const col = makePointColumn(3, false);
    const texts = Array.from(col.querySelectorAll('.point.box')).map(b => b.textContent);
    expect(texts.indexOf('1')).toBeLessThan(texts.indexOf('3'));
  });

  test('bottomFirst=true → descending order in HTML (3 appears before 1)', () => {
    const col = makePointColumn(3, true);
    const texts = Array.from(col.querySelectorAll('.point.box')).map(b => b.textContent);
    expect(texts.indexOf('3')).toBeLessThan(texts.indexOf('1'));
  });

  test('contains point_column class', () => {
    expect(makePointColumn(1, false).classList.contains('point_column')).toBe(true);
  });
});

// ─── assembleTeamColumn ────────────────────────────────────────────────────────

/** Build a ColumnResult from matches using the real buildTeamColumn pipeline. */
function buildCol(
  teamName: string,
  matches: ReturnType<typeof makeMatch>[],
  targetDate = '2025/12/31',
  disp = false,
): ColumnResult {
  const td = makeTeamData(matches);
  calculateTeamStats(td, targetDate, 'section_no');
  return buildTeamColumn(teamName, td, targetDate, disp);
}

describe('assembleTeamColumn', () => {
  const info = makeSeasonInfo({ teamCount: 4, promotionCount: 1, relegationCount: 1 });

  test('space box added when avlbl_pt < maxAvblPt', () => {
    const col = buildCol('TeamA', [makeMatch({ point: 3, has_result: true })]);
    // avlbl_pt = 3, maxAvblPt = 6 → space = 3
    const el = assembleTeamColumn(col, 1, 6, 20, false, info);
    const spaceBox = el.querySelector('.space.box') as HTMLElement | null;
    expect(spaceBox).not.toBeNull();
    expect(spaceBox!.style.height).toBe('60px'); // 3 × 20
  });

  test('no space box when avlbl_pt === maxAvblPt', () => {
    const col = buildCol('TeamA', [makeMatch({ point: 3, has_result: true })]);
    const maxAvblPt = col.avlbl_pt;
    const el = assembleTeamColumn(col, 1, maxAvblPt, 20, false, info);
    expect(el.querySelector('.space.box')).toBeNull();
  });

  test('team column has correct id attribute', () => {
    const col = buildCol('TeamA', [makeMatch({ point: 3 })]);
    const el = assembleTeamColumn(col, 1, col.avlbl_pt, 20, false, info);
    expect(el.id).toBe('TeamA_column');
  });

  test('rank=1 → promoted CSS class', () => {
    const col = buildCol('TeamA', []);
    const el = assembleTeamColumn(col, 1, 0, 20, false, info);
    expect(el.querySelector('.promoted')).not.toBeNull();
  });

  test('rank=4 (last, relegationCount=1) → relegated CSS class', () => {
    const col = buildCol('TeamD', []);
    const el = assembleTeamColumn(col, 4, 0, 20, false, info);
    expect(el.querySelector('.relegated')).not.toBeNull();
  });

  test('rank=2 → no promotion/relegation class', () => {
    const col = buildCol('TeamB', []);
    const el = assembleTeamColumn(col, 2, 0, 20, false, info);
    expect(el.querySelector('.promoted')).toBeNull();
    expect(el.querySelector('.relegated')).toBeNull();
  });

  test('bottomFirst=true → does not throw and still produces column element', () => {
    const col = buildCol('TeamA', [makeMatch({ point: 3 })]);
    const el = assembleTeamColumn(col, 1, col.avlbl_pt, 20, true, info);
    expect(el.id).toBe('TeamA_column');
  });

  test('original ColumnResult.graph is not mutated by reversal', () => {
    const col = buildCol('TeamA', [
      makeMatch({ point: 3, match_date: '2025/03/01' }),
      makeMatch({ point: 0, match_date: '2025/04/01', goal_get: 0, goal_lose: 1 }),
    ]);
    const originalGraphLength = col.graph.length;
    assembleTeamColumn(col, 1, col.avlbl_pt, 20, true, info);
    expect(col.graph).toHaveLength(originalGraphLength);
  });
});

// ─── renderBarGraph ──────────────────────────────────────────────────────────

describe('renderBarGraph', () => {
  const TARGET = '2025/12/31';
  const info = makeSeasonInfo({ teamCount: 3, promotionCount: 1, relegationCount: 1 });

  function buildGroupData(): Record<string, ReturnType<typeof makeTeamData>> {
    const teams = {
      TeamA: makeTeamData([
        makeMatch({ point: 3, match_date: '2025/03/01' }),
        makeMatch({ point: 3, match_date: '2025/04/01' }),
      ]),
      TeamB: makeTeamData([
        makeMatch({ point: 1, match_date: '2025/03/01', goal_get: 1, goal_lose: 1 }),
      ]),
      TeamC: makeTeamData([]),
    };
    for (const td of Object.values(teams)) {
      calculateTeamStats(td, TARGET, 'section_no');
    }
    return teams;
  }

  /** Mount a DocumentFragment into a container for querying. */
  function mountFragment(fragment: DocumentFragment): HTMLDivElement {
    const container = document.createElement('div');
    container.appendChild(fragment);
    return container;
  }

  test('matchDates always starts with sentinel 1970/01/01 for "開幕前" slider position', () => {
    const groupData = buildGroupData();
    const { matchDates } = renderBarGraph(
      groupData, ['TeamA', 'TeamB', 'TeamC'], info, TARGET, false, false, 20,
    );
    expect(matchDates[0]).toBe('1970/01/01');
  });

  test('matchDates contains sentinel + actual match dates in sorted order', () => {
    const groupData = buildGroupData();
    const { matchDates } = renderBarGraph(
      groupData, ['TeamA', 'TeamB', 'TeamC'], info, TARGET, false, false, 20,
    );
    expect(matchDates).toEqual(['1970/01/01', '2025/03/01', '2025/04/01']);
  });

  test('matchDates contains only sentinel when all teams have no matches', () => {
    const groupData = {
      TeamA: makeTeamData([]),
      TeamB: makeTeamData([]),
    };
    for (const td of Object.values(groupData)) {
      calculateTeamStats(td, TARGET, 'section_no');
    }
    const { matchDates } = renderBarGraph(
      groupData, ['TeamA', 'TeamB'], info, TARGET, false, false, 20,
    );
    expect(matchDates).toEqual(['1970/01/01']);
  });

  test('fragment contains all team column ids', () => {
    const groupData = buildGroupData();
    const sortedTeams = ['TeamA', 'TeamB', 'TeamC'];
    const { fragment } = renderBarGraph(
      groupData, sortedTeams, info, TARGET, false, false, 20,
    );
    const container = mountFragment(fragment);
    expect(container.querySelector('#TeamA_column')).not.toBeNull();
    expect(container.querySelector('#TeamB_column')).not.toBeNull();
    expect(container.querySelector('#TeamC_column')).not.toBeNull();
  });

  test('fragment starts and ends with point_column', () => {
    const groupData = buildGroupData();
    const { fragment } = renderBarGraph(
      groupData, ['TeamA', 'TeamB', 'TeamC'], info, TARGET, false, false, 20,
    );
    const container = mountFragment(fragment);
    const pointCols = container.querySelectorAll('.point_column');
    expect(pointCols.length).toBeGreaterThanOrEqual(2);
    expect(container.firstElementChild?.classList.contains('point_column')).toBe(true);
    expect(container.lastElementChild?.classList.contains('point_column')).toBe(true);
  });

  test('insertIndices causes extra point_column between teams', () => {
    // teamCount=3, promotion=1, relegation=1 → insertIndices=[1, 2, 2] deduped to {1, 2}
    // indices 1 and 2 get extra point columns
    const groupData = buildGroupData();
    const { fragment } = renderBarGraph(
      groupData, ['TeamA', 'TeamB', 'TeamC'], info, TARGET, false, false, 20,
    );
    const container = mountFragment(fragment);
    // Count point_column occurrences: start + insertions + end ≥ 3
    const count = container.querySelectorAll('.point_column').length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ─── findSliderIndex ─────────────────────────────────────────────────────────

describe('findSliderIndex', () => {
  // Typical matchDates as returned by renderBarGraph (sentinel + real dates).
  const DATES = ['1970/01/01', '2026/03/08', '2026/03/15', '2026/03/22'];

  test('targetDate before first real match → 0 (sentinel / 開幕前)', () => {
    expect(findSliderIndex(DATES, '2026/01/01')).toBe(0);
  });

  test('targetDate equals sentinel → 0', () => {
    expect(findSliderIndex(DATES, '1970/01/01')).toBe(0);
  });

  test('targetDate equals first real match → 1', () => {
    expect(findSliderIndex(DATES, '2026/03/08')).toBe(1);
  });

  test('targetDate between two match dates → last index ≤ targetDate', () => {
    expect(findSliderIndex(DATES, '2026/03/10')).toBe(1); // '2026/03/08' ≤ '2026/03/10' < '2026/03/15'
  });

  test('targetDate equals last match → last index', () => {
    expect(findSliderIndex(DATES, '2026/03/22')).toBe(3);
  });

  test('targetDate after last match → last index', () => {
    expect(findSliderIndex(DATES, '2099/12/31')).toBe(3);
  });

  test('single-element array (sentinel only) → 0', () => {
    expect(findSliderIndex(['1970/01/01'], '2026/03/08')).toBe(0);
  });
});

// ─── formatSliderDate ────────────────────────────────────────────────────────

describe('formatSliderDate', () => {
  test('sentinel 1970/01/01 → 開幕前', () => {
    expect(formatSliderDate('1970/01/01', '2026/03/08')).toBe('開幕前');
  });

  test('real match date → targetDate (exact user-requested date)', () => {
    // Slider snapped to '2026/03/08' but user typed '2026/03/10' → show targetDate.
    expect(formatSliderDate('2026/03/08', '2026/03/10')).toBe('2026/03/10');
  });

  test('real match date equals targetDate → that date', () => {
    expect(formatSliderDate('2026/03/08', '2026/03/08')).toBe('2026/03/08');
  });
});
