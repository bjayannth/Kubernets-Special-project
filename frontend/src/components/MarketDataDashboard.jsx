import React, { useState } from 'react';
import { Coins, TrendingUp, TrendingDown, Clock, ExternalLink, BarChart3 } from 'lucide-react';
import InteractiveChart from './InteractiveChart';
import StockWatchlistManager from './StockWatchlistManager';
import QuotaSafetyCard from './QuotaSafetyCard';
import MiniSparkline from './MiniSparkline';
import { formatDateTime } from '../utils/dateFormatter';

function getDelayLabel(providerTimestamp) {
  if (!providerTimestamp) return null;
  const diffMs = Date.now() - providerTimestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 2) return null;
  if (diffMin < 60) return `delayed ${diffMin}m`;
  return `stale ${Math.floor(diffMin / 60)}h`;
}

export default function MarketDataDashboard({
  goldData,
  stockData,
  goldSeries,
  stockSeriesMap,   // { AAPL: [...], MSFT: [...], ... }
  goldAvailability,
  watchlist,
  quotaData,
  onAddSymbol,
  onRemoveSymbol,
  onSync,
  isSyncing,
  syncMessage,
  timezone
}) {
  const [goldCurrency, setGoldCurrency] = useState('USD'); // 'USD' | 'INR' | 'INR10G'
  const [selectedRange, setSelectedRange] = useState('1H');
  const [isCompareMode, setIsCompareMode] = useState(false);

  const stocksList = Object.values(stockData || {});

  // Gold sparkline values from latest 20 stored points
  const goldSparkValues = goldSeries.slice(-20).map(p => p.value);
  const goldSessionHigh = goldSparkValues.length ? Math.max(...goldSparkValues) : null;
  const goldSessionLow  = goldSparkValues.length ? Math.min(...goldSparkValues) : null;
  const goldOpen = goldSparkValues.length ? goldSparkValues[0] : null;
  const goldDayChange = goldOpen && goldData?.usd_per_oz
    ? Math.round((goldData.usd_per_oz - goldOpen) * 100) / 100 : 0;
  const goldDayChangePct = goldOpen ? Math.round((goldDayChange / goldOpen) * 10000) / 100 : 0;
  const goldIsUp = goldDayChange >= 0;

  // Stock sparklines from DB series
  const getStockSparkline = (sym) => (stockSeriesMap?.[sym] || []).slice(-20).map(p => p.value);

  // Range to minutes map
  const rangeToMinutes = { '1H': 60, '1D': 1440, '1W': 10080, '1M': 43200 };

  // First stock availability (AAPL as proxy)
  const stockAvailability = {
    availableRanges: goldAvailability?.availableRanges || { '1H': true, '1D': false, '1W': false, '1M': false },
    firstTimestamp: goldAvailability?.firstTimestamp,
    note: goldAvailability?.note
  };

  return (
    <div className="space-y-6">
      {/* Quota & Database Protection Card */}
      <QuotaSafetyCard
        quotaData={quotaData}
        onManualSync={onSync}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
      />

      {/* Gold & Stocks Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gold Market Card */}
        <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Gold (XAU)</h2>
                <span className={`text-xs ${goldData?.stale ? 'text-amber-400' : 'text-slate-400'}`}>
                  {goldData?.stale ? 'Last Provider Quote (stale)' : 'Live Spot Rate'}
                </span>
              </div>
            </div>

            {/* Currency Toggle */}
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              {[['USD', 'USD/oz'], ['INR', 'INR/g'], ['INR10G', '10g ₹']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setGoldCurrency(key)}
                  className={`px-2 py-1 rounded-lg font-semibold transition ${
                    goldCurrency === key ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title={`Show gold price in ${label}`}
                  aria-label={`Switch to ${label} view`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Price Display */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">USD / troy oz</span>
              <span className="text-xl font-black text-amber-400">
                ${goldData?.usd_per_oz?.toLocaleString() ?? '---'}
              </span>
            </div>
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">INR / gram</span>
              <span className="text-xl font-black text-emerald-400">
                ₹{goldData?.inr_per_gram?.toLocaleString() ?? '---'}
              </span>
            </div>
          </div>

          {/* Sparkline + Session Stats */}
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between mb-3">
            <div className="space-y-0.5 text-xs">
              <div className={`font-bold ${goldIsUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {goldIsUp ? <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1" />}
                {goldIsUp ? '+' : ''}{goldDayChange} ({goldIsUp ? '+' : ''}{goldDayChangePct}%) session
              </div>
              {goldSessionHigh && (
                <div className="text-[10px] text-slate-400">
                  H: ${goldSessionHigh.toLocaleString()} / L: ${goldSessionLow.toLocaleString()}
                </div>
              )}
            </div>
            {goldSparkValues.length > 1 && (
              <MiniSparkline data={goldSparkValues} isPositive={goldIsUp} />
            )}
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Source: <strong className="text-slate-300">{goldData?.source ?? 'MetalpriceAPI'}</strong></span>
            <span className="flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              {goldData?.updated_at ? formatDateTime(goldData.updated_at, timezone) : '---'}
            </span>
          </div>
        </div>

        {/* Stock Watchlist Manager & Table (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <StockWatchlistManager
            watchlist={watchlist}
            onAddSymbol={onAddSymbol}
            onRemoveSymbol={onRemoveSymbol}
            isCompareMode={isCompareMode}
            onToggleCompareMode={() => setIsCompareMode(!isCompareMode)}
          />

          {/* Stocks Table with per-row timestamps, delay badges, sparklines */}
          <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-5 shadow-xl overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/50">
                  <th className="py-3 px-3">Symbol</th>
                  <th className="py-3 px-3 w-32">Price</th>
                  <th className="py-3 px-3 w-28">Change</th>
                  <th className="py-3 px-3 w-24">Trend</th>
                  <th className="py-3 px-3 w-40">Provider Timestamp</th>
                  <th className="py-3 px-3 w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stocksList.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-500 italic">No watchlist data available.</td>
                  </tr>
                )}
                {stocksList.map(stock => {
                  const isPositive = typeof stock.change === 'number' && stock.change >= 0;
                  const sparkData = getStockSparkline(stock.symbol);
                  const delayLabel = getDelayLabel(stock.provider_timestamp);

                  return (
                    <tr key={stock.symbol} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-100 block">{stock.symbol}</span>
                        <span className="text-slate-500 text-[10px]">{stock.name !== stock.symbol ? stock.name : ''}</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-100">{typeof stock.price === 'number' ? `$${stock.price.toFixed(2)}` : '—'}</td>
                      <td className={`py-3 px-3 font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <div>{typeof stock.change === 'number' ? `${isPositive ? '+' : ''}${stock.change.toFixed(2)}` : '—'}</div>
                        <div className="text-[10px]">{typeof stock.change_percent === 'number' ? `${isPositive ? '+' : ''}${stock.change_percent.toFixed(2)}%` : '—'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <MiniSparkline data={sparkData} isPositive={isPositive} width={70} height={24} />
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                        {stock.provider_timestamp ? formatDateTime(stock.provider_timestamp, timezone) : '---'}
                      </td>
                      <td className="py-3 px-3">
                        {stock.unavailable ? (
                          <span className="text-slate-400 text-[10px] font-bold uppercase bg-slate-500/10 px-1.5 py-0.5 rounded border border-slate-500/20" title={stock.stale_reason}>
                            Unavailable
                          </span>
                        ) : stock.stale ? (
                          <span className="text-amber-400 text-[10px] font-bold uppercase bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            Stale Cache
                          </span>
                        ) : delayLabel ? (
                          <span className="text-orange-400 text-[10px] font-bold bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
                            {delayLabel}
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            Fresh
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Gold Chart */}
      <InteractiveChart
        title={`Gold Time-Series — ${goldCurrency === 'INR' ? 'INR / gram' : goldCurrency === 'INR10G' ? 'INR / 10 grams' : 'USD / troy oz'}`}
        seriesData={goldSeries}
        symbol="XAU"
        unit={goldCurrency === 'INR' ? 'INR / gram' : goldCurrency === 'INR10G' ? 'INR / 10g' : 'USD / troy oz'}
        timezone={timezone}
        selectedRange={selectedRange}
        onRangeChange={setSelectedRange}
        historyAvailability={goldAvailability}
        goldCurrency={goldCurrency}
      />

      {/* Stocks Chart — single (AAPL) or multi-symbol compare */}
      <InteractiveChart
        title={isCompareMode
          ? 'Stocks Compare Mode — % Change from Range Start'
          : `AAPL — Price History (USD)`}
        seriesData={stockSeriesMap?.AAPL || []}
        multiSeriesData={isCompareMode ? stockSeriesMap : {}}
        symbol="AAPL"
        unit="USD"
        timezone={timezone}
        selectedRange={selectedRange}
        onRangeChange={setSelectedRange}
        historyAvailability={stockAvailability}
        isCompareMode={isCompareMode}
      />

      {/* Footer */}
      <footer className="mt-6 pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-2">
        <div className="flex items-center space-x-4">
          <span>Attribution:</span>
          <a href="https://metalpriceapi.com" target="_blank" rel="noreferrer" className="text-amber-400/80 hover:text-amber-400 flex items-center gap-1 hover:underline">
            MetalpriceAPI (Gold) <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-slate-700">|</span>
          <a href="https://finnhub.io" target="_blank" rel="noreferrer" className="text-blue-400/80 hover:text-blue-400 flex items-center gap-1 hover:underline">
            Finnhub (Stocks) <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <span>SQLite Time-Series · Provider TS as X-Axis · No Synthetic Points</span>
      </footer>
    </div>
  );
}
