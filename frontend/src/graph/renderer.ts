// Bar graph renderer: assembles full HTML from ColumnResult objects.
//
// All exported functions are pure (no DOM writes). The caller (j_points.ts)
// is responsible for writing the returned HTML to the DOM.

import type { TeamData } from '../types/match';
import type { SeasonInfo } from '../types/season';
import { makeHtmlColumn } from './bar-column';
import type { ColumnResult } from './bar-column';
import { getRankClass, joinLoseBox } from './tooltip';

/** Return value of renderBarGraph, consumed by j_points.ts. */
export interface RenderResult {
  /** Complete HTML string to write into #box_container. */
  html: string;
  /** Sorted unique YYYY/MM/DD match dates across all teams (for date slider). */
  matchDates: string[];
}

/**
 * Returns the team-column indices at which an extra point scale column is inserted.
 *
 * Always includes: Math.floor(teamCount / 2)  ← mid-table
 * If promotionCount > 0: unshift(promotionCount) before mid
 * If relegationCount > 0: push(teamCount - relegationCount) after mid
 *
 * Example: teamCount=20, promotion=3, relegation=4 → [3, 10, 16]
 */
export function makeInsertColumns(seasonInfo: SeasonInfo): number[] {
  const columns: number[] = [Math.floor(seasonInfo.teamCount / 2)];
  if (seasonInfo.promotionCount !== 0) columns.unshift(seasonInfo.promotionCount);
  if (seasonInfo.relegationCount !== 0) columns.push(seasonInfo.teamCount - seasonInfo.relegationCount);
  return columns;
}

/**
 * Generates the point scale column HTML.
 *
 * Contains header cells (rank/point), numbered boxes 1..maxAvblPt, then footer cells.
 * bottomFirst=true → number list is reversed (large values at top).
 */
export function makePointColumn(maxAvblPt: number, bottomFirst: boolean): string {
  const boxList = Array.from({ length: maxAvblPt }, (_, i) => i + 1)
    .map(i => `<div class="point box">${i}</div>`);
  if (bottomFirst) boxList.reverse();
  return `<div class="point_column"><div class="point box">順位</div><div class="point box">勝点</div>`
    + boxList.join('')
    + `<div class="point box">勝点</div><div class="point box">順位</div></div>\n\n`;
}

/**
 * Assembles one team's bar graph column HTML from a ColumnResult.
 *
 * Steps:
 *   1. Add a space box at the top (height = (maxAvblPt - col.avlbl_pt) × heightUnit px).
 *   2. If bottomFirst, reverse graph[] and loseBox[].
 *   3. Wrap with rank_cell (top/bottom) and team_name tooltip boxes.
 *
 * Returns: <div id="TEAM_column">rank + name + boxes + name + rank</div>
 */
export function appendSpaceCols(
  col: ColumnResult,
  rank: number,
  maxAvblPt: number,
  heightUnit: number,
  bottomFirst: boolean,
  seasonInfo: SeasonInfo,
): string {
  // Clone arrays so we don't mutate the original ColumnResult.
  const graph = [...col.graph];
  const loseBox = [...col.loseBox];

  const spaceCols = maxAvblPt - col.avlbl_pt;
  if (spaceCols > 0) {
    graph.push(`<div class="space box" style="height:${heightUnit * spaceCols}px">(${spaceCols})</div>`);
  }

  if (bottomFirst) {
    graph.reverse();
    loseBox.reverse();
  }

  const rankClass = getRankClass(rank, seasonInfo);
  const rankCell = `<div class="short box ${rankClass}">${rank}</div>`;
  const teamName = `<div class="short box tooltip ${col.teamName}">${col.teamName}`
    + `<span class=" tooltiptext fullW ${col.teamName}">`
    + `成績情報:<hr/>${col.stats}<hr/>敗戦記録:<hr/>${joinLoseBox(loseBox)}</span></div>\n`;

  return `<div id="${col.teamName}_column">${rankCell}${teamName}${graph.join('')}${teamName}${rankCell}</div>\n\n`;
}

