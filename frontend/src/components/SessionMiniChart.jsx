import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function SessionMiniChart({ sessionData }) {
  if (!sessionData || sessionData.labels.length === 0) {
    return (
      <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
        Collecting session price telemetry...
      </div>
    );
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#94A3B8',
          font: { size: 12 }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#0F172A',
        titleColor: '#F8FAFC',
        bodyColor: '#E2E8F0',
        borderColor: '#334155',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
        ticks: { color: '#64748B', font: { size: 10 } }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Gold (USD/oz)', color: '#F59E0B', font: { size: 11 } },
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
        ticks: { color: '#F59E0B', font: { size: 10 } }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'AAPL Stock ($)', color: '#3B82F6', font: { size: 11 } },
        grid: { drawOnChartArea: false },
        ticks: { color: '#3B82F6', font: { size: 10 } }
      }
    }
  };

  const data = {
    labels: sessionData.labels,
    datasets: [
      {
        label: 'Gold USD/oz',
        data: sessionData.goldPrices,
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        yAxisID: 'y',
        tension: 0.3,
        fill: true
      },
      {
        label: 'AAPL Stock ($)',
        data: sessionData.aaplPrices,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        yAxisID: 'y1',
        tension: 0.3,
        fill: true
      }
    ]
  };

  return (
    <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100">Live Session Price Trends</h2>
          <p className="text-xs text-slate-400">Real-time telemetry gathered during your active browser session</p>
        </div>
        <span className="text-xs text-slate-500 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">
          {sessionData.labels.length} Data Points
        </span>
      </div>
      <div className="h-64">
        <Line options={options} data={data} />
      </div>
    </div>
  );
}

