// Bar graph column builder: generates box-graph HTML for a single team.
//
// Precondition: call calculateTeamStats(teamData, ...) before makeHtmlColumn.
// calculateTeamStats handles stat accumulation and sorts teamData.df in place.

import type { TeamData } from '../types/match';
import { timeFormat } from '../core/date-utils';
import {
  makeWinContent,
  makePkWinContent,
  makeDrawContent,
  makeFullContent,
  makeTeamStats,
} from './tooltip';

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
 * Box heights correspond to result types:
 *   tall (.tall)   – win (3 pt) or any display-future match
 *   medium (.medium) – PK win (2 pt)
 *   short (.short)   – draw / PK loss (1 pt)
 *   (none)           – loss (0 pt) → goes to loseBox only
 *
 * A "display-future" match is either:
 *   (a) unplayed (has_result=false), or
 *   (b) completed but with match_date > targetDate (after display cutoff).
 *
 * @param teamName   Team identifier (used as CSS class on boxes and tooltips).
 * @param teamData   TeamData with stats already computed by calculateTeamStats.
 * @param targetDate Display cutoff date 'YYYY/MM/DD'.
 * @param disp       true → column height uses disp_avlbl_pt; false → avlbl_pt.
 */
export function makeHtmlColumn(
  teamName: string,
  teamData: TeamData,
  targetDate: string,
  disp: boolean,
): ColumnResult {
  const graph: string[] = [];
  const loseBox: string[] = [];
  const matchDateSet = new Set<string>();

  for (const row of teamData.df) {
    // Normalize display date: empty string → '未定'
    const matchDate = row.match_date === '' ? '未定' : row.match_date;
    if (matchDate !== '未定') matchDateSet.add(matchDate);

    if (!row.has_result || matchDate > targetDate) {
      // Unplayed or completed-after-cutoff: tall box with future (ghost) styling
      graph.push(
        '<div class="tall box"><div class="future bg ' + teamName + '"></div><p class="tooltip">'
        + makeWinContent(row, matchDate)
        + '<span class="tooltiptext ' + teamName + '">(' + row.section_no + ') ' + timeFormat(row.start_time)
        + (row.status ? '<br/>' + row.status : '') + '</span></p></div>\n',
      );
    } else if (row.point === 3) {
      graph.push(
        '<div class="tall box' + (row.live ? ' live' : '') + '"><p class="tooltip '
        + teamName + '">' + makeWinContent(row, matchDate)
        + '<span class="tooltiptext halfW ' + teamName + '">(' + row.section_no + ') ' + timeFormat(row.start_time)
        + (row.status ? '<br/>' + row.status : '') + '</span></p></div>\n',
      );
    } else if (row.point === 2) {
      graph.push(
        '<div class="medium box' + (row.live ? ' live' : '') + '"><p class="tooltip '
        + teamName + '">' + makePkWinContent(row, matchDate)
        + '<span class="tooltiptext halfW ' + teamName + '">(' + row.section_no + ') ' + timeFormat(row.start_time)
        + '<br/>' + row.stadium
        + (row.status ? '<br/>' + row.status : '') + '</span></p></div>\n',
      );
    } else if (row.point === 1) {
      graph.push(
        '<div class="short box' + (row.live ? ' live' : '') + '"><p class="tooltip ' + teamName + '">'
        + makeDrawContent(row, matchDate)
        + '<span class="tooltiptext fullW ' + teamName + '">'
        + makeFullContent(row, matchDate)
        + (row.status ? '<br/>' + row.status : '') + '</span></p></div>',
      );
    } else {
      // Loss (point === 0): no box; goes to loseBox for the stats tooltip
      let loseContent = makeFullContent(row, matchDate);
      if (row.live) {
        loseContent = '<div class="live">' + loseContent
          + (row.status ? '<br/>' + row.status : '') + '</div>';
      }
      loseBox.push(loseContent);
    }
  }

  // Always use disp_avlbl_pt for the column height, regardless of the disp flag.
  //
  // The visible height of the column = disp_point + (future/after-cutoff matches) × 3
  //                                  = disp_avlbl_pt (by definition).
  //
  // When disp=false and viewing a past date, matches completed after the display cutoff
  // are shown as gray "future" boxes (3pt high each), but their actual results may be
  // losses (0pt). Using avlbl_pt (latest) in that case would under-count the visible
  // height and misalign the space box. disp_avlbl_pt always matches what's drawn.
  //
  // The disp flag continues to affect only the tooltip stats (makeTeamStats).
  const avlbl_pt = teamData.disp_avlbl_pt ?? 0;

  return {
    graph,
    avlbl_pt,
    teamName,
    loseBox,
    stats: makeTeamStats(teamData, disp),
    matchDates: [...matchDateSet].sort(),
  };
}
