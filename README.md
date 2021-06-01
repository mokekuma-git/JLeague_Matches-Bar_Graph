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


### ToDo
そろそろIssue管理に移行するか
+ 軽微な機能修正
+ グラフ機能
2. 節基準での上下並びも作る (未実施が間に挟まって、現勝ち点は見にくくなる)
3. 未実施の試合を指定して、「この試合は負けると想定」「この試合は引き分けと想定」などを入れ込めるようにする (一度負け想定をすると、グラフから消えて戻す操作が難しいので、チーム毎に想定はリセット可能にする)
4. グラフ領域の拡大・縮小
+ 試合データ取得機能
+ 表示機能
5. CSSを自分で編集できるようにする
6. 各チームの色合いは特に
7. 登録ボタンを押して、IssueやPull-requestにできれば、さらに嬉しい
