import type { MessageKey } from './ja';

export const en: Record<MessageKey, string> = {
  // HTML labels
  'label.competition': 'Competition',
  'label.season': 'Season',
  'label.teamSort': 'Team order',
  'label.matchSort': 'Match order',
  'label.displayDate': 'Display date',
  'label.graphScale': 'Graph scale',
  'label.scaleUnit': 'x',
  'label.futureOpacity': 'Future match opacity',
  'label.spaceColor': 'Space color',
  'label.dataTimestamp': 'Data updated:',
  'label.language': 'Language',
  'label.roundStart': 'Start round',
  'label.multiSection': 'Multi-section',
  'label.bracketLayout': 'Layout',
  'label.layoutHorizontal': 'Horizontal (L→R)',
  'label.layoutVertical': 'Vertical (bottom→up)',

  // Buttons
  'btn.resetDate': 'Reset to latest',
  'btn.resetPrefs': 'Reset preferences',
  'btn.sliderPrev': '<',
  'btn.sliderNext': '>',

  // Status messages
  'status.loading': 'Loading CSV...',
  'status.loaded': '{league} {season} — {rows} rows',
  'status.cached': '{league} {season} (cached)',
  'status.error': 'CSV load error: {detail}',
  'status.noSeason': 'No season info: {competition}/{season}',
  'status.seasonMapError': 'Failed to load season_map.json',
  'status.dataSource': 'Data source: ',

  // Warnings
  'warn.undefinedColor': 'Undefined team colors: {teams}',

  // Date slider
  'slider.preseason': 'Preseason',

  // Team sort options
  'sort.dispPoint': 'Points (displayed)',
  'sort.dispAvlblPt': 'Max points (displayed)',
  'sort.point': 'Points (latest)',
  'sort.avlblPt': 'Max points (latest)',

  // Match sort options
  'sort.oldBottom': 'Older matches at bottom',
  'sort.newBottom': 'Newer matches at bottom',
  'sort.firstBottom': 'Matchday 1 at bottom',
  'sort.lastBottom': 'Last matchday at bottom',

  // Rank table headers
  'col.team': 'Team',
  'col.games': 'GP',
  'col.points': 'Pts',
  'col.average': 'Avg',
  'col.maxPoints': 'Max',
  'col.win': 'W',
  'col.draw': 'D',
  'col.loss': 'L',
  'col.goalsFor': 'GF',
  'col.goalsAgainst': 'GA',
  'col.goalDiff': 'GD',
  'col.remaining': 'Rem',
  'col.pkWin': 'PKW',
  'col.pkLoss': 'PKL',
  'col.exWin': 'ETW',
  'col.exLoss': 'ETL',
  'col.champion': 'Title',
  'col.promotion': 'Promo',
  'col.relegation': 'Safety',
  'col.rank': 'Rank',
  'col.group': 'Grp',

  // Rank status
  'rank.clinched': 'Clinched',
  'rank.eliminated': 'Out',
  'rank.selfPower': 'In hands',
  'rank.otherPower': 'Need help',
  'rank.relegated': 'Relegated',

  // Graph labels
  'graph.group': 'Group {key}',
  'graph.undecided': 'TBD',
  'graph.cancelled': 'Cancelled',

  // Tooltip
  'tip.statsLabel.disp': 'As of displayed date',
  'tip.statsLabel.latest': 'Latest',
  'tip.record': '{win}W / {draw}D / {loss}L',
  'tip.exRecord': '{exWin} ET wins / {exLoss} ET losses',
  'tip.pkRecord': '{pkWin} PK wins / {pkLoss} PK losses',
  'tip.points': 'Pts {point}, Max {max}',
  'tip.goals': '{get} scored, {lose} conceded',
  'tip.goalDiff': 'Goal diff: {diff}',
  'tip.statsHeader': 'Stats:',
  'tip.lossHeader': 'Defeats:',
  'tip.matchStatus.started': 'Not started',

  // Score prefixes
  'score.et': 'ET{get}-{lose}',
  'score.pk': 'PK{get}-{lose}',

  // Cross-group
  'crossGroup.caption': 'Comparison of teams ranked {position}',
  'crossGroup.exclude': ' (excl. matches vs rank {rank}+)',

  // Rank table footer notes
  'note.judgmentCaveat': 'Due to multi-team head-to-head tiebreakers, clinch/elimination status may show as "In hands" or "Need help" even when mathematically decided',
  'note.judgmentDecided': '("Clinched", "Relegated", and "Out" are confirmed results)',
  'note.playoffNote': 'Promotion/Relegation: Playoff qualification is also shown as "Clinched" or "Relegated"',
  'note.otherLeague': 'Does not account for promotion/relegation slots affected by other leagues',

  // Links
  'link.github': 'GitHub repository',

  // Rule notes (from rule-notes.ts)
  'rule.victoryCount': 'Win/loss count only (win = 1 pt)',
  'rule.win3allPkloss1': 'Win = 3 pts (90 min/ET/PK), PK loss = 1 pt',
  'rule.graduatedWin': '90-min win = 3 pts, ET win = 2 pts, PK win = 1 pt',
  'rule.exWin2': '90-min win = 3 pts, ET win = 2 pts, draw = 1 pt',
  'rule.pkWin2Loss1': 'Win = 3 pts, PK win = 2 pts, PK loss = 1 pt',
  'rule.tiebreakPrefix': 'Tiebreaker order: ',
  'rule.headToHead': 'Head-to-head',
  'rule.goalDiff': 'Goal difference',
  'rule.goalGet': 'Goals scored',
  'rule.wins': 'Wins',
};
