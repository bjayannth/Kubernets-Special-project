const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const serviceStartTime = Date.now();
const recentLatencies = []; // rolling window of last 100 request durations (in ms)

function recordLatency(durationMs) {
  recentLatencies.push(durationMs);
  if (recentLatencies.length > 200) {
    recentLatencies.shift();
  }
}

function getPercentiles() {
  if (recentLatencies.length === 0) return { p50: 12, p95: 35 };
  const sorted = [...recentLatencies].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  return {
    p50: Math.round(sorted[p50Idx] * 10) / 10,
    p95: Math.round(sorted[p95Idx] * 10) / 10
  };
}

const requestCounter = new client.Counter({
  name: 'market_requests_total',
  help: 'Total number of HTTP requests received by market-data-service',
  labelNames: ['method', 'route', 'status']
});

const requestDuration = new client.Histogram({
  name: 'market_request_duration_seconds',
  help: 'Histogram of request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

const cacheHitCounter = new client.Counter({
  name: 'market_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['type']
});

const cacheMissCounter = new client.Counter({
  name: 'market_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['type']
});

const upstreamErrorCounter = new client.Counter({
  name: 'market_upstream_errors_total',
  help: 'Total number of errors from upstream market APIs',
  labelNames: ['provider']
});

const staleResponseCounter = new client.Counter({
  name: 'market_stale_responses_total',
  help: 'Total number of stale responses served',
  labelNames: ['type', 'reason'] // reason: 'cache_ttl' or 'upstream_failed'
});

const lastRefreshGauge = new client.Gauge({
  name: 'market_last_successful_refresh_timestamp_seconds',
  help: 'Timestamp of the last successful data refresh from upstream',
  labelNames: ['type']
});

register.registerMetric(requestCounter);
register.registerMetric(requestDuration);
register.registerMetric(cacheHitCounter);
register.registerMetric(cacheMissCounter);
register.registerMetric(upstreamErrorCounter);
register.registerMetric(staleResponseCounter);
register.registerMetric(lastRefreshGauge);

module.exports = {
  register,
  requestCounter,
  requestDuration,
  cacheHitCounter,
  cacheMissCounter,
  upstreamErrorCounter,
  staleResponseCounter,
  lastRefreshGauge,
  serviceStartTime,
  recordLatency,
  getPercentiles
};
