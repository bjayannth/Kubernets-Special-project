const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'market_data.db');
const db = new sqlite3.Database(DB_PATH);

// SSE Listeners list
const sseClients = [];

function initDatabase() {
  db.serialize(() => {
    // 1. Time-series market data table with UNIQUE constraint on symbol + provider_timestamp
    db.run(`
      CREATE TABLE IF NOT EXISTS market_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        value REAL NOT NULL,
        currency_unit TEXT NOT NULL,
        provider_timestamp INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        is_stale INTEGER DEFAULT 0,
        usd_inr_rate_used REAL,
        is_demo INTEGER DEFAULT 0,
        UNIQUE(symbol, provider_timestamp)
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_market_series_symbol_ts ON market_series(symbol, provider_timestamp)`);

    // 2. Watchlist symbols table
    db.run(`
      CREATE TABLE IF NOT EXISTS watchlist (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        added_at INTEGER NOT NULL
      )
    `);

    // Seed default watchlist symbols if empty
    db.get(`SELECT COUNT(*) as count FROM watchlist`, (err, row) => {
      if (!err && row.count === 0) {
        const defaultSymbols = [
          ['AAPL', 'Apple Inc.'],
          ['MSFT', 'Microsoft Corp.'],
          ['GOOGL', 'Alphabet Inc.'],
          ['AMZN', 'Amazon.com Inc.'],
          ['TSLA', 'Tesla Inc.']
        ];
        const stmt = db.prepare(`INSERT OR IGNORE INTO watchlist (symbol, name, added_at) VALUES (?, ?, ?)`);
        const now = Date.now();
        defaultSymbols.forEach(([sym, name]) => stmt.run(sym, name, now));
        stmt.finalize();
      }
    });

    // 3. Quota Tracker table & Quota Ledger
    db.run(`
      CREATE TABLE IF NOT EXISTS quota_tracker (
        service TEXT PRIMARY KEY,
        requests_used INTEGER DEFAULT 0,
        monthly_limit INTEGER DEFAULT 100,
        reset_at INTEGER,
        last_fetch_at INTEGER
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS quota_ledger (
        service TEXT NOT NULL,
        day_key TEXT NOT NULL,
        month_key TEXT NOT NULL,
        calls_count INTEGER DEFAULT 0,
        last_called_at INTEGER NOT NULL,
        PRIMARY KEY (service, day_key)
      )
    `);

    db.run(`INSERT OR IGNORE INTO quota_tracker (service, requests_used, monthly_limit, reset_at, last_fetch_at) VALUES ('metalcharts', 5, 1000, ${Date.now() + 2592000000}, ${Date.now()})`);
    db.run(`INSERT OR IGNORE INTO quota_tracker (service, requests_used, monthly_limit, reset_at, last_fetch_at) VALUES ('metalprice', 12, 100, ${Date.now() + 2592000000}, ${Date.now()})`);
    db.run(`INSERT OR IGNORE INTO quota_tracker (service, requests_used, monthly_limit, reset_at, last_fetch_at) VALUES ('finnhub', 45, 1000, ${Date.now() + 2592000000}, ${Date.now()})`);
  });
}

// Insert time series point with duplicate-timestamp skipping
function insertTimeSeriesPoint(point) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT OR IGNORE INTO market_series 
      (symbol, value, currency_unit, provider_timestamp, fetched_at, source, is_stale, usd_inr_rate_used, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      point.symbol,
      point.value,
      point.currency_unit || 'USD',
      point.provider_timestamp,
      point.fetched_at || Date.now(),
      point.source,
      point.is_stale ? 1 : 0,
      point.usd_inr_rate_used || null,
      point.is_demo ? 1 : 0
    ];

    db.run(query, params, function (err) {
      if (err) return reject(err);
      const inserted = this.changes > 0;
      if (inserted) {
        // Broadcast new point to SSE clients
        notifySseClients('market_update', { ...point, id: this.lastID });
      }
      resolve({ inserted, id: this.lastID });
    });
  });
}

