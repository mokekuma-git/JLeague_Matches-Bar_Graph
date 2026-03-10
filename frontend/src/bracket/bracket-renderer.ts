// Render a BracketNode tree as a DOM tree using recursive flexbox layout.

import type { BracketNode, LegDetail } from './bracket-types';
import { teamCssClass } from '../core/team-utils';
import './bracket.css';

/**
 * Format score text for a team line.
 * Returns the main score and optional PK/ET annotation.
 */
function formatScore(
  node: BracketNode, isHome: boolean,
): { main: string; annotation: string } {
  const goal = isHome ? node.homeGoal : node.awayGoal;
  if (goal == null) return { main: '', annotation: '' };

  const main = String(goal);
  const pk = isHome ? node.homePkScore : node.awayPkScore;
  const opponentPk = isHome ? node.awayPkScore : node.homePkScore;
  if (pk != null && opponentPk != null) {
    return { main, annotation: `(PK${pk})` };
  }

  const ex = isHome ? node.homeScoreEx : node.awayScoreEx;
  const opponentEx = isHome ? node.awayScoreEx : node.homeScoreEx;
  if (ex != null && opponentEx != null) {
    return { main, annotation: `(ET${ex})` };
  }

  return { main, annotation: '' };
}

/** Compute date range text from legs (e.g. "09/03 - 09/07"). */
function legDateRange(legs: LegDetail[]): string {
  const dates = legs.map(l => l.matchDate).filter((d): d is string => d != null);
  if (dates.length === 0) return '\u00A0';
  if (dates.length === 1) return dates[0];
  const first = dates[0];
  const last = dates[dates.length - 1];
  // If same year prefix (YYYY/), abbreviate second date to MM/DD
  if (first.slice(0, 5) === last.slice(0, 5)) {
    return `${first} - ${last.slice(5)}`;
  }
  return `${first} - ${last}`;
}

/** Format a leg score annotation (PK/ET) for tooltip display. */
function formatLegAnnotation(leg: LegDetail): string {
  if (leg.homePkScore != null && leg.awayPkScore != null) {
    return ` (PK${leg.homePkScore}-${leg.awayPkScore})`;
  }
  if (leg.homeScoreEx != null && leg.awayScoreEx != null) {
    return ` (ET${leg.homeScoreEx}-${leg.awayScoreEx})`;
  }
  return '';
}

// ---- Tooltip (shared floating element) ------------------------------------

let tooltipEl: HTMLElement | null = null;

function getTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.classList.add('bracket-tooltip');
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/** Build tooltip inner HTML for an H&A aggregate node. */
function buildAggregateTooltip(node: BracketNode): string {
  const legs = node.legs!;
  const lines: string[] = [];
  lines.push(`<div class="bracket-tooltip-title">${node.round} (${legs.length}試合合計)</div>`);

  for (const leg of legs) {
    const label = leg.leg ? `第${leg.leg}戦` : '';
    const date = leg.matchDate ?? '';
    lines.push(`<div class="bracket-tooltip-leg-header">${label} ${date}</div>`);
    lines.push(`<div class="bracket-tooltip-leg-stadium">${leg.stadium ?? ''}</div>`);
    const hg = leg.homeGoal ?? '';
    const ag = leg.awayGoal ?? '';
    const ann = formatLegAnnotation(leg);
    // Show original CSV home/away order
    lines.push(`<div class="bracket-tooltip-leg-score">${leg.homeTeam} ${hg}-${ag} ${leg.awayTeam}${ann}</div>`);
  }

  // Aggregate total
  const upper = node.homeTeam ?? '';
  const lower = node.awayTeam ?? '';
  const hTotal = node.homeGoal ?? '';
  const aTotal = node.awayGoal ?? '';
  lines.push(`<div class="bracket-tooltip-total">合計: ${upper} ${hTotal}-${aTotal} ${lower}</div>`);

  return lines.join('');
}

/** Build tooltip inner HTML for a single match node. */
function buildSingleTooltip(node: BracketNode): string {
  const lines: string[] = [];
  lines.push(`<div class="bracket-tooltip-title">${node.round}</div>`);
  if (node.matchDate) lines.push(`<div class="bracket-tooltip-leg-header">${node.matchDate}</div>`);
  if (node.stadium) lines.push(`<div class="bracket-tooltip-leg-stadium">${node.stadium}</div>`);

  const home = node.homeTeam ?? 'TBD';
  const away = node.awayTeam ?? 'TBD';
  const hg = node.homeGoal ?? '';
  const ag = node.awayGoal ?? '';
  let ann = '';
  if (node.homePkScore != null && node.awayPkScore != null) {
    ann = ` (PK${node.homePkScore}-${node.awayPkScore})`;
  } else if (node.homeScoreEx != null && node.awayScoreEx != null) {
    ann = ` (ET${node.homeScoreEx}-${node.awayScoreEx})`;
  }
  if (hg !== '' && ag !== '') {
    lines.push(`<div class="bracket-tooltip-leg-score">${home} ${hg}-${ag} ${away}${ann}</div>`);
  }

  return lines.join('');
}

