"""2020東京オリンピックサッカーグループステージの試合情報を読み込んでCSV, JSO化
"""
import sys
import re
import pandas as pd
import json
import requests
from typing import Dict, Any
sys.path.append('../src/')
from read_jleague_matches import read_allmatches_csv
from read_jfamatch import read_match_df

SCHEDULE_URL_FORMAT = 'https://www.jfa.jp/national_team/u24_2021/tokyo_olympic_2020/group{}/match/schedule.json'
# 'http://www.jfa.jp/match/acl_2021/group{}/match/schedule.json'
CSV_FILENAME = '../docs/csv/2021_allmatch_result-Olympic_GS.csv'


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    if '--skip' not in sys.argv:
        match_df = pd.DataFrame()
    for group in ['A', 'B', 'C', 'D']:
        _df = read_match_df(SCHEDULE_URL_FORMAT.format(group))
        _df['group'] = group
        match_df = pd.concat([match_df, _df])
    match_df = match_df.sort_values(['group', 'section_no', 'match_index_in_section']).reset_index(drop=True)
    match_df.to_csv(CSV_FILENAME)
