// Render a BracketNode tree as a DOM tree using recursive flexbox layout.
// Connector lines are drawn post-render via SVG overlay (drawBracketConnectors).

import type { BracketNode, LegDetail } from './bracket-types';
import { hasAnyTeam } from './bracket-data';
import { teamCssClass } from '../core/team-utils';
import './bracket.css';

// ---- Connection tracking for SVG connectors --------------------------------

interface BracketConnection {
  childId: number;
  parentId: number;
  team: string | null;  // winner team name (null if match not yet played)
}

let _nextBracketId = 0;
let _connections: BracketConnection[] = [];

// ---- Score formatting ------------------------------------------------------

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

  if (node.decidedBy === 'aggregate_away_goals' && node.legs) {
    let sideAwayGoals = 0;
    const sideTeam = isHome ? node.homeTeam : node.awayTeam;
    for (const leg of node.legs) {
      if (!sideTeam || leg.homeGoal == null || leg.awayGoal == null) continue;
      if (leg.awayTeam === sideTeam) sideAwayGoals += leg.awayGoal;
    }
    return { main, annotation: `(AG${sideAwayGoals})` };
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
let pinnedCardId: string | null = null;
let _globalListenersAttached = false;

function getTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.classList.add('bracket-tooltip');
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/** Unpin the tooltip and hide it. Called on re-render and dismissal. */
export function unpinTooltip(): void {
  pinnedCardId = null;
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
    tooltipEl.classList.remove('pinned');
  }
}

/** Set up document-level listeners for background click and Escape to dismiss pinned tooltip. */
function setupGlobalListeners(): void {
  if (_globalListenersAttached) return;
  _globalListenersAttached = true;

  document.addEventListener('click', (e) => {
    if (pinnedCardId == null) return;
    const target = e.target as Element;
    // Keep tooltip open when clicking on the tooltip itself
    if (target.closest('.bracket-tooltip')) return;
    unpinTooltip();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pinnedCardId != null) {
      unpinTooltip();
    }
  });
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

/** Show tooltip content for a node, positioned below the card. */
function showTooltipForCard(card: HTMLElement, node: BracketNode): void {
  const tip = getTooltip();
  const isAggregate = node.legs != null && node.legs.length > 0;
  tip.innerHTML = isAggregate
    ? buildAggregateTooltip(node)
    : buildSingleTooltip(node);
  tip.style.display = 'block';

  const rect = card.getBoundingClientRect();
  tip.style.left = `${rect.left + window.scrollX}px`;
  tip.style.top = `${rect.bottom + window.scrollY + 4}px`;
}

/** Attach tooltip hover/click events to a match card. */
function attachTooltip(card: HTMLElement, node: BracketNode): void {
  // Only show tooltip for played matches
  if (node.status === 'ＶＳ' && !node.legs) return;

  setupGlobalListeners();
  card.style.cursor = 'pointer';

  card.addEventListener('mouseenter', () => {
    const cardId = card.getAttribute('data-bracket-id');
    // Another card is pinned — suppress hover
    if (pinnedCardId != null && pinnedCardId !== cardId) return;
    showTooltipForCard(card, node);
  });

  card.addEventListener('mouseleave', () => {
    const cardId = card.getAttribute('data-bracket-id');
    // This card is pinned — keep tooltip visible
    if (pinnedCardId === cardId) return;
    const tip = getTooltip();
    tip.style.display = 'none';
  });

  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const cardId = card.getAttribute('data-bracket-id');
    if (!cardId) return;

    if (pinnedCardId === cardId) {
      // Click pinned card again → unpin
      unpinTooltip();
      return;
    }

    // Pin this card
    pinnedCardId = cardId;
    showTooltipForCard(card, node);
    getTooltip().classList.add('pinned');
  });
}

/** Compute combined stadium text from legs (e.g. "ニッパツ / ノエスタ"). */
function legStadiums(legs: LegDetail[]): string {
  const stadiums = legs.map(l => l.stadium).filter((s): s is string => s != null);
  return stadiums.length > 0 ? stadiums.join(' / ') : '\u00A0';
}

// ---- DOM element creation --------------------------------------------------