/**
 * Generates the complete bar graph HTML.
 *
 * Pipeline:
 *   1. For each team, run makeHtmlColumn → collect ColumnResult and matchDates.
 *   2. Compute max_avlbl_pt across all teams.
 *   3. Determine point column insertion positions (makeInsertColumns).
 *   4. Assemble: point_column + [team columns with interleaved point columns] + point_column.
 *   5. Return { html, matchDates } — no DOM writes.
 *
 * @param groupData    TeamData map (stats NOT yet computed — computed inside makeHtmlColumn's
 *                     caller calculateTeamStats, which must be called before this function).
 * @param sortedTeams  Team names in display order.
 * @param seasonInfo   Season configuration.
 * @param targetDate   Display cutoff date 'YYYY/MM/DD'.
 * @param disp         true → use disp_avlbl_pt for column heights.
 * @param bottomFirst  true → reverse graph order so older/earlier matches appear at bottom.
 * @param heightUnit   CSS height in px for one point box (from getHeightUnit()).
 */
export function renderBarGraph(
  groupData: Record<string, TeamData>,
  sortedTeams: string[],
  seasonInfo: SeasonInfo,
  targetDate: string,
  disp: boolean,
  bottomFirst: boolean,
  heightUnit: number,
  hasPk = false,
): RenderResult {
  // Step 1: Build column results for each team and collect all match dates.
  const columns: Record<string, ColumnResult> = {};
  const matchDateSet = new Set<string>();
  let maxAvblPt = 0;

  // Sentinel: slider position 0 always maps to "開幕前" (before season start).
  // '1970/01/01' sorts before any J-League date (1993–), so it will be first after sort.
  matchDateSet.add('1970/01/01');

  for (const teamName of sortedTeams) {
    const teamData = groupData[teamName];
    if (!teamData) continue;
    const col = makeHtmlColumn(teamName, teamData, targetDate, disp, hasPk, seasonInfo.pointSystem);
    columns[teamName] = col;
    maxAvblPt = Math.max(maxAvblPt, col.avlbl_pt);
    for (const d of col.matchDates) matchDateSet.add(d);
  }

  const matchDates = [...matchDateSet].sort();

  // Step 2: Build point column and insertion index set.
  const pointColumn = makePointColumn(maxAvblPt, bottomFirst);
  const insertIndices = new Set(makeInsertColumns(seasonInfo));

  // Step 3: Assemble full HTML.
  let html = pointColumn;
  sortedTeams.forEach((teamName, index) => {
    if (insertIndices.has(index)) html += pointColumn;
    const col = columns[teamName];
    if (col) {
      html += appendSpaceCols(col, index + 1, maxAvblPt, heightUnit, bottomFirst, seasonInfo);
    }
  });
  html += pointColumn;

  return { html, matchDates };
}

// ---- Slider utilities (pure, exported for testing) ----------------------

/**
 * Returns the slider index for a given target date within the matchDates array.
 *
 * Finds the last index i where matchDates[i] <= targetDate.
 * If targetDate is before the first real match (or equals the sentinel '1970/01/01'),
 * returns 0 (the "開幕前" sentinel position).
 */
export function findSliderIndex(matchDates: string[], targetDate: string): number {
  let idx = matchDates.length - 1;
  for (let i = 0; i < matchDates.length; i++) {
    if (matchDates[i] > targetDate) {
      idx = Math.max(0, i - 1);
      break;
    }
  }
  return idx;
}

/**
 * Returns the display text for a resolved slider date.
 *
 * When sliderDate is the sentinel '1970/01/01', returns '開幕前'.
 * Otherwise returns targetDate (the exact date the user requested,
 * which may differ from sliderDate when typed between match days).
 */
export function formatSliderDate(sliderDate: string, targetDate: string): string {
  return sliderDate === '1970/01/01' ? '開幕前' : targetDate;
}
