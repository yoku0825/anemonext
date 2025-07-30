
# ベースイメージ
FROM debian:bookworm

# 必要なパッケージインストール
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv nodejs npm wget lsb-release gnupg && \
    wget https://dev.mysql.com/get/mysql-apt-config_0.8.34-1_all.deb && \
    DEBIAN_FRONTEND=noninteractive dpkg -i mysql-apt-config_0.8.34-1_all.deb && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server && \
    rm -rf /var/lib/apt/lists/* && \
    rm mysql-apt-config_0.8.34-1_all.deb

# 作業ディレクトリ
WORKDIR /app



# Python依存パッケージ（仮想環境でインストール）
COPY backend/requirements.txt backend/requirements.txt
RUN python3 -m venv /venv && \
    /venv/bin/pip install --break-system-packages --no-cache-dir -r backend/requirements.txt
ENV PATH="/venv/bin:$PATH"

# Reactフロントエンド
COPY frontend/ frontend/
WORKDIR /app/frontend
RUN npm install react react-dom chart.js react-chartjs-2 chartjs-adapter-date-fns chartjs-plugin-zoom react-router-dom && npm install
RUN npm run build || true

# MySQL初期化
COPY db/init.sql /docker-entrypoint-initdb.d/init.sql

# Flask API
WORKDIR /app/backend
COPY backend/app.py app.py

# 起動スクリプト
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000

CMD ["/start.sh"]
