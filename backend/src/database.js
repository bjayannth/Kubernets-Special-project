const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'k8s_metrics.db');
const db = new sqlite3.Database(DB_PATH);

function initDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS pod_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pod_name TEXT NOT NULL,
        namespace TEXT NOT NULL,
        status TEXT NOT NULL,
        restarts INTEGER DEFAULT 0,
        cpu_usage TEXT,
        memory_usage TEXT,
        cpu_pct REAL NOT NULL,
        memory_pct REAL NOT NULL,
        sampled_at INTEGER NOT NULL
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_pod_series_name ON pod_series(namespace, pod_name, sampled_at)`);
  });
}

function storePodSample(pod) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO pod_series 
      (pod_name, namespace, status, restarts, cpu_usage, memory_usage, cpu_pct, memory_pct, sampled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      pod.name,
      pod.namespace,
      pod.status,
      pod.restarts || 0,
      pod.cpuUsage || '0m',
      pod.memoryUsage || '0Mi',
      pod.cpuPct || 0,
      pod.memoryPct || 0,
      Date.now()
    ];

    db.run(query, params, function(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID });
    });
  });
}

function getPodTimeSeries(namespace, podName, limitMinutes = 60) {
  return new Promise((resolve, reject) => {
    const since = Date.now() - (limitMinutes * 60 * 1000);
    const query = `
      SELECT id, pod_name, namespace, status, restarts, cpu_usage, memory_usage, cpu_pct, memory_pct, sampled_at
      FROM pod_series
      WHERE namespace = ? AND pod_name = ? AND sampled_at >= ?
      ORDER BY sampled_at ASC
    `;
    db.all(query, [namespace, podName, since], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

initDatabase();

module.exports = {
  storePodSample,
  getPodTimeSeries
};

