import React, { useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { Download, AlertTriangle, Info, Clock, SlidersHorizontal } from 'lucide-react';
import { formatDateTime } from '../utils/dateFormatter';

ChartJS.register(
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Distinct vibrant color palette for multi-symbol compare mode
const SYMBOL_COLORS = [
  '#3B82F6', // Blue (AAPL)
  '#10B981', // Emerald (MSFT)
  '#F59E0B', // Amber (GOOGL)
  '#EC4899', // Pink (AMZN)
  '#8B5CF6', // Purple (TSLA)
  '#06B6D4', // Cyan (NVDA)
  '#F97316'  // Orange (Other)
];

export default function InteractiveChart({
  title,
  seriesData = [],           // For single symbol chart
  multiSeriesData = {},      // For compare mode { AAPL: [...], MSFT: [...], ... }
  symbol = 'XAU',
  unit = 'USD / troy oz',
  timezone = 'IST',
  selectedRange = '1H',
  onRangeChange,
  historyAvailability,
  isCompareMode = false,
  goldCurrency = 'USD'
}) {
  const chartRef = useRef(null);

  // Range availability
  const available = historyAvailability?.availableRanges || {
    '1H': true,
    '1D': false,
    '1W': false,
    '1M': false
  };

  // Expected refresh interval (5 minutes = 300,000 ms). Gap > 2x (600,000 ms) breaks the line.
  const MAX_GAP_MS = 10 * 60 * 1000;

  // Filter series data according to selectedRange (1H = 60m, 1D = 1440m, etc.)
  const activeSeriesData = useMemo(() => {
    if (!seriesData || seriesData.length === 0) return [];
    const rangeMap = { '1H': 60, '1D': 1440, '1W': 10080, '1M': 43200 };
    const maxMins = rangeMap[selectedRange] || 60;
    const latestTs = seriesData[seriesData.length - 1]?.provider_timestamp || Date.now();
    const cutoffTs = latestTs - (maxMins * 60 * 1000);
    return seriesData.filter(pt => pt.provider_timestamp >= cutoffTs);
  }, [seriesData, selectedRange]);

  const activeMultiSeriesData = useMemo(() => {
    if (!multiSeriesData || Object.keys(multiSeriesData).length === 0) return {};
    const rangeMap = { '1H': 60, '1D': 1440, '1W': 10080, '1M': 43200 };
    const maxMins = rangeMap[selectedRange] || 60;
    const res = {};
    for (const [sym, pts] of Object.entries(multiSeriesData)) {
      if (!pts || pts.length === 0) continue;
      const latestTs = pts[pts.length - 1]?.provider_timestamp || Date.now();
      const cutoffTs = latestTs - (maxMins * 60 * 1000);
      res[sym] = pts.filter(pt => pt.provider_timestamp >= cutoffTs);
    }
    return res;
  }, [multiSeriesData, selectedRange]);

  // Process data points with gap handling
  const processedDatasets = useMemo(() => {
    if (isCompareMode && Object.keys(activeMultiSeriesData).length > 0) {
      // Multi-symbol Compare Mode
      return Object.entries(activeMultiSeriesData).map(([sym, pts], idx) => {
        if (!pts || pts.length === 0) return null;

        const baseVal = pts[0]?.value || 1;
        const color = SYMBOL_COLORS[idx % SYMBOL_COLORS.length];

        // Build continuous coordinates with gap breaks
        const dataPoints = [];
        for (let i = 0; i < pts.length; i++) {
          if (i > 0 && (pts[i].provider_timestamp - pts[i - 1].provider_timestamp > MAX_GAP_MS)) {
            // Insert gap marker (null) to break line
            dataPoints.push({ x: pts[i - 1].provider_timestamp + 1, y: null });
          }
          const pctChange = Math.round(((pts[i].value - baseVal) / baseVal) * 10000) / 100;
          dataPoints.push({
            x: pts[i].provider_timestamp,
            y: pctChange,
            source: pts[i].source,
            is_stale: pts[i].is_stale,
            rawPrice: pts[i].value
          });
        }

        const hidePoints = dataPoints.length > 60;

        return {
          label: `${sym} (% Change)`,
          data: dataPoints,
          borderColor: color,
          backgroundColor: `${color}15`,
          borderWidth: 2,
          tension: 0,          // STRICT ZERO SMOOTHING
          spanGaps: false,     // STRICT ZERO GAP INTERPOLATION
          pointRadius: hidePoints ? 0 : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          fill: false
        };
      }).filter(Boolean);
    }

    // Single Symbol Mode (e.g. Gold or single Stock)
    if (!activeSeriesData || activeSeriesData.length === 0) return [];

    const dataPoints = [];
    for (let i = 0; i < activeSeriesData.length; i++) {
      const pt = activeSeriesData[i];
      if (i > 0 && (pt.provider_timestamp - activeSeriesData[i - 1].provider_timestamp > MAX_GAP_MS)) {
        // Insert gap break
        dataPoints.push({ x: activeSeriesData[i - 1].provider_timestamp + 1, y: null });
      }

      let val = pt.value;
      if (symbol === 'XAU') {
        const rate = pt.usd_inr_rate_used && pt.usd_inr_rate_used !== 85.2
          ? pt.usd_inr_rate_used
          : null;
        if ((goldCurrency === 'INR' || goldCurrency === 'INR10G') && rate) {
          const multiplier = goldCurrency === 'INR10G' ? 10 : 1;
          val = Math.round(((pt.value * rate) / 31.1035 * multiplier) * 100) / 100;
        } else if (goldCurrency === 'INR' || goldCurrency === 'INR10G') {
          val = null;
        }
      }

      dataPoints.push({
        x: pt.provider_timestamp,
        y: val,
        source: pt.source,
        is_stale: pt.is_stale,
        rawPoint: pt
      });
    }

    const hidePoints = dataPoints.length > 60;
    const mainColor = symbol === 'XAU' ? '#F59E0B' : '#3B82F6';

    return [
      {
        label: `${symbol} (${unit})`,
        data: dataPoints,
        borderColor: mainColor,
        backgroundColor: symbol === 'XAU' ? 'rgba(245, 158, 11, 0.06)' : 'rgba(59, 130, 246, 0.06)',
        borderWidth: 2,
        tension: 0,          // STRICT ZERO SMOOTHING
        spanGaps: false,     // STRICT ZERO GAP INTERPOLATION
        pointRadius: (ctx) => {
          if (hidePoints) return 0;
          const pt = ctx.raw;
          return pt && pt.is_stale ? 4 : 2.5;
        },
        pointHoverRadius: 6,
        pointBackgroundColor: (ctx) => {
          const pt = ctx.raw;
          return pt && pt.is_stale ? '#EF4444' : mainColor;
        },
        pointBorderColor: '#0F172A',
        pointBorderWidth: 1.5,
        fill: true
      }
    ];
  }, [activeSeriesData, activeMultiSeriesData, isCompareMode, symbol, unit, goldCurrency]);

  const hasDemoData = isCompareMode
    ? Object.values(multiSeriesData).some(arr => arr?.some(p => p.is_demo))
    : seriesData.some(p => p.is_demo);

  // Latest point metadata for header
  const latestPt = seriesData && seriesData.length > 0 ? seriesData[seriesData.length - 1] : null;

  const chartData = {
    datasets: processedDatasets
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#94A3B8',
          font: { size: 11, family: 'system-ui' },
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 6
        }
      },
      tooltip: {
        backgroundColor: '#0F172A',
        titleColor: '#F8FAFC',
        bodyColor: '#E2E8F0',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          title: (context) => {
            const raw = context[0]?.raw;
            if (!raw || !raw.x) return '';
            return formatDateTime(raw.x, timezone);
          },
          label: (context) => {
            const raw = context.raw;
            if (!raw || raw.y === null) return 'No data (Gap in Telemetry)';
            if (isCompareMode) {
              return ` ${context.dataset.label}: ${raw.y >= 0 ? '+' : ''}${raw.y}% (Price: $${raw.rawPrice?.toFixed(2)})`;
            }
            return ` ${context.dataset.label}: ${raw.y?.toLocaleString()}`;
          },
          afterBody: (context) => {
            const raw = context[0]?.raw;
            if (!raw || raw.y === null) return [];
            return [
              `Source: ${raw.source || 'Database'}`,
              `Status: ${raw.is_stale ? '⚠️ Stale / Cached Fallback' : '✅ Verified Fresh'}`
            ];
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            minute: 'HH:mm',
            hour: 'HH:mm',
            day: 'dd MMM'
          }
        },
        grid: { color: 'rgba(51, 65, 85, 0.25)' },
        ticks: {
          color: '#64748B',
          font: { size: 10 },
          autoSkip: true,
          maxTicksLimit: 8,
          maxRotation: 0
        }
      },
      y: {
        beginAtZero: isCompareMode,
        title: {
          display: true,
          text: isCompareMode ? '% Change' : unit,
          color: '#64748B',
          font: { size: 10 }
        },
        grid: { color: 'rgba(51, 65, 85, 0.25)' },
        ticks: {
          color: '#94A3B8',
          font: { size: 10 },
          callback: (val) => isCompareMode ? `${val}%` : val.toLocaleString()
        }
      }
    }
  };

  // CSV Export
  const exportCSV = () => {
    if (!seriesData || seriesData.length === 0) return;
    const headers = ['Symbol', 'ProviderTimestamp', 'ProviderTimestampFormatted', 'Value', 'Unit', 'Source', 'IsStale'];
    const rows = seriesData.map(pt => [
      pt.symbol,
      pt.provider_timestamp,
      `"${formatDateTime(pt.provider_timestamp, timezone)}"`,
      pt.value,
      pt.currency_unit,
      `"${pt.source}"`,
      pt.is_stale ? 1 : 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${symbol}_timeseries_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PNG Export
  const exportPNG = () => {
    if (!chartRef.current) return;
    const link = document.createElement('a');
    link.download = `${symbol}_chart_${Date.now()}.png`;
    link.href = chartRef.current.toBase64Image();
    link.click();
  };

  return (
    <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-6 shadow-xl relative space-y-4">
      {/* Chart Header & Data Freshness */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            {hasDemoData && (
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                DEMO DATA
              </span>
            )}
          </div>
          {latestPt && (
            <p className="text-xs text-slate-400 font-mono mt-1">
              Provider TS: <span className="text-slate-200">{formatDateTime(latestPt.provider_timestamp, timezone)}</span> •
              Fetched: <span className="text-slate-200">{formatDateTime(latestPt.fetched_at, timezone)}</span> •
              Source: <span className="text-slate-300">{latestPt.source || 'Database'}</span>
            </p>
          )}
        </div>

        {/* Range Selector & Action Buttons */}
        <div className="flex items-center space-x-2 flex-wrap">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            {['1H', '1D', '1W', '1M'].map(r => {
              const isAvail = available[r];
              return (
                <button
                  key={r}
                  disabled={!isAvail}
                  onClick={() => isAvail && onRangeChange(r)}
                  className={`px-3 py-1 font-semibold rounded-lg transition ${
                    selectedRange === r
                      ? 'bg-blue-600 text-white shadow-sm'
                      : isAvail
                      ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                      : 'text-slate-600 cursor-not-allowed opacity-40'
                  }`}
                  title={!isAvail ? `Range ${r} requires more history` : `View ${r} range`}
                  aria-label={`Select range ${r}`}
                >
                  {r}
                </button>
              );
            })}
          </div>

          <div className="flex space-x-1">
            <button
              onClick={exportCSV}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition text-xs flex items-center space-x-1"
              title="Export CSV"
              aria-label="Export chart data as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={exportPNG}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition text-xs flex items-center space-x-1"
              title="Export PNG Image"
              aria-label="Export chart as PNG image"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">PNG</span>
            </button>
          </div>
        </div>
      </div>

      {/* History Note with Unified Date Format */}
      {historyAvailability?.firstTimestamp && (
        <div className="flex items-center space-x-2 text-[11px] text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-slate-800/80">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>History collecting since: <strong className="text-slate-200">{formatDateTime(historyAvailability.firstTimestamp, timezone)}</strong></span>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="h-72 relative">
        <Line ref={chartRef} options={chartOptions} data={chartData} />
      </div>
    </div>
  );
}
