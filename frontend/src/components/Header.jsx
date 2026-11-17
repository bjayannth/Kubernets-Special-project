import React from 'react';
import { Activity, TrendingUp, Cpu, RefreshCw, AlertTriangle, Globe, Pause, Play, Sun, Moon } from 'lucide-react';

export default function Header({
  activeTab,
  setActiveTab,
  isDemoMode,
  onRefresh,
  isRefreshing,
  timezone,
  onToggleTimezone,
  autoRefresh,
  onToggleAutoRefresh,
  theme,
  onToggleTheme
}) {
  const autoRefreshLabel = isDemoMode
    ? (autoRefresh ? 'Auto-refresh (simulated): ON' : 'Auto-refresh (simulated): OFF')
    : (autoRefresh ? 'Live Auto Update: ON' : 'Live Auto Update: PAUSED');
  return (
    <header className="border-b border-slate-800 bg-[#0F172A]/90 dark:bg-[#0F172A]/90 backdrop-blur sticky top-0 z-30 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        {/* Title and Brand */}
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                CloudOps Market Monitor
              </h1>
              {isDemoMode && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Demo Mode
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">Kubernetes Telemetry & Live Financial Microservices Dashboard</p>
          </div>
        </div>

        {/* Controls: Timezone, Theme, AutoRefresh, Tabs */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end">
          {/* Timezone Toggle */}
          <button
            onClick={onToggleTimezone}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition flex items-center space-x-1.5"
            title="Toggle Chart Timezone (IST vs UTC)"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>TZ: {timezone}</span>
          </button>

          {/* Auto Refresh Toggle */}
          <button
            onClick={onToggleAutoRefresh}
            className={`px-3 py-1.5 border rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
            title="Pause or Resume Auto Live Updates"
          >
            {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoRefresh ? 'Live Auto Update: ON' : 'Live Auto Update: PAUSED'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition"
            title="Toggle Light / Dark Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-400" />}
          </button>

          {/* Navigation Tabs */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('cluster')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'cluster'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>K8s Cluster</span>
            </button>
            <button
              onClick={() => setActiveTab('market')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'market'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Market Data</span>
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition"
            title="Sync Database"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