// Fetch time series data for a symbol within a given range
function getTimeSeries(symbol, rangeMinutes = 60) {
  return new Promise((resolve, reject) => {
    const sinceTimestamp = rangeMinutes > 0 ? Date.now() - (rangeMinutes * 60 * 1000) : 0;
    const query = `
      SELECT id, symbol, value, currency_unit, provider_timestamp, fetched_at, source, is_stale, usd_inr_rate_used, is_demo
      FROM market_series
      WHERE symbol = ? AND provider_timestamp >= ?
      ORDER BY provider_timestamp ASC
    `;
    db.all(query, [symbol, sinceTimestamp], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Return the newest real provider observation without mixing in demo rows.
function getLatestTimeSeriesPoint(symbol) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT id, symbol, value, currency_unit, provider_timestamp, fetched_at, source, is_stale, usd_inr_rate_used, is_demo
      FROM market_series
      WHERE symbol = ? AND is_demo = 0
      ORDER BY provider_timestamp DESC
      LIMIT 1
    `, [symbol], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

// Fetch first stored timestamp for symbol to determine available history range
function getFirstTimestamp(symbol) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT MIN(provider_timestamp) as min_ts, COUNT(*) as total FROM market_series WHERE symbol = ?`, [symbol], (err, row) => {
      if (err) return reject(err);
      resolve({ minTimestamp: row ? row.min_ts : null, totalPoints: row ? row.total : 0 });
    });
  });
}

// Watchlist CRUD
function getWatchlist() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT symbol, name, added_at FROM watchlist ORDER BY added_at ASC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function addWatchlistSymbol(symbol, name) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT OR REPLACE INTO watchlist (symbol, name, added_at) VALUES (?, ?, ?)`, [symbol.toUpperCase(), name || symbol, Date.now()], function(err) {
      if (err) return reject(err);
      resolve({ symbol: symbol.toUpperCase(), name });
    });
  });
}

function removeWatchlistSymbol(symbol) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM watchlist WHERE symbol = ?`, [symbol.toUpperCase()], function(err) {
      if (err) return reject(err);
      resolve({ symbol: symbol.toUpperCase() });
    });
  });
}

// Quota Info
function getQuotaInfo() {
  return new Promise((resolve, reject) => {
    const monthKey = new Date().toISOString().slice(0, 7);
    db.all(`
      SELECT
        qt.service,
        COALESCE((
          SELECT SUM(ql.calls_count)
          FROM quota_ledger ql
          WHERE ql.service = qt.service AND ql.month_key = ?
        ), 0) AS requests_used,
        qt.monthly_limit,
        qt.reset_at,
        qt.last_fetch_at
      FROM quota_tracker qt
    `, [monthKey], (err, rows) => {
      if (err) return reject(err);
      const result = {};
      rows.forEach(r => { result[r.service] = r; });
      resolve(result);
    });
  });
}

function recordApiCall(service) {
  return new Promise((resolve) => {
    const now = Date.now();
    const d = new Date(now);
    const dayKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const monthKey = d.toISOString().slice(0, 7); // YYYY-MM

    db.serialize(() => {
      db.run(`UPDATE quota_tracker SET requests_used = requests_used + 1, last_fetch_at = ? WHERE service = ?`, [now, service]);
      db.run(`
        INSERT INTO quota_ledger (service, day_key, month_key, calls_count, last_called_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(service, day_key) DO UPDATE SET
          calls_count = calls_count + 1,
          last_called_at = excluded.last_called_at
      `, [service, dayKey, monthKey, now], () => {
        resolve();
      });
    });
  });
}

function getLedgerInfo(service) {
  return new Promise((resolve) => {
    const now = Date.now();
    const d = new Date(now);
    const dayKey = d.toISOString().slice(0, 10);
    const monthKey = d.toISOString().slice(0, 7);

    db.get(`SELECT SUM(calls_count) as month_calls FROM quota_ledger WHERE service = ? AND month_key = ?`, [service, monthKey], (err1, monthRow) => {
      db.get(`SELECT calls_count as day_calls FROM quota_ledger WHERE service = ? AND day_key = ?`, [service, dayKey], (err2, dayRow) => {
        resolve({
          dayCalls: dayRow ? dayRow.day_calls : 0,
          monthCalls: monthRow && monthRow.month_calls ? monthRow.month_calls : 0
        });
      });
    });
  });
}

// SSE Subscriber management
function addSseClient(res) {
  sseClients.push(res);
}

function removeSseClient(res) {
  const idx = sseClients.indexOf(res);
  if (idx !== -1) sseClients.splice(idx, 1);
}

function getSseClientCount() {
  return sseClients.length;
}

function notifySseClients(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => client.write(payload));
}

initDatabase();

module.exports = {
  db,
  insertTimeSeriesPoint,
  getTimeSeries,
  getLatestTimeSeriesPoint,
  getFirstTimestamp,
  getWatchlist,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  getQuotaInfo,
  getLedgerInfo,
  recordApiCall,
  addSseClient,
  removeSseClient,
  getSseClientCount
};

