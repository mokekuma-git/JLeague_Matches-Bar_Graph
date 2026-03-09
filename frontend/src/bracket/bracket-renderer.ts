// Render a BracketNode tree as a DOM tree using recursive flexbox layout.

import type { BracketNode } from './bracket-types';
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
    return { main, annotation: `(PK${pk}-${opponentPk})` };
  }

  const ex = isHome ? node.homeScoreEx : node.awayScoreEx;
  const opponentEx = isHome ? node.awayScoreEx : node.homeScoreEx;
  if (ex != null && opponentEx != null) {
    return { main, annotation: `(ET${ex}-${opponentEx})` };
  }

  return { main, annotation: '' };
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

  // Date line (above team rows) — always present for consistent card height
  const dateLine = document.createElement('div');
  dateLine.classList.add('bracket-match-date');
  dateLine.textContent = node.matchDate || '\u00A0';
  card.appendChild(dateLine);

  card.appendChild(createTeamRow(node.homeTeam, node, true));
  card.appendChild(createTeamRow(node.awayTeam, node, false));

  // Stadium line (below team rows) — always present for consistent card height
  const stadiumLine = document.createElement('div');
  stadiumLine.classList.add('bracket-match-stadium');
  stadiumLine.textContent = node.stadium || '\u00A0';
  card.appendChild(stadiumLine);

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
