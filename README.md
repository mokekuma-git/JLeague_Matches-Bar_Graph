# JLeague_Matches-Bar_Graph
Make a bar graph of points each team got and will get.

日本のプロサッカーリーグ、Jリーグの勝ち点 (取得済み & 今後取り得る) を各チームの試合情報と共に積み上げグラフにするコードです。

## 結果を見る方法
https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/ を見れば、基本的にその時の最新データを見られるようにしています。

https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/olympic_points.html オリンピックグループステージの得点表も作ってみました。

https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/wcafc_fq_points.html W杯2022アジア最終予選

(https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/aclgl_points.html ACLのグループステージ)

## 簡単な説明
### これは何？
今年の (も) Jリーグって節ごとの日程も前倒しや延期ばっかりで、いったいどのチームがどれくらい勝ってるのか、負けてるのか  
その時の勝ち点が多くても、単に試合数をこなしてるからなのか、勝ってるせいなのか、よく分かんないですよね？
そこで、シーズンの試合とその中の勝ち試合を棒グラフ風に並べて、どのチームがどれくらい勝ち点を稼いでいて、今後どこまで稼げるのか、を表示するプログラムを作りました。
![最新の勝ち点順](https://user-images.githubusercontent.com/84721916/123546553-00999c80-d798-11eb-9d30-0ce6f89b43b7.png)


### 最大勝ち点って何さ？
で、「実際今年はどこまで勝点稼ぐ可能性があるの？」という数字を「最大勝ち点」として、その順序に並べることもできます。  
「チーム並び順」のプルダウンを、「最新の最大勝ち点順」にしてみてください。
![最新の最大勝ち点順](https://user-images.githubusercontent.com/84721916/123546558-068f7d80-d798-11eb-82e6-5e6cefae7845.png)

独走してるように見える川崎に、肉薄してるのはどこなのか、その差はどれくらいなのか、が分かり易くなったと思いませんか？

### で、並び順はどうやって決めてるの？
Jリーグの現在のルール ([大会概要](https://www.jleague.jp/outline/j1.html)) に準じて、下記の比較を行っています。  
反則ポイントは現状入手していないので、比較対象としていません。
1. 勝ち点 (最大勝ち点を指定している場合は、「最大勝ち点」「勝ち点」の順)
2. 得失点差
3. 総得点数

リーグで次に適用する「当該チーム間の対戦成績（イ：勝点、ロ：得失点差、ハ：総得点数）」は、現在は実装しておらず、前年度の成績を元にソートしています。

「最新の勝ち点」「最新の最大勝ち点」を選ぶと、過去の情報に遡っても並び順は最新の値を元に行います。  
つまり、「今の順位のままで過去の勝ち点状況などを見比べる」時にご利用ください。


### 負け試合が見えない・勝敗数が数えにくい・得失点情報が分からない
この勝ち点積み上げ方式は、これまでの対戦、ここからの対戦を見るための面白いスタイルだと思いますが、残念ながら各チームの負け試合がみえなくなります。(勝ち点0なんで仕方ない)  
その分は、チーム名のところにマウスを置く (タッチパネルであれば長押しをする) ことで、下記のような表示を行います。

![チーム成績・敗戦記録](https://user-images.githubusercontent.com/84721916/124478296-03bc0a80-dde0-11eb-96e9-b0e0160d391c.png)

どんな試合で、どんな点差で負けたっけ、みたいな振り返りにどうぞ。(見たくない時もあるかもしれませんが)  

敗戦情報の上に、最新または表示時点の、勝ち点、最大勝ち点、得点、失点、得失点差などチームの成績情報を表示させています。  
グラフは多くのチームの比較には役立つかもしれませんが、何勝したのか、いくつ引き分けたのかは、パッと見分かりにくい点が欠点です。  
なので、数字で知りたい時はこちらをご覧ください。  
総得点、総失点などもこちらに表示しています。  
チーム並び順が「最新の～」の時には、成績情報も最新状態のものです。  
チーム並び順が「表示時の～」の時には、成績情報も表示している時点の成績です。


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

そういう時は、このGithubのIssueなどでお知らせいただくと助かります。  
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


### どこ情報よ
Jリーグのデータは、Jリーグのサイトで公開される https://www.jleague.jp/match/section/j1/1/ などから取得しています。  
変換した結果はこちらです。https://github.com/mokekuma-git/JLeague_Matches-Bar_Graph/blob/main/docs/csv/match_result-J1.csv (ほか、J2, J3も)

ACLのデータは、Yahoo スポーツナビさんのhttps://soccer.yahoo.co.jp/jleague/category/acl/schedule/ から取得しています。  
こちらの変換結果は、これです。 https://github.com/mokekuma-git/JLeague_Matches-Bar_Graph/blob/main/docs/csv/2021_allmatch_result-ACL_GL.csv

取得頻度は、各節の試合終了後にスクリプトで取得しています。  
データ化、公開してくださる皆様に感謝します。  
いずれもオープンなニュースとしての情報で、著作物ではない情報という理解でいますが、問題がありましたら取得先、取得方法を見直します。


### このスタイル、誰に聞いたの
わたしがこの方式を見かけたのは2021年の春なんですが、[ミネ月 (id:mineja)](https://jalanjalansepakbola.hatenadiary.com/about) さんは少なくとも2016年4月にはこのスタイルを確立されています。 (もっと古いかもしれません)

https://jalanjalansepakbola.hatenadiary.com/entry/2016/04/11/165521

直接的には、5chのフロンターレスレで流れていたのを見たのがきっかけになりました。  
先人達の工夫に敬意を表します。


## 自分の環境で動かす方法
docs に置いている、j_points.css  j_points.js j_points.html とcsvディレクトリのファイルをダウンロードして、
同じディレクトリに置いて、Chromeなどのブラウザで開く (CSVを読むようにしたので、HTTPでないとダメかも (サーバが要る？))

これらdocsに置いている例は、なるべく最新のものにするつもりですが、今のところ自動的にアップデートするようにはしていないので、最新のものを確認したい場合は、ご自身でこのプロジェクトを clone して、以下のスクリプトを実行してください (pythonとその他requirements.txtで示すライブラリが必要)
```
python3 src/read_jleague_matches.py
```