/** Attach tooltip hover events to a match card. */
function attachTooltip(card: HTMLElement, node: BracketNode): void {
  // Only show tooltip for played matches
  if (node.status === 'ＶＳ' && !node.legs) return;

  card.addEventListener('mouseenter', () => {
    const tip = getTooltip();
    const isAggregate = node.legs != null && node.legs.length > 0;
    tip.innerHTML = isAggregate
      ? buildAggregateTooltip(node)
      : buildSingleTooltip(node);
    tip.style.display = 'block';

    // Position below the card
    const rect = card.getBoundingClientRect();
    tip.style.left = `${rect.left + window.scrollX}px`;
    tip.style.top = `${rect.bottom + window.scrollY + 4}px`;
  });

  card.addEventListener('mouseleave', () => {
    const tip = getTooltip();
    tip.style.display = 'none';
  });
}

/** Compute combined stadium text from legs (e.g. "ニッパツ / ノエスタ"). */
function legStadiums(legs: LegDetail[]): string {
  const stadiums = legs.map(l => l.stadium).filter((s): s is string => s != null);
  return stadiums.length > 0 ? stadiums.join(' / ') : '\u00A0';
}

/** Create a team row element within a match card. */
function createTeamRow(
  team: string | null, node: BracketNode, isHome: boolean,
): HTMLElement {
  const row = document.createElement('div');
  row.classList.add('bracket-team');
  if (isHome) row.classList.add('home');
  else row.classList.add('away');

  // Team color via CSS class (background-color + color from team_style.css)
  row.classList.add('team-cell');
  if (team) {
    row.classList.add(teamCssClass(team));
  }

  // TBD team: future styling (opacity controlled by slider)
  if (!team) {
    row.classList.add('bracket-future');
  }

  // Winner/loser styling
  if (node.winner) {
    row.classList.add(node.winner === team ? 'winner' : 'loser');
  }

  // Team name
  const nameSpan = document.createElement('span');
  nameSpan.classList.add('bracket-team-name');
  nameSpan.textContent = team ?? 'TBD';
  row.appendChild(nameSpan);

  // Score
  const { main, annotation } = formatScore(node, isHome);
  if (main) {
    const scoreSpan = document.createElement('span');
    scoreSpan.classList.add('bracket-score');
    scoreSpan.textContent = main;
    if (annotation) {
      const pkSpan = document.createElement('span');
      pkSpan.classList.add('bracket-score-pk');
      pkSpan.textContent = annotation;
      scoreSpan.appendChild(pkSpan);
    }
    row.appendChild(scoreSpan);
  }

  return row;
}

/** Create a match card element. */
function createMatchCard(node: BracketNode): HTMLElement {
  const card = document.createElement('div');
  card.classList.add('bracket-match');

  const isAggregate = node.legs != null && node.legs.length > 0;

  // Date line (above team rows) — always present for consistent card height
  const dateLine = document.createElement('div');
  dateLine.classList.add('bracket-match-date');
  dateLine.textContent = isAggregate
    ? legDateRange(node.legs!)
    : (node.matchDate || '\u00A0');
  card.appendChild(dateLine);

  card.appendChild(createTeamRow(node.homeTeam, node, true));
  card.appendChild(createTeamRow(node.awayTeam, node, false));

  // Stadium line (below team rows) — always present for consistent card height
  const stadiumLine = document.createElement('div');
  stadiumLine.classList.add('bracket-match-stadium');
  stadiumLine.textContent = isAggregate
    ? legStadiums(node.legs!)
    : (node.stadium || '\u00A0');
  card.appendChild(stadiumLine);

  attachTooltip(card, node);

  return card;
}

/** Create connector lines between child matches and their parent. */
function createConnector(): HTMLElement {
  const connector = document.createElement('div');
  connector.classList.add('bracket-connector');

  const top = document.createElement('div');
  top.classList.add('connector-top');
  connector.appendChild(top);

  const bottom = document.createElement('div');
  bottom.classList.add('connector-bottom');
  connector.appendChild(bottom);

  return connector;
}

/** Recursively render a BracketNode subtree. */
function renderNode(node: BracketNode): HTMLElement {
  const [upper, lower] = node.children;

  /** Wrap a match card with its round label (always present for consistent height). */
  const wrapWithLabel = (n: BracketNode): HTMLElement => {
    const wrapper = document.createElement('div');
    const label = document.createElement('div');
    label.classList.add('bracket-round-label');
    label.textContent = n.round || '\u00A0';
    wrapper.appendChild(label);
    wrapper.appendChild(createMatchCard(n));
    return wrapper;
  };

  // Leaf node: just the match card with label
  if (!upper && !lower) {
    return wrapWithLabel(node);
  }

  const subtree = document.createElement('div');
  subtree.classList.add('bracket-subtree');

  // Render child subtrees, each wrapped with a horizontal connector line
  const children = document.createElement('div');
  children.classList.add('bracket-children');
  const addChild = (child: BracketNode): void => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('bracket-child');
    wrapper.appendChild(renderNode(child));
    children.appendChild(wrapper);
  };
  if (upper) addChild(upper);
  if (lower) addChild(lower);
  subtree.appendChild(children);

  // Vertical connector + midpoint horizontal (via ::after in CSS)
  subtree.appendChild(createConnector());

  // This match with label
  subtree.appendChild(wrapWithLabel(node));

  return subtree;
}

/**
 * Render a full bracket from its root node.
 *
 * @param root - Root BracketNode (the final match).
 * @param _cssFiles - CSS file names for team colors (loaded via link tags in HTML).
 * @returns DocumentFragment containing the rendered bracket.
 */
export function renderBracket(root: BracketNode, _cssFiles: string[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.classList.add('bracket');
  wrapper.appendChild(renderNode(root));
  fragment.appendChild(wrapper);
  return fragment;
}
