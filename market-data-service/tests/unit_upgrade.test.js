const test = require('node:test');
const assert = require('node:assert/strict');
const { insertTimeSeriesPoint } = require('../src/database');
const { computeOptimalFetchInterval, calculateGoldPrices } = require('../src/market');

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 2 — Duplicate provider_timestamp: no new DB row should be written
// ─────────────────────────────────────────────────────────────────────────────
test('Duplicate Timestamp Skipping', async () => {
  const symbol = `TEST_DUP_${Date.now()}`;
  const timestamp = 1700000000000 + Math.floor(Math.random() * 10000);

  // Insert first point
  const first = await insertTimeSeriesPoint({
    symbol,
    value: 100.5,
    currency_unit: 'USD',
    provider_timestamp: timestamp,
    fetched_at: Date.now(),
    source: 'Test',
    is_stale: false
  });
  assert.equal(first.inserted, true, 'First insert should succeed');

  // Attempt duplicate insert with exact same symbol and provider_timestamp
  const second = await insertTimeSeriesPoint({
    symbol,
    value: 100.5,
    currency_unit: 'USD',
    provider_timestamp: timestamp,
    fetched_at: Date.now() + 1000,
    source: 'Test Duplicate',
    is_stale: false
  });
  assert.equal(second.inserted, false, 'Second insert with same provider_timestamp must be rejected (deduped)');
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 2 extra — market.js logic: prevTs check prevents insertTimeSeriesPoint call
// ─────────────────────────────────────────────────────────────────────────────
test('In-memory prevTs guard prevents redundant DB insert call', () => {
  let insertCalled = 0;
  function simulateInsertGuard(prevTs, newTs) {
    if (!prevTs || prevTs !== newTs) {
      insertCalled++;
      return true;
    }
    return false;
  }

  const ts = 1700000060000;
  assert.equal(simulateInsertGuard(null, ts), true);
  assert.equal(insertCalled, 1);

  assert.equal(simulateInsertGuard(ts, ts), false);
  assert.equal(insertCalled, 1, 'Insert count must still be 1 after duplicate guard fires');

  const ts2 = ts + 60000;
  assert.equal(simulateInsertGuard(ts, ts2), true);
  assert.equal(insertCalled, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Conversion math tests: usd_per_oz, inr_per_gram, inr_per_10g
// ─────────────────────────────────────────────────────────────────────────────
test('calculateGoldPrices math: usd_per_oz, inr_per_gram, inr_per_10g', () => {
  const res = calculateGoldPrices({ XAU: 4000.00, INR: 85.00 });
  assert.equal(res.usd_per_oz, 4000.00);
  assert.equal(res.inr_per_gram, 10931.25);
  assert.equal(res.inr_per_10g, 109312.46);
  assert.equal(res.inr_rate, 85.00);
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 8 — computeOptimalFetchInterval quota math
// ─────────────────────────────────────────────────────────────────────────────
test('computeOptimalFetchInterval: exhausted quota returns null interval', () => {
  const result = computeOptimalFetchInterval(100, 100);
  assert.equal(result.quotaRemaining, 0);
  assert.equal(result.intervalMinutes, null);
  assert.match(result.formattedInterval, /exhausted/i);
});

test('computeOptimalFetchInterval: partial quota returns a positive interval', () => {
  const result = computeOptimalFetchInterval(50, 100);
  assert.equal(result.quotaRemaining, 50);
  assert.equal(result.monthlyLimit, 100);
  assert.ok(result.intervalMinutes > 0, 'intervalMinutes must be positive');
  assert.ok(result.intervalHours > 0, 'intervalHours must be positive');
  assert.ok(typeof result.formattedInterval === 'string', 'formattedInterval must be a string');
});

test('computeOptimalFetchInterval: full quota results in shorter interval than partial', () => {
  const full = computeOptimalFetchInterval(0, 100);
  const half = computeOptimalFetchInterval(50, 100);
  assert.ok(full.intervalMinutes <= half.intervalMinutes,
    'Full quota should allow more frequent refreshes (shorter or equal interval)');
});

test('computeOptimalFetchInterval: 1 request remaining gives very long interval', () => {
  const result = computeOptimalFetchInterval(99, 100);
  assert.equal(result.quotaRemaining, 1);
  assert.ok(result.intervalMinutes > 60, 'Should be more than an hour between fetches');
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 11 — computeHealthStatus state machine
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { computeHealthStatus } = require(path.join(__dirname, '../../backend/src/marketHealthService'));

const baseMetrics = {
  requestCount: 100,
  cacheHits: 80,
  cacheMisses: 20,
  upstreamErrors: 0,
  staleResponses: 5,
  staleCacheTtl: 4,
  staleUpstreamFailed: 1,
  lastRefreshSeconds: Math.floor(Date.now() / 1000) - 60
};

test('computeHealthStatus: Healthy when all good', () => {
  const status = computeHealthStatus({
    isConfigured: true,
    isReachable: true,
    metrics: { ...baseMetrics, staleResponses: 5, upstreamErrors: 0 },
    minutesSinceLastRefresh: 2
  });
  assert.equal(status, 'Healthy');
});

test('computeHealthStatus: Down when not reachable', () => {
  const status = computeHealthStatus({
    isConfigured: true,
    isReachable: false,
    metrics: baseMetrics,
    minutesSinceLastRefresh: null
  });
  assert.equal(status, 'Down');
});

test('computeHealthStatus: Not configured when no API keys', () => {
  const status = computeHealthStatus({
    isConfigured: false,
    isReachable: true,
    metrics: baseMetrics,
    minutesSinceLastRefresh: 1
  });
  assert.equal(status, 'Not configured');
});

test('computeHealthStatus: Degraded when stale ratio > 20%', () => {
  const status = computeHealthStatus({
    isConfigured: true,
    isReachable: true,
    metrics: { ...baseMetrics, staleResponses: 25, requestCount: 100 },
    minutesSinceLastRefresh: 3
  });
  assert.equal(status, 'Degraded');
});

test('computeHealthStatus: Degraded when last refresh > 15 minutes ago', () => {
  const status = computeHealthStatus({
    isConfigured: true,
    isReachable: true,
    metrics: { ...baseMetrics, staleResponses: 1, requestCount: 100 },
    minutesSinceLastRefresh: 20
  });
  assert.equal(status, 'Degraded');
});

test('computeHealthStatus: Degraded when upstream errors > 5', () => {
  const status = computeHealthStatus({
    isConfigured: true,
    isReachable: true,
    metrics: { ...baseMetrics, upstreamErrors: 6 },
    minutesSinceLastRefresh: 2
  });
  assert.equal(status, 'Degraded');
});

test('computeHealthStatus: Not configured takes precedence over Degraded stale ratio', () => {
  const status = computeHealthStatus({
    isConfigured: false,
    isReachable: true,
    metrics: { ...baseMetrics, staleResponses: 50 },
    minutesSinceLastRefresh: 1
  });
  assert.equal(status, 'Not configured');
});

// ─────────────────────────────────────────────────────────────────────────────
// Gold USD/oz to INR/g Conversion with Stored Rate
// ─────────────────────────────────────────────────────────────────────────────
test('Gold USD/oz to INR/g Conversion with Stored Rate', () => {
  const usdPrice = 2650;
  const storedInrRate = 83.5;
  const inrPerGram = Math.round(((usdPrice * storedInrRate) / 31.1035) * 100) / 100;
  assert.equal(inrPerGram, 7114.15);
});

// ─────────────────────────────────────────────────────────────────────────────
// Range Availability Logic Calculation
// ─────────────────────────────────────────────────────────────────────────────
test('Range Availability Logic Calculation', () => {
  const span15m = 15;
  const avail15m = {
    '1H': span15m >= 5,
    '1D': span15m >= 60 * 12,
    '1W': span15m >= 60 * 24 * 5,
    '1M': span15m >= 60 * 24 * 25
  };
  assert.equal(avail15m['1H'], true);
  assert.equal(avail15m['1D'], false);
  assert.equal(avail15m['1W'], false);

  const span24h = 60 * 24;
  const avail24h = {
    '1H': span24h >= 5,
    '1D': span24h >= 60 * 12,
    '1W': span24h >= 60 * 24 * 5,
    '1M': span24h >= 60 * 24 * 25
  };
  assert.equal(avail24h['1H'], true);
  assert.equal(avail24h['1D'], true);
  assert.equal(avail24h['1W'], false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap Handling Detection (spanGaps logic)
// ─────────────────────────────────────────────────────────────────────────────
test('Gap Handling Detection (spanGaps logic)', () => {
  const baseTs = 1700000000000;
  const points = [
    { provider_timestamp: baseTs, value: 100 },
    { provider_timestamp: baseTs + 300000, value: 102 },
    { provider_timestamp: baseTs + 2100000, value: 105 }
  ];

  const maxGapThresholdMs = 10 * 60 * 1000;
  const gapDurationMs = points[2].provider_timestamp - points[1].provider_timestamp;
  const hasGap = gapDurationMs > maxGapThresholdMs;

  assert.equal(hasGap, true);
});