/** Create a team row element within a match card. */
function createTeamRow(
  team: string | null, node: BracketNode, isHome: boolean,
): HTMLElement {
  const row = document.createElement('div');
  row.classList.add('bracket-team');
  if (isHome) row.classList.add('home');
  else row.classList.add('away');

  // Data attribute for SVG connector targeting
  if (team) row.setAttribute('data-team', team);

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
function createMatchCard(node: BracketNode, bracketId: number): HTMLElement {
  const card = document.createElement('div');
  card.classList.add('bracket-match');
  card.setAttribute('data-bracket-id', String(bracketId));

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

/** Wrap a match card with its round label (always present for consistent height). */
function wrapWithLabel(node: BracketNode, bracketId: number): HTMLElement {
  const wrapper = document.createElement('div');
  const label = document.createElement('div');
  label.classList.add('bracket-round-label');
  label.textContent = node.round || '\u00A0';
  wrapper.appendChild(label);
  wrapper.appendChild(createMatchCard(node, bracketId));
  return wrapper;
}

// ---- Bye chain detection ----------------------------------------------------

/**
 * Check if a node is a bye chain — a team auto-advancing through rounds
 * without playing (no opponent, no match data).
 * Returns true for leaf byes (team vs null) and multi-level chains.
 */
function isByeChain(node: BracketNode): boolean {
  if (node.homeGoal != null) return false;  // actual match played
  if (!node.winner) return false;           // no auto-advance
  // One side must be null (bye opponent)
  if (node.homeTeam != null && node.awayTeam != null) return false;

  const [upper, lower] = node.children;
  if (!upper && !lower) return true;  // leaf bye

  // One child must be entirely empty, the other must be a bye chain
  const upperReal = hasAnyTeam(upper);
  const lowerReal = hasAnyTeam(lower);
  if (upperReal && lowerReal) return false;
  const realChild = upperReal ? upper : (lowerReal ? lower : null);
  if (!realChild) return true;  // both empty
  return isByeChain(realChild);
}

/** Render a bye leaf: just the team name in a colored box, no opponent row. */
function renderByeLeaf(node: BracketNode, bracketId: number): HTMLElement {
  const wrapper = document.createElement('div');

  // Round label spacer (consistent layout height)
  const label = document.createElement('div');
  label.classList.add('bracket-round-label');
  label.textContent = '\u00A0';
  wrapper.appendChild(label);

  // Team element styled like a single bracket-team row
  const team = node.winner ?? node.homeTeam ?? node.awayTeam;
  const teamEl = document.createElement('div');
  teamEl.classList.add('bracket-bye-team', 'team-cell');
  if (team) {
    teamEl.classList.add(teamCssClass(team));
    teamEl.setAttribute('data-team', team);
  }
  teamEl.setAttribute('data-bracket-id', String(bracketId));
  teamEl.textContent = team ?? '';
  wrapper.appendChild(teamEl);

  return wrapper;
}

// ---- Node rendering --------------------------------------------------------

/** Recursively render a BracketNode subtree. Returns element and its card ID. */
function renderNodeInternal(node: BracketNode): { element: HTMLElement; cardId: number } {
  const [upper, lower] = node.children;

  // Leaf node
  if (!upper && !lower) {
    const cardId = _nextBracketId++;
    if (isByeChain(node)) {
      return { element: renderByeLeaf(node, cardId), cardId };
    }
    return { element: wrapWithLabel(node, cardId), cardId };
  }

  // Non-leaf bye chain: preserve nesting depth with ghost cards for X alignment.
  // Each bye level renders as a bracket-subtree with a ghost element occupying
  // the match card slot, so rounds stay at the correct X-coordinate.
  if (isByeChain(node)) {
    const realChild = hasAnyTeam(upper) ? upper! : lower!;
    const childResult = renderNodeInternal(realChild);

    const subtree = document.createElement('div');
    subtree.classList.add('bracket-subtree');

    const childrenDiv = document.createElement('div');
    childrenDiv.classList.add('bracket-children');
    const childWrapper = document.createElement('div');
    childWrapper.classList.add('bracket-child');
    childWrapper.appendChild(childResult.element);
    childrenDiv.appendChild(childWrapper);
    subtree.appendChild(childrenDiv);

    // Ghost element occupies the match card slot width
    const ghost = document.createElement('div');
    ghost.classList.add('bracket-ghost');
    subtree.appendChild(ghost);

    return { element: subtree, cardId: childResult.cardId };
  }

  // Normal subtree
  const cardId = _nextBracketId++;

  const subtree = document.createElement('div');
  subtree.classList.add('bracket-subtree');

  // Render child subtrees
  const children = document.createElement('div');
  children.classList.add('bracket-children');

  let upperResult: { cardId: number } | null = null;
  let lowerResult: { cardId: number } | null = null;

  if (upper) {
    const result = renderNodeInternal(upper);
    upperResult = result;
    const childWrapper = document.createElement('div');
    childWrapper.classList.add('bracket-child');
    childWrapper.appendChild(result.element);
    children.appendChild(childWrapper);
  }
  if (lower) {
    const result = renderNodeInternal(lower);
    lowerResult = result;
    const childWrapper = document.createElement('div');
    childWrapper.classList.add('bracket-child');
    childWrapper.appendChild(result.element);
    children.appendChild(childWrapper);
  }

  subtree.appendChild(children);

  // Match card with label (no connector div — SVG handles connections)
  subtree.appendChild(wrapWithLabel(node, cardId));

  // Record connections for SVG drawing
  if (upperResult) {
    _connections.push({
      childId: upperResult.cardId,
      parentId: cardId,
      team: upper!.winner,
    });
  }
  if (lowerResult) {
    _connections.push({
      childId: lowerResult.cardId,
      parentId: cardId,
      team: lower!.winner,
    });
  }

  return { element: subtree, cardId };
}

// ---- SVG connector drawing -------------------------------------------------

/** Escape a string for use in a CSS attribute value selector. */
function cssAttrEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Draw SVG connector lines between bracket nodes.
 * Lines go from each child's winner team row to the same team's row
 * in the parent match, showing the progression path of each team.
 *
 * Must be called after the bracket fragment is inserted into the DOM.
 *
 * @param container - The element containing the rendered bracket.
 */
export function drawBracketConnectors(container: HTMLElement): void {
  const bracket = container.querySelector('.bracket') as HTMLElement | null;
  if (!bracket) return;

  // Remove existing SVG
  bracket.querySelector('.bracket-svg')?.remove();
  if (_connections.length === 0) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('bracket-svg');
  // Size to bracket content area
  svg.setAttribute('width', String(bracket.scrollWidth));
  svg.setAttribute('height', String(bracket.scrollHeight));

  const isVertical = bracket.classList.contains('vertical');

  // Compute scale factor to convert getBoundingClientRect (visual) to
  // content-space coordinates (for SVG inside a CSS-transformed container).
  const bracketRect = bracket.getBoundingClientRect();
  const scaleX = bracket.offsetWidth > 0 ? bracketRect.width / bracket.offsetWidth : 1;
  const scaleY = bracket.offsetHeight > 0 ? bracketRect.height / bracket.offsetHeight : 1;

  function relPos(el: Element) {
    const r = el.getBoundingClientRect();
    return {
      left: (r.left - bracketRect.left) / scaleX,
      top: (r.top - bracketRect.top) / scaleY,
      right: (r.right - bracketRect.left) / scaleX,
      bottom: (r.bottom - bracketRect.top) / scaleY,
      centerX: ((r.left + r.right) / 2 - bracketRect.left) / scaleX,
      centerY: ((r.top + r.bottom) / 2 - bracketRect.top) / scaleY,
    };
  }

  // Group connections by parentId so sibling children share the same bend position.
  // The bend coordinate is the midpoint between the nearest child card edge and
  // the parent card edge — this prevents bye pass-through lines from overlapping
  // with intermediate match cards.
  const groups = new Map<number, BracketConnection[]>();
  for (const conn of _connections) {
    if (!conn.team) continue;
    const list = groups.get(conn.parentId) ?? [];
    list.push(conn);
    groups.set(conn.parentId, list);
  }

  for (const [parentId, conns] of groups) {
    const parentCard = bracket.querySelector(
      `.bracket-match[data-bracket-id="${parentId}"]`,
    );
    if (!parentCard) continue;
    const parentPos = relPos(parentCard);

    // Compute shared bend coordinate from the children container's edge.
    // Uses the full .bracket-children container (not just connected child cards)
    // so bends clear ALL intermediate match cards, including TBD matches whose
    // connections are filtered out due to null winners.
    let bendCoord: number;
    const parentSubtree = parentCard.parentElement?.parentElement;
    const childrenEl = parentSubtree?.firstElementChild;
    if (childrenEl?.classList.contains('bracket-children')) {
      const childrenPos = relPos(childrenEl);
      bendCoord = isVertical
        ? (childrenPos.top + parentPos.bottom) / 2
        : (childrenPos.right + parentPos.left) / 2;
    } else {
      // Fallback: use connected child card edges
      if (isVertical) {
        let minChildTop = Infinity;
        for (const conn of conns) {
          const cc = bracket.querySelector(`[data-bracket-id="${conn.childId}"]`);
          if (cc) minChildTop = Math.min(minChildTop, relPos(cc).top);
        }
        bendCoord = (minChildTop + parentPos.bottom) / 2;
      } else {
        let maxChildRight = 0;
        for (const conn of conns) {
          const cc = bracket.querySelector(`[data-bracket-id="${conn.childId}"]`);
          if (cc) maxChildRight = Math.max(maxChildRight, relPos(cc).right);
        }
        bendCoord = (maxChildRight + parentPos.left) / 2;
      }
    }

    for (const conn of conns) {
      if (!conn.team) continue;
      const teamEsc = cssAttrEscape(conn.team);

      // Find child output element: the winner's team row or the bye element
      const childCard = bracket.querySelector(`[data-bracket-id="${conn.childId}"]`);
      if (!childCard) continue;

      let childOutput: Element | null;
      if (childCard.classList.contains('bracket-bye-team')) {
        childOutput = childCard;
      } else {
        childOutput = childCard.querySelector(`.bracket-team[data-team="${teamEsc}"]`);
      }
      if (!childOutput) continue;

      // Find parent input element: the team row in the parent match
      const parentInput = bracket.querySelector(
        `.bracket-match[data-bracket-id="${parentId}"] .bracket-team[data-team="${teamEsc}"]`,
      );
      if (!parentInput) continue;

      const from = relPos(childOutput);
      const to = relPos(parentInput);

      // Draw Manhattan (right-angle) path: horizontal → vertical → horizontal
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      let points: string;
      if (isVertical) {
        points = [
          `${from.centerX},${from.top}`,
          `${from.centerX},${bendCoord}`,
          `${to.centerX},${bendCoord}`,
          `${to.centerX},${to.bottom}`,
        ].join(' ');
      } else {
        points = [
          `${from.right},${from.centerY}`,
          `${bendCoord},${from.centerY}`,
          `${bendCoord},${to.centerY}`,
          `${to.left},${to.centerY}`,
        ].join(' ');
      }
      poly.setAttribute('points', points);
      poly.setAttribute('stroke', '#888');
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('fill', 'none');
      svg.appendChild(poly);
    }
  }

  bracket.insertBefore(svg, bracket.firstChild);
}

// ---- Post-render position adjustment ----------------------------------------

/**
 * Adjust match card vertical positions so each card is centered between
 * its incoming team rows (rather than at the CSS flexbox midpoint).
 *
 * This corrects misalignment when one child is a bye (small element) and
 * the other is a full subtree.  Works bottom-up so transforms cascade
 * correctly via getBoundingClientRect.
 *
 * Must be called after the bracket fragment is in the DOM and layout is applied,
 * but BEFORE drawBracketConnectors.
 */
export function adjustBracketPositions(container: HTMLElement): void {
  const bracket = container.querySelector('.bracket') as HTMLElement | null;
  if (!bracket) return;
  if (_connections.length === 0) return;

  const isVertical = bracket.classList.contains('vertical');

  // Clear prior adjustments so getBoundingClientRect returns base layout positions
  for (const card of Array.from(bracket.querySelectorAll('.bracket-match'))) {
    const wrapper = (card as HTMLElement).parentElement;
    if (wrapper) wrapper.style.transform = '';
  }

  const bracketRect = bracket.getBoundingClientRect();
  const scaleX = bracket.offsetWidth > 0 ? bracketRect.width / bracket.offsetWidth : 1;
  const scaleY = bracket.offsetHeight > 0 ? bracketRect.height / bracket.offsetHeight : 1;

  /** Get the center coordinate along the stacking axis (Y for horizontal, X for vertical). */
  function stackCenter(el: Element): number {
    const r = el.getBoundingClientRect();
    if (isVertical) {
      return ((r.left + r.right) / 2 - bracketRect.left) / scaleX;
    }
    return ((r.top + r.bottom) / 2 - bracketRect.top) / scaleY;
  }

  // Group connections by parentId
  const groups = new Map<number, BracketConnection[]>();
  for (const conn of _connections) {
    if (!conn.team) continue;
    const list = groups.get(conn.parentId) ?? [];
    list.push(conn);
    groups.set(conn.parentId, list);
  }

  // Process bottom-up: parent IDs are lower than child IDs (pre-order DFS),
  // so sorting descending gives leaves-first order.
  const sortedParentIds = [...groups.keys()].sort((a, b) => b - a);

  for (const parentId of sortedParentIds) {
    const conns = groups.get(parentId)!;
    const parentCard = bracket.querySelector(
      `.bracket-match[data-bracket-id="${parentId}"]`,
    ) as HTMLElement | null;
    if (!parentCard) continue;

    const wrapper = parentCard.parentElement;
    if (!wrapper) continue;

    // Find incoming team centers
    const teamCenters: number[] = [];
    for (const conn of conns) {
      if (!conn.team) continue;
      const teamEsc = cssAttrEscape(conn.team);
      const childCard = bracket.querySelector(`[data-bracket-id="${conn.childId}"]`);
      if (!childCard) continue;

      let childTeamEl: Element | null;
      if (childCard.classList.contains('bracket-bye-team')) {
        childTeamEl = childCard;
      } else {
        childTeamEl = childCard.querySelector(`.bracket-team[data-team="${teamEsc}"]`);
      }
      if (childTeamEl) teamCenters.push(stackCenter(childTeamEl));
    }

    // Only adjust when both incoming teams are known
    if (teamCenters.length < 2) continue;

    const idealCenter = teamCenters.reduce((a, b) => a + b, 0) / teamCenters.length;
    const actualCenter = stackCenter(parentCard);
    const delta = idealCenter - actualCenter;

    if (Math.abs(delta) > 2) {
      wrapper.style.transform = isVertical
        ? `translateX(${delta}px)`
        : `translateY(${delta}px)`;
    }
  }
}

// ---- Public API ------------------------------------------------------------

/**
 * Render a full bracket from its root node.
 *
 * @param root - Root BracketNode (the final match).
 * @param _cssFiles - CSS file names for team colors (loaded via link tags in HTML).
 * @returns DocumentFragment containing the rendered bracket.
 */
export function renderBracket(root: BracketNode, _cssFiles: string[]): DocumentFragment {
  // Reset connection tracking state
  _nextBracketId = 0;
  _connections = [];

  const result = renderNodeInternal(root);

  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.classList.add('bracket');
  wrapper.appendChild(result.element);
  fragment.appendChild(wrapper);
  return fragment;
}

/**
 * Full render pipeline: create DOM, apply layout, adjust positions, draw connectors.
 * The container must already be in the DOM for getBoundingClientRect to work.
 *
 * @param container - DOM element to render bracket into.
 * @param root - Root BracketNode (the final match).
 * @param cssFiles - CSS file names for team colors.
 * @param layout - Bracket layout orientation.
 */
export function renderBracketInto(
  container: HTMLElement,
  root: BracketNode,
  cssFiles: string[],
  layout: 'horizontal' | 'vertical',
): void {
  container.appendChild(renderBracket(root, cssFiles));
  const isVertical = layout === 'vertical';
  for (const el of Array.from(container.querySelectorAll('.bracket'))) {
    if (isVertical) el.classList.add('vertical');
    else el.classList.remove('vertical');
  }
  adjustBracketPositions(container);
  drawBracketConnectors(container);
}
