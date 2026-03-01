// Bar graph renderer: assembles DOM elements from ColumnResult objects.
//
// All exported functions build DOM nodes. The caller (app.ts)
// is responsible for inserting the returned fragment into the DOM.

import type { TeamData } from '../types/match';
import type { SeasonInfo } from '../types/season';
import { buildTeamColumn } from './bar-column';
import type { ColumnResult } from './bar-column';
import { getRankClass, joinLossBox } from './tooltip';

/** Return value of renderBarGraph, consumed by app.ts. */
export interface RenderResult {
  /** DocumentFragment to insert into #box_container. */
  fragment: DocumentFragment;
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
export function getScaleColumnPositions(seasonInfo: SeasonInfo): number[] {
  const columns: number[] = [Math.floor(seasonInfo.teamCount / 2)];
  if (seasonInfo.promotionCount !== 0) columns.unshift(seasonInfo.promotionCount);
  if (seasonInfo.relegationCount !== 0) columns.push(seasonInfo.teamCount - seasonInfo.relegationCount);
  return columns;
}

/** Create a point box <div> with text content. */
function createPointBox(text: string): HTMLDivElement {
  const div = document.createElement('div');
  div.classList.add('point', 'box');
  div.textContent = text;
  return div;
}

/**
 * Generates the point scale column as a DOM element.
 *
 * Contains header cells (rank/point), numbered boxes 1..maxAvblPt, then footer cells.
 * bottomFirst=true → number list is reversed (large values at top).
 */
export function makePointColumn(maxAvblPt: number, bottomFirst: boolean): HTMLDivElement {
  const col = document.createElement('div');
  col.classList.add('point_column');

  col.appendChild(createPointBox('順位'));
  col.appendChild(createPointBox('勝点'));

  const indices = Array.from({ length: maxAvblPt }, (_, i) => i + 1);
  if (bottomFirst) indices.reverse();
  for (const i of indices) {
    col.appendChild(createPointBox(String(i)));
  }

  col.appendChild(createPointBox('勝点'));
  col.appendChild(createPointBox('順位'));

  return col;
}

/**
 * Assembles one team's bar graph column as a DOM element from a ColumnResult.
 *
 * Steps:
 *   1. Add a space box at the top (height = (maxAvblPt - col.avlbl_pt) × heightUnit px).
 *   2. If bottomFirst, reverse graph[] and lossBox[].
 *   3. Wrap with rank_cell (top/bottom) and team_name tooltip boxes.
 *
 * Returns: <div id="TEAM_column">rank + name + boxes + name + rank</div>
 */
export function assembleTeamColumn(
  col: ColumnResult,
  rank: number,
  maxAvblPt: number,
  heightUnit: number,
  bottomFirst: boolean,
  seasonInfo: SeasonInfo,
): HTMLDivElement {
  // Clone arrays so we don't mutate the original ColumnResult.
  const graph = [...col.graph];
  const lossBox = [...col.lossBox];

  const spaceCols = maxAvblPt - col.avlbl_pt;
  if (spaceCols > 0) {
    const spaceBox = document.createElement('div');
    spaceBox.classList.add('space', 'box');
    spaceBox.style.height = `${heightUnit * spaceCols}px`;
    spaceBox.textContent = `(${spaceCols})`;
    graph.push(spaceBox);
  }

  if (bottomFirst) {
    graph.reverse();
    lossBox.reverse();
  }

  const rankClass = getRankClass(rank, seasonInfo);

  function createRankCell(): HTMLDivElement {
    const div = document.createElement('div');
    div.classList.add('short', 'box');
    if (rankClass) div.classList.add(rankClass);
    div.textContent = String(rank);
    return div;
  }

  function createTeamNameTooltip(): HTMLDivElement {
    const div = document.createElement('div');
    div.classList.add('short', 'box', 'tooltip', col.teamName);
    div.append(col.teamName);
    const span = document.createElement('span');
    span.classList.add('tooltiptext', 'fullW', col.teamName);
    span.innerHTML = `成績情報:<hr/>${col.stats}<hr/>敗戦記録:<hr/>${joinLossBox(lossBox)}`;
    div.appendChild(span);
    return div;
  }

  const wrapper = document.createElement('div');
  wrapper.id = `${col.teamName}_column`;
  wrapper.appendChild(createRankCell());
  wrapper.appendChild(createTeamNameTooltip());
  for (const el of graph) {
    wrapper.appendChild(el);
  }
  wrapper.appendChild(createTeamNameTooltip());
  wrapper.appendChild(createRankCell());

  return wrapper;
}

/**
 * Generates the complete bar graph as a DocumentFragment.
 *
 * Pipeline:
 *   1. For each team, run buildTeamColumn → collect ColumnResult and matchDates.
 *   2. Compute max_avlbl_pt across all teams.
 *   3. Determine point column insertion positions (getScaleColumnPositions).
 *   4. Assemble: point_column + [team columns with interleaved point columns] + point_column.
 *   5. Return { fragment, matchDates } — no DOM writes to the live document.
 *
 * @param groupData    TeamData map (stats NOT yet computed — computed inside buildTeamColumn's
 *                     caller calculateTeamStats, which must be called before this function).
 * @param sortedTeams  Team names in display order.
 * @param seasonInfo   Season configuration.
 * @param targetDate   Display cutoff date 'YYYY/MM/DD'.
 * @param disp         true → use displayStats for tooltip; false → latestStats.
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
    const col = buildTeamColumn(teamName, teamData, targetDate, disp, hasPk, seasonInfo.pointSystem);
    columns[teamName] = col;
    maxAvblPt = Math.max(maxAvblPt, col.avlbl_pt);
    for (const d of col.matchDates) matchDateSet.add(d);
  }

  const matchDates = [...matchDateSet].sort();

  // Step 2: Build point column template and insertion index set.
  const pointColumn = makePointColumn(maxAvblPt, bottomFirst);
  const insertIndices = new Set(getScaleColumnPositions(seasonInfo));

  // Step 3: Assemble into DocumentFragment.
  const fragment = document.createDocumentFragment();
  fragment.appendChild(pointColumn.cloneNode(true));

  sortedTeams.forEach((teamName, index) => {
    if (insertIndices.has(index)) {
      fragment.appendChild(pointColumn.cloneNode(true));
    }
    const col = columns[teamName];
    if (col) {
      fragment.appendChild(
        assembleTeamColumn(col, index + 1, maxAvblPt, heightUnit, bottomFirst, seasonInfo),
      );
    }
  });
  fragment.appendChild(pointColumn.cloneNode(true));

  return { fragment, matchDates };
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
