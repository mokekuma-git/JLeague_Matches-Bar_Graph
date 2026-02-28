// Bar graph column builder: generates box-graph HTML for a single team.
//
// Precondition: call calculateTeamStats(teamData, ...) before buildTeamColumn.
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
const BOX_HEIGHT_CLASS: Record<number, string> = {
  3: 'tall',
  2: 'medium',
  1: 'short',
};

function boxHeightClass(pointValue: number): string {
  const cls = BOX_HEIGHT_CLASS[pointValue];
  if (!cls) throw new Error(`No CSS height class for point value ${pointValue}`);
  return cls;
}

/** Result returned by buildTeamColumn, consumed by assembleTeamColumn (renderer). */
export interface ColumnResult {
  /** Box HTML strings in display order (before any reversal by the renderer). */
  graph: string[];
  /** Maximum points (displayStats.avlbl_pt). Used for space calculation. */
  avlbl_pt: number;
  teamName: string;
  /** Full-match content strings for loss matches (shown in team stats tooltip). */
  lossBox: string[];
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
 *   (none)           – loss (0 pt) → goes to lossBox only
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
 * @param disp       true → tooltip uses displayStats; false → latestStats.
 * @param hasPk      true → PK columns exist in the CSV.
 * @param pointSystem Scoring system.
 */
export function buildTeamColumn(
  teamName: string,
  teamData: TeamData,
  targetDate: string,
  disp: boolean,
  hasPk = false,
  pointSystem: PointSystem = 'standard',
): ColumnResult {
  const graph: string[] = [];
  const lossBox: string[] = [];
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
        // Loss (point === 0): no box; goes to lossBox for the stats tooltip
        let lossContent = makeFullContent(row, matchDate);
        if (row.live) {
          lossContent = `<div class="live">${lossContent}${statusSuffix}</div>`;
        }
        lossBox.push(lossContent);
      }
    }
  }

  return {
    graph,
    avlbl_pt: teamData.displayStats.avlbl_pt,
    teamName,
    lossBox,
    stats: makeTeamStats(disp ? teamData.displayStats : teamData.latestStats, disp, hasPk),
    matchDates: [...matchDateSet].sort(),
  };
}
