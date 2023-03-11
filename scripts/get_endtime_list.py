"""read_jleague_matches.pyで読んだリーグのスケジュールから試合時間を取り出し、Workflowで使うcron形式の並びにそろえる。

githubのworkflowはUTCで時間を扱うので、その分修正。
"""
from datetime import datetime, timedelta

import pandas as pd
import numpy as np

SEASON = datetime.now().year
DELAY_TIME = 135

DTTIME = 'datetime'
M_DATE = 'match_date'
S_TIME = 'start_time'
IGNORE_COLS = [DTTIME, M_DATE, S_TIME]

df_list = []
for i in [1, 2, 3]:
    df_list.append(pd.read_csv(f'docs/csv/{SEASON}_allmatch_result-J{i}.csv', index_col=0))

time_df = pd.DataFrame()
for i in [0, 1, 2]:
    time_df = pd.concat([time_df, df_list[i][[M_DATE, S_TIME]]])

# Make Datetime column
time_df = time_df[time_df[S_TIME] != '未定']
time_df[DTTIME] = time_df[M_DATE] + ' ' + time_df[S_TIME]
time_df[DTTIME] = pd.to_datetime(time_df[DTTIME])

# Filter target datetime
time_df = time_df[time_df[DTTIME] > datetime.now()]

# Adjust Finish time in GMT
time_df[DTTIME] += timedelta(minutes=DELAY_TIME)
time_df[DTTIME] -= timedelta(hours=9)

# Make cron part
time_df['m'] = time_df[DTTIME].dt.minute
time_df['h'] = time_df[DTTIME].dt.hour
time_df['D'] = time_df[DTTIME].dt.day
time_df['M'] = time_df[DTTIME].dt.month
time_df['WD'] = '*'

time_df = time_df.sort_values(DTTIME)
time_df = time_df.drop_duplicates(subset=[DTTIME])
time_df = time_df.reset_index(drop=True).astype(str)

time_df = time_df.drop(columns=IGNORE_COLS)
PREFIX = "    - cron: '"
time_df.apply(lambda x: print(PREFIX + " ".join(x.to_list()) + "'"), axis=1)
