#!/bin/bash

RUNNING_HOUR=`env TZ=JST−9 date "+%H"`
env TZ=JST−9 date
echo $RUNNING_HOUR

if [ $RUNNING_HOUR -eq 1 ]; then
  # 日ごと深夜自動実行 ⇒ 全CSVのアップデートを実行
  python src/read_jleague_matches.py
  python src/read_jfamatch.py PrincePremierE
  python src/read_jfamatch.py PrincePremierW
  python src/read_jfamatch.py PrinceKanto
  # python src/read_jfamatch.py WC2022AFC_F
  # python src/read_we-league.py
  # python src/read_aclgl_matches.py
else
  # 試合時間ごとの自動実行は、現在はJリーグ分のみ
  python src/read_jleague_matches.py
fi
