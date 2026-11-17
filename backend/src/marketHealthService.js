const axios = require('axios');

const MARKET_SERVICE_URL = process.env.MARKET_SERVICE_URL || 'http://localhost:4000';

function parsePrometheusMetrics(text) {
  const metrics = {
    requestCount: 0,
    upstreamErrors: 0,
    cacheHits: 0,
    cacheMisses: 0,
    staleResponses: 0,
    staleCacheTtl: 0,
    staleUpstreamFailed: 0,
    lastRefreshSeconds: 0
  };

  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    if (line.startsWith('market_requests_total')) {
      const val = parseFloat(line.split(' ').pop());
      if (!isNaN(val)) metrics.requestCount += val;
    } else if (line.startsWith('market_upstream_errors_total')) {
      const val = parseFloat(line.split(' ').pop());
      if (!isNaN(val)) metrics.upstreamErrors += val;
    } else if (line.startsWith('market_cache_hits_total')) {
      const val = parseFloat(line.split(' ').pop());
      if (!isNaN(val)) metrics.cacheHits += val;
    } else if (line.startsWith('market_cache_misses_total')) {
      const val = parseFloat(line.split(' ').pop());
      if (!isNaN(val)) metrics.cacheMisses += val;
    } else if (line.startsWith('market_stale_responses_total')) {
      const val = parseFloat(line.split(' ').pop());
      if (!isNaN(val)) {
        metrics.staleResponses += val;
        if (line.includes('reason="upstream_failed"')) {
          metrics.staleUpstreamFailed += val;
        } else {
          metrics.staleCacheTtl += val;
        }
      }
    } else if (line.startsWith('market_last_successful_refresh_timestamp_seconds')) {
      const val = parseFloat(line.split(' ').pop());
      if (!isNaN(val) && val > metrics.lastRefreshSeconds) {
        metrics.lastRefreshSeconds = val;
      }
    }
  }

  return metrics;
}

// Compute service health state according to requirement 11
function computeHealthStatus({ isConfigured, isReachable, metrics, minutesSinceLastRefresh, sampleGold }) {
  if (!isReachable) return 'Down';
  if (!isConfigured) return 'Not configured';

  const totalRequests = metrics.requestCount || 0;
  const staleCount = metrics.staleResponses || 0;
  const staleRatio = totalRequests > 0 ? staleCount / totalRequests : 0;

  // Degraded if stale ratio > 20% or last refresh > 15 minutes
  if (staleRatio > 0.20 || (minutesSinceLastRefresh !== null && minutesSinceLastRefresh > 15) || metrics.upstreamErrors > 5) {
    return 'Degraded';
  }

  return 'Healthy';
}

async function getMarketServiceHealth() {
  const result = {
    status: 'Healthy',
    url: MARKET_SERVICE_URL,
    healthz: false,
    uptimeFormatted: '---',
    latencyMs: { p50: 0, p95: 0 },
    metrics: {
      requestCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      upstreamErrors: 0,
      staleResponses: 0,
      staleCacheTtl: 0,
      staleUpstreamFailed: 0,
      lastRefreshTime: null,
      minutesSinceLastRefresh: null
    },
    sampleGold: null,
    isConfigured: false,
    alerts: [],
    updatedAt: new Date().toISOString()
  };

  try {
    // 1. Probe healthz
    const healthzRes = await axios.get(`${MARKET_SERVICE_URL}/healthz`, { timeout: 3000 });
    if (healthzRes.status === 200) {
      result.healthz = true;
      result.uptimeFormatted = healthzRes.data.uptimeFormatted || 'Active';
      result.latencyMs = healthzRes.data.latencyMs || { p50: 12, p95: 35 };
      if (healthzRes.data.lastSuccessfulRefresh?.gold) {
        const d = new Date(healthzRes.data.lastSuccessfulRefresh.gold);
        result.metrics.lastRefreshTime = d.toISOString();
        result.metrics.minutesSinceLastRefresh = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
      }
    }

    // 2. Scrape Prometheus metrics
    const metricsRes = await axios.get(`${MARKET_SERVICE_URL}/metrics`, { timeout: 3000 });
    if (metricsRes.status === 200 && typeof metricsRes.data === 'string') {
      const parsed = parsePrometheusMetrics(metricsRes.data);
      result.metrics.requestCount = parsed.requestCount;
      result.metrics.cacheHits = parsed.cacheHits;
      result.metrics.cacheMisses = parsed.cacheMisses;
      result.metrics.upstreamErrors = parsed.upstreamErrors;
      result.metrics.staleResponses = parsed.staleResponses;
      result.metrics.staleCacheTtl = parsed.staleCacheTtl;
      result.metrics.staleUpstreamFailed = parsed.staleUpstreamFailed;
    }

    // 3. Sample Gold price
    const goldRes = await axios.get(`${MARKET_SERVICE_URL}/api/gold-price`, { timeout: 3000 });
    if (goldRes.data) {
      result.sampleGold = goldRes.data;
      result.isConfigured = !goldRes.data.is_demo && goldRes.data.source?.includes('Live');
    }

    // Compute Health Status
    result.status = computeHealthStatus({
      isConfigured: result.isConfigured,
      isReachable: result.healthz,
      metrics: result.metrics,
      minutesSinceLastRefresh: result.metrics.minutesSinceLastRefresh,
      sampleGold: result.sampleGold
    });

    // Generate alerts
    if (result.status === 'Not configured') {
      result.alerts.push({
        severity: 'info',
        title: 'API Keys Not Configured',
        message: 'Running in Demo Mode with simulated smooth random walk telemetry.'
      });
    }

    if (result.metrics.staleUpstreamFailed > 0) {
      result.alerts.push({
        severity: 'warning',
        title: 'Stale (Upstream API Failed)',
        message: `Upstream market provider returned errors for ${result.metrics.staleUpstreamFailed} requests; served cached baseline.`
      });
    }

    if (result.metrics.minutesSinceLastRefresh !== null && result.metrics.minutesSinceLastRefresh > 15) {
      result.alerts.push({
        severity: 'critical',
        title: 'Data Stale > 15m',
        message: `Last successful upstream data refresh was ${result.metrics.minutesSinceLastRefresh} minutes ago.`
      });
    }

  } catch (err) {
    result.status = 'Down';
    result.healthz = false;
    result.alerts.push({
      severity: 'critical',
      title: 'Market Service Down',
      message: `Failed connecting to market-data-service probe: ${err.message}`
    });
  }

  return result;
}

module.exports = {
  getMarketServiceHealth,
  computeHealthStatus,
  parsePrometheusMetrics
};
