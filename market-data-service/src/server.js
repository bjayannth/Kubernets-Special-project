require('dotenv').config();
const express = require('express');
const cors = require('cors');
const {
  register,
  requestCounter,
  requestDuration,
  serviceStartTime,
  getPercentiles,
  recordLatency
} = require('./metrics');
const {
  getGoldPrice,
  getStockPrices,
  getTimeSeries,
  getFirstTimestamp,
  getWatchlist,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  getQuotaInfo,
  computeOptimalFetchInterval,
  getFinnhubRateLimitStatus,
  executeManualSync,
  lastSuccessfulRefreshTime
} = require('./market');
const { addSseClient, removeSseClient, getSseClientCount } = require('./database');
const { getQuotaConfig } = require('./quotaBudgetManager');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const durationSec = durationMs / 1000;
    recordLatency(durationMs);
    const route = req.route ? req.route.path : req.path;
    requestCounter.inc({ method: req.method, route, status: res.statusCode });
    requestDuration.observe({ method: req.method, route, status: res.statusCode }, durationSec);
  });
  next();
});

// Probes with latency, uptime, and last refresh metadata
app.get('/healthz', (req, res) => {
  const now = Date.now();
  const uptimeSeconds = Math.floor((now - serviceStartTime) / 1000);
  const percentiles = getPercentiles();

  res.status(200).json({
    status: 'ok',
    uptimeSeconds,
    uptimeFormatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
    latencyMs: percentiles,
    lastSuccessfulRefresh: lastSuccessfulRefreshTime,
    timestamp: new Date(now).toISOString()
  });
});

app.get('/readyz', (req, res) => res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() }));

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// SSE endpoint
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addSseClient(res);

  req.on('close', () => {
    removeSseClient(res);
  });
});

// Gold price API
app.get('/api/gold-price', async (req, res) => {
  try {
    const data = await getGoldPrice();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Service Unavailable', message: err.message });
  }
});

// Stocks API
app.get('/api/stocks', async (req, res) => {
  try {
    const watchlist = await getWatchlist();
    const symbols = watchlist.map(w => w.symbol);
    const data = await getStockPrices(symbols);
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Service Unavailable', message: err.message });
  }
});

// Time series DB endpoint
app.get('/api/timeseries', async (req, res) => {
  try {
    const { symbol = 'XAU', range = '60' } = req.query;
    const rangeMinutes = parseInt(range, 10);
    const rows = await getTimeSeries(symbol.toUpperCase(), rangeMinutes);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time series', message: err.message });
  }
});

// History range availability endpoint
app.get('/api/history-availability', async (req, res) => {
  try {
    const { symbol = 'XAU' } = req.query;
    const { minTimestamp, totalPoints } = await getFirstTimestamp(symbol.toUpperCase());
    const now = Date.now();
    const totalSpanMinutes = minTimestamp ? Math.floor((now - minTimestamp) / 60000) : 0;

    res.json({
      symbol,
      firstTimestamp: minTimestamp,
      firstTimestampIso: minTimestamp ? new Date(minTimestamp).toISOString() : null,
      totalPoints,
      totalSpanMinutes,
      availableRanges: {
        '1H': totalSpanMinutes >= 5,
        '1D': totalSpanMinutes >= 60 * 12,
        '1W': totalSpanMinutes >= 60 * 24 * 5,
        '1M': totalSpanMinutes >= 60 * 24 * 25
      },
      note: minTimestamp ? `History collecting since ${minTimestamp}` : 'No history collected yet'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed checking history availability', message: err.message });
  }
});

// Watchlist endpoints
app.get('/api/watchlist', async (req, res) => {
  try {
    const list = await getWatchlist();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed fetching watchlist', message: err.message });
  }
});

app.post('/api/watchlist', async (req, res) => {
  try {
    const { symbol, name } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });
    const result = await addWatchlistSymbol(symbol, name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed adding to watchlist', message: err.message });
  }
});

app.delete('/api/watchlist/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await removeWatchlistSymbol(symbol);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed deleting from watchlist', message: err.message });
  }
});

// Rate-limited DB Sync endpoint
app.post('/api/sync', async (req, res) => {
  try {
    const result = await executeManualSync();
    res.json(result);
  } catch (err) {
    res.status(429).json({ error: 'Rate Limited', message: err.message });
  }
});

