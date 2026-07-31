import React, { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Chart } from 'chart.js';
import { useNavigate, useLocation, BrowserRouter, Routes, Route } from 'react-router-dom';
Chart.register(zoomPlugin);

const PERIODS = [
  { value: '15min', label: '15分' },
  { value: '30min', label: '30分' },
  { value: '1h', label: '1時間' },
  { value: '3h', label: '3時間' },
  { value: '6h', label: '6時間' },
  { value: '12h', label: '12時間' },
  { value: '1d', label: '1日' },
  { value: '2d', label: '2日' },
  { value: '1w', label: '1週間' },
  { value: '2w', label: '2週間' },
  { value: '30days', label: '30日' },
  { value: '60days', label: '60日' },
  { value: 'all', label: '全期間' },
];

const METRICS = [
  { value: 'Query_time_sum', label: 'Query_time_sum' },
  { value: 'Query_time_max', label: 'Query_time_max' },
  { value: 'ts_cnt', label: 'ts_cnt' },
  { value: 'Rows_sent_sum', label: 'Rows_sent_sum' },
  { value: 'Rows_examined_sum', label: 'Rows_examined_sum' },
];
const SAMPLE_PREVIEW_LENGTH = 100;
const SUMMARY_COLUMNS = [
  { key: 'checksum', label: 'checksum', type: 'string' },
  { key: 'sample', label: 'sample', type: 'string' },
  { key: 'Query_time_sum', label: 'query_time_sum', type: 'number' },
  { key: 'Query_time_max', label: 'query_time_max', type: 'number' },
  { key: 'ts_cnt', label: 'ts_cnt', type: 'number' },
  { key: 'Rows_sent_sum', label: 'rows_sent_sum', type: 'number' },
  { key: 'Rows_examined_sum', label: 'rows_examined_sum', type: 'number' },
];

function parseDbDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6]),
      );
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLocalDateTime(value) {
  const date = parseDbDateTime(value);
  if (!date) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getPeriodMs(period) {
  switch (period) {
    case '15min': return 15 * 60 * 1000;
    case '30min': return 30 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '3h': return 3 * 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '12h': return 12 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    case '2d': return 2 * 24 * 60 * 60 * 1000;
    case '1w': return 7 * 24 * 60 * 60 * 1000;
    case '2w': return 14 * 24 * 60 * 60 * 1000;
    case '30days': return 30 * 24 * 60 * 60 * 1000;
    case '60days': return 60 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    metric: params.get('metric') || 'Query_time_sum',
    period: params.get('period') || 'all',
    zoomMin: params.get('zoomMin'),
    zoomMax: params.get('zoomMax'),
  };
}

function setQueryParams({ metric, period, zoomMin, zoomMax }, replace = false) {
  const params = new URLSearchParams();
  if (metric) params.set('metric', metric);
  if (period) params.set('period', period);
  if (zoomMin) params.set('zoomMin', zoomMin);
  if (zoomMax) params.set('zoomMax', zoomMax);
  const url = `${window.location.pathname}?${params.toString()}`;
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
}

function App() {
  const [data, setData] = useState([]);
  const [metric, setMetric] = useState(getQueryParams().metric);
  const [period, setPeriod] = useState(getQueryParams().period);
  const [zoomRange, setZoomRange] = useState(() => {
    const { zoomMin, zoomMax } = getQueryParams();
    if (zoomMin && zoomMax) return { min: Number(zoomMin), max: Number(zoomMax) };
    return null;
  });
  const [summary, setSummary] = useState([]);
  const [showByChecksum, setShowByChecksum] = useState(true);
  const [expandedSamples, setExpandedSamples] = useState({});
  const [summarySort, setSummarySort] = useState({ key: 'Query_time_sum', direction: 'desc' });
  const chartRef = useRef();
  const navigate = useNavigate();
  const location = useLocation();

  // summary取得関数（期間指定対応）
  const fetchSummary = (period, zoomRange) => {
    const params = new URLSearchParams();
    if (period && period !== 'all') params.set('period', period);
    if (zoomRange && zoomRange.min && zoomRange.max) {
      const zoomMin = formatLocalDateTime(zoomRange.min);
      const zoomMax = formatLocalDateTime(zoomRange.max);
      if (zoomMin && zoomMax) {
        params.set('zoomMin', zoomMin);
        params.set('zoomMax', zoomMax);
      }
    }
    return fetch(`http://localhost:5000/api/query_summary?${params.toString()}`)
      .then(res => res.json());
  };

  // checksumごとにデータ取得
  useEffect(() => {
    fetch('http://localhost:5000/api/query_history')
      .then(res => res.json())
      .then(setData)
      .catch(err => {
        console.error('failed to fetch query_history', err);
        setData([]);
      });
    fetchSummary(period, zoomRange)
      .then(setSummary)
      .catch(err => {
        console.error('failed to fetch query_summary', err);
        setSummary([]);
      });
  }, [period, zoomRange]);

  // ...existing code...

  // popstateでURLから状態復元
  useEffect(() => {
    const onPopState = () => {
      const { metric, period, zoomMin, zoomMax } = getQueryParams();
      setMetric(metric);
      setPeriod(period);
      if (zoomMin && zoomMax) {
        setZoomRange({ min: Number(zoomMin), max: Number(zoomMax) });
      } else {
        setZoomRange(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // checksumごとにデータをまとめる
  const checksumGroups = {};
  data.forEach(row => {
    if (!checksumGroups[row.checksum]) checksumGroups[row.checksum] = [];
    checksumGroups[row.checksum].push(row);
  });

  // フィルタリング（期間・ズーム）
  const filteredGroups = {};
  Object.entries(checksumGroups).forEach(([checksum, rows]) => {
    let filtered = rows;
    if (period !== 'all' && rows.length > 0) {
      const maxDate = parseDbDateTime(rows[rows.length - 1].ts_min);
      if (!maxDate) {
        filteredGroups[checksum] = filtered;
        return;
      }
      const minDate = new Date(maxDate.getTime() - getPeriodMs(period));
      filtered = rows.filter(row => {
        const rowDate = parseDbDateTime(row.ts_min);
        return rowDate && rowDate >= minDate;
      });
    }
    if (zoomRange && filtered.length > 0) {
      filtered = filtered.filter(row => {
        const rowDate = parseDbDateTime(row.ts_min);
        if (!rowDate) return false;
        const t = rowDate.getTime();
        return t >= zoomRange.min && t <= zoomRange.max;
      });
    }
    filteredGroups[checksum] = filtered;
  });

  // 色リスト
  const COLORS = [
    'rgba(75,192,192,1)',
    'rgba(255,99,132,1)',
    'rgba(54,162,235,1)',
    'rgba(255,206,86,1)',
    'rgba(153,102,255,1)',
    'rgba(255,159,64,1)',
    'rgba(0,200,83,1)',
    'rgba(233,30,99,1)',
    'rgba(63,81,181,1)',
    'rgba(0,188,212,1)',
  ];
  // サマリーが空でも履歴から上位チェックサムを算出して描画できるようにする
  const fallbackTopChecksums = (() => {
    const entries = Object.entries(filteredGroups).map(([checksum, rows]) => {
      const score = rows.reduce((acc, row) => acc + Number(row[metric] || 0), 0);
      return { checksum, score };
    });
    return entries
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(row => row.checksum);
  })();
  // チェックサム→色の割り当て（トップ10のみ）
  const topChecksums = (summary.length > 0
    ? summary.slice(0, 10).map(row => String(row.checksum))
    : fallbackTopChecksums);
  const checksumColorMap = {};
  topChecksums.forEach((cs, idx) => {
    checksumColorMap[cs] = COLORS[idx % COLORS.length];
  });

  // グラフデータ
  let chartData;
  let periodText = '全期間';
  const params = new URLSearchParams(location.search);
  const selectedChecksum = params.get('checksum');

  if (selectedChecksum) {
    // checksum指定時はそのchecksumのみ表示
    const rows = filteredGroups[String(selectedChecksum)] || [];
    // 色はトップ10に含まれていればその色、含まれていなければデフォルト
    const color = checksumColorMap[selectedChecksum] || COLORS[0];
    chartData = {
      labels: rows.map(row => parseDbDateTime(row.ts_min)).filter(Boolean),
      datasets: [
        {
          label: (() => {
            const summaryRow = summary.find(row => String(row.checksum) === String(selectedChecksum));
            if (summaryRow) {
              return `${(summaryRow.sample || '').replace(/\s+/g, ' ').slice(0, 20)}... [${selectedChecksum.slice(0,8)}]`;
            }
            return selectedChecksum;
          })(),
          data: rows.map(row => row[metric]),
          borderColor: color,
          fill: false,
        },
      ],
    };
    if (rows.length > 0) {
      const min = parseDbDateTime(rows[0].ts_min);
      const max = parseDbDateTime(rows[rows.length - 1].ts_min);
      if (min && max) {
        periodText = `${min.toLocaleString()} ～ ${max.toLocaleString()}`;
      }
    }
  } else if (!showByChecksum) {
    // 合算グラフ
    const tsMap = {};
    Object.values(filteredGroups).forEach(rows => {
      rows.forEach(row => {
        const ts = row.ts_min;
        if (!tsMap[ts]) tsMap[ts] = 0;
        tsMap[ts] += Number(row[metric] || 0);
      });
    });
    const sortedTs = Object.keys(tsMap).sort();
    chartData = {
      labels: sortedTs.map(ts => parseDbDateTime(ts)).filter(Boolean),
      datasets: [
        {
          label: '合算',
          data: sortedTs.map(ts => tsMap[ts]),
          borderColor: COLORS[0],
          fill: false,
        },
      ],
    };
    if (sortedTs.length > 0) {
      const min = parseDbDateTime(sortedTs[0]);
      const max = parseDbDateTime(sortedTs[sortedTs.length - 1]);
      if (min && max) {
        periodText = `${min.toLocaleString()} ～ ${max.toLocaleString()}`;
      }
    }
  } else {
    // summaryトップ10のみ表示
    const chartLabels = (() => {
      // 最初の系列のラベルを使う
      const first = topChecksums.find(cs => filteredGroups[cs]?.length > 0);
      if (first) {
        return filteredGroups[first].map(row => parseDbDateTime(row.ts_min)).filter(Boolean);
      }
      return [];
    })();
    chartData = {
      labels: chartLabels,
      datasets: topChecksums.map((checksum, idx) => {
        const rows = filteredGroups[String(checksum)] || [];
        // 系列名: sample先頭20文字＋checksum短縮
        const summaryRow = summary.find(row => String(row.checksum) === String(checksum));
        let label = checksum;
        if (summaryRow) {
          label = `${(summaryRow.sample || '').replace(/\s+/g, ' ').slice(0, 20)}... [${checksum.slice(0,8)}]`;
        }
        return {
          label,
          data: rows.map(row => row[metric]),
          borderColor: checksumColorMap[checksum] || COLORS[idx % COLORS.length],
          fill: false,
        };
      }),
    };
    if (chartLabels.length > 0) {
      const min = chartLabels[0];
      const max = chartLabels[chartLabels.length - 1];
      periodText = `${min.toLocaleString()} ～ ${max.toLocaleString()}`;
    }
  }

  const options = {
    scales: {
      x: {
        type: 'time',
        time: {
          tooltipFormat: 'yyyy/MM/dd HH:mm:ss',
          displayFormats: {
            minute: 'HH:mm',
            hour: 'MM/dd HH:mm',
            day: 'yyyy/MM/dd',
          },
        },
        title: {
          display: true,
          text: '日時',
        },
      },
      y: {
        beginAtZero: true,
        min: 0,
        title: {
          display: true,
          text: metric,
        },
      },
    },
    plugins: {
      legend: {
        onClick: (e, legendItem, legend) => {
          // Chart.js標準のtoggle動作
          const index = legendItem.datasetIndex;
          const ci = legend.chart;
          const meta = ci.getDatasetMeta(index);
          meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
          ci.update();
        },
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          drag: {
            enabled: true,
            backgroundColor: 'rgba(0,0,0,0.1)'
          },
          mode: 'x',
          onZoom: ({chart}) => {
            const xScale = chart.scales.x;
            setZoomRange({ min: xScale.min, max: xScale.max });
            setQueryParams({ metric, period, zoomMin: xScale.min, zoomMax: xScale.max });
          },
        },
        limits: {
          x: { min: 'original', max: 'original' },
          y: { min: 'original', max: 'original' },
        },
        onZoomComplete: ({chart}) => {
          const xScale = chart.scales.x;
          setZoomRange({ min: xScale.min, max: xScale.max });
          setQueryParams({ metric, period, zoomMin: xScale.min, zoomMax: xScale.max });
        },
      },
    },
    animation: false,
    onClick: (event, elements, chart) => {
      if (!showByChecksum) return;
      if (elements && elements.length > 0) {
        // elements[0].datasetIndex で系列番号取得
        const datasetIndex = elements[0].datasetIndex;
        // topChecksumsの順番と一致
        const topChecksums = summary.slice(0, 10).map(row => row.checksum);
        const checksum = topChecksums[datasetIndex];
        if (checksum) {
          navigate(`/?checksum=${checksum}`);
        }
      }
    },
  };

  const filteredSummary = summary.filter(row => !selectedChecksum || row.checksum === selectedChecksum);
  const sortedSummary = [...filteredSummary].sort((a, b) => {
    const column = SUMMARY_COLUMNS.find(col => col.key === summarySort.key);
    if (!column) return 0;
    const direction = summarySort.direction === 'asc' ? 1 : -1;
    if (column.type === 'number') {
      const av = Number(a[column.key] ?? 0);
      const bv = Number(b[column.key] ?? 0);
      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return 0;
    }
    const av = String(a[column.key] ?? '');
    const bv = String(b[column.key] ?? '');
    return av.localeCompare(bv) * direction;
  });
  const displayedSummary = selectedChecksum ? sortedSummary : sortedSummary.slice(0, 10);

  const toggleSummarySort = (key) => {
    setSummarySort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };


  const handleResetZoom = () => {
    setZoomRange(null);
    setQueryParams({ metric, period });
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  // トップURLに戻った時はzoomRangeをリセット
  const handleTitleClick = () => {
    setZoomRange(null);
    setQueryParams({ metric, period });
    navigate('/');
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  return (
    <div style={{ width: '80vw', margin: '40px auto' }}>
      <h2>
        <span style={{cursor: 'pointer', color: '#1976d2', textDecoration: 'underline'}} onClick={handleTitleClick}>{metric} 時系列グラフ</span>
      </h2>
      <div style={{ marginBottom: '10px' }}>期間: {periodText}</div>
      <div style={{ marginBottom: '20px' }}>
        <label>指標: </label>
        <select value={metric} onChange={e => { setMetric(e.target.value); setQueryParams({ metric: e.target.value, period, ...(zoomRange ? { zoomMin: zoomRange.min, zoomMax: zoomRange.max } : {}) }); }} style={{ marginRight: '20px', fontSize: '1rem' }}>
          {METRICS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <label>期間: </label>
        <select value={period} onChange={e => { setPeriod(e.target.value); setZoomRange(null); setQueryParams({ metric, period: e.target.value }); }} style={{ fontSize: '1rem' }}>
          {PERIODS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {zoomRange && (
          <button onClick={handleResetZoom} style={{ marginLeft: '20px', fontSize: '1rem' }}>戻る</button>
        )}
      </div>
      {/* 表示モード切替チェックボックス */}
      <div style={{marginBottom: '10px'}}>
        <label>
          <input
            type="checkbox"
            checked={showByChecksum}
            onChange={e => setShowByChecksum(e.target.checked)}
            style={{marginRight: '8px'}}
          />
          チェックサムごとに表示
        </label>
      </div>
      <Line ref={chartRef} data={chartData} options={options} />
      {/* グラフ下の表 */}
      <h3 style={{marginTop: '40px'}}>クエリサマリー</h3>
      <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '10px', tableLayout: 'fixed'}}>
        <thead>
          <tr>
            <th style={{border: '1px solid #ccc', padding: '4px', width: '80px'}}>
              <button type="button" onClick={() => toggleSummarySort('checksum')} style={{border: 'none', background: 'none', cursor: 'pointer', padding: 0}}>
                checksum{summarySort.key === 'checksum' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th style={{border: '1px solid #ccc', padding: '4px', width: '320px'}}>
              <button type="button" onClick={() => toggleSummarySort('sample')} style={{border: 'none', background: 'none', cursor: 'pointer', padding: 0}}>
                sample{summarySort.key === 'sample' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th style={{border: '1px solid #ccc', padding: '4px', width: '120px'}}>
              <button type="button" onClick={() => toggleSummarySort('Query_time_sum')} style={{border: 'none', background: 'none', cursor: 'pointer', padding: 0}}>
                query_time_sum{summarySort.key === 'Query_time_sum' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th style={{border: '1px solid #ccc', padding: '4px', width: '120px'}}>
              <button type="button" onClick={() => toggleSummarySort('Query_time_max')} style={{border: 'none', background: 'none', cursor: 'pointer', padding: 0}}>
                query_time_max{summarySort.key === 'Query_time_max' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th style={{border: '1px solid #ccc', padding: '4px', width: '80px'}}>
              <button type="button" onClick={() => toggleSummarySort('ts_cnt')} style={{border: 'none', background: 'none', cursor: 'pointer', padding: 0}}>
                ts_cnt{summarySort.key === 'ts_cnt' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th style={{border: '1px solid #ccc', padding: '4px', width: '120px'}}>
              <button type="button" onClick={() => toggleSummarySort('Rows_sent_sum')} style={{border: 'none', background: 'none', cursor: 'pointer', padding: 0}}>
                rows_sent_sum{summarySort.key === 'Rows_sent_sum' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th style={{border: '1px solid #ccc', padding: '4px', width: '120px'}}>
              <button type="button" onClick={() => toggleSummarySort('Rows_examined_sum')} style={{border: 'none', background: 'none', cursor: 'pointer', padding: 0}}>
                rows_examined_sum{summarySort.key === 'Rows_examined_sum' ? (summarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {displayedSummary.map(row => {
              const sampleText = row.sample || '';
              const isLongSample = sampleText.length > SAMPLE_PREVIEW_LENGTH;
              const isExpanded = Boolean(expandedSamples[row.checksum]);
              const shownSample = isLongSample && !isExpanded
                ? `${sampleText.slice(0, SAMPLE_PREVIEW_LENGTH)}...`
                : sampleText;
              return (
                <tr key={row.checksum}>
                  <td style={{border: '1px solid #ccc', padding: '4px'}}>
                    <span style={{color: 'blue', textDecoration: 'underline', cursor: 'pointer'}} onClick={() => navigate(`/?checksum=${row.checksum}`)}>
                      {row.checksum?.toString().slice(0,8)}
                    </span>
                  </td>
                  <td style={{border: '1px solid #ccc', padding: '4px', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxWidth: '320px'}}>
                    <span>{shownSample}</span>
                    {isLongSample && (
                      <button
                        type="button"
                        onClick={() => setExpandedSamples(prev => ({ ...prev, [row.checksum]: !prev[row.checksum] }))}
                        style={{marginLeft: '8px', border: 'none', background: 'none', color: '#1976d2', cursor: 'pointer', padding: 0}}
                      >
                        {isExpanded ? '折りたたむ' : '続きを読む'}
                      </button>
                    )}
                  </td>
                  <td style={{border: '1px solid #ccc', padding: '4px'}}>{row.Query_time_sum ? Number(row.Query_time_sum).toFixed(3) : ''}</td>
                  <td style={{border: '1px solid #ccc', padding: '4px'}}>{row.Query_time_max ? Number(row.Query_time_max).toFixed(3) : ''}</td>
                  <td style={{border: '1px solid #ccc', padding: '4px'}}>{row.ts_cnt}</td>
                  <td style={{border: '1px solid #ccc', padding: '4px'}}>{row.Rows_sent_sum}</td>
                  <td style={{border: '1px solid #ccc', padding: '4px'}}>{row.Rows_examined_sum}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// ルーティングラッパー
function AppWrapper() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
        </Routes>
      </BrowserRouter>
      <div style={{position: 'fixed', right: 8, bottom: 4, fontSize: '0.8rem', color: '#888', opacity: 0.7, pointerEvents: 'none', zIndex: 9999}}>
        anemonext
      </div>
    </>
  );
}
export default AppWrapper;
