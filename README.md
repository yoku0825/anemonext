# anemonext

anemonextはスローログを小刻みに [percona-toolkit](https://github.com/percona/percona-toolkit)の `pt-query-digest` にかけ、MySQLにその結果を保存するためのラッパースクリプトです。
かつては [anemoeater](https://github.com/yoku0825/anemoeater) として公開されていたもののうち、 `box/Anemometer` の部分を取り換えたものです。そのためスクリプトのライセンスは以前のものを継承しています。

## クイックスタート

* dockerとpercona-toolkitがインストールされている必要があります。

```
$ git clone https://github.com/yoku0825/anemonext
$ cd anemonext
$ cpanm --installdeps .
$ ./anemonext path_to_slow_log
```

* オプションなしの起動では、[yoku0825/anemonext](https://hub.docker.com/repository/docker/yoku0825/anemonext/general)を`docker run`します。
* スローログを小刻みに `pt-query-digest` にかけます。分割して渡さないとpt-query-digestが(checksum, ts_min, ts_max)という粒度で集計してしまうため、一括で処理した場合に綺麗なグラフにならないからです（ts_minの時刻にクエリーが集中してプロットされてしまう）
* anemonextの起動後にブラウザーからアクセスするためのURLを標準出力に表示します。コンテナーの3000番と5000番を公開します。ブラウザアクセス用のポートは3000番の方です。
* --sinceと--untilを指定して（ログが多いと重い）スローログをパースしてブラウザで見てコンテナーを止める、みたいな使い方を想定しています。

## 何故anemonext/anemoeaterが必要だったのか

* pt-query-digestはスローログをパースする際に時間の情報を「クエリーが最初に記録された時間からクエリーが最後に記録された時間」に集計してしまうからです。
* それを考慮せずにそのままAnemometerに食わせるとこうなります。Anemometerは時間軸に対してts_minの点でプロットするため、そのクエリーが最初に記録された時刻にいっぱい出たことになってしまいます。

![](https://raw.githubusercontent.com/yoku0825/anemoeater/master/image/vanilla_pt-qd.png)

* なのでanemonextの中でスローログを小刻みに処理させ、(ts_min, ts_max)が綺麗に分かれるようにpt-query-digestを呼び出してMySQLに保存させています。

![](https://raw.githubusercontent.com/yoku0825/anemoeater/master/image/anemoeater.png)

* 見たくなったら起動、見終わったらコンテナごと破棄することを想定しているためDockerを使っています。

## オプション

|     オプション      |                                                     意味                                                     |        デフォルト        |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------ |
| --socket=s          | Dockerコンテナーを使わずに既存のanemonextに結果を保存する場合の接続先MySQLソケット                           | DBD::mysql依存           |
| --host=s            | Dockerコンテナーを使わずに既存のanemonextに結果を保存する場合の接続先MySQLホスト                             | DBD::mysql依存           |
| --port=i            | Dockerコンテナーを使わずに既存のanemonextに結果を保存する場合の接続先MySQLポート                             | DBD::mysql依存           |
| --user=s            | Dockerコンテナーを使わずに既存のanemonextに結果を保存する場合のMySQLユーザー                                 | "anemometer"             |
| --password=s        | Dockerコンテナーを使わずに既存のanemonextに結果を保存する場合のMySQLパスワード                               | ""                       |
| --parallel=i        | この数値までフォークして並列でpt-query-digestを起動する                                                      | CPUスレッド数 * 1.5      |
| --since=s           | スローログ読み取りの開始時刻（これ以前の時刻のログを読み飛ばす）                                             | 現在時刻マイナス1か月    |
| --unti=s            | スローログ読み取りの終了時刻（これ以降の時刻のログを読み飛ばす）                                             | "9999/12/31"             |
| --report=i          | この数値までpt-query-digestを起動したら標準出力に現在処理中のログ時刻を出力                                  | 15                       |
| --cell=i            | 何分単位でログをpt-query-digestに送るか                                                                      | 5                        |
| --no-docker         | Dockerコンテナーを使わずに既存のanemonextに結果を保存する                                                    | N/A                      |
| --local             | yoku0825/anemonextをpullせず、Dockerfileからローカルホストにanemonextイメージをビルドする                    | N/A                      |
| --pt-query-digest=s | pt-query-digestのパスを指定する。/usr/bin/pt-query-digest 以外のパスにある場合に指定                         | /usr/bin/pt-query-digest |
| --use-docker-for-pt | --pt-query-digestで指定されたファイルの代わりに yoku0825/percona-toolkit のDockerイメージをを使う            | 0                        |
| --type=s            | 入力ファイルとして利用するファイルの種類を指定する。サポートしているファイルの種類はslowlog、binlog、tcpdump | slowlog                  |


## 引数

* スローログファイルを渡します。複数指定可能ですがグラフが混ざって見分けがつかなくなります。あまり推奨しません。