// Upgraded Quota & Rate Limit endpoint with Central Quota Budget Manager
app.get('/api/quota', async (req, res) => {
  try {
    const { isUsMarketOpen, isGoldMarketOpen, stockTokenBucket, computeGoldScheduleInterval } = require('./quotaBudgetManager');
    const { metalchartsRateLimitInfo } = require('./market');
    const rawQuota = await getQuotaInfo();

    const isDemo = !process.env.METALCHARTS_API_KEY && !process.env.GOLD_API_KEY && (!process.env.METALPRICE_API_KEY || process.env.METALPRICE_API_KEY === 'your_metalprice_api_key_here');
    
    const quotaConfig = getQuotaConfig();
    const metalchartsUsed = rawQuota?.metalcharts?.requests_used ?? 0;
    const metalpriceUsed = rawQuota?.metalprice?.requests_used ?? 0;

    const goldSchedule = computeGoldScheduleInterval({
      requestsUsed: metalchartsUsed,
      monthlyLimit: quotaConfig.metalchartsMonthlyLimit,
      minIntervalMinutes: quotaConfig.goldScheduleMinMinutes
    });

    const usMarket = isUsMarketOpen();
    const goldMarket = isGoldMarketOpen();
    const sseViewers = getSseClientCount();
    const bucketStatus = stockTokenBucket.getStatus();

    let activeSkipReason = null;
    if (!usMarket.isOpen) {
      activeSkipReason = 'Market closed (NYSE/Nasdaq outside 9:30-16:00 ET)';
    } else if (sseViewers === 0) {
      activeSkipReason = 'No active viewers (SSE clients = 0)';
    } else if (goldSchedule.stopSchedule) {
      activeSkipReason = 'Budget reserve threshold (90%) reached for scheduled fetches';
    }

    const nextScheduledFetchMs = goldSchedule.intervalMinutes
      ? Date.now() + (goldSchedule.intervalMinutes * 60 * 1000)
      : null;

    const watchlist = await getWatchlist();
    const syncCallsRequired = 1 + watchlist.length; // 1 Gold + N stocks

    res.json({
      isDemo,
      metalcharts: {
        service: 'MetalCharts (Primary Gold)',
        quotaType: 'monthly',
        requestsUsed: metalchartsUsed,
        monthlyLimit: quotaConfig.metalchartsMonthlyLimit,
        quotaRemaining: metalchartsRateLimitInfo.monthRemaining ?? (quotaConfig.metalchartsMonthlyLimit - metalchartsUsed),
        headersRemaining: metalchartsRateLimitInfo.remaining
      },
      metalprice: {
        service: 'MetalpriceAPI (Secondary Cross-Check)',
        quotaType: 'monthly_with_daily_cross_check',
        monthlyLimit: quotaConfig.metalpriceMonthlyLimit,
        quotaRemaining: Math.max(0, quotaConfig.metalpriceMonthlyLimit - metalpriceUsed),
        maxDailyCalls: quotaConfig.metalpriceMaxDailyCalls,
        requestsUsed: metalpriceUsed,
        fetchPolicy: `At most ${quotaConfig.metalpriceMaxDailyCalls} cross-check call(s) per day`
      },
      goldSchedule,
      finnhub: {
        service: 'Finnhub (US Equities)',
        quotaType: 'token_bucket_per_minute',
        limitPerMinute: bucketStatus.limitPerMinute,
        tokensAvailable: bucketStatus.tokensAvailable,
        queueLength: bucketStatus.queueLength
      },
      marketStatus: {
        usMarket,
        goldMarket
      },
      sseViewers,
      activeSkipReason,
      nextScheduledFetchIso: nextScheduledFetchMs ? new Date(nextScheduledFetchMs).toISOString() : null,
      syncCallsRequired,
      cacheTtlSeconds: {
        gold: parseInt(process.env.GOLD_CACHE_TTL || '300', 10),
        stock: parseInt(process.env.STOCK_CACHE_TTL || '300', 10)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed fetching quota info', message: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Market Data Service running on port ${PORT}`);
  });
}

module.exports = app;
