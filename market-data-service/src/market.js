const fs = require('fs');
const path = require('path');
const axios = require('axios');
const {
  cacheHitCounter,
  cacheMissCounter,
  upstreamErrorCounter,
  staleResponseCounter,
  lastRefreshGauge,
  serviceStartTime,
  recordLatency,
  getPercentiles
} = require('./metrics');
const {
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
  getSseClientCount
} = require('./database');
const {
  isUsMarketOpen,
  isGoldMarketOpen,
  computeGoldScheduleInterval,
  stockTokenBucket,
  singleFlight,
  recordBackoffSuccess,
  recordBackoffError,
  isProviderInBackoff,
  getQuotaConfig,
  shouldRefreshUsdInrRate,
  updateUsdInrRate,
  getUsdInrRate
} = require('./quotaBudgetManager');

const quotaConfig = getQuotaConfig();

const CACHE_FILE = path.join(__dirname, '..', 'cache_store.json');
const AXIOS_TIMEOUT_MS = 10000;

// Rate-limiting for manual Sync DB (minimum 10s cooldown)
let lastSyncTime = 0;

// Rolling Finnhub rate limit counter (60 calls / min)
const finnhubCallTimestamps = [];

// MetalCharts Rate Limit Headers Cache
let metalchartsRateLimitInfo = {
  remaining: quotaConfig.metalchartsMonthlyLimit,
  monthRemaining: quotaConfig.metalchartsMonthlyLimit
};

let inMemoryCache = {
  gold: null,       // { data, timestamp }
  stocks: {}        // symbol -> { data, timestamp }
};

let lastSuccessfulRefreshTime = {
  gold: null,
  stocks: null
};

function computeOptimalFetchInterval(requestsUsed = 12, monthlyLimit = 1000) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const hoursRemainingToday = 24 - now.getUTCHours();
  const daysRemaining = (daysInMonth - dayOfMonth) + (hoursRemainingToday / 24);

  const quotaRemaining = Math.max(0, monthlyLimit - requestsUsed);
  if (quotaRemaining === 0) {
    return {
      quotaRemaining: 0,
      monthlyLimit,
      requestsUsed,
      daysRemaining: Math.round(daysRemaining * 10) / 10,
      intervalMinutes: null,
      intervalHours: null,
      formattedInterval: 'Quota exhausted for current month'
    };
  }

  const intervalHours = (daysRemaining * 24) / quotaRemaining;
  const intervalMinutes = Math.round(intervalHours * 60);

  return {
    quotaRemaining,
    monthlyLimit,
    requestsUsed,
    daysRemaining: Math.round(daysRemaining * 10) / 10,
    intervalMinutes,
    intervalHours: Math.round(intervalHours * 10) / 10,
    formattedInterval: intervalHours >= 1
      ? `Every ${Math.round(intervalHours * 10) / 10} hrs (~${intervalMinutes}m)`
      : `Every ${intervalMinutes} mins`
  };
}

function loadPersistentCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed.gold) {
        // Older cache entries were created with the removed 85.20 INR fallback.
        // Preserve the USD quote, but never expose an unverified INR conversion.
        if (!parsed.gold.data?.usd_inr_rate_source) {
          parsed.gold.data.inr_per_gram = null;
          parsed.gold.data.inr_per_10g = null;
          parsed.gold.data.usd_inr_rate = null;
        }
        inMemoryCache.gold = parsed.gold;
      }
      if (parsed.stocks) inMemoryCache.stocks = parsed.stocks;
      if (parsed.lastSuccessfulRefreshTime) lastSuccessfulRefreshTime = parsed.lastSuccessfulRefreshTime;
    }
  } catch (err) {
    console.warn('Could not read persistent cache file:', err.message);
  }
}

function savePersistentCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...inMemoryCache, lastSuccessfulRefreshTime }, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save persistent cache:', err.message);
  }
}

