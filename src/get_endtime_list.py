"""read_jleague_matches.pyで読んだリーグのスケジュールから試合時間を取り出し、Workflowで使うcron形式の並びにそろえる。

githubのworkflowはUTCで時間を扱うので、その分修正。
"""

from datetime import timedelta

import pandas as pd

_df = []
for i in [1, 2, 3]:
    _df.append(pd.read_csv(f'docs/csv/2022_allmatch_result-J{i}.csv', index_col=0))

time_df = pd.DataFrame()
for i in [0, 1, 2]:
    time_df = pd.concat([time_df, _df[i][['match_date', 'start_time']]])

time_df = time_df[time_df['start_time'] != '未定']
time_df['datetime'] = time_df['match_date'] + ' ' + time_df['start_time']
time_df['datetime'] = pd.to_datetime(time_df['datetime'])

time_df['datetime'] += timedelta(minutes=135)
time_df['datetime'] -= timedelta(hours=9)

time_df['m'] = time_df['datetime'].dt.minute
time_df['h'] = time_df['datetime'].dt.hour
time_df['D'] = time_df['datetime'].dt.day
time_df['M'] = time_df['datetime'].dt.month
time_df['WD'] = '*'

time_df = time_df.sort_values('datetime')
time_df = time_df.drop_duplicates(subset=['datetime'])

time_df.to_csv('datetimes.csv')
