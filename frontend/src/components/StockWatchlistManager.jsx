import React, { useState } from 'react';
import { Plus, Trash2, TrendingUp, Check, SlidersHorizontal } from 'lucide-react';

export default function StockWatchlistManager({
  watchlist = [],
  onAddSymbol,
  onRemoveSymbol,
  isCompareMode,
  onToggleCompareMode
}) {
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    onAddSymbol(newSymbol.trim().toUpperCase(), newName.trim() || newSymbol.trim().toUpperCase());
    setNewSymbol('');
    setNewName('');
    setShowAddForm(false);
  };

  return (
    <div className="bg-[#151C28] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <span>Stock Watchlist & Compare Mode</span>
          </h3>
          <p className="text-xs text-slate-400">Persisted in SQLite. Toggle Compare Mode to plot % change relative to start of range.</p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Compare Mode Toggle */}
          <button
            onClick={onToggleCompareMode}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center space-x-1.5 ${
              isCompareMode
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Compare Mode: {isCompareMode ? 'ON (%)' : 'OFF ($)'}</span>
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Symbol</span>
          </button>
        </div>
      </div>

      {/* Add Symbol Form Drawer */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-2 animate-fadeIn">
          <input
            type="text"
            placeholder="Symbol (e.g. NVDA)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500 uppercase w-full sm:w-36"
            required
          />
          <input
            type="text"
            placeholder="Company Name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500 w-full sm:flex-1"
          />
          <div className="flex space-x-2 w-full sm:w-auto">
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition flex-1 sm:flex-none"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white text-xs rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Active Watchlist Symbols Tags */}
      <div className="flex flex-wrap gap-2">
        {watchlist.map(item => (
          <div
            key={item.symbol}
            className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200"
          >
            <span className="font-bold text-blue-400">{item.symbol}</span>
            <span className="text-slate-400 hidden sm:inline">({item.name})</span>
            <button
              onClick={() => onRemoveSymbol(item.symbol)}
              className="p-0.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
              title={`Remove ${item.symbol} from watchlist`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