function calculateGoldPrices(rates) {
  if (!rates) throw new Error('Invalid rates');
  const xauRate = rates.XAU || rates.gold || (rates.USDXAU ? 1 / rates.USDXAU : null);
  const inrRate = rates.INR || getUsdInrRate();

  if (!xauRate) throw new Error('Invalid XAU rate');
  const usd_per_oz = typeof xauRate === 'number' && xauRate < 100 ? (1 / xauRate) : xauRate;
  const inr_per_gram = inrRate ? (usd_per_oz * inrRate) / 31.1035 : null;
  const inr_per_10g = inr_per_gram === null ? null : inr_per_gram * 10;

  return {
    usd_per_oz: Math.round(usd_per_oz * 100) / 100,
    inr_per_gram: inr_per_gram === null ? null : Math.round(inr_per_gram * 100) / 100,
    inr_per_10g: inr_per_10g === null ? null : Math.round(inr_per_10g * 100) / 100,
    inr_rate: inrRate
  };
}

/**
 * Primary & Secondary Gold Fetcher with Quota Budget Manager
 */
async function getGoldPrice(forceRefresh = false, isScheduled = false) {
  const ttlSeconds = parseInt(process.env.GOLD_CACHE_TTL || '3600', 10);
  const now = Date.now();

  // 1. In-memory cache hit (fresh within TTL)
  if (!forceRefresh && inMemoryCache.gold && (now - inMemoryCache.gold.timestamp < ttlSeconds * 1000)) {
    cacheHitCounter.inc({ type: 'gold' });
    return {
      ...inMemoryCache.gold.data,
      stale: false,
      stale_reason: null,
      fetched_at: inMemoryCache.gold.timestamp,
      updated_at: new Date(inMemoryCache.gold.timestamp).toISOString()
    };
  }

  // 2. Viewer-aware check for background scheduled fetches
  if (isScheduled && getSseClientCount() === 0 && inMemoryCache.gold) {
    return {
      ...inMemoryCache.gold.data,
      stale: true,
      stale_reason: 'no_active_viewers',
      skip_reason: 'no_active_viewers',
      fetched_at: inMemoryCache.gold.timestamp,
      updated_at: new Date(inMemoryCache.gold.timestamp).toISOString()
    };
  }

  // 3. Market status check
  const goldMarket = isGoldMarketOpen(now);
  if (!goldMarket.isOpen && !forceRefresh && inMemoryCache.gold) {
    return {
      ...inMemoryCache.gold.data,
      stale: true,
      stale_reason: 'market_closed',
      skip_reason: goldMarket.reason,
      fetched_at: inMemoryCache.gold.timestamp,
      updated_at: new Date(inMemoryCache.gold.timestamp).toISOString()
    };
  }

  cacheMissCounter.inc({ type: 'gold' });

  // Use Single-Flight to coalesce concurrent upstream requests
  return singleFlight('gold', async () => {
    // A. Primary Gold Provider: MetalCharts (api.metalcharts.org)
    const metalchartsKey = process.env.METALCHARTS_API_KEY;
    const isConfiguredKey = metalchartsKey && metalchartsKey !== 'your_metalcharts_api_key_here';

    if (isConfiguredKey) {
      const backoff = isProviderInBackoff('metalcharts');
      if (!backoff.inBackoff) {
        const startReq = Date.now();
        try {
          const response = await axios.get('https://api.metalcharts.org/v1/prices', {
            headers: { 'Authorization': `Bearer ${metalchartsKey}` },
            timeout: AXIOS_TIMEOUT_MS
          });
          recordLatency(Date.now() - startReq);
          recordBackoffSuccess('metalcharts');

          // Extract rate limit headers if present
          if (response.headers['x-ratelimit-remaining']) {
            metalchartsRateLimitInfo.remaining = parseInt(response.headers['x-ratelimit-remaining'], 10);
          }
          if (response.headers['x-ratelimit-month-remaining']) {
            metalchartsRateLimitInfo.monthRemaining = parseInt(response.headers['x-ratelimit-month-remaining'], 10);
          }

          if (response.data && (response.data.success || response.data.data)) {
            const dataObj = response.data.data || response.data.rates || response.data;
            const xau = dataObj.XAU || dataObj.gold;

            if (xau && (typeof xau.price === 'number' || typeof xau === 'number')) {
              const usd_per_oz = Math.round((typeof xau.price === 'number' ? xau.price : xau) * 100) / 100;
              const inr_rate = typeof dataObj.INR === 'number' ? dataObj.INR : getUsdInrRate();
              const inr_per_gram = inr_rate ? Math.round(((usd_per_oz * inr_rate) / 31.1035) * 100) / 100 : null;
              const inr_per_10g = inr_per_gram === null ? null : Math.round((inr_per_gram * 10) * 100) / 100;

              const providerTs = xau.timestamp
                ? new Date(xau.timestamp).getTime()
                : response.data.timestamp ? new Date(response.data.timestamp).getTime() : now;

              const prevPrice = inMemoryCache.gold?.data?.usd_per_oz || usd_per_oz;
              const priceDiff = Math.round((usd_per_oz - prevPrice) * 100) / 100;
              const priceDiffPct = prevPrice ? Math.round(((priceDiff / prevPrice) * 100) * 100) / 100 : 0;

              const goldData = {
                usd_per_oz,
                inr_per_gram,
                inr_per_10g,
                source: 'MetalCharts (Primary Live)',
                provider_timestamp: providerTs,
                fetched_at: now,
                usd_inr_rate: inr_rate,
                usd_inr_rate_source: inr_rate ? 'provider' : null,
                is_demo: false,
                movement: {
                  change: priceDiff,
                  change_percent: priceDiffPct
                }
              };

              const prevTs = inMemoryCache.gold?.data?.provider_timestamp;
              inMemoryCache.gold = { data: goldData, timestamp: now };
              lastSuccessfulRefreshTime.gold = now;
              savePersistentCache();
              lastRefreshGauge.set({ type: 'gold' }, Math.floor(now / 1000));
              await recordApiCall('metalcharts');

              // Skip duplicate provider timestamps in SQLite
              if (!prevTs || prevTs !== providerTs) {
                await insertTimeSeriesPoint({
                  symbol: 'XAU',
                  value: usd_per_oz,
                  currency_unit: 'USD_PER_OZ',
                  provider_timestamp: providerTs,
                  fetched_at: now,
                  source: 'MetalCharts (Primary Live)',
                  is_stale: false,
                  usd_inr_rate_used: inr_rate,
                  is_demo: false
                });
              }

              return { ...goldData, stale: false, stale_reason: null, updated_at: new Date(now).toISOString() };
            }
          }
        } catch (err) {
          const maskedKey = metalchartsKey ? metalchartsKey.slice(0, 6) + '...' : 'NONE';
          console.warn(`MetalCharts API fetch failed (key: ${maskedKey}):`, err.message);
          upstreamErrorCounter.inc({ provider: 'metalcharts' });
          const status = err.response ? err.response.status : 500;
          const retryAfter = err.response ? err.response.headers['retry-after'] : null;
          recordBackoffError('metalcharts', status, retryAfter);
        }
      }
    }

    // B. Secondary Gold Provider (cross-check), limited by the configured daily budget.
    const secondaryKey = process.env.GOLD_API_KEY || process.env.METALPRICE_API_KEY;
    if (secondaryKey && secondaryKey !== 'your_metalprice_api_key_here' && secondaryKey !== 'your_gold_api_key_here') {
      const ledger = await getLedgerInfo('metalprice');
      if (ledger.dayCalls < quotaConfig.metalpriceMaxDailyCalls) {
        const backoff = isProviderInBackoff('metalprice');
        if (!backoff.inBackoff) {
          const startReq = Date.now();
          try {
            const response = await axios.get('https://api.metalpriceapi.com/v1/latest', {
              headers: { 'X-API-KEY': secondaryKey },
              params: { base: 'USD', currencies: 'XAU,INR' },
              timeout: AXIOS_TIMEOUT_MS
            });
            recordLatency(Date.now() - startReq);
            recordBackoffSuccess('metalprice');

            if (response.data && response.data.success && response.data.rates) {
              const rates = response.data.rates;
              const xauRate = rates.XAU;
              // MetalpriceAPI XAU rate is ounces per USD, so usd_per_oz = 1 / rates.XAU
              const usd_per_oz = xauRate ? Math.round((1 / xauRate) * 100) / 100 : 4100;
              const inr_rate = rates.INR || getUsdInrRate();
              const inr_per_gram = inr_rate ? Math.round(((usd_per_oz * inr_rate) / 31.1035) * 100) / 100 : null;
              const inr_per_10g = inr_per_gram === null ? null : Math.round((inr_per_gram * 10) * 100) / 100;

              const providerTs = response.data.timestamp ? response.data.timestamp * 1000 : now;

              const goldData = {
                usd_per_oz,
                inr_per_gram,
                inr_per_10g,
                source: 'MetalpriceAPI (Secondary Cross-Check)',
                provider_timestamp: providerTs,
                fetched_at: now,
                usd_inr_rate: inr_rate,
                usd_inr_rate_source: inr_rate ? 'provider' : null,
                is_demo: false,
                movement: { change: 0, change_percent: 0 }
              };

              const prevTs = inMemoryCache.gold?.data?.provider_timestamp;
              inMemoryCache.gold = { data: goldData, timestamp: now };
              lastSuccessfulRefreshTime.gold = now;
              savePersistentCache();
              lastRefreshGauge.set({ type: 'gold' }, Math.floor(now / 1000));
              await recordApiCall('metalprice');

              if (!prevTs || prevTs !== providerTs) {
                await insertTimeSeriesPoint({
                  symbol: 'XAU',
                  value: usd_per_oz,
                  currency_unit: 'USD_PER_OZ',
                  provider_timestamp: providerTs,
                  fetched_at: now,
                  source: 'MetalpriceAPI (Secondary Cross-Check)',
                  is_stale: false,
                  usd_inr_rate_used: inr_rate,
                  is_demo: false
                });
              }

              return { ...goldData, stale: false, stale_reason: null, updated_at: new Date(now).toISOString() };
            }
          } catch (err) {
            console.warn('MetalpriceAPI secondary fetch failed:', err.message);
            upstreamErrorCounter.inc({ provider: 'metalprice' });
            const status = err.response ? err.response.status : 500;
            const retryAfter = err.response ? err.response.headers['retry-after'] : null;
            recordBackoffError('metalprice', status, retryAfter);
          }
        }
      }
    }

    // Fallback 1: Serve last stored price from memory / cache with stale=true
    if (inMemoryCache.gold) {
      staleResponseCounter.inc({ type: 'gold', reason: 'upstream_failed' });
      return {
        ...inMemoryCache.gold.data,
        stale: true,
        stale_reason: isConfiguredKey ? 'upstream_failed' : 'api_key_not_configured',
        fetched_at: inMemoryCache.gold.timestamp,
        updated_at: new Date(inMemoryCache.gold.timestamp).toISOString()
      };
    }

    // Fallback 2: Check SQLite database directly for latest stored snapshot
    const dbRows = await getTimeSeries('XAU', 0);
    if (dbRows && dbRows.length > 0) {
      const lastRow = dbRows[dbRows.length - 1];
      const usd_per_oz = Math.round(lastRow.value * 100) / 100;
      const inr_rate = lastRow.usd_inr_rate_used || getUsdInrRate();
      const inr_per_gram = inr_rate ? Math.round(((usd_per_oz * inr_rate) / 31.1035) * 100) / 100 : null;
      const inr_per_10g = inr_per_gram === null ? null : Math.round((inr_per_gram * 10) * 100) / 100;

      const storedGold = {
        usd_per_oz,
        inr_per_gram,
        inr_per_10g,
        source: lastRow.source || 'SQLite Stored Snapshot',
        provider_timestamp: lastRow.provider_timestamp,
        fetched_at: lastRow.fetched_at,
        usd_inr_rate: inr_rate,
        usd_inr_rate_source: inr_rate ? 'provider' : null,
        is_demo: lastRow.is_demo === 1,
        stale: true,
        stale_reason: 'served_from_db_history'
      };

      inMemoryCache.gold = { data: storedGold, timestamp: lastRow.fetched_at };
      return storedGold;
    }

    // Fallback 3: No stored price exists and API key is unconfigured or failed
    if (!isConfiguredKey) {
      throw new Error('API key missing or invalid. Please configure METALCHARTS_API_KEY in .env file.');
    }

    throw new Error('Upstream market providers unavailable and no stored history found.');
  });
}

