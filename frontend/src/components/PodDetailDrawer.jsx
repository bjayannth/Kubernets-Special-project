import React, { useState, useEffect } from 'react';
import { X, Server, Terminal, AlertCircle, Cpu, HardDrive, Clock } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function PodDetailDrawer({ pod, onClose, timezone = 'IST' }) {
  const [podSeries, setPodSeries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pod) return;
    setLoading(true);
    fetch(`/api/k8s/pods/${pod.namespace}/${pod.name}/timeseries?range=60`)
      .then(res => res.json())
      .then(data => {
        setPodSeries(data || []);
      })
      .catch(err => console.warn('Failed fetching pod series:', err))
      .finally(() => setLoading(false));
  }, [pod]);

  if (!pod) return null;

  const chartLabels = podSeries.map(p => {
    const d = new Date(p.sampled_at);
    return timezone === 'IST'
      ? d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const chartData = {
    labels: chartLabels.length > 0 ? chartLabels : ['Now'],
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: podSeries.length > 0 ? podSeries.map(p => p.cpu_pct) : [pod.cpuPct || 0],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        tension: 0,
        spanGaps: false
      },
      {
        label: 'Memory Usage (%)',
        data: podSeries.length > 0 ? podSeries.map(p => p.memory_pct) : [pod.memoryPct || 0],
        borderColor: '#EC4899',
        backgroundColor: 'rgba(236, 72, 153, 0.2)',
        tension: 0,
        spanGaps: false
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94A3B8', font: { size: 11 } } },
      tooltip: {
        backgroundColor: '#0F172A',
        titleColor: '#F8FAFC',
        bodyColor: '#E2E8F0',
        borderColor: '#334155',
        borderWidth: 1
      }
    },
    scales: {
      x: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#64748B', font: { size: 10 } } },
      y: { min: 0, max: 100, grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94A3B8', font: { size: 10 } } }
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#151C28] border-l border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center space-x-3">
          <Server className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-base font-bold text-slate-100">{pod.name}</h2>
            <p className="text-xs text-slate-400">Namespace: {pod.namespace} • Node: {pod.node || 'Unassigned'}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="p-6 overflow-y-auto space-y-6 flex-1">
        {/* Status Pills */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">Status</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold ${
              pod.status === 'Running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              pod.status === 'CrashLoopBackOff' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              {pod.status}
            </span>
          </div>

          <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">Restarts</span>
            <span className={`font-bold ${pod.restarts > 3 ? 'text-amber-400' : 'text-slate-200'}`}>
              {pod.restarts}
            </span>
          </div>

          <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">CPU / Memory</span>
            <span className="font-semibold text-slate-200">{pod.cpuUsage || '0m'} / {pod.memoryUsage || '0Mi'}</span>
          </div>
        </div>

        {/* CPU & Memory Time-Series Chart */}
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-300 flex items-center">
              <Cpu className="w-4 h-4 mr-1.5 text-blue-400" />
              Pod Telemetry Time-Series (SQLite Stored)
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">Timezone: {timezone}</span>
          </div>
          <div className="h-48">
            <Line options={chartOptions} data={chartData} />
          </div>
        </div>

        {/* Events Timeline */}
        <div>
          <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center">
            <AlertCircle className="w-4 h-4 mr-1.5 text-indigo-400" />
            Recent Kubernetes Events
          </h3>
          <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-3 space-y-2 text-xs">
            {pod.events && pod.events.length > 0 ? (
              pod.events.map((evt, idx) => (
                <div key={idx} className="flex items-start justify-between p-2 rounded bg-slate-800/40">
                  <div className="flex items-start space-x-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      evt.type === 'Warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {evt.reason}
                    </span>
                    <span className="text-slate-300">{evt.message}</span>
                  </div>
                  <span className="text-slate-500 whitespace-nowrap ml-2 font-mono text-[10px]">{evt.age}</span>
                </div>
              ))
            ) : (
              <div className="text-slate-500 italic p-2">No warning events reported.</div>
            )}
          </div>
        </div>

        {/* Container Log Tail */}
        <div>
          <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center">
            <Terminal className="w-4 h-4 mr-1.5 text-emerald-400" />
            Container Log Tail
          </h3>
          <div className="bg-black/90 rounded-xl border border-slate-800 p-4 font-mono text-xs text-emerald-400 overflow-x-auto max-h-48 leading-relaxed">
            {pod.logs && pod.logs.length > 0 ? (
              pod.logs.map((line, idx) => <div key={idx} className="whitespace-pre-wrap">{line}</div>)
            ) : (
              <div className="text-slate-500 italic">No logs available for this pod.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

