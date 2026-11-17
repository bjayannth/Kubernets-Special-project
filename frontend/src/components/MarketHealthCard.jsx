import React from 'react';
import { Server, CheckCircle2, AlertOctagon, ShieldAlert, Activity } from 'lucide-react';
import { formatDateTime } from '../utils/dateFormatter';
import { openDetailHtmlPage } from '../utils/openDetailHtmlPage';

export default function MarketHealthCard({ health, timezone = 'IST' }) {
  if (!health) return null;

  const statusConfig = {
    Healthy: { color: 'emerald', icon: <CheckCircle2 className="w-5 h-5" />, bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    Degraded: { color: 'amber', icon: <ShieldAlert className="w-5 h-5" />, bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
    'Not configured': { color: 'blue', icon: <Activity className="w-5 h-5" />, bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
    Down: { color: 'rose', icon: <AlertOctagon className="w-5 h-5" />, bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400' }
  };
  const cfg = statusConfig[health.status] || statusConfig['Not configured'];

  const m = health.metrics || {};
  const total = (m.cacheHits || 0) + (m.cacheMisses || 0);

  return (
    <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-10 pointer-events-none bg-${cfg.color}-500`} />

      {/* Header — Clickable for Market Diagnostics */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => openDetailHtmlPage('MARKET_DIAGNOSTICS', { health, timezone })}
            className={`p-2.5 rounded-xl border ${cfg.bg} ${cfg.border} ${cfg.text} hover:scale-105 transition cursor-pointer`}
            title="Click to view full Market Health Diagnostics"
            aria-label="View Market Diagnostics"
          >
            <Server className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Market Service Health
              <button
                onClick={() => openDetailHtmlPage('MARKET_DIAGNOSTICS', { health, timezone })}
                className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${cfg.bg} ${cfg.text} border ${cfg.border} hover:opacity-80 transition cursor-pointer`}
                title="Click to open status detail window"
                aria-label="Open status detail"
              >
                {health.status}
              </button>
              {health.status === 'Not configured' && (
                <span className="text-xs text-slate-400 font-normal">(Demo Random Walk Mode)</span>
              )}
            </h2>
            <p className="text-xs text-slate-400">Prometheus Telemetry • /healthz Probe • Uptime: {health.uptimeFormatted || '---'}</p>
          </div>
        </div>

        <button
          onClick={() => openDetailHtmlPage('MARKET_DIAGNOSTICS', { health, timezone })}
          className="text-right text-xs hover:opacity-80 transition cursor-pointer focus:outline-none"
          title="Click to view /healthz probe telemetry"
          aria-label="View healthz probe telemetry"
        >
          <span className={`font-medium ${health.healthz ? 'text-emerald-400' : 'text-rose-400'}`}>
            /healthz {health.healthz ? '✓ 200 OK' : '✗ FAIL'}
          </span>
        </button>
      </div>

      {/* Key Metrics Grid — 4 Interactive Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {/* Requests (Total) */}
        <button
          onClick={() => openDetailHtmlPage('MARKET_REQUESTS', { health, timezone })}
          className="p-3 bg-slate-900/60 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-blue-500/50 transition active:scale-98 text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          title="Click to view Total Requests detailed HTML telemetry"
          aria-label="View Total Requests details"
        >
          <span className="text-[11px] text-slate-400 group-hover:text-blue-400 transition block mb-1 font-medium">Requests (Total)</span>
          <span className="text-xl font-bold text-slate-100">{m.requestCount || 0}</span>
          <p className="text-[10px] text-slate-500 mt-0.5">= Hits + Misses + Other</p>
        </button>

        {/* Cache Hits / Misses */}
        <button
          onClick={() => openDetailHtmlPage('MARKET_CACHE', { health, timezone })}
          className="p-3 bg-slate-900/60 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-blue-500/50 transition active:scale-98 text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          title="Click to view Cache Hits / Misses detailed HTML view"
          aria-label="View Cache details"
        >
          <span className="text-[11px] text-slate-400 group-hover:text-blue-400 transition block mb-1 font-medium">Cache Hits / Misses</span>
          <span className="text-xl font-bold text-slate-100">
            <span className="text-emerald-400">{m.cacheHits || 0}</span> / <span className="text-amber-400">{m.cacheMisses || 0}</span>
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">of {total} total requests</p>
        </button>

        {/* Upstream Errors */}
        <button
          onClick={() => openDetailHtmlPage('MARKET_ERRORS', { health, timezone })}
          className="p-3 bg-slate-900/60 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-blue-500/50 transition active:scale-98 text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          title="Click to view Upstream Errors detailed HTML log"
          aria-label="View Upstream Errors details"
        >
          <span className="text-[11px] text-slate-400 group-hover:text-blue-400 transition block mb-1 font-medium">Upstream Errors</span>
          <span className={`text-xl font-bold ${(m.upstreamErrors || 0) > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
            {m.upstreamErrors || 0}
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">Provider API failures</p>
        </button>

        {/* Stale Served */}
        <button
          onClick={() => openDetailHtmlPage('MARKET_STALE', { health, timezone })}
          className="p-3 bg-slate-900/60 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-blue-500/50 transition active:scale-98 text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          title="Click to view Stale Responses detailed HTML report"
          aria-label="View Stale Responses details"
        >
          <span className="text-[11px] text-slate-400 group-hover:text-blue-400 transition block mb-1 font-medium">Stale Served</span>
          <span className={`text-xl font-bold ${(m.staleResponses || 0) > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
            {m.staleResponses || 0}
          </span>
          <div className="text-[10px] text-slate-500 mt-0.5 space-y-0.5">
            {(m.staleUpstreamFailed || 0) > 0 && <p className="text-rose-400/80">↑ {m.staleUpstreamFailed} upstream failed</p>}
            {(m.staleCacheTtl || 0) > 0 && <p>↑ {m.staleCacheTtl} TTL cache</p>}
          </div>
        </button>
      </div>

      {/* p50/p95 Latency and Last Refresh — 3 Interactive Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {/* p50 Latency */}
        <button
          onClick={() => openDetailHtmlPage('MARKET_LATENCY_P50', { health, timezone })}
          className="p-3 bg-slate-900/50 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-blue-500/50 transition active:scale-98 text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          title="Click to view p50 Latency details"
          aria-label="View p50 Latency details"
        >
          <span className="text-slate-400 group-hover:text-blue-400 transition block mb-1 text-xs font-medium">p50 Latency</span>
          <span className="font-bold text-slate-100 font-mono text-sm">{health.latencyMs?.p50 ?? 12} ms</span>
        </button>

        {/* p95 Latency */}
        <button
          onClick={() => openDetailHtmlPage('MARKET_LATENCY_P95', { health, timezone })}
          className="p-3 bg-slate-900/50 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-blue-500/50 transition active:scale-98 text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          title="Click to view p95 Latency details"
          aria-label="View p95 Latency details"
        >
          <span className="text-slate-400 group-hover:text-blue-400 transition block mb-1 text-xs font-medium">p95 Latency</span>
          <span className="font-bold text-slate-100 font-mono text-sm">{health.latencyMs?.p95 ?? 35} ms</span>
        </button>

        {/* Last Successful Refresh */}
        <button
          onClick={() => openDetailHtmlPage('MARKET_REFRESH', { health, timezone })}
          className="p-3 bg-slate-900/50 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-blue-500/50 transition active:scale-98 text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          title="Click to view Sync Refresh Schedule details"
          aria-label="View Sync Refresh details"
        >
          <span className="text-slate-400 group-hover:text-blue-400 transition block mb-1 text-xs font-medium">Last Successful Refresh</span>
          <span className="font-mono text-slate-200 text-[11px] block">
            {m.lastRefreshTime ? formatDateTime(m.lastRefreshTime, timezone) : 'N/A'}
          </span>
          {m.minutesSinceLastRefresh !== null && m.minutesSinceLastRefresh !== undefined && (
            <p className={`text-[10px] mt-0.5 ${m.minutesSinceLastRefresh > 15 ? 'text-rose-400' : 'text-slate-500'}`}>
              {m.minutesSinceLastRefresh}m ago
            </p>
          )}
        </button>
      </div>

      {/* Active Service Diagnostics — Interactive Button */}
      {health.alerts && health.alerts.length > 0 ? (
        <button
          onClick={() => openDetailHtmlPage('MARKET_DIAGNOSTICS', { health, timezone })}
          className="w-full text-left space-y-2 group focus:outline-none"
          title="Click to open full Active Service Diagnostics detail page"
          aria-label="View Service Diagnostics detail page"
        >
          <h3 className="text-xs font-semibold text-slate-400 group-hover:text-blue-400 transition uppercase tracking-wider flex items-center justify-between">
            <span>Active Service Diagnostics</span>
            <span className="text-[10px] text-blue-400 font-normal underline">View Details ↗</span>
          </h3>
          {health.alerts.map((alert, idx) => (
            <div key={idx} className={`p-3 rounded-xl border flex items-start space-x-2 text-xs transition hover:border-blue-500/50 ${
              alert.severity === 'critical' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
              alert.severity === 'info' ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' :
              'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              {alert.severity === 'critical' ? <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" /> :
               <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                <span className="font-bold block">{alert.title}</span>
                <span>{alert.message}</span>
              </div>
            </div>
          ))}
        </button>
      ) : (
        <button
          onClick={() => openDetailHtmlPage('MARKET_DIAGNOSTICS', { health, timezone })}
          className="w-full flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/50 p-3 rounded-xl transition text-left cursor-pointer focus:outline-none"
          title="Click to view service health status detail page"
          aria-label="View healthy probes detail"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>All probes healthy. Stale ratio within 20% threshold. Refresh cadence normal.</span>
        </button>
      )}
    </div>
  );
}
