/**
 * Quota Budget Manager
 * Centralized rate-limiting, budget tracking, market hours checking, token bucket,
 * single-flight request coalescing, and exponential backoff.
 */

// Single-Flight Map
const singleFlightPromises = new Map();

// Backoff State per Provider: { failures: 0, nextAllowedTs: 0 }
const backoffStates = new Map();

function getPositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Keep provider limits in one place. These are budgets for this application,
// not guesses derived from generated/demo prices.
function getQuotaConfig() {
  return {
    metalchartsMonthlyLimit: getPositiveIntEnv('METALCHARTS_MONTHLY_LIMIT', 1000),
    metalpriceMonthlyLimit: getPositiveIntEnv('METALPRICE_MONTHLY_LIMIT', 100),
    metalpriceMaxDailyCalls: getPositiveIntEnv('METALPRICE_MAX_DAILY_CALLS', 1),
    finnhubCallsPerMinute: getPositiveIntEnv('FINNHUB_CALLS_PER_MINUTE', 60),
    goldScheduleMinMinutes: getPositiveIntEnv('GOLD_SCHEDULE_MIN_MINUTES', 60)
  };
}

// USD to INR Rate Cache (refreshed max twice a day = 12 hours)
let cachedUsdInrRate = {
  rate: null,
  lastFetchedAt: 0
};

/**
 * Check if US stock market (NYSE/Nasdaq) is open.
 * Hours: Mon-Fri, 9:30 AM to 4:00 PM US Eastern Time (ET).
 * Excludes US Holidays.
 */
function isUsMarketOpen(nowMs = Date.now()) {
  const date = new Date(nowMs);
  
  // Format to US Eastern Time
  const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);

  const dayOfWeek = etDate.getDay(); // 0 = Sun, 6 = Sat
  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const marketOpenMinutes = 9 * 60 + 30;  // 9:30 AM = 570
  const marketCloseMinutes = 16 * 60;     // 4:00 PM = 960

  // US Market Holidays (fixed & rule-based common holidays for 2026/general)
  const month = etDate.getMonth() + 1; // 1-12
  const day = etDate.getDate();
  const year = etDate.getFullYear();

  // Common fixed US holidays: Jan 1 (New Year), Jul 4 (Independence), Dec 25 (Christmas)
  const isFixedHoliday = (month === 1 && day === 1) || (month === 7 && day === 4) || (month === 12 && day === 25);

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isWithinHours = totalMinutes >= marketOpenMinutes && totalMinutes < marketCloseMinutes;

  const isOpen = !isWeekend && !isFixedHoliday && isWithinHours;

  // Calculate last close time if closed
  let lastClose = new Date(etDate);
  if (!isOpen) {
    if (totalMinutes < marketOpenMinutes) {
      // Prior day 4:00 PM
      lastClose.setDate(lastClose.getDate() - (dayOfWeek === 1 ? 3 : 1));
      lastClose.setHours(16, 0, 0, 0);
    } else {
      // Today 4:00 PM (or Fri 4:00 PM if weekend)
      if (dayOfWeek === 6) lastClose.setDate(lastClose.getDate() - 1);
      if (dayOfWeek === 0) lastClose.setDate(lastClose.getDate() - 2);
      lastClose.setHours(16, 0, 0, 0);
    }
  }

  return {
    isOpen,
    isWeekend,
    isWithinHours,
    reason: isOpen ? 'Market open' : (isWeekend ? 'Weekend (Market closed)' : 'Outside trading hours (9:30-16:00 ET)'),
    lastCloseIso: lastClose.toISOString(),
    formattedLastClose: lastClose.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET'
  };
}

/**
 * Check if Gold market is open.
 * Gold trades 23 hrs/day Sun 6 PM ET - Fri 5 PM ET (Closed Fri 5 PM ET - Sun 6 PM ET).
 */
function isGoldMarketOpen(nowMs = Date.now()) {
  const date = new Date(nowMs);
  const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);

  const dayOfWeek = etDate.getDay(); // 0 = Sun, 6 = Sat, 5 = Fri
  const hours = etDate.getHours();

  // Closed Friday after 5 PM ET until Sunday 6 PM ET
  let isClosed = false;
  if (dayOfWeek === 5 && hours >= 17) isClosed = true;
  if (dayOfWeek === 6) isClosed = true;
  if (dayOfWeek === 0 && hours < 18) isClosed = true;

  return {
    isOpen: !isClosed,
    reason: !isClosed ? 'Gold market open' : 'Gold market closed on weekend'
  };
}

/**
 * Compute Gold Schedule Interval
 * - remaining monthly quota = monthlyLimit * 0.9 - requestsUsed (saving 10% for manual Fetch Now)
 * - min default interval = 60 minutes
 * - stop scheduled fetches at 90% usage
 */
