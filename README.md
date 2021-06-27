# JLeague_Matches-Bar_Graph
Make a bar graph of points each team got and will get.

日本のプロサッカーリーグ、Jリーグの勝ち点 (取得済み & 今後取り得る) を各チームの試合情報と共に積み上げグラフにするコードです。

## 結果を見る方法
https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/ を見れば、基本的にその時の最新データを見られるようにしています。

## 簡単な説明
### これは何？
今年の (も) Jリーグって節ごとの日程も前倒しや延期ばっかりで、いったいどのチームがどれくらい勝ってるのか、負けてるのか  
その時の勝ち点が多くても、単に試合数をこなしてるからなのか、勝ってるせいなのか、よく分かんないですよね？
そこで、シーズンの試合とその中の勝ち試合を棒グラフ風に並べて、どのチームがどれくらい勝ち点を稼いでいて、今後どこまで稼げるのか、を表示するプログラムを作りました。
![現在の勝ち点順](https://user-images.githubusercontent.com/84721916/123546553-00999c80-d798-11eb-9d30-0ce6f89b43b7.png)


### 最大勝ち点って何さ？
で、「実際今年はどこまで勝点稼ぐ可能性があるの？」という数字を「最大勝ち点」として、その順序に並べることもできます。  
「チーム並び順」のプルダウンを、「今年の最大勝ち点順」にしてみてください。
![今年の最大勝ち点順](https://user-images.githubusercontent.com/84721916/123546558-068f7d80-d798-11eb-82e6-5e6cefae7845.png)

独走してるように見える川崎に、肉薄してるのはどこなのか、その差はどれくらいなのか、が分かり易くなったと思いませんか？


### 時系列を遡った表示
表示も、開幕前から最終節まで (もちろん、まだやってない試合の結果は未定のままです) スライダーで戻してみることもできます。  
一応、過去のデータも拾ってきているけども、2003年より前は勝ち点計算も違うし延長戦もあるので、この辺の順位計算はまだうまく実装できてませんので、あしからず。

表示日程の調整は、各シーズンの試合日ごとに一目盛りとなっていて、この日の午後と夜とを比べる、ということは現状ではできません。  
必要なら考えますけど、どうですかね。(ちょっと細かすぎるかなと思ってます)
スライダーで一目盛りずつ調整するのが大変なので、左右のボタン 【＜】と【＞】で一つずつずらすこともできます。  
(でも、描画に秒単位くらいはかかる時があるので、ばんばん押しても細かく追従できないかもしれません)
今日の状態 (過去のシーズンデータの場合は最終節の状態) に戻したい時は、「最新の状態にリセット」ボタンを押してください。


### 表示の上下設定
グラフの上下は、新しいものが上か下かを選べます。  
一応、節数順に並べることもできますが、歯抜けばかりであまり比べやすくはないですね。


### 別カテゴリ
J2, J3のデータもそろえています。  
ただ、各クラブの背景色は作者が勝手に各Webページから拾ってきた色を配色しているので、  
「これはうちのクラブの色じゃない！」と言うこともあると思います。

そういう時は、このGitlabのIssueなどでお知らせいただくと助かります。  
近いうちに、この色合いやグラデーションなどを編集する簡単なUIを作って、編集できるようにしたいなと思っています。  
いい設定ができたら、お知らせいただければ幸いです。


### なんか再読み込みしても表示が変わんないんだけど
どのカテゴリを見てるか、どんな順序で見ているか、などはブラウザのクッキーを使って覚えています。  
他に、下の方には
 - 余白の色設定
 - 未実施試合の色合いの濃さ
 - グラフ領域の拡大・縮小

などが変えられるようになっていますが、これもクッキーで覚えています。  
元の状態に戻したい時は、「ブラウザで覚えた状態をリセット」ボタンを押してくださいね。  
その状態でブラウザを閉じれば、変なクッキーは残らないはず。



## 自分の環境で動かす方法
docs に置いている、j_points.css  j_points.js j_points.html とjsonディレクトリのファイルをダウンロードして、
同じディレクトリに置いて、Chromeなどのブラウザで開く (JSONを読むようにしたので、HTTPでないとダメかも (サーバが要る？))

これらdocsに置いている例は、なるべく最新のものにするつもりですが、今のところ自動的にアップデートするようにはしていないので、最新のものを確認したい場合は、ご自身でこのプロジェクトを clone して、以下のスクリプトを実行してください (pythonとその他requirements.txtで示すライブラリが必要)
```
python3 read_jleague_matches.py
```

