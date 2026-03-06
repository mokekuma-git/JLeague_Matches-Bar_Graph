// Pure HTML-generation helpers: tooltip content, team stats, and rank class.
// None of these functions access the DOM or global state.

import type { TeamMatch, TeamStats } from '../types/match';
import type { SeasonInfo } from '../types/season';
import { dateOnly, timeFormat } from '../core/date-utils';

/** Max display length for opponent name in box/tooltip content. */
const OPPONENT_MAX_LEN = 3;
/** Max display length for stadium name in box/tooltip content. */
const STADIUM_MAX_LEN = 7;

/** Score string with ET/PK indicators where applicable. */
function formatScore(row: TeamMatch): string {
  let s = `${row.goal_get}-${row.goal_lose}`;
  if (row.score_ex_get != null && row.score_ex_lose != null && row.score_ex_get !== row.score_ex_lose) {
    s += ` (ET${row.score_ex_get}-${row.score_ex_lose})`;
  }
  if (row.pk_get != null && row.pk_lose != null) {
    s += ` (PK${row.pk_get}-${row.pk_lose})`;
  }
  return s;
}

/**
 * Box body HTML, scaled by CSS height class.
 *
 *   tall:   date + opponent + score (ET/PK) + stadium
 *   medium: date + opponent + score (ET/PK)
 *   short:  date + opponent
 */
export function makeBoxBody(row: TeamMatch, matchDate: string, heightCls: string): string {
  const datePart = `${dateOnly(matchDate)} ${row.opponent.substring(0, OPPONENT_MAX_LEN)}`;
  if (heightCls === 'short') return datePart;
  const scoreLine = row.goal_get != null && row.goal_lose != null
    ? `<br/>${formatScore(row)}` : '';
  if (heightCls !== 'tall') return `${datePart}${scoreLine}`;
  return `${datePart}${scoreLine}<br/>${row.stadium.substring(0, STADIUM_MAX_LEN)}`;
}

/** Full match details for tooltip span and lossBox: section, time, date, opponent, score, stadium. */
export function makeFullContent(row: TeamMatch, matchDate: string): string {
  return `(${row.section_no}) ${timeFormat(row.start_time)}<br/>${dateOnly(matchDate)} ${row.opponent.substring(0, OPPONENT_MAX_LEN)}<br/>${formatScore(row)} ${row.stadium.substring(0, STADIUM_MAX_LEN)}`;
}

/** Content for a cancelled match shown in the lossBox tooltip. */
export function makeCancelledContent(row: TeamMatch, matchDate: string): string {
  const datePart = matchDate === '未定' ? '未定' : dateOnly(matchDate);
  return `(${row.section_no}) ${datePart} ${row.opponent.substring(0, OPPONENT_MAX_LEN)}<br/>${row.status}`;
}

/**
 * Generates the stats HTML shown in the team name tooltip.
 * Caller selects the appropriate TeamStats (latestStats or displayStats).
 * hasPk=true → includes PK win/loss counts (omitted when the season has no PK matches).
 */
export function makeTeamStats(stats: TeamStats, disp: boolean, hasPk = false, hasEx = false): string {
  const label = disp ? '表示時の状態' : '最新の状態';
  const rc = stats.resultCounts;
  const lines = [
    `${label}`,
    `${rc.win}勝 / ${rc.draw}分 / ${rc.loss}敗`,
  ];
  if (hasEx) lines.push(`${rc.ex_win}延勝 / ${rc.ex_loss}延負`);
  if (hasPk) lines.push(`${rc.pk_win}PK勝 / ${rc.pk_loss}PK負`);
  lines.push(
    `勝点${stats.point}, 最大${stats.avlbl_pt}`,
    `${stats.goal_get}得点, ${stats.goal_get - stats.goal_diff}失点`,
    `得失点差: ${stats.goal_diff}`,
  );
  return lines.join('<br/>');
}

/** Joins loss-match content strings with <hr/> dividers. */
export function joinLossBox(lossBox: string[]): string {
  return lossBox.join('<hr/>');
}

/**
 * Returns the CSS class name for a given rank within a season.
 * Priority: custom rankClass entry → 'promoted' → 'relegated' → '' (no class).
 */
export function getRankClass(rank: number, seasonInfo: SeasonInfo): string {
  const custom = seasonInfo.rankClass[String(rank)];
  if (custom) return custom;
  if (rank <= seasonInfo.promotionCount) return 'promoted';
  if (rank > seasonInfo.teamCount - seasonInfo.relegationCount) return 'relegated';
  return '';
}
