require('dotenv').config();
const axios = require('axios');

function maskKey(key) {
  if (!key || key.length < 12) return '****';
  return key.slice(0, 8) + '...' + key.slice(-6);
}

async function verifyGold() {
  const key = process.env.METALCHARTS_API_KEY;

  console.log('--- MetalCharts LIVE Gold API Verification ---');

  if (!key || key === 'your_metalcharts_api_key_here') {
    console.error('FAIL: METALCHARTS_API_KEY is not configured in .env file.');
    process.exit(1);
  }

  const masked = maskKey(key);
  console.log(`Using API Key: ${masked}`);

  try {
    const response = await axios.get('https://api.metalcharts.org/v1/prices', {
      headers: {
        'Authorization': `Bearer ${key}`
      },
      timeout: 10000
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      const xau = data?.data?.XAU;

      if (xau && typeof xau.price === 'number') {
        const usd_per_oz = Math.round(xau.price * 100) / 100;
        const inrRate = 85.20;
        const inr_per_gram = Math.round(((usd_per_oz * inrRate) / 31.1035) * 100) / 100;
        const inr_per_10g = Math.round((inr_per_gram * 10) * 100) / 100;

        console.log('\nPASS: MetalCharts Gold Price API verified successfully!');
        console.log(`Gold Price (USD/oz): $${usd_per_oz.toLocaleString()}`);
        console.log(`Gold Price (INR/g) : ₹${inr_per_gram.toLocaleString()}`);
        console.log(`Gold Price (10g)   : ₹${inr_per_10g.toLocaleString()}`);
        console.log(`Provider Timestamp : ${xau.timestamp || data.timestamp}`);
        console.log(`RateLimit Remaining: ${response.headers['x-ratelimit-remaining'] || 'N/A'}`);
        console.log(`Month Remaining    : ${response.headers['x-ratelimit-month-remaining'] || 'N/A'}`);
        process.exit(0);
      } else {
        console.error('FAIL: Invalid response format from MetalCharts API. XAU data missing.');
        process.exit(1);
      }
    } else {
      console.error(`FAIL: HTTP ${response.status} returned from MetalCharts API.`);
      process.exit(1);
    }
  } catch (err) {
    const status = err.response ? err.response.status : 'Network / Timeout';
    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`FAIL: MetalCharts API call failed [Status: ${status}]`);
    console.error(`Details: ${errData}`);
    process.exit(1);
  }
}

verifyGold();

