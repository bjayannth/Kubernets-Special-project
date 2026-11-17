require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const { getClusterOverview, getPodsList, getPodDetails, getAlerts } = require('./k8sService');
const { getMarketServiceHealth } = require('./marketHealthService');
const { getPodTimeSeries } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;
const MARKET_SERVICE_URL = process.env.MARKET_SERVICE_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());

// Probes
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

// Cluster Overview
app.get('/api/k8s/overview', async (req, res) => {
  try {
    const data = await getClusterOverview();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cluster overview', message: err.message });
  }
});

// Pods list
app.get('/api/k8s/pods', async (req, res) => {
  try {
    const { namespace, status, search } = req.query;
    const pods = await getPodsList(namespace, status, search);
    res.json(pods);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pods list', message: err.message });
  }
});

// Pod detail
app.get('/api/k8s/pods/:namespace/:name', async (req, res) => {
  try {
    const { namespace, name } = req.params;
    const pod = await getPodDetails(namespace, name);
    res.json(pod);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pod details', message: err.message });
  }
});

// Pod Time-Series metrics from SQLite
app.get('/api/k8s/pods/:namespace/:name/timeseries', async (req, res) => {
  try {
    const { namespace, name } = req.params;
    const minutes = parseInt(req.query.range || '60', 10);
    const series = await getPodTimeSeries(namespace, name, minutes);
    res.json(series);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pod time series', message: err.message });
  }
});

// Cluster Alerts
app.get('/api/k8s/alerts', async (req, res) => {
  try {
    const alerts = await getAlerts();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts', message: err.message });
  }
});

// Market Service Health
app.get('/api/market-health', async (req, res) => {
  try {
    const health = await getMarketServiceHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch market service health', message: err.message });
  }
});

// Proxy Market APIs
app.get('/api/market/gold', async (req, res) => {
  try {
    const response = await axios.get(`${MARKET_SERVICE_URL}/api/gold-price`, { timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json({ error: 'Market Service Offline' });
  }
});

app.get('/api/market/stocks', async (req, res) => {
  try {
    const response = await axios.get(`${MARKET_SERVICE_URL}/api/stocks`, { timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json({ error: 'Market Service Offline' });
  }
});

app.get('/api/market/timeseries', async (req, res) => {
  try {
    const { symbol = 'XAU', range = '60' } = req.query;
    const response = await axios.get(`${MARKET_SERVICE_URL}/api/timeseries`, { params: { symbol, range }, timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json([]);
  }
});

app.get('/api/market/availability', async (req, res) => {
  try {
    const { symbol = 'XAU' } = req.query;
    const response = await axios.get(`${MARKET_SERVICE_URL}/api/history-availability`, { params: { symbol }, timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json({});
  }
});

app.get('/api/market/watchlist', async (req, res) => {
  try {
    const response = await axios.get(`${MARKET_SERVICE_URL}/api/watchlist`, { timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json([]);
  }
});

app.post('/api/market/watchlist', async (req, res) => {
  try {
    const response = await axios.post(`${MARKET_SERVICE_URL}/api/watchlist`, req.body, { timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.delete('/api/market/watchlist/:symbol', async (req, res) => {
  try {
    const response = await axios.delete(`${MARKET_SERVICE_URL}/api/watchlist/${req.params.symbol}`, { timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/market/quota', async (req, res) => {
  try {
    const response = await axios.get(`${MARKET_SERVICE_URL}/api/quota`, { timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json({});
  }
});

// SSE stream proxy — pipes market-data-service SSE to the browser
// Vite's /api proxy routes here (port 5000), then we pipe upstream to port 4000
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const marketUrl = new URL(`${MARKET_SERVICE_URL}/api/stream`);
  const upstreamReq = http.get({
    hostname: marketUrl.hostname,
    port: marketUrl.port || 80,
    path: marketUrl.pathname,
    headers: { Accept: 'text/event-stream' }
  }, (upstream) => {
    upstream.on('data', (chunk) => { try { res.write(chunk); } catch (_) {} });
    upstream.on('end', () => { try { res.end(); } catch (_) {} });
    upstream.on('error', () => { try { res.end(); } catch (_) {} });
  });

  upstreamReq.on('error', () => { try { res.end(); } catch (_) {} });
  req.on('close', () => { try { upstreamReq.destroy(); } catch (_) {} });
});

app.post('/api/market/sync', async (req, res) => {
  try {
    const response = await axios.post(`${MARKET_SERVICE_URL}/api/sync`, {}, { timeout: 12000 });
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(503).json({ error: 'Market Service Offline', message: err.message });
    }
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 CloudOps API Backend running on port ${PORT}`);
  });
}

module.exports = app;
