-- DBユーザー作成と権限付与
CREATE USER 'anemonext';
GRANT ALL PRIVILEGES ON slow_query_log.* TO 'anemonext';
