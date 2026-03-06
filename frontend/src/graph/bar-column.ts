// Bar graph column builder: generates DOM elements for a single team's box graph.
//
// Precondition: call calculateTeamStats(teamData, ...) before buildTeamColumn.
// calculateTeamStats handles stat accumulation and sorts teamData.df in place.

import type { PointSystem } from '../types/config';
import type { TeamData } from '../types/match';
import { timeFormat } from '../core/date-utils';
import { getPointHeightScale, getWinPoints } from '../core/point-calculator';
import { teamCssClass } from '../core/team-utils';
import {
  makeBoxBody,
  makeFullContent,
  makeCancelledContent,
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

/** Create an outer box <div> with the given CSS classes. */
function createBoxDiv(...classes: string[]): HTMLDivElement {
  const div = document.createElement('div');
  div.classList.add(...classes);
  return div;
}

/** Create a tooltip <p> with inner content HTML and a tooltiptext <span>. */
function createTooltip(
  bodyHtml: string,
  spanHtml: string,
  tooltipClasses: string[],
  spanClasses: string[],
): HTMLParagraphElement {
  const p = document.createElement('p');
  p.classList.add('tooltip', ...tooltipClasses);
  p.innerHTML = bodyHtml;
  const span = document.createElement('span');
  span.classList.add('tooltiptext', ...spanClasses);
  span.innerHTML = spanHtml;
  p.appendChild(span);
  return p;
}

/** Result returned by buildTeamColumn, consumed by assembleTeamColumn (renderer). */
export interface ColumnResult {
  /** Box DOM elements in display order (before any reversal by the renderer). */
  graph: HTMLDivElement[];
  /** Available points (= displayStats.avlbl_pt). Used for space-box calculation. */
  avlbl_pt: number;
  teamName: string;
  /** Sanitized team name safe for CSS class selectors (dots/spaces removed). */
  cssClass: string;
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
 * Box heights are driven by point value × POINT_HEIGHT_SCALE:
 *   boxHeightClass(row.point * scale) → CSS class (tall / medium / short).
 *
 * Display content is determined by box height, not result type:
 *   tall:   body = date + opponent + score + stadium, span = section + time
 *   medium: body = date + opponent + score,           span = section + time + stadium
 *   short:  body = date + opponent,                   span = full match details
 *   0 pt:   no box → lossBox only
 *
 * @param teamName   Team identifier (used as CSS class on boxes and tooltips).
 * @param teamData   TeamData with stats already computed by calculateTeamStats.
 * @param targetDate Display cutoff date 'YYYY/MM/DD'.
 * @param disp       true → tooltip uses displayStats; false → latestStats.
 * @param hasPk      true → PK columns exist in the CSV.
 * @param hasEx      true → extra-time columns exist in the CSV.
 * @param pointSystem Scoring system.
 */
export function buildTeamColumn(
  teamName: string,
  teamData: TeamData,
  targetDate: string,
  disp: boolean,
  hasPk = false,
  hasEx = false,
  pointSystem: PointSystem = 'standard',
): ColumnResult {
  const graph: HTMLDivElement[] = [];
  const lossBox: string[] = [];
  const matchDateSet = new Set<string>();
  const winPt = getWinPoints(pointSystem);
  const scale = getPointHeightScale(pointSystem);
  const futureClass = boxHeightClass(winPt * scale);
  const cssClass = teamCssClass(teamName);

  for (const row of teamData.df) {
    // Normalize display date: empty string → '未定'
    const matchDate = row.match_date === '' ? '未定' : row.match_date;
    if (matchDate !== '未定') matchDateSet.add(matchDate);

    if (row.status === '試合中止') {
      lossBox.push(makeCancelledContent(row, matchDate));
      continue;
    }

    const statusSuffix = row.status ? `<br/>${row.status}` : '';

    const isFuture = !row.has_result || (matchDate !== '未定' && matchDate > targetDate);
    if (isFuture) {
      // Unplayed or completed-after-cutoff: future (ghost) styling
      const box = createBoxDiv(futureClass, 'box');
      const futureBg = document.createElement('div');
      futureBg.classList.add('future', 'bg', cssClass);
      box.appendChild(futureBg);
      box.appendChild(createTooltip(
        makeBoxBody(row, matchDate, futureClass),
        `(${row.section_no}) ${timeFormat(row.start_time)}${statusSuffix}`,
        [],
        [cssClass],
      ));
      graph.push(box);
    } else if (row.point > 0) {
      // Completed match with points: box height determines display content
      const heightCls = boxHeightClass(row.point * scale);
      const box = createBoxDiv(heightCls, 'box');
      if (row.live) box.classList.add('live');
      if (heightCls === 'short') {
        box.appendChild(createTooltip(
          makeBoxBody(row, matchDate, heightCls),
          makeFullContent(row, matchDate) + statusSuffix,
          [cssClass],
          ['fullW', cssClass],
        ));
      } else {
        const stadiumLine = heightCls !== 'tall' ? `<br/>${row.stadium}` : '';
        box.appendChild(createTooltip(
          makeBoxBody(row, matchDate, heightCls),
          `(${row.section_no}) ${timeFormat(row.start_time)}${stadiumLine}${statusSuffix}`,
          [cssClass],
          ['halfW', cssClass],
        ));
      }
      graph.push(box);
    } else {
      // Loss or 0-pt result → lossBox
      let lossContent = makeFullContent(row, matchDate);
      if (row.live) {
        lossContent = `<div class="live">${lossContent}${statusSuffix}</div>`;
      }
      lossBox.push(lossContent);
    }
  }

  return {
    graph,
    avlbl_pt: teamData.displayStats.avlbl_pt,
    teamName,
    cssClass,
    lossBox,
    stats: makeTeamStats(disp ? teamData.displayStats : teamData.latestStats, disp, hasPk, hasEx),
    matchDates: [...matchDateSet].sort(),
  };
}
