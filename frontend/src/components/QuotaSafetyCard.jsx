import React, { useState, useEffect } from 'react';
import { Database, ShieldCheck, Clock, RefreshCw, AlertCircle, Zap, Activity, AlertTriangle, EyeOff, Lock } from 'lucide-react';

export default function QuotaSafetyCard({ quotaData, onManualSync, isSyncing, syncMessage }) {
  const [secondsToNextRefresh, setSecondsToNextRefresh] = useState(300);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToNextRefresh(prev => (prev > 1 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}m ${remainder < 10 ? '0' : ''}${remainder}s`;
  };

  const isDemo = quotaData?.isDemo ?? false;
  const metalcharts = quotaData?.metalcharts || {
    service: 'MetalCharts (Primary Gold)',
    quotaRemaining: null,
    monthlyLimit: null,
    requestsUsed: null,
    headersRemaining: null
  };

  const metalprice = quotaData?.metalprice || {
    service: 'MetalpriceAPI (Secondary Cross-Check)',
    maxDailyCalls: null,
    monthlyLimit: null,
    quotaRemaining: null,
    requestsUsed: null
  };

  const finnhub = quotaData?.finnhub || {
    limitPerMinute: null,
    tokensAvailable: null,
    queueLength: 0
  };

  const goldSchedule = quotaData?.goldSchedule || {
    formattedInterval: 'Unavailable',
    stopSchedule: false
  };

  const marketStatus = quotaData?.marketStatus || {
    usMarket: { isOpen: true, reason: 'Market open', formattedLastClose: '4:00 PM ET' },
    goldMarket: { isOpen: true, reason: 'Gold market open' }
  };

  const sseViewers = quotaData?.sseViewers ?? 0;
  const activeSkipReason = quotaData?.activeSkipReason;
  const syncCallsRequired = quotaData?.syncCallsRequired ?? null;
  const metalchartsPercent = metalcharts.monthlyLimit
    ? Math.min(100, (metalcharts.requestsUsed / metalcharts.monthlyLimit) * 100)
    : 0;
  const finnhubPercent = finnhub.limitPerMinute
    ? Math.min(100, (finnhub.tokensAvailable / finnhub.limitPerMinute) * 100)
    : 0;

  const handleSyncClick = () => {
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 6000);
      return;
    }
    setShowConfirm(false);
    onManualSync();
  };

  return (
    <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Central Quota Budget Manager
              {isDemo && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  DEMO BUDGET
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">Single-flight request coalescing, token bucket (30/min), 90% reserve threshold & market hours protection</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-wrap">
          {/* Market Status Badge */}
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
            marketStatus.usMarket?.isOpen
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            <Activity className="w-3 h-3" />
            {marketStatus.usMarket?.isOpen ? 'NYSE/Nasdaq Open' : `Market Closed (${marketStatus.usMarket?.formattedLastClose})`}
          </span>

          <span className="text-xs text-slate-400 flex items-center bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 mr-1 text-blue-400" />
            Next Fetch: <strong className="text-blue-400 ml-1 font-mono">{formatCountdown(secondsToNextRefresh)}</strong>
          </span>
        </div>
      </div>

      {/* Active Skip Reason Alert Banner */}
      {activeSkipReason && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Scheduled Fetch Paused: <strong>{activeSkipReason}</strong></span>
        </div>
      )}

      {/* Grid: MetalCharts (Primary), Secondary Cross-Check, Finnhub Token Bucket */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MetalCharts Primary Gold */}
        <div className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              MetalCharts (Primary Gold)
            </span>
            <span className="text-slate-400 font-mono text-[11px]">{metalcharts.requestsUsed ?? '—'} / {metalcharts.monthlyLimit ?? '—'} used</span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all"
              style={{ width: `${metalchartsPercent}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
            <span>Remaining: <strong className="text-amber-400 font-mono">{metalcharts.quotaRemaining ?? '—'} calls</strong></span>
            <span className="text-indigo-300 font-mono font-medium">{goldSchedule.formattedInterval}</span>
          </div>
        </div>

        {/* Secondary Cross-Check (MetalpriceAPI) */}
        <div className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              MetalpriceAPI (Cross-Check)
            </span>
            <span className="text-slate-400 font-mono text-[11px]">{metalprice.requestsUsed ?? '—'} calls</span>
          </div>

          <div className="p-2 bg-slate-950/60 rounded-lg text-[11px] text-slate-400 flex items-center justify-between">
            <span>Budget / policy:</span>
            <strong className="text-purple-400 font-mono">{metalprice.monthlyLimit ?? '—'} / month · {metalprice.maxDailyCalls ?? '—'} / day</strong>
          </div>

          <div className="text-[10px] text-slate-500 italic">
            Cross-check runs once daily to verify spot rates.
          </div>
        </div>

        {/* Finnhub Token-Bucket */}
        <div className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              Finnhub (Token Bucket)
            </span>
            <span className="text-slate-400 font-mono text-[11px]">{finnhub.tokensAvailable ?? '—'} / {finnhub.limitPerMinute ?? '—'} tokens</span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${finnhubPercent}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
            <span>Rate Limit: <strong className="text-blue-400 font-mono">{finnhub.limitPerMinute ?? '—'} calls/min</strong></span>
            <span className="text-emerald-400 font-mono font-medium">{finnhub.tokensAvailable ?? '—'} tokens ready</span>
          </div>
        </div>
      </div>

      {/* Footer & Sync Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-slate-400 pt-2 border-t border-slate-800/60">
        <span className="flex items-center text-[11px]">
          <Database className="w-3.5 h-3.5 mr-1.5 text-emerald-400 shrink-0" />
          Active SSE Viewers: <strong className="text-slate-200 mx-1">{sseViewers}</strong> • 90% budget reserve preserved for manual sync
        </span>

        <div className="flex items-center space-x-2">
          {syncMessage && (
            <span className="text-[11px] text-amber-400 font-medium animate-fadeIn">{syncMessage}</span>
          )}
          <button
            onClick={handleSyncClick}
            disabled={isSyncing}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center space-x-1.5 ${
              showConfirm
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border-slate-700'
            }`}
            title={syncCallsRequired ? `Trigger rate-limited sync (Uses ${syncCallsRequired} upstream calls)` : 'Sync unavailable'}
            aria-label="Sync Database from upstream providers"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : 'text-slate-300'}`} />
            <span>{showConfirm ? `Confirm Sync (${syncCallsRequired} calls)?` : `Sync DB${syncCallsRequired ? ` (${syncCallsRequired} calls)` : ''}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
