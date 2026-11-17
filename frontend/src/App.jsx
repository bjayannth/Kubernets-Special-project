import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import CloudOpsDashboard from './components/CloudOpsDashboard';
import MarketDataDashboard from './components/MarketDataDashboard';
import PodDetailDrawer from './components/PodDetailDrawer';

const RANGE_TO_MINUTES = { '1H': 60, '1D': 1440, '1W': 10080, '1M': 43200 };

export default function App() {
  const [activeTab, setActiveTab] = useState('cluster');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timezone, setTimezone] = useState('IST');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [theme, setTheme] = useState('dark');

  // K8s state
  const [overview, setOverview] = useState(null);
  const [pods, setPods] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedPod, setSelectedPod] = useState(null);
  const [marketHealth, setMarketHealth] = useState(null);

  // Market state
  const [goldData, setGoldData] = useState(null);
  const [stockData, setStockData] = useState({});
  const [goldSeries, setGoldSeries] = useState([]);
  const [stockSeriesMap, setStockSeriesMap] = useState({}); // { AAPL: [...], ... }
  const [goldAvailability, setGoldAvailability] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [quotaData, setQuotaData] = useState(null);

  // Sync DB state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Cluster
      const [overviewRes, podsRes, alertsRes, healthRes] = await Promise.all([
        fetch('/api/k8s/overview').then(r => r.json()).catch(() => null),
        fetch('/api/k8s/pods').then(r => r.json()).catch(() => []),
        fetch('/api/k8s/alerts').then(r => r.json()).catch(() => []),
        fetch('/api/market-health').then(r => r.json()).catch(() => null)
      ]);
      if (overviewRes) { setOverview(overviewRes); setIsDemoMode(overviewRes.demo_mode); }
      if (podsRes) setPods(podsRes);
      if (alertsRes) setAlerts(alertsRes);
      if (healthRes) setMarketHealth(healthRes);

      // Market Live Data
      const [goldRes, stocksRes, availRes, watchRes, qRes] = await Promise.all([
        fetch('/api/market/gold').then(r => r.json()).catch(() => null),
        fetch('/api/market/stocks').then(r => r.json()).catch(() => null),
        fetch('/api/market/availability?symbol=XAU').then(r => r.json()).catch(() => null),
        fetch('/api/market/watchlist').then(r => r.json()).catch(() => []),
        fetch('/api/market/quota').then(r => r.json()).catch(() => null)
      ]);
      if (goldRes) setGoldData(goldRes);
      if (stocksRes) setStockData(stocksRes);
      if (availRes) setGoldAvailability(availRes);
      if (watchRes) setWatchlist(watchRes);
      if (qRes) setQuotaData(qRes);

      // Time-series for Gold + all watchlist symbols
      const allSymbols = ['XAU', ...(watchRes || []).map(w => w.symbol)];
      const seriesResults = await Promise.all(
        allSymbols.map(sym =>
          fetch(`/api/market/timeseries?symbol=${sym}&range=1440`).then(r => r.json()).catch(() => [])
        )
      );

      // Update goldSeries
      if (seriesResults[0]) setGoldSeries(seriesResults[0]);

      // Update stockSeriesMap
      const newStockMap = {};
      allSymbols.slice(1).forEach((sym, idx) => {
        newStockMap[sym] = seriesResults[idx + 1] || [];
      });
      setStockSeriesMap(newStockMap);

    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/market/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.message || 'Rate limited. Please wait.');
      } else {
        setSyncMessage(`✓ Synced (${data.callsUsed?.total ?? '?'} calls used)`);
        await fetchData();
      }
    } catch (err) {
      setSyncMessage('Sync failed: service offline');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const handleAddSymbol = async (symbol, name) => {
    try {
      await fetch('/api/market/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, name })
      });
      fetchData();
    } catch (err) { console.error('Add symbol failed:', err); }
  };

  const handleRemoveSymbol = async (symbol) => {
    try {
      await fetch(`/api/market/watchlist/${symbol}`, { method: 'DELETE' });
      fetchData();
    } catch (err) { console.error('Remove symbol failed:', err); }
  };

  // Initial fetch + auto-refresh interval
  useEffect(() => {
    fetchData();
    let interval = null;
    if (autoRefresh) {
      interval = setInterval(fetchData, 15000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [autoRefresh, fetchData]);

  // SSE stream for live market updates
  useEffect(() => {
    let es;
    try {
      // Connect to market-data-service SSE directly via Vite proxy
      es = new EventSource('/api/stream');
      es.addEventListener('market_update', (e) => {
        try {
          const pt = JSON.parse(e.data);
          if (pt.symbol === 'XAU') {
            setGoldSeries(prev => {
              const lastTs = prev[prev.length - 1]?.provider_timestamp;
              return lastTs === pt.provider_timestamp ? prev : [...prev.slice(-500), pt];
            });
          } else {
            setStockSeriesMap(prev => {
              const sym = pt.symbol;
              const arr = prev[sym] || [];
              const lastTs = arr[arr.length - 1]?.provider_timestamp;
              if (lastTs === pt.provider_timestamp) return prev;
              return { ...prev, [sym]: [...arr.slice(-500), pt] };
            });
          }
        } catch (_) {}
      });
    } catch (_) {}
    return () => { if (es) es.close(); };
  }, []);

  // SSE is at market-data-service port 4000, but Vite proxies /api/stream -> localhost:5000
  // We need to add the stream proxy in the backend
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.body.style.backgroundColor = next === 'dark' ? '#0B0F17' : '#F8FAFC';
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
      theme === 'dark' ? 'bg-[#0B0F17] text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDemoMode={isDemoMode}
        onRefresh={fetchData}
        isRefreshing={isRefreshing}
        timezone={timezone}
        onToggleTimezone={() => setTimezone(tz => tz === 'IST' ? 'UTC' : 'IST')}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(v => !v)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'cluster' ? (
          <CloudOpsDashboard
            overview={overview}
            pods={pods}
            alerts={alerts}
            marketHealth={marketHealth}
            onSelectPod={setSelectedPod}
            timezone={timezone}
            isDemoMode={isDemoMode}
          />
        ) : (
          <MarketDataDashboard
            goldData={goldData}
            stockData={stockData}
            goldSeries={goldSeries}
            stockSeriesMap={stockSeriesMap}
            goldAvailability={goldAvailability}
            watchlist={watchlist}
            quotaData={quotaData}
            onAddSymbol={handleAddSymbol}
            onRemoveSymbol={handleRemoveSymbol}
            onSync={handleManualSync}
            isSyncing={isSyncing}
            syncMessage={syncMessage}
            timezone={timezone}
          />
        )}
      </main>

      {/* Pod detail drawer */}
      <PodDetailDrawer
        pod={selectedPod}
        onClose={() => setSelectedPod(null)}
        timezone={timezone}
      />
    </div>
  );
}
