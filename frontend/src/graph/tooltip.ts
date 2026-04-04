// Pure HTML-generation helpers: tooltip content, team stats, and rank class.
// None of these functions access the DOM or global state.

import type { TeamMatch, TeamStats } from '../types/match';
import type { LeagueSeasonInfo } from '../types/season';
import { dateOnly, timeFormat } from '../core/date-utils';
import { t } from '../i18n';

/** Max display length for opponent name in box/tooltip content. */
const OPPONENT_MAX_LEN = 3;
/** Max display length for stadium name in box/tooltip content. */
const STADIUM_MAX_LEN = 7;

/** Score string with ET/PK indicators where applicable. */
function formatScore(row: TeamMatch): string {
  let s = `${row.goal_get}-${row.goal_lose}`;
  if (row.score_ex_get != null && row.score_ex_lose != null && row.score_ex_get !== row.score_ex_lose) {
    s += ` (${t('score.et', { get: row.score_ex_get, lose: row.score_ex_lose })})`;
  }
  if (row.pk_get != null && row.pk_lose != null) {
    s += ` (${t('score.pk', { get: row.pk_get, lose: row.pk_lose })})`;
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
  const datePart = matchDate === t('graph.undecided') ? t('graph.undecided') : dateOnly(matchDate);
  return `(${row.section_no}) ${datePart} ${row.opponent.substring(0, OPPONENT_MAX_LEN)}<br/>${row.status}`;
}

/**
 * Generates the stats HTML shown in the team name tooltip.
 * Caller selects the appropriate TeamStats (latestStats or displayStats).
 * hasPk=true → includes PK win/loss counts (omitted when the season has no PK matches).
 */
export function makeTeamStats(stats: TeamStats, disp: boolean, hasPk = false, hasEx = false): string {
  const label = disp ? t('tip.statsLabel.disp') : t('tip.statsLabel.latest');
  const rc = stats.resultCounts;
  const lines = [
    label,
    t('tip.record', { win: rc.win, draw: rc.draw, loss: rc.loss }),
  ];
  if (hasEx) lines.push(t('tip.exRecord', { exWin: rc.ex_win, exLoss: rc.ex_loss }));
  if (hasPk) lines.push(t('tip.pkRecord', { pkWin: rc.pk_win, pkLoss: rc.pk_loss }));
  lines.push(
    t('tip.points', { point: stats.point, max: stats.avlbl_pt }),
    t('tip.goals', { get: stats.goal_get, lose: stats.goal_get - stats.goal_diff }),
    t('tip.goalDiff', { diff: stats.goal_diff }),
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
export function getRankClass(rank: number, seasonInfo: LeagueSeasonInfo): string {
  const custom = seasonInfo.rankClass[String(rank)];
  if (custom) return custom;
  if (rank <= seasonInfo.promotionCount) return 'promoted';
  if (rank > seasonInfo.teamCount - seasonInfo.relegationCount) return 'relegated';
  return '';
}