function computeGoldScheduleInterval({ requestsUsed = 0, monthlyLimit = 100, nowMs = Date.now(), minIntervalMinutes = 60 }) {
  const reserveThreshold = Math.floor(monthlyLimit * 0.9);
  
  if (requestsUsed >= reserveThreshold) {
    return {
      quotaRemaining: Math.max(0, monthlyLimit - requestsUsed),
      usableScheduleQuota: 0,
      monthlyLimit,
      requestsUsed,
      stopSchedule: true,
      skipReason: 'budget_reserve_90',
      intervalMinutes: null,
      formattedInterval: 'Schedule stopped (90% budget reserve reached for manual Fetch Now)'
    };
  }

  const usableQuota = reserveThreshold - requestsUsed;
  const now = new Date(nowMs);
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const hoursRemainingToday = 24 - now.getUTCHours();
  const daysRemaining = Math.max(0.1, (daysInMonth - dayOfMonth) + (hoursRemainingToday / 24));

  const rawHoursPerFetch = (daysRemaining * 24) / usableQuota;
  const computedMinutes = Math.round(rawHoursPerFetch * 60);
  const intervalMinutes = Math.max(minIntervalMinutes, computedMinutes);

  return {
    quotaRemaining: Math.max(0, monthlyLimit - requestsUsed),
    usableScheduleQuota: usableQuota,
    monthlyLimit,
    requestsUsed,
    stopSchedule: false,
    skipReason: null,
    intervalMinutes,
    intervalHours: Math.round((intervalMinutes / 60) * 10) / 10,
    formattedInterval: `Every ${intervalMinutes} mins (~${Math.round((intervalMinutes / 60) * 10) / 10}h)`
  };
}

/**
 * Token-Bucket Limiter for Stock API calls
 * - Capacity: 30 calls
 * - Refill: 30 calls / minute (0.5 tokens/sec)
 */
class TokenBucketLimiter {
  constructor(capacity = 30, refillRatePerMin = 30) {
    this.capacity = capacity;
    this.refillRatePerSec = refillRatePerMin / 60;
    this.limitPerMinute = refillRatePerMin;
    this.tokens = capacity;
    this.lastRefill = Date.now();
    this.queue = [];
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRatePerSec);
    this.lastRefill = now;
  }

  getStatus() {
    this.refill();
    return {
      capacity: this.capacity,
      tokensAvailable: Math.floor(this.tokens),
      queueLength: this.queue.length,
      limitPerMinute: this.limitPerMinute
    };
  }

  async acquireToken() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  processQueue() {
    if (this.queue.length === 0) return;
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      resolve(true);
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }
    } else {
      const waitMs = Math.ceil(((1 - this.tokens) / this.refillRatePerSec) * 1000);
      setTimeout(() => this.processQueue(), Math.max(100, waitMs));
    }
  }
}

const finnhubCallsPerMinute = getQuotaConfig().finnhubCallsPerMinute;
const stockTokenBucket = new TokenBucketLimiter(finnhubCallsPerMinute, finnhubCallsPerMinute);

/**
 * Single-Flight Request Coalescing
 * Coalesces concurrent calls with the same key to share one underlying Promise.
 */
function singleFlight(key, fetchFn) {
  if (singleFlightPromises.has(key)) {
    return singleFlightPromises.get(key);
  }

  const promise = (async () => {
    try {
      return await fetchFn();
    } finally {
      singleFlightPromises.delete(key);
    }
  })();

  singleFlightPromises.set(key, promise);
  return promise;
}

/**
 * Exponential Backoff Manager for HTTP 429/5xx
 */
function getBackoffState(provider) {
  if (!backoffStates.has(provider)) {
    backoffStates.set(provider, { failures: 0, nextAllowedTs: 0 });
  }
  return backoffStates.get(provider);
}

function recordBackoffSuccess(provider) {
  backoffStates.set(provider, { failures: 0, nextAllowedTs: 0 });
}

function recordBackoffError(provider, statusCode, retryAfterHeader = null) {
  const state = getBackoffState(provider);
  state.failures += 1;

  let delayMs = Math.min(300000, Math.pow(2, state.failures) * 1000); // 2s, 4s, 8s, 16s... up to 5 mins

  if (retryAfterHeader) {
    const retrySec = parseInt(retryAfterHeader, 10);
    if (!isNaN(retrySec) && retrySec > 0) {
      delayMs = retrySec * 1000;
    }
  }

  state.nextAllowedTs = Date.now() + delayMs;
  return { delayMs, failures: state.failures, nextAllowedTs: state.nextAllowedTs };
}

function isProviderInBackoff(provider) {
  const state = getBackoffState(provider);
  if (Date.now() < state.nextAllowedTs) {
    return {
      inBackoff: true,
      retryInSeconds: Math.ceil((state.nextAllowedTs - Date.now()) / 1000)
    };
  }
  return { inBackoff: false, retryInSeconds: 0 };
}

/**
 * USD to INR Rate Manager (Max 2 refreshes per day = 12 hours)
 */
function shouldRefreshUsdInrRate() {
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  return Date.now() - cachedUsdInrRate.lastFetchedAt > TWELVE_HOURS_MS;
}

function updateUsdInrRate(newRate) {
  if (typeof newRate === 'number' && newRate > 0) {
    cachedUsdInrRate = {
      rate: newRate,
      lastFetchedAt: Date.now()
    };
  }
}

function getUsdInrRate() {
  return cachedUsdInrRate.rate;
}

module.exports = {
  isUsMarketOpen,
  isGoldMarketOpen,
  computeGoldScheduleInterval,
  getQuotaConfig,
  TokenBucketLimiter,
  stockTokenBucket,
  singleFlight,
  getBackoffState,
  recordBackoffSuccess,
  recordBackoffError,
  isProviderInBackoff,
  shouldRefreshUsdInrRate,
  updateUsdInrRate,
  getUsdInrRate
};