/**
 * Stocks Fetcher with Token-Bucket Rate Limiting & Market Hours Check
 */
async function getStockPrices(symbolsArray, forceRefresh = false, isScheduled = false) {
  const ttlSeconds = parseInt(process.env.STOCK_CACHE_TTL || '300', 10);
  const now = Date.now();
  const apiKey = process.env.FINNHUB_API_KEY;

  const results = {};
  const isConfiguredKey = apiKey && apiKey !== 'your_finnhub_api_key_here';

  // Never manufacture a market price. If Finnhub is not configured, expose an
  // explicit unavailable state and allow the UI to explain what is missing.
  if (!isConfiguredKey) {
    for (const sym of symbolsArray) {
      const symbol = sym.toUpperCase().trim();
      const latest = await getLatestTimeSeriesPoint(symbol);
      results[symbol] = latest
        ? {
            symbol,
            name: symbol,
            price: latest.value,
            change: null,
            change_percent: null,
            provider_timestamp: latest.provider_timestamp,
            source: latest.source,
            is_demo: false,
            stale: true,
            stale_reason: 'finnhub_api_key_not_configured',
            unavailable: true,
            updated_at: new Date(latest.fetched_at).toISOString()
          }
        : {
            symbol,
            name: symbol,
            price: null,
            change: null,
            change_percent: null,
            provider_timestamp: null,
            source: 'Finnhub (API key not configured)',
            is_demo: false,
            stale: true,
            stale_reason: 'finnhub_api_key_not_configured',
            unavailable: true
          };
    }
    return results;
  }

  // Check NYSE/Nasdaq Market Hours
  const usMarket = isUsMarketOpen(now);

  // Live Finnhub Fetching
  for (const sym of symbolsArray) {
    const symbol = sym.toUpperCase().trim();
    const cachedItem = inMemoryCache.stocks[symbol];

    // In-memory cache hit
    if (!forceRefresh && cachedItem && (now - cachedItem.timestamp < ttlSeconds * 1000)) {
      cacheHitCounter.inc({ type: 'stock' });
      results[symbol] = {
        ...cachedItem.data,
        stale: false,
        stale_reason: null,
        updated_at: new Date(cachedItem.timestamp).toISOString()
      };
      continue;
    }

    // Skip external fetch if market closed (and return cached/status)
    if (!usMarket.isOpen && !forceRefresh && cachedItem) {
      results[symbol] = {
        ...cachedItem.data,
        stale: true,
        stale_reason: 'market_closed',
        market_status: `Market closed, last close at ${usMarket.formattedLastClose}`,
        updated_at: new Date(cachedItem.timestamp).toISOString()
      };
      continue;
    }

    cacheMissCounter.inc({ type: 'stock' });

    // Single-Flight for each symbol
    await singleFlight(`stock_${symbol}`, async () => {
      let fetchedSuccess = false;
      const backoff = isProviderInBackoff('finnhub');

      if (!backoff.inBackoff) {
        // Acquire a token using the configured Finnhub calls/minute budget.
        await stockTokenBucket.acquireToken();

        const startReq = Date.now();
        try {
          finnhubCallTimestamps.push(Date.now());
          const response = await axios.get('https://finnhub.io/api/v1/quote', {
            params: { symbol, token: apiKey },
            timeout: AXIOS_TIMEOUT_MS
          });
          recordLatency(Date.now() - startReq);
          recordBackoffSuccess('finnhub');

          if (response.data && typeof response.data.c === 'number' && response.data.c !== 0) {
            const price = Math.round(response.data.c * 100) / 100;
            const change = Math.round((response.data.d || 0) * 100) / 100;
            const change_percent = Math.round((response.data.dp || 0) * 100) / 100;
            const providerTs = response.data.t ? response.data.t * 1000 : now;

            const stockData = {
              symbol,
              name: symbol,
              price,
              change,
              change_percent,
              source: 'Finnhub (Live)',
              provider_timestamp: providerTs,
              is_demo: false,
              stale: false,
              market_status: usMarket.isOpen ? 'Market open' : `Market closed, last close at ${usMarket.formattedLastClose}`
            };

            const prevTs = cachedItem?.data?.provider_timestamp;
            inMemoryCache.stocks[symbol] = { data: stockData, timestamp: now };
            lastSuccessfulRefreshTime.stocks = now;
            savePersistentCache();
            lastRefreshGauge.set({ type: 'stock' }, Math.floor(now / 1000));
            await recordApiCall('finnhub');

            if (!prevTs || prevTs !== providerTs) {
              await insertTimeSeriesPoint({
                symbol,
                value: price,
                currency_unit: 'USD',
                provider_timestamp: providerTs,
                fetched_at: now,
                source: 'Finnhub (Live)',
                is_stale: false,
                usd_inr_rate_used: null,
                is_demo: false
              });
            }

            results[symbol] = {
              ...stockData,
              stale: false,
              stale_reason: null,
              updated_at: new Date(now).toISOString()
            };
            fetchedSuccess = true;
          }
        } catch (err) {
          console.warn(`Finnhub fetch failed for ${symbol}:`, err.message);
          upstreamErrorCounter.inc({ provider: 'finnhub' });
          const status = err.response ? err.response.status : 500;
          const retryAfter = err.response ? err.response.headers['retry-after'] : null;
          recordBackoffError('finnhub', status, retryAfter);
        }
      }

      if (!fetchedSuccess && inMemoryCache.stocks[symbol]) {
        staleResponseCounter.inc({ type: 'stock', reason: 'upstream_failed' });
        results[symbol] = {
          ...inMemoryCache.stocks[symbol].data,
          stale: true,
          stale_reason: 'upstream_failed',
          updated_at: new Date(inMemoryCache.stocks[symbol].timestamp).toISOString()
        };
      }
    });
  }

  return results;
}

// Manual DB Sync with rate-limiting check
async function executeManualSync() {
  const now = Date.now();
  if (now - lastSyncTime < 10000) {
    const waitSecs = Math.ceil((10000 - (now - lastSyncTime)) / 1000);
    throw new Error(`Sync is rate-limited. Please wait ${waitSecs} seconds before syncing again.`);
  }
  lastSyncTime = now;

  const watchlist = await getWatchlist();
  const symbols = watchlist.map(w => w.symbol);

  const gold = await getGoldPrice(true);
  const stocks = await getStockPrices(symbols, true);

  return {
    success: true,
    callsUsed: { gold: 1, stocks: symbols.length, total: 1 + symbols.length },
    gold,
    stocks,
    syncedAt: new Date(now).toISOString()
  };
}

loadPersistentCache();

module.exports = {
  getGoldPrice,
  getStockPrices,
  calculateGoldPrices,
  getTimeSeries,
  getFirstTimestamp,
  getWatchlist,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  getQuotaInfo,
  computeGoldScheduleInterval,
  computeOptimalFetchInterval,
  executeManualSync,
  lastSuccessfulRefreshTime,
  inMemoryCache,
  metalchartsRateLimitInfo
};
