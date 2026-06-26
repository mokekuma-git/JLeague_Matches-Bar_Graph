#!/bin/bash

echo Called by schedule $1
DAILY=Daily
ONGAME=OnGame
TRIGGER=$(echo $1 | awk '{if($3 == "*" && $4 == "*") {print "'$DAILY'"} else {print "'$ONGAME'"}}')

RUNNING_HOUR=`TZ=Asia/Tokyo date "+%H"`
TZ=Asia/Tokyo date
echo $RUNNING_HOUR
echo $TRIGGER

if [ $RUNNING_HOUR -eq 1 ]; then
# if [ $TRIGGER = $DAILY]; then
  # 日ごと深夜自動実行 ⇒ 全CSVのアップデートを実行
  uv run python src/read_jleague_matches.py -f
  uv run python src/read_jfamatch.py PrincePremierE PrincePremierW PrinceKanto WC2026 WC2026KO
  uv run python src/read_we_league.py
  # uv run python src/read_aclgl_matches.py
else
  # 試合時間ごとの自動実行では、Jリーグと開催中のWC2026を更新
  uv run python src/read_jleague_matches.py
  uv run python src/read_jfamatch.py WC2026 WC2026KO
fi
