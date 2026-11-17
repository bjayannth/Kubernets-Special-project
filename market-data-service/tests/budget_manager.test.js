const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isUsMarketOpen,
  isGoldMarketOpen,
  computeGoldScheduleInterval,
  TokenBucketLimiter,
  singleFlight,
  recordBackoffSuccess,
  recordBackoffError,
  isProviderInBackoff
} = require('../src/quotaBudgetManager');

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCHEDULER MATH & 90% THRESHOLD RESERVE
// ─────────────────────────────────────────────────────────────────────────────
test('computeGoldScheduleInterval: stops schedule at 90% threshold reserve', () => {
  // 90 used out of 100 limit -> 90% threshold reached
  const result = computeGoldScheduleInterval({
    requestsUsed: 90,
    monthlyLimit: 100,
    minIntervalMinutes: 60
  });

  assert.equal(result.stopSchedule, true);
  assert.equal(result.skipReason, 'budget_reserve_90');
  assert.equal(result.intervalMinutes, null);
  assert.match(result.formattedInterval, /stopped/i);
});

test('computeGoldScheduleInterval: 89 used out of 100 continues with safe interval', () => {
  const result = computeGoldScheduleInterval({
    requestsUsed: 89,
    monthlyLimit: 100,
    minIntervalMinutes: 60
  });

  assert.equal(result.stopSchedule, false);
  assert.equal(result.skipReason, null);
  assert.ok(result.intervalMinutes >= 60, 'Interval must be at least 60 minutes default minimum');
});

test('computeGoldScheduleInterval: enforces 60-minute default minimum clamp', () => {
  // Lots of remaining quota -> calculated interval might be 15 mins, but clamped to 60 mins
  const result = computeGoldScheduleInterval({
    requestsUsed: 10,
    monthlyLimit: 1000,
    minIntervalMinutes: 60
  });

  assert.equal(result.stopSchedule, false);
  assert.ok(result.intervalMinutes >= 60, 'Should be clamped to at least 60 minutes minimum');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MARKET HOURS LOGIC
// ─────────────────────────────────────────────────────────────────────────────
test('isUsMarketOpen: detects market open during ET trading hours on weekday', () => {
  // Wednesday 11:00 AM ET (15:00 UTC)
  // Date: 2026-10-07T15:00:00.000Z
  const wednesdayNoonEt = new Date('2026-10-07T15:00:00.000Z').getTime();
  const res = isUsMarketOpen(wednesdayNoonEt);

  assert.equal(res.isOpen, true);
  assert.equal(res.isWeekend, false);
  assert.equal(res.reason, 'Market open');
});

test('isUsMarketOpen: detects market closed outside 9:30-16:00 ET trading hours', () => {
  // Wednesday 8:00 AM ET (12:00 UTC) -> Before 9:30 AM ET
  const earlyMorning = new Date('2026-10-07T12:00:00.000Z').getTime();
  const res = isUsMarketOpen(earlyMorning);

  assert.equal(res.isOpen, false);
  assert.ok(res.formattedLastClose.includes('ET'));
});

test('isUsMarketOpen: detects market closed on Saturday weekend', () => {
  // Saturday 2:00 PM ET
  const saturdayMs = new Date('2026-10-10T18:00:00.000Z').getTime();
  const res = isUsMarketOpen(saturdayMs);

  assert.equal(res.isOpen, false);
  assert.equal(res.isWeekend, true);
  assert.match(res.reason, /Weekend/i);
});

test('isGoldMarketOpen: detects gold market closed on Saturday', () => {
  const saturdayMs = new Date('2026-10-10T18:00:00.000Z').getTime();
  const res = isGoldMarketOpen(saturdayMs);

  assert.equal(res.isOpen, false);
  assert.match(res.reason, /weekend/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TOKEN-BUCKET RATE LIMITER FOR STOCKS
// ─────────────────────────────────────────────────────────────────────────────
test('TokenBucketLimiter: capacity capped at 30 tokens and refilling rate', async () => {
  const bucket = new TokenBucketLimiter(30, 30); // 30 tokens, 30/min
  const status = bucket.getStatus();

  assert.equal(status.capacity, 30);
  assert.equal(status.tokensAvailable, 30);

  // Consume 1 token
  await bucket.acquireToken();
  const statusAfter = bucket.getStatus();
  assert.equal(statusAfter.tokensAvailable, 29);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SINGLE-FLIGHT REQUEST COALESCING
// ─────────────────────────────────────────────────────────────────────────────
test('singleFlight: concurrent calls with same key coalesce into 1 fetch execution', async () => {
  let executeCount = 0;

  const mockFetch = () => singleFlight('test_key_1', async () => {
    executeCount++;
    await new Promise(r => setTimeout(r, 50));
    return { data: 'coalesced_result' };
  });

  // Call 3 times concurrently
  const [res1, res2, res3] = await Promise.all([mockFetch(), mockFetch(), mockFetch()]);

  assert.equal(executeCount, 1, 'Underlying fetch function must execute exactly once');
  assert.equal(res1.data, 'coalesced_result');
  assert.equal(res2.data, 'coalesced_result');
  assert.equal(res3.data, 'coalesced_result');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EXPONENTIAL BACKOFF & 429 RETRY-AFTER HANDLING
// ─────────────────────────────────────────────────────────────────────────────
test('Exponential Backoff: 429 error triggers backoff delay and respects Retry-After header', () => {
  const provider = `test_provider_${Date.now()}`;

  // Initially not in backoff
  assert.equal(isProviderInBackoff(provider).inBackoff, false);

  // Record 429 error with Retry-After header = 10 seconds
  const backoffInfo = recordBackoffError(provider, 429, '10');
  assert.equal(backoffInfo.delayMs, 10000);

  // Immediately checked -> in backoff
  const check = isProviderInBackoff(provider);
  assert.equal(check.inBackoff, true);
  assert.ok(check.retryInSeconds > 0 && check.retryInSeconds <= 10);

  // Record success -> clears backoff
  recordBackoffSuccess(provider);
  assert.equal(isProviderInBackoff(provider).inBackoff, false);
});

