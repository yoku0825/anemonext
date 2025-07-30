from flask import Flask, jsonify
import mysql.connector
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

# MySQL接続情報
DB_CONFIG = {
    'user': 'anemonext',
    'password': '',
    'host': '127.0.0.1',
    'database': 'slow_query_log',
    'port': 3306
}

@app.route('/api/query_history')
def get_query_history():
    checksum = request.args.get('checksum')
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    sql = 'SELECT checksum, ts_min, ts_max, Query_time_sum, Query_time_max, ts_cnt, Rows_sent_sum, Rows_examined_sum FROM global_query_review_history'
    params = []
    if checksum:
        sql += ' WHERE checksum = %s'
        params.append(checksum)
    sql += ' ORDER BY ts_min'
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)

from flask import request

@app.route('/api/query_summary')
def get_query_summary():
    period = request.args.get('period')
    zoom_min = request.args.get('zoomMin')
    zoom_max = request.args.get('zoomMax')
    where = []
    params = []
    if period and period != 'all':
        # ts_minの最大値から期間分引いた値を計算
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute('SELECT MAX(ts_min) FROM global_query_review_history')
        max_ts = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        if max_ts:
            import datetime
            import re
            # ts_minが文字列の場合のパース
            if isinstance(max_ts, str):
                # 例: '2025-07-28 12:34:56'
                max_ts = datetime.datetime.strptime(max_ts, '%Y-%m-%d %H:%M:%S')
            period_map = {
                '15min': 15*60,
                '30min': 30*60,
                '1h': 60*60,
                '3h': 3*60*60,
                '6h': 6*60*60,
                '12h': 12*60*60,
                '1d': 24*60*60,
                '2d': 2*24*60*60,
                '1w': 7*24*60*60,
                '2w': 14*24*60*60,
                '30days': 30*24*60*60,
                '60days': 60*24*60*60,
            }
            sec = period_map.get(period)
            if sec:
                min_ts = max_ts - datetime.timedelta(seconds=sec)
                where.append('ts_min >= %s')
                params.append(min_ts.strftime('%Y-%m-%d %H:%M:%S'))
    if zoom_min and zoom_max:
        # zoom_min, zoom_maxはJSのgetTime()で得たUNIXミリ秒なので、変換
        try:
            import datetime
            zoom_min_dt = datetime.datetime.fromtimestamp(float(zoom_min)/1000)
            zoom_max_dt = datetime.datetime.fromtimestamp(float(zoom_max)/1000)
            where.append('ts_min BETWEEN %s AND %s')
            params.extend([zoom_min_dt.strftime('%Y-%m-%d %H:%M:%S'), zoom_max_dt.strftime('%Y-%m-%d %H:%M:%S')])
        except Exception:
            pass
    checksum = request.args.get('checksum')
    if checksum:
        where.append('checksum = %s')
        params.append(checksum)
    where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''
    query = f'SELECT checksum, ANY_VALUE(sample) AS sample, SUM(Query_time_sum) AS Query_time_sum, MAX(Query_time_max) AS Query_time_max, SUM(ts_cnt) AS ts_cnt, SUM(Rows_sent_sum) AS Rows_sent_sum, SUM(Rows_examined_sum) AS Rows_examined_sum FROM global_query_review_history {where_sql} GROUP BY checksum ORDER BY SUM(Query_time_sum) DESC'
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    cursor.execute(query, params)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
