#!/bin/bash
set -e

# MySQL起動（mysqlユーザーで）
mysqld --user=mysql --daemonize

# MySQL起動待ち
sleep 10

# DB初期化
mysql -u root < /docker-entrypoint-initdb.d/init.sql

# Flask API起動
cd /app/backend
python app.py &

# Reactフロントエンド（静的ファイル）を公開
cd /app/frontend
npx serve -s dist -l 3000
