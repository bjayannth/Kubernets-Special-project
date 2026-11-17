import React from 'react';
import { X, Server, Terminal, AlertCircle, Clock, ShieldCheck } from 'lucide-react';

export default function PodDetailModal({ pod, onClose }) {
  if (!pod) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#151C28] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <Server className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-100">{pod.name}</h2>
              <span className="text-xs text-slate-400">Namespace: {pod.namespace}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">Status</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                pod.status === 'Running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                pod.status === 'CrashLoopBackOff' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {pod.status}
              </span>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">Node</span>
              <span className="text-sm font-semibold text-slate-200">{pod.node || 'Unassigned'}</span>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">Restarts</span>
              <span className={`text-sm font-semibold ${pod.restarts > 3 ? 'text-amber-400' : 'text-slate-200'}`}>
                {pod.restarts}
              </span>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">CPU / Memory</span>
              <span className="text-sm font-semibold text-slate-200">{pod.cpuUsage} / {pod.memoryUsage}</span>
            </div>
          </div>

          {/* Recent Events */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 text-indigo-400" />
              Recent Events
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
                    <span className="text-slate-500 whitespace-nowrap ml-2">{evt.age}</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic p-2">No recent warning events recorded.</div>
              )}
            </div>
          </div>

          {/* Container Log Tail */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center">
              <Terminal className="w-4 h-4 mr-2 text-emerald-400" />
              Log Tail (Recent Lines)
            </h3>
            <div className="bg-black/90 rounded-xl border border-slate-800 p-4 font-mono text-xs text-emerald-400 overflow-x-auto max-h-56 leading-relaxed">
              {pod.logs && pod.logs.length > 0 ? (
                pod.logs.map((line, idx) => (
                  <div key={idx} className="whitespace-pre-wrap">{line}</div>
                ))
              ) : (
                <div className="text-slate-500 italic">No logs available for this pod.</div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

