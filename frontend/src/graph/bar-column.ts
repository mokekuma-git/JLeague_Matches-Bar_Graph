// Bar graph column builder: generates DOM elements for a single team's box graph.
//
// Precondition: call calculateTeamStats(teamData, ...) before buildTeamColumn.
// calculateTeamStats handles stat accumulation and sorts teamData.df in place.

import { POINT_MAPS } from '../types/config';
import type { PointSystem } from '../types/config';
import type { TeamData } from '../types/match';
import { timeFormat } from '../core/date-utils';
import { getPointHeightScale, getWinPoints } from '../core/point-calculator';
import { teamCssClass } from '../core/team-utils';
import { classifyResult } from '../ranking/stats-calculator';
import {
  makeWinContent,
  makeExWinContent,
  makePkWinContent,
  makeDrawContent,
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
 *   boxHeightClass(ptMap[result] * scale) → CSS class (tall / medium / short).
 *
 * Examples:
 *   standard 3-1-0:    win 3×1=3 → tall, pk_win 2×1=2 → medium, draw 1×1=1 → short
 *   victory-count:     win 1×3=3 → tall (1 pt scaled up to tall height)
 *   loss (0 pt) → always goes to lossBox only
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
        makeWinContent(row, matchDate),
        `(${row.section_no}) ${timeFormat(row.start_time)}${statusSuffix}`,
        [],
        [cssClass],
      ));
      graph.push(box);
    } else {
      const cls = classifyResult(row.point, row.score_ex_get, row.score_ex_lose, row.pk_get, row.pk_lose, pointSystem);
      const ptMap = POINT_MAPS[pointSystem];
      if (cls === 'win') {
        const heightCls = boxHeightClass(ptMap.win * scale);
        const stadiumLine = heightCls !== 'tall' ? `<br/>${row.stadium}` : '';
        const box = createBoxDiv(heightCls, 'box');
        if (row.live) box.classList.add('live');
        box.appendChild(createTooltip(
          makeWinContent(row, matchDate),
          `(${row.section_no}) ${timeFormat(row.start_time)}${stadiumLine}${statusSuffix}`,
          [cssClass],
          ['halfW', cssClass],
        ));
        graph.push(box);
      } else if (cls === 'ex_win') {
        const heightCls = boxHeightClass(ptMap.ex_win * scale);
        const stadiumLine = heightCls !== 'tall' ? `<br/>${row.stadium}` : '';
        const box = createBoxDiv(heightCls, 'box');
        if (row.live) box.classList.add('live');
        box.appendChild(createTooltip(
          makeExWinContent(row, matchDate),
          `(${row.section_no}) ${timeFormat(row.start_time)}${stadiumLine}${statusSuffix}`,
          [cssClass],
          ['halfW', cssClass],
        ));
        graph.push(box);
      } else if (cls === 'pk_win') {
        const heightCls = boxHeightClass(ptMap.pk_win * scale);
        const stadiumLine = heightCls !== 'tall' ? `<br/>${row.stadium}` : '';
        const box = createBoxDiv(heightCls, 'box');
        if (row.live) box.classList.add('live');
        box.appendChild(createTooltip(
          makePkWinContent(row, matchDate),
          `(${row.section_no}) ${timeFormat(row.start_time)}${stadiumLine}${statusSuffix}`,
          [cssClass],
          ['halfW', cssClass],
        ));
        graph.push(box);
      } else if ((cls === 'draw' || cls === 'pk_loss') && row.point > 0) {
        const heightCls = boxHeightClass(row.point * scale);
        const box = createBoxDiv(heightCls, 'box');
        if (row.live) box.classList.add('live');
        box.appendChild(createTooltip(
          makeDrawContent(row, matchDate),
          makeFullContent(row, matchDate) + statusSuffix,
          [cssClass],
          ['fullW', cssClass],
        ));
        graph.push(box);
      } else {
        // Loss or 0-pt result (e.g. pk_loss under victory-count): no box → lossBox
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
    cssClass,
    lossBox,
    stats: makeTeamStats(disp ? teamData.displayStats : teamData.latestStats, disp, hasPk, hasEx),
    matchDates: [...matchDateSet].sort(),
  };
}
