import React, { useState } from 'react';
import { Server, Layers, Cpu, AlertTriangle, RotateCcw, Search, Eye, CheckCircle, ShieldAlert } from 'lucide-react';
import MarketHealthCard from './MarketHealthCard';
import { openDetailHtmlPage } from '../utils/openDetailHtmlPage';

// Middle-truncate pod name so the unique suffix at the end is always visible
function truncatePodName(name, maxLen = 36) {
  if (!name || name.length <= maxLen) return name;
  const keep = Math.floor((maxLen - 3) / 2);
  return name.slice(0, keep) + '…' + name.slice(name.length - keep);
}

export default function CloudOpsDashboard({ overview, pods, alerts, marketHealth, onSelectPod, timezone, isDemoMode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNs, setSelectedNs] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortField, setSortField] = useState('status');
  const [sortDir, setSortDir] = useState('asc');

  const namespaces = ['all', ...new Set(pods.map(p => p.namespace))];

  const statusOrder = { CrashLoopBackOff: 0, Pending: 1, Failed: 2, Running: 3 };

  const filteredPods = pods
    .filter(p => {
      const matchNs = selectedNs === 'all' || p.namespace === selectedNs;
      const matchStatus = selectedStatus === 'all' || p.status.toLowerCase() === selectedStatus.toLowerCase();
      const matchSearch = !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.namespace.toLowerCase().includes(searchQuery.toLowerCase());
      return matchNs && matchStatus && matchSearch;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'status') {
        const ao = statusOrder[a.status] ?? 5;
        const bo = statusOrder[b.status] ?? 5;
        return (ao - bo) * dir;
      }
      if (sortField === 'restarts') return (a.restarts - b.restarts) * dir;
      if (sortField === 'cpu') return (a.cpuPct - b.cpuPct) * dir;
      if (sortField === 'mem') return (a.memoryPct - b.memoryPct) * dir;
      if (sortField === 'name') return a.name.localeCompare(b.name) * dir;
      return 0;
    });

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function SortTh({ label, field }) {
    const active = sortField === field;
    return (
      <th
        className="py-3 px-3 cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
        title={`Sort by ${label}`}
        aria-label={`Sort by ${label}`}
      >
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : <span className="opacity-30">↕</span>}
      </th>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { type: 'NODES', label: 'Nodes', value: overview?.nodes_count ?? 0, sub: 'Active Nodes', color: 'blue', Icon: Server },
          { type: 'NAMESPACES', label: 'Namespaces', value: overview?.namespaces_count ?? 0, sub: 'Isolated', color: 'indigo', Icon: Layers },
          { type: 'PODS', label: 'Pods', value: overview?.pods_count ?? 0, sub: `${overview?.pod_status_breakdown?.running ?? 0} Run / ${overview?.pod_status_breakdown?.pending ?? 0} Pend / ${overview?.pod_status_breakdown?.crashloop ?? 0} Crash`, color: 'emerald', Icon: Cpu },
          { type: 'RESTARTS', label: 'Restarts', value: overview?.total_restarts ?? 0, sub: 'Pod Restarts', color: 'amber', Icon: RotateCcw, warn: (overview?.total_restarts ?? 0) > 5 },
          { type: 'ALERTS', label: 'Alerts', value: alerts?.length ?? 0, sub: 'Active Incidents', color: (alerts?.length ?? 0) > 0 ? 'rose' : 'emerald', Icon: AlertTriangle }
        ].map(({ type, label, value, sub, color, Icon, warn }) => (
          <button
            key={label}
            onClick={() => openDetailHtmlPage(type, { overview, pods, alerts })}
            className="bg-[#151C28] border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/80 active:scale-98 transition rounded-2xl p-4 shadow-lg text-left group cursor-pointer w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            title={`Click to open ${label} detailed view in a new window`}
            aria-label={`Open ${label} detail window`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 group-hover:text-blue-400 transition uppercase tracking-wider">{label}</span>
              <div className={`p-2 bg-${color}-500/10 text-${color}-400 rounded-xl border border-${color}-500/20 group-hover:scale-110 transition`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <span className={`text-3xl font-extrabold ${warn ? `text-${color}-400` : 'text-slate-100'}`}>{value}</span>
            <span className="text-[10px] text-slate-400 group-hover:text-slate-300 block mt-1 leading-tight">{sub}</span>
          </button>
        ))}
      </div>

      {/* Market Service Health */}
      <MarketHealthCard health={marketHealth} timezone={timezone} />

      {/* Pod Table + Alerts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pod Table (2 col) */}
        <div className="lg:col-span-2 bg-[#151C28] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-100">Cluster Pod Workloads</h2>
              <p className="text-xs text-slate-400">Click any row to open the telemetry drawer</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Search pods..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  aria-label="Search pods by name or namespace"
                  className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 w-40"
                />
              </div>
              <select
                value={selectedNs}
                onChange={e => setSelectedNs(e.target.value)}
                aria-label="Filter by namespace"
                className="bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 px-2.5 py-1.5"
              >
                {namespaces.map(ns => <option key={ns} value={ns}>{ns === 'all' ? 'All Namespaces' : ns}</option>)}
              </select>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                aria-label="Filter by pod status"
                className="bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 px-2.5 py-1.5"
              >
                <option value="all">All Statuses</option>
                <option value="running">Running</option>
                <option value="pending">Pending</option>
                <option value="crashloopbackoff">CrashLoopBackOff</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[740px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/50">
                  <SortTh label="Pod Name" field="name" />
                  <th className="py-3 px-3 w-36">Namespace</th>
                  <SortTh label="Status" field="status" />
                  <th className="py-3 px-3 w-14">Ready</th>
                  <SortTh label="Restarts" field="restarts" />
                  <SortTh label="CPU (of limit)" field="cpu" />
                  <SortTh label="Mem (of limit)" field="mem" />
                  <th className="py-3 px-3 text-right w-16">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredPods.length === 0 ? (
                  <tr><td colSpan="8" className="py-8 text-center text-slate-500 italic">No pods match the current filters.</td></tr>
                ) : filteredPods.map(pod => (
                  <tr
                    key={`${pod.namespace}-${pod.name}`}
                    onClick={() => onSelectPod(pod)}
                    className="hover:bg-slate-800/40 cursor-pointer transition"
                    title={pod.name}
                  >
                    {/* Middle-truncated name — unique suffix stays visible */}
                    <td className="py-3 px-3 font-medium text-blue-400 max-w-[180px]">
                      <span className="block truncate" style={{ direction: 'rtl', textAlign: 'left' }} title={pod.name}>
                        {truncatePodName(pod.name)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 w-36">{pod.namespace}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                        pod.status === 'Running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        pod.status === 'CrashLoopBackOff' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {pod.status === 'Running' ? '● ' : pod.status === 'CrashLoopBackOff' ? '✕ ' : '○ '}
                        {pod.status}
                      </span>
                      {pod.status === 'Pending' && pod.pendingReason && (
                        <p className="text-[10px] text-slate-500 mt-0.5 max-w-[160px] truncate" title={pod.pendingReason}>{pod.pendingReason}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-300">{pod.ready}</td>
                    <td className="py-3 px-3">
                      <span className={pod.restarts > 3 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                        {pod.restarts_detail || pod.restarts}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={pod.cpuPct > 80 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                        {pod.cpuUsage} <span className="text-slate-500">({pod.cpuPct}%)</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={pod.memoryPct > 80 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                        {pod.memoryUsage} <span className="text-slate-500">({pod.memoryPct}%)</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); onSelectPod(pod); }}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg border border-slate-700 transition"
                        title={`Open telemetry drawer for ${pod.name}`}
                        aria-label={`Open detail drawer for pod ${pod.name}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts Panel (1 col) — grouped incidents, critical first */}
        <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" aria-hidden="true" />
              <span>Active Incidents</span>
            </h2>
            <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
              {alerts.length}
            </span>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-4">
                <CheckCircle className="w-7 h-7 mx-auto mb-2 opacity-80" />
                <span className="font-semibold block text-sm">All Systems Nominal</span>
                <span className="text-xs text-slate-400">No CrashLoopBackOff, high restarts, or resource spikes.</span>
              </div>
            ) : alerts.map(incident => {
              const targetPod = pods.find(p => `${p.namespace}/${p.name}` === incident.target);
              return (
                <div
                  key={incident.id}
                  onClick={() => targetPod && onSelectPod(targetPod)}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${targetPod ? 'cursor-pointer hover:border-slate-600' : ''} ${
                    incident.severity === 'critical'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                  title={targetPod ? `Open drawer for ${incident.target}` : ''}
                >
                  {/* Severity badge + target */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30 uppercase">
                      {incident.severity}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono truncate ml-2">{incident.target}</span>
                  </div>

                  {/* Grouped Signals */}
                  {incident.signals.map((sig, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[10px] font-bold text-slate-300 shrink-0">▸</span>
                      <span>{sig}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
