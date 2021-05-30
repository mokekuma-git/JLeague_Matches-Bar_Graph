# JLeague_Matches-Bar_Graph
Make a bar graph of points each team got and will get.

日本のプロサッカーリーグ、Jリーグの勝ち点 (取得済み & 今後取り得る) を各チームの試合情報と共に積み上げグラフにするコードです。

## 結果を見る方法
1. docs に置いている、j_points.css  j_points.js  j1_points.json  j2_points.json  j3_points.json j_points.html のファイルをダウンロードして、
同じディレクトリに置いて、Chromeなどのブラウザで開く (JSONを読むようにしたので、HTTPでないとダメかも (サーバが要る？))
1. https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/j_points.html を見る

これらdocsに置いている例は、なるべく最新のものにするつもりですが、自動的にアップデートするようにはしていないので、最新のものを確認したい場合は、ご自身でこのプロジェクトを clone して、以下の二つのスクリプトを実行してください  
```
mv match_result-J*.csv csv
python3 read_jleague_matches.py 1-3
python3 make_match_bar_graph.py
```


### ToDo
+ 軽微な機能修正
1. まだ未実施の試合の色の薄さを指定できるようにする
2. 各ページの指定した設定をCookieに覚えさせて忘れないようにする
+ グラフ機能
4. 日程を過去に遡って、過去のグラフを再現できるようにする (スライドバーで調整)
+ 試合データ取得機能
6. 各節の日程によって、差分がある (試合日をまたいだ) データのみにアクセスするように変更
7. そのために、各節の試合日リストを保存・更新
+ 表示機能
8. CSSを自分で編集できるようにする
9. 各チームの色合いは特に
10. 登録ボタンを押して、IssueやPull-requestにできれば、さらに嬉しい
