import requests
import pandas as pd

for _year in range(1994, 2021):
    print(_year)
    _text = requests.request('GET', f'https://data.j-league.or.jp/SFMS01/search?competition_years={_year}&tv_relay_station_name=').text
    pd.read_html(_text)[0].to_csv(f'../csv/{_year}.csv')

