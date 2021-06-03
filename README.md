# JLeague_Matches-Bar_Graph
Make a bar graph of points each team got and will get.

日本のプロサッカーリーグ、Jリーグの勝ち点 (取得済み & 今後取り得る) を各チームの試合情報と共に積み上げグラフにするコードです。

## 結果を見る方法
1. docs に置いている、j_points.css  j_points.js  j1_points.json  j2_points.json  j3_points.json j_points.html のファイルをダウンロードして、
同じディレクトリに置いて、Chromeなどのブラウザで開く (JSONを読むようにしたので、HTTPでないとダメかも (サーバが要る？))
1. https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/j_points.html を見る

これらdocsに置いている例は、なるべく最新のものにするつもりですが、自動的にアップデートするようにはしていないので、最新のものを確認したい場合は、ご自身でこのプロジェクトを clone して、以下のスクリプトを実行してください  
```
python3 read_jleague_matches.py
```
