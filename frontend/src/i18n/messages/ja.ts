export const ja = {
  // HTML labels
  'label.competition': '大会',
  'label.season': 'シーズン',
  'label.teamSort': 'チーム順',
  'label.matchSort': '試合順',
  'label.displayDate': '表示日',
  'label.graphScale': 'グラフ縮小',
  'label.scaleUnit': '倍',
  'label.futureOpacity': '未実施試合透明度',
  'label.spaceColor': '余白色',
  'label.dataTimestamp': 'データ取得時刻:',
  'label.language': '言語',
  'label.roundStart': '表示開始ラウンド',
  'label.multiSection': 'マルチセクション',
  'label.bracketLayout': '表示方向',
  'label.layoutHorizontal': '横 (左→右)',
  'label.layoutVertical': '縦 (下→上)',

  // Buttons
  'btn.resetDate': '最新にリセット',
  'btn.resetPrefs': '設定をリセット',
  'btn.sliderPrev': '＜',
  'btn.sliderNext': '＞',
  'btn.collapseAll': '全て閉じる',
  'btn.expandAll': '全て開く',

  // Status messages
  'status.loading': 'CSVを読み込み中...',
  'status.loaded': '{league} {season} — {rows} 行',
  'status.cached': '{league} {season} (cached)',
  'status.error': 'CSV読み込みエラー: {detail}',
  'status.noSeason': 'シーズン情報なし: {competition}/{season}',
  'status.seasonMapError': 'season_map.json の読み込みに失敗しました',
  'status.dataSource': 'データ参照元: ',

  // Warnings
  'warn.undefinedColor': 'チームカラー未定義: {teams}',

  // Date slider
  'slider.preseason': '開幕前',

  // Team sort options
  'sort.dispPoint': '勝点(表示時)',
  'sort.dispAvlblPt': '最大勝点(表示時)',
  'sort.point': '勝点(最新)',
  'sort.avlblPt': '最大勝点(最新)',

  // Match sort options
  'sort.oldBottom': '古い試合が下',
  'sort.newBottom': '新しい試合が下',
  'sort.firstBottom': '第1節が下',
  'sort.lastBottom': '最終節が下',

  // Rank table headers
  'col.team': 'チーム',
  'col.games': '試合',
  'col.points': '勝点',
  'col.average': '平均',
  'col.maxPoints': '最大',
  'col.win': '勝',
  'col.draw': '分',
  'col.loss': '負',
  'col.goalsFor': '得点',
  'col.goalsAgainst': '失点',
  'col.goalDiff': '点差',
  'col.remaining': '残り',
  'col.pkWin': 'PK勝',
  'col.pkLoss': 'PK負',
  'col.exWin': '延勝',
  'col.exLoss': '延負',
  'col.champion': '優勝',
  'col.promotion': '昇格',
  'col.relegation': '残留',
  'col.rank': '順位',
  'col.group': 'Grp',

  // Rank status
  'rank.clinched': '確定',
  'rank.eliminated': 'なし',
  'rank.selfPower': '自力',
  'rank.otherPower': '他力',
  'rank.relegated': '降格',

  // Graph labels
  'graph.group': 'グループ{key}',
  'graph.undecided': '未定',
  'graph.cancelled': '試合中止',

  // Tooltip
  'tip.statsLabel.disp': '表示時の状態',
  'tip.statsLabel.latest': '最新の状態',
  'tip.record': '{win}勝 / {draw}分 / {loss}敗',
  'tip.exRecord': '{exWin}延勝 / {exLoss}延負',
  'tip.pkRecord': '{pkWin}PK勝 / {pkLoss}PK負',
  'tip.points': '勝点{point}, 最大{max}',
  'tip.goals': '{get}得点, {lose}失点',
  'tip.goalDiff': '得失点差: {diff}',
  'tip.statsHeader': '成績情報:',
  'tip.lossHeader': '敗戦記録:',
  'tip.matchStatus.started': '開始前',

  // Score prefixes
  'score.et': 'ET{get}-{lose}',
  'score.pk': 'PK{get}-{lose}',

  // Cross-group
  'crossGroup.caption': '{position}位チーム比較',
  'crossGroup.exclude': ' ({rank}位以下との対戦除外)',

  // Rank table footer notes
  'note.judgmentCaveat': 'どの判定も、3チーム以上の対戦成績の関係から、実際には確定していても「自力」「他力」と示す場合アリ',
  'note.judgmentDecided': '(「確定」「降格」「なし」と判定されている場合は、それぞれ決定済み)',
  'note.playoffNote': '昇格・降格: プレーオフ参戦決定も、それぞれ「確定」「降格」と表示',
  'note.otherLeague': '別リーグの影響で昇格・降格数が減るケースは考慮しない',

  // Bracket notes
  'bracketNote.aggregateScore': 'H&A (ホーム&アウェー) 方式の得点は2試合の合計です',
  'bracketNote.etIncluded': '延長戦 (ET) がある場合、メインスコアに延長分が含まれます',
  'bracketNote.pkAnnotation': 'PK戦の結果は (PKn) として別表示されます',

  // Links
  'link.github': 'Github公開場所',

  // Rule notes (from rule-notes.ts)
  'rule.victoryCount': '勝敗数のみカウント (勝ち=1点)',
  'rule.win3allPkloss1': '勝ち=3点 (90分/延長/PK共通), PK負け=1点',
  'rule.graduatedWin': '90分勝ち=3点, 延長勝ち=2点, PK勝ち=1点',
  'rule.exWin2': '90分勝ち=3点, 延長勝ち=2点, 引分け=1点',
  'rule.pkWin2Loss1': '勝ち=3点, PK勝ち=2点, PK負け=1点',
  'rule.tiebreakPrefix': '同勝点時の順位決定: ',
  'rule.headToHead': '直接対戦',
  'rule.goalDiff': '得失点差',
  'rule.goalGet': '総得点',
  'rule.wins': '勝利数',
} as const;

export type MessageKey = keyof typeof ja;
