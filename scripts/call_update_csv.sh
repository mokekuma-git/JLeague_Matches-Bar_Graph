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
  python src/read_jleague_matches.py -f
  python src/read_jfamatch.py PrincePremierE PrincePremierW PrinceKanto
  # python src/read_we-league.py
  # python src/read_aclgl_matches.py
else
  # 試合時間ごとの自動実行は、現在はJリーグ分のみ
  python src/read_jleague_matches.py
  # python src/read_jfamatch.py PrincePremierE PrincePremierW PrinceKanto
fi
