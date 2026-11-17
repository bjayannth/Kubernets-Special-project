const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateGoldPrices, getGoldPrice, inMemoryCache } = require('../src/market');

test('Gold Price Calculation Formula', () => {
  // Mock rates: 1 XAU = 0.000377358... oz per USD (i.e. 2650 USD/oz)
  // INR = 83.5
  const mockRates = {
    XAU: 1 / 2650,
    INR: 83.5
  };

  const { usd_per_oz, inr_per_gram } = calculateGoldPrices(mockRates);

  // Expected USD per oz: 2650
  assert.equal(usd_per_oz, 2650);

  // Expected INR per gram: (2650 * 83.5) / 31.1035 = 7114.15
  const expectedInrPerGram = Math.round(((2650 * 83.5) / 31.1035) * 100) / 100;
  assert.equal(inr_per_gram, expectedInrPerGram);
});

test('Gold Price Cache & Stale Logic without API key', async () => {
  // Save original env keys
  const origMc = process.env.METALCHARTS_API_KEY;
  const origGold = process.env.GOLD_API_KEY;
  const origMp = process.env.METALPRICE_API_KEY;

  delete process.env.METALCHARTS_API_KEY;
  delete process.env.GOLD_API_KEY;
  delete process.env.METALPRICE_API_KEY;

  // Clear in-memory cache
  inMemoryCache.gold = null;

  // Set custom in-memory cache data
  inMemoryCache.gold = {
    data: { usd_per_oz: 2700, inr_per_gram: 7200, inr_per_10g: 72000, source: 'Test Cache' },
    timestamp: Date.now()
  };

  // Next call within TTL should return cached data with stale: false
  const freshRes = await getGoldPrice();
  assert.equal(freshRes.stale, false);
  assert.equal(freshRes.usd_per_oz, 2700);

  // Simulate cache expiration (e.g. 70 minutes ago, past 60m TTL)
  inMemoryCache.gold.timestamp = Date.now() - (70 * 60 * 1000);

  // Next call should fall back to cached data with stale: true
  const expiredRes = await getGoldPrice();
  assert.equal(expiredRes.stale, true);
  assert.equal(expiredRes.usd_per_oz, 2700);

  // Restore env keys
  if (origMc) process.env.METALCHARTS_API_KEY = origMc;
  if (origGold) process.env.GOLD_API_KEY = origGold;
  if (origMp) process.env.METALPRICE_API_KEY = origMp;
});
