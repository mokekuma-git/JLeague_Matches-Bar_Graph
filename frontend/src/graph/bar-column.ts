// Bar graph column builder: generates box-graph HTML for a single team.
//
// Precondition: call calculateTeamStats(teamData, ...) before makeHtmlColumn.
// calculateTeamStats handles stat accumulation and sorts teamData.df in place.

import type { PointSystem } from '../types/config';
import type { TeamData } from '../types/match';
import { timeFormat } from '../core/date-utils';
import { getWinPoints } from '../core/point-calculator';
import { classifyResult } from '../ranking/stats-calculator';
import {
  makeWinContent,
  makePkWinContent,
  makeDrawContent,
  makeFullContent,
  makeTeamStats,
} from './tooltip';

/** CSS class name for box height based on point value. */
function boxHeightClass(pointValue: number): string {
  if (pointValue >= 3) return 'tall';
  if (pointValue === 2) return 'medium';
  return 'short';
}

/** Result returned by makeHtmlColumn, consumed by appendSpaceCols (renderer). */
export interface ColumnResult {
  /** Box HTML strings in display order (before any reversal by the renderer). */
  graph: string[];
  /** Display-mode maximum points (disp_avlbl_pt or avlbl_pt). Used for space calculation. */
  avlbl_pt: number;
  teamName: string;
  /** Full-match content strings for loss matches (shown in team stats tooltip). */
  loseBox: string[];
  /** Pre-rendered stats HTML for the team name tooltip. */
  stats: string;
  /** Sorted unique YYYY/MM/DD match dates encountered (for the date slider). */
  matchDates: string[];
}

/**
 * Generates the bar graph box list for a single team.
 *
 * Box heights correspond to result types (under standard 3-1-0):
 *   tall (.tall)   – win (3 pt) or any display-future match
 *   medium (.medium) – PK win (2 pt)
 *   short (.short)   – draw / PK loss (1 pt)
 *   (none)           – loss (0 pt) → goes to loseBox only
 *
 * Under old-two-points (2-1-0):
 *   medium (.medium) – win (2 pt) or display-future match
 *   short (.short)   – draw (1 pt)
 *
 * A "display-future" match is either:
 *   (a) unplayed (has_result=false), or
 *   (b) completed but with match_date > targetDate (after display cutoff).
 *
 * @param teamName   Team identifier (used as CSS class on boxes and tooltips).
 * @param teamData   TeamData with stats already computed by calculateTeamStats.
 * @param targetDate Display cutoff date 'YYYY/MM/DD'.
 * @param disp       true → column height uses disp_avlbl_pt; false → avlbl_pt.
 * @param hasPk      true → PK columns exist in the CSV.
 * @param pointSystem Scoring system.
 */
export function makeHtmlColumn(
  teamName: string,
  teamData: TeamData,
  targetDate: string,
  disp: boolean,
  hasPk = false,
  pointSystem: PointSystem = 'standard',
): ColumnResult {
  const graph: string[] = [];
  const loseBox: string[] = [];
  const matchDateSet = new Set<string>();
  const winPt = getWinPoints(pointSystem);
  const futureClass = boxHeightClass(winPt);

  for (const row of teamData.df) {
    // Normalize display date: empty string → '未定'
    const matchDate = row.match_date === '' ? '未定' : row.match_date;
    if (matchDate !== '未定') matchDateSet.add(matchDate);

    const statusSuffix = row.status ? `<br/>${row.status}` : '';

    if (!row.has_result || matchDate > targetDate) {
      // Unplayed or completed-after-cutoff: future (ghost) styling
      graph.push(
        `<div class="${futureClass} box"><div class="future bg ${teamName}"></div><p class="tooltip">`
        + makeWinContent(row, matchDate)
        + `<span class="tooltiptext ${teamName}">(${row.section_no}) ${timeFormat(row.start_time)}`
        + `${statusSuffix}</span></p></div>\n`,
      );
    } else {
      const cls = classifyResult(row.point, row.pk_get, pointSystem);
      const liveCls = row.live ? ' live' : '';
      if (cls === 'win') {
        const heightCls = boxHeightClass(winPt);
        const stadiumLine = heightCls !== 'tall' ? `<br/>${row.stadium}` : '';
        graph.push(
          `<div class="${heightCls} box${liveCls}"><p class="tooltip ${teamName}">`
          + makeWinContent(row, matchDate)
          + `<span class="tooltiptext halfW ${teamName}">(${row.section_no}) ${timeFormat(row.start_time)}`
          + `${stadiumLine}${statusSuffix}</span></p></div>\n`,
        );
      } else if (cls === 'pk_win') {
        graph.push(
          `<div class="medium box${liveCls}"><p class="tooltip ${teamName}">`
          + makePkWinContent(row, matchDate)
          + `<span class="tooltiptext halfW ${teamName}">(${row.section_no}) ${timeFormat(row.start_time)}`
          + `<br/>${row.stadium}${statusSuffix}</span></p></div>\n`,
        );
      } else if (cls === 'draw' || cls === 'pk_loss') {
        graph.push(
          `<div class="short box${liveCls}"><p class="tooltip ${teamName}">`
          + makeDrawContent(row, matchDate)
          + `<span class="tooltiptext fullW ${teamName}">`
          + makeFullContent(row, matchDate)
          + `${statusSuffix}</span></p></div>`,
        );
      } else {
        // Loss (point === 0): no box; goes to loseBox for the stats tooltip
        let loseContent = makeFullContent(row, matchDate);
        if (row.live) {
          loseContent = `<div class="live">${loseContent}${statusSuffix}</div>`;
        }
        loseBox.push(loseContent);
      }
    }
  }

  // Always use disp_avlbl_pt for the column height, regardless of the disp flag.
  const avlbl_pt = teamData.disp_avlbl_pt ?? 0;

  return {
    graph,
    avlbl_pt,
    teamName,
    loseBox,
    stats: makeTeamStats(teamData, disp, hasPk),
    matchDates: [...matchDateSet].sort(),
  };
}
