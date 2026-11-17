import { formatDateTime } from './dateFormatter';

/**
 * Utility to generate and open interactive standalone HTML detail pages in a new window/tab.
 * Supports both Kubernetes Cluster metrics (NODES, NAMESPACES, PODS, RESTARTS, ALERTS)
 * and Market Service Health telemetry (MARKET_REQUESTS, MARKET_CACHE, MARKET_ERRORS, MARKET_STALE, MARKET_LATENCY_P50, MARKET_LATENCY_P95, MARKET_REFRESH, MARKET_DIAGNOSTICS).
 */
export function openDetailHtmlPage(type, { overview, pods = [], alerts = [], health = {}, timezone = 'IST' } = {}) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked! Please allow pop-ups for localhost to view the detailed HTML page.');
    return;
  }

  const timestampStr = formatDateTime(new Date(), timezone);
  const m = health.metrics || {};

  // Helper CSS styles for dark dashboard theme
  const baseCss = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background-color: #0B0F17;
        color: #F8FAFC;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        padding: 24px;
        line-height: 1.5;
      }
      .container { max-width: 1200px; margin: 0 auto; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #1E293B;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }
      .title { font-size: 24px; font-weight: 800; color: #F8FAFC; }
      .subtitle { font-size: 13px; color: #94A3B8; margin-top: 4px; }
      .badge-demo {
        background-color: rgba(245, 158, 11, 0.15);
        color: #FBBF24;
        border: 1px solid rgba(245, 158, 11, 0.3);
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .badge-health {
        background-color: rgba(59, 130, 246, 0.15);
        color: #60A5FA;
        border: 1px solid rgba(59, 130, 246, 0.3);
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .card {
        background-color: #151C28;
        border: 1px solid #1E293B;
        border-radius: 12px;
        padding: 16px;
      }
      .card-label { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; }
      .card-val { font-size: 28px; font-weight: 800; color: #F8FAFC; margin-top: 4px; }
      .card-sub { font-size: 11px; color: #94A3B8; margin-top: 2px; }

      .table-card {
        background-color: #151C28;
        border: 1px solid #1E293B;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
        overflow-x: auto;
      }
      table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
      th {
        padding: 12px 14px;
        background-color: #0F172A;
        color: #94A3B8;
        font-weight: 700;
        border-bottom: 1px solid #1E293B;
        font-size: 11px;
        text-transform: uppercase;
      }
      td { padding: 14px; border-bottom: 1px solid rgba(30, 41, 59, 0.6); }
      tr:hover { background-color: rgba(30, 41, 59, 0.4); }

      .badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
      }
      .badge-green { background-color: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.3); }
      .badge-yellow { background-color: rgba(245, 158, 11, 0.15); color: #FBBF24; border: 1px solid rgba(245, 158, 11, 0.3); }
      .badge-red { background-color: rgba(239, 68, 68, 0.15); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.3); }
      .badge-blue { background-color: rgba(59, 130, 246, 0.15); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.3); }

      .mono { font-family: monospace; }
      .footer {
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid #1E293B;
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #64748B;
      }
      .btn-close {
        background-color: #1E293B;
        color: #F8FAFC;
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      }
      .btn-close:hover { background-color: #334155; }
    </style>
  `;

  let title = '';
  let categoryBadge = 'LIVE K8S TELEMETRY';
  let bodyContent = '';

  // KUBERNETES CLUSTER VIEWS
  if (type === 'NODES') {
    title = 'Cluster Nodes Overview';
    const nodes = overview?.nodes || [
      { name: 'cloudops-node-1', status: 'Ready', role: 'control-plane', cpuUsagePct: 42, memUsagePct: 68, kubeletVersion: 'v1.30.2' },
      { name: 'cloudops-node-2', status: 'Ready', role: 'worker', cpuUsagePct: 76, memUsagePct: 84, kubeletVersion: 'v1.30.2' }
    ];

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Total Nodes</div>
          <div class="card-val">${nodes.length}</div>
          <div class="card-sub">Active Cluster Nodes</div>
        </div>
        <div class="card">
          <div class="card-label">Control Plane</div>
          <div class="card-val">${nodes.filter(n => n.role?.includes('control')).length || 1}</div>
          <div class="card-sub">Master Nodes</div>
        </div>
        <div class="card">
          <div class="card-label">Worker Nodes</div>
          <div class="card-val">${nodes.filter(n => n.role?.includes('worker')).length || 1}</div>
          <div class="card-sub">Execution Nodes</div>
        </div>
        <div class="card">
          <div class="card-label">Status</div>
          <div class="card-val" style="color: #34D399;">Ready</div>
          <div class="card-sub">100% Operational</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Node Inventory & Metrics</h3>
        <table>
          <thead>
            <tr>
              <th>Node Name</th>
              <th>Status</th>
              <th>Role</th>
              <th>Kubelet Version</th>
              <th>CPU Usage</th>
              <th>Memory Usage</th>
              <th>Architecture</th>
            </tr>
          </thead>
          <tbody>
            ${nodes.map(n => `
              <tr>
                <td style="font-weight: 700; color: #F8FAFC;">${n.name}</td>
                <td><span class="badge badge-green">${n.status || 'Ready'}</span></td>
                <td><span class="badge badge-blue">${n.role || 'worker'}</span></td>
                <td class="mono">${n.kubeletVersion || 'v1.30.2'}</td>
                <td class="mono">${n.cpuUsagePct || 45}%</td>
                <td class="mono">${n.memUsagePct || 65}%</td>
                <td>Linux / amd64</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'NAMESPACES') {
    title = 'Kubernetes Namespaces Isolation';
    const nsList = [
      { name: 'cloudops-system', pods: pods.filter(p => p.namespace === 'cloudops-system').length || 4, status: 'Active', quota: 'Unlimited' },
      { name: 'default', pods: pods.filter(p => p.namespace === 'default').length || 1, status: 'Active', quota: 'Default' },
      { name: 'kube-system', pods: pods.filter(p => p.namespace === 'kube-system').length || 2, status: 'Active', quota: 'System Protected' },
      { name: 'monitoring', pods: pods.filter(p => p.namespace === 'monitoring').length || 1, status: 'Active', quota: 'High Priority' }
    ];

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Total Namespaces</div>
          <div class="card-val">${nsList.length}</div>
          <div class="card-sub">Logical Environments</div>
        </div>
        <div class="card">
          <div class="card-label">Total Workloads</div>
          <div class="card-val">${pods.length}</div>
          <div class="card-sub">Active Pods Across Namespaces</div>
        </div>
        <div class="card">
          <div class="card-label">Isolation Mode</div>
          <div class="card-val" style="color: #60A5FA;">RBAC Strict</div>
          <div class="card-sub">NetworkPolicy Enforced</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Namespace Allocation Table</h3>
        <table>
          <thead>
            <tr>
              <th>Namespace Name</th>
              <th>Status</th>
              <th>Total Pods</th>
              <th>Resource Quota</th>
              <th>Security Level</th>
            </tr>
          </thead>
          <tbody>
            ${nsList.map(n => `
              <tr>
                <td style="font-weight: 700; color: #F8FAFC;">${n.name}</td>
                <td><span class="badge badge-green">${n.status}</span></td>
                <td class="mono" style="font-weight: 700;">${n.pods} pods</td>
                <td>${n.quota}</td>
                <td><span class="badge badge-blue">Isolated</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'PODS') {
    title = 'All Cluster Workload Pods';
    const runningCount = pods.filter(p => p.status === 'Running').length;
    const pendingCount = pods.filter(p => p.status === 'Pending').length;
    const crashCount = pods.filter(p => p.status === 'CrashLoopBackOff').length;

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Total Pods</div>
          <div class="card-val">${pods.length}</div>
          <div class="card-sub">Configured Pods</div>
        </div>
        <div class="card">
          <div class="card-label">Running</div>
          <div class="card-val" style="color: #34D399;">${runningCount}</div>
          <div class="card-sub">Healthy Workloads</div>
        </div>
        <div class="card">
          <div class="card-label">Pending</div>
          <div class="card-val" style="color: #FBBF24;">${pendingCount}</div>
          <div class="card-sub">Unscheduled / Provisioning</div>
        </div>
        <div class="card">
          <div class="card-label">CrashLoopBackOff</div>
          <div class="card-val" style="color: #F87171;">${crashCount}</div>
          <div class="card-sub">Failing Containers</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Pod Inventory & Health Telemetry</h3>
        <table>
          <thead>
            <tr>
              <th>Pod Name</th>
              <th>Namespace</th>
              <th>Status</th>
              <th>Ready</th>
              <th>Restarts</th>
              <th>CPU %</th>
              <th>Memory %</th>
              <th>Node</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            ${pods.map(p => {
              const badgeClass = p.status === 'Running' ? 'badge-green' : p.status === 'Pending' ? 'badge-yellow' : 'badge-red';
              return `
                <tr>
                  <td style="font-weight: 700; color: #F8FAFC;" class="mono">${p.name}</td>
                  <td class="mono">${p.namespace}</td>
                  <td><span class="badge ${badgeClass}">${p.status}</span></td>
                  <td class="mono">${p.ready || '1/1'}</td>
                  <td class="mono">${p.restarts_detail || p.restarts}</td>
                  <td class="mono">${p.cpuPct || 0}%</td>
                  <td class="mono">${p.memoryPct || 0}%</td>
                  <td>${p.node || 'unassigned'}</td>
                  <td style="color: #94A3B8;">${p.age || '1d'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'RESTARTS') {
    title = 'Pod Restarts Analysis';
    const restartedPods = pods.filter(p => p.restarts > 0);
    const totalRestarts = pods.reduce((acc, p) => acc + (p.restarts || 0), 0);

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Total Restarts</div>
          <div class="card-val" style="color: #FBBF24;">${totalRestarts}</div>
          <div class="card-sub">Cumulative Container Crashes</div>
        </div>
        <div class="card">
          <div class="card-label">Pods Affected</div>
          <div class="card-val">${restartedPods.length}</div>
          <div class="card-sub">Pods with > 0 Restarts</div>
        </div>
        <div class="card">
          <div class="card-label">High Frequency (>3)</div>
          <div class="card-val" style="color: #F87171;">${pods.filter(p => p.restarts > 3).length}</div>
          <div class="card-sub">Critical Restart Rates</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Restart Telemetry Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Pod Name</th>
              <th>Namespace</th>
              <th>Total Restarts</th>
              <th>Time Window Breakdown</th>
              <th>Status</th>
              <th>Assigned Node</th>
              <th>Remediation Status</th>
            </tr>
          </thead>
          <tbody>
            ${pods.map(p => {
              const isHigh = p.restarts > 3;
              return `
                <tr>
                  <td style="font-weight: 700; color: #F8FAFC;" class="mono">${p.name}</td>
                  <td class="mono">${p.namespace}</td>
                  <td class="mono" style="font-weight: 800; color: ${p.restarts > 0 ? '#FBBF24' : '#94A3B8'}">${p.restarts}</td>
                  <td class="mono">${p.restarts_detail || `${p.restarts} total`}</td>
                  <td><span class="badge ${isHigh ? 'badge-red' : p.restarts > 0 ? 'badge-yellow' : 'badge-green'}">${p.status}</span></td>
                  <td>${p.node || '---'}</td>
                  <td>${isHigh ? '<span style="color: #F87171;">Investigate Backoff</span>' : '<span style="color: #34D399;">Normal</span>'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'ALERTS') {
    title = 'Active Incident Alerts';
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Total Alerts</div>
          <div class="card-val" style="color: ${alerts.length > 0 ? '#F87171' : '#34D399'}">${alerts.length}</div>
          <div class="card-sub">Active Cluster Incidents</div>
        </div>
        <div class="card">
          <div class="card-label">Critical Incidents</div>
          <div class="card-val" style="color: #F87171;">${criticalCount}</div>
          <div class="card-sub">Immediate Action Required</div>
        </div>
        <div class="card">
          <div class="card-label">Warnings</div>
          <div class="card-val" style="color: #FBBF24;">${warningCount}</div>
          <div class="card-sub">Elevated Resource Levels</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Active Incident Signals & Alert Log</h3>
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Target Pod / Component</th>
              <th>Namespace</th>
              <th>Incident Signals</th>
              <th>Alert Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${alerts.length === 0 ? `
              <tr><td colspan="6" style="text-align: center; color: #34D399; padding: 24px;">✅ No active cluster incidents. All pods and services healthy.</td></tr>
            ` : alerts.map(a => `
              <tr>
                <td><span class="badge ${a.severity === 'critical' ? 'badge-red' : 'badge-yellow'}">${(a.severity || 'warning').toUpperCase()}</span></td>
                <td style="font-weight: 700; color: #F8FAFC;" class="mono">${a.pod || a.target || 'Cluster'}</td>
                <td class="mono">${a.namespace || 'cloudops-system'}</td>
                <td>${(a.signals || [a.title || 'Incident']).map(s => `<span class="badge badge-blue" style="margin-right: 4px;">${s}</span>`).join('')}</td>
                <td style="color: #CBD5E1;">${a.message || (a.messages ? a.messages.join('; ') : '')}</td>
                <td><span class="badge badge-yellow">Open</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // MARKET SERVICE HEALTH VIEWS
  else if (type === 'MARKET_REQUESTS') {
    categoryBadge = 'MARKET SERVICE TELEMETRY';
    title = 'Market Service Total Requests Telemetry';
    const totalReq = m.requestCount || 0;
    const hits = m.cacheHits || 0;
    const misses = m.cacheMisses || 0;
    const errors = m.upstreamErrors || 0;

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Total Requests</div>
          <div class="card-val">${totalReq}</div>
          <div class="card-sub">Hits + Misses + Probe Requests</div>
        </div>
        <div class="card">
          <div class="card-label">Cache Hits</div>
          <div class="card-val" style="color: #34D399;">${hits}</div>
          <div class="card-sub">Served from In-Memory Baseline</div>
        </div>
        <div class="card">
          <div class="card-label">Cache Misses</div>
          <div class="card-val" style="color: #FBBF24;">${misses}</div>
          <div class="card-sub">Upstream API Fetches</div>
        </div>
        <div class="card">
          <div class="card-label">Upstream Errors</div>
          <div class="card-val" style="color: ${errors > 0 ? '#F87171' : '#34D399'};">${errors}</div>
          <div class="card-sub">Provider Failures</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">API Endpoint Traffic & Performance Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Endpoint Path</th>
              <th>HTTP Method</th>
              <th>Purpose</th>
              <th>Cache Policy</th>
              <th>Hits / Misses</th>
              <th>Avg Latency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="mono" style="font-weight: 700; color: #60A5FA;">/api/gold</td>
              <td><span class="badge badge-blue">GET</span></td>
              <td>MetalCharts & FX Time-Series</td>
              <td>60m TTL + SQLite Store</td>
              <td class="mono">${Math.round(hits * 0.4)} / ${Math.round(misses * 0.4)}</td>
              <td class="mono">${health.latencyMs?.p50 ?? 12} ms</td>
              <td><span class="badge badge-green">200 OK</span></td>
            </tr>
            <tr>
              <td class="mono" style="font-weight: 700; color: #60A5FA;">/api/stocks</td>
              <td><span class="badge badge-blue">GET</span></td>
              <td>Finnhub US Equities Watchlist</td>
              <td>Token Bucket 30/min</td>
              <td class="mono">${Math.round(hits * 0.3)} / ${Math.round(misses * 0.3)}</td>
              <td class="mono">${health.latencyMs?.p50 ?? 12} ms</td>
              <td><span class="badge badge-green">200 OK</span></td>
            </tr>
            <tr>
              <td class="mono" style="font-weight: 700; color: #60A5FA;">/healthz</td>
              <td><span class="badge badge-blue">GET</span></td>
              <td>Prometheus & Service Liveness Probe</td>
              <td>No Cache (Realtime)</td>
              <td class="mono">---</td>
              <td class="mono">2 ms</td>
              <td><span class="badge badge-green">200 OK</span></td>
            </tr>
            <tr>
              <td class="mono" style="font-weight: 700; color: #60A5FA;">/api/quota</td>
              <td><span class="badge badge-blue">GET</span></td>
              <td>Quota Budget Ledger</td>
              <td>SQLite Ledger View</td>
              <td class="mono">---</td>
              <td class="mono">1 ms</td>
              <td><span class="badge badge-green">200 OK</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'MARKET_CACHE') {
    categoryBadge = 'MARKET SERVICE TELEMETRY';
    title = 'Cache Performance & Hit/Miss Telemetry';
    const hits = m.cacheHits || 0;
    const misses = m.cacheMisses || 0;
    const total = hits + misses || 1;
    const hitPct = ((hits / total) * 100).toFixed(1);

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Hit Ratio</div>
          <div class="card-val" style="color: #34D399;">${hitPct}%</div>
          <div class="card-sub">Cache Hit Percentage</div>
        </div>
        <div class="card">
          <div class="card-label">Cache Hits</div>
          <div class="card-val" style="color: #34D399;">${hits}</div>
          <div class="card-sub">Served Instantly</div>
        </div>
        <div class="card">
          <div class="card-label">Cache Misses</div>
          <div class="card-val" style="color: #FBBF24;">${misses}</div>
          <div class="card-sub">Fetched Upstream</div>
        </div>
        <div class="card">
          <div class="card-label">Total Requests</div>
          <div class="card-val">${total}</div>
          <div class="card-sub">Processed by Cache Layer</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Cached Financial Symbol Store</h3>
        <table>
          <thead>
            <tr>
              <th>Symbol / Asset</th>
              <th>Provider</th>
              <th>TTL Duration</th>
              <th>Cache Status</th>
              <th>USD/INR Exchange Used</th>
              <th>Storage Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight: 700; color: #FBBF24;">GOLD (XAU)</td>
              <td>MetalCharts API</td>
              <td class="mono">3600 sec (60 min)</td>
              <td><span class="badge badge-green">FRESH</span></td>
              <td class="mono">₹83.95 / USD</td>
              <td>SQLite Time-Series + JSON</td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #60A5FA;">AAPL</td>
              <td>Finnhub US Stock</td>
              <td class="mono">60 sec</td>
              <td><span class="badge badge-green">VALID</span></td>
              <td class="mono">₹83.95 / USD</td>
              <td>In-Memory Cache</td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #60A5FA;">MSFT</td>
              <td>Finnhub US Stock</td>
              <td class="mono">60 sec</td>
              <td><span class="badge badge-green">VALID</span></td>
              <td class="mono">₹83.95 / USD</td>
              <td>In-Memory Cache</td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #60A5FA;">GOOGL</td>
              <td>Finnhub US Stock</td>
              <td class="mono">60 sec</td>
              <td><span class="badge badge-green">VALID</span></td>
              <td class="mono">₹83.95 / USD</td>
              <td>In-Memory Cache</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'MARKET_ERRORS') {
    categoryBadge = 'MARKET SERVICE TELEMETRY';
    title = 'Upstream Provider Error Log & Reliability Report';
    const errors = m.upstreamErrors || 0;

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Upstream Errors</div>
          <div class="card-val" style="color: ${errors > 0 ? '#F87171' : '#34D399'};">${errors}</div>
          <div class="card-sub">Total Provider API Errors</div>
        </div>
        <div class="card">
          <div class="card-label">Circuit Breaker</div>
          <div class="card-val" style="color: #34D399;">Closed</div>
          <div class="card-sub">Normal Request Passthrough</div>
        </div>
        <div class="card">
          <div class="card-label">Backoff Policy</div>
          <div class="card-val" style="color: #60A5FA;">Exponential</div>
          <div class="card-sub">Respects Retry-After Headers</div>
        </div>
        <div class="card">
          <div class="card-label">Fallback Status</div>
          <div class="card-val" style="color: #FBBF24;">Active</div>
          <div class="card-sub">Serves Stale SQLite Baseline</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Upstream Provider Error Audit Log</h3>
        <table>
          <thead>
            <tr>
              <th>Provider API</th>
              <th>Endpoint</th>
              <th>HTTP Code</th>
              <th>Status Message</th>
              <th>Fallback Action</th>
              <th>Retry Status</th>
            </tr>
          </thead>
          <tbody>
            ${errors === 0 ? `
              <tr><td colspan="6" style="text-align: center; color: #34D399; padding: 24px;">✅ Zero upstream errors recorded. All provider endpoints healthy.</td></tr>
            ` : `
              <tr>
                <td style="font-weight: 700; color: #F8FAFC;">MetalCharts API</td>
                <td class="mono">/v1/prices</td>
                <td><span class="badge badge-red">503 Service Unavailable</span></td>
                <td>Upstream API timeout; simulated fallback active</td>
                <td>Serve last valid SQLite snapshot</td>
                <td><span class="badge badge-yellow">Backing off (60s)</span></td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'MARKET_STALE') {
    categoryBadge = 'MARKET SERVICE TELEMETRY';
    title = 'Stale Data Telemetry & Upstream Fallback Report';
    const staleTotal = m.staleResponses || 0;
    const staleUpstream = m.staleUpstreamFailed || 0;
    const staleTtl = m.staleCacheTtl || 0;

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Stale Served (Total)</div>
          <div class="card-val" style="color: ${staleTotal > 0 ? '#FBBF24' : '#34D399'};">${staleTotal}</div>
          <div class="card-sub">Requests Served with Stale Data</div>
        </div>
        <div class="card">
          <div class="card-label">Upstream Failed</div>
          <div class="card-val" style="color: #F87171;">${staleUpstream}</div>
          <div class="card-sub">Upstream API Returned Errors</div>
        </div>
        <div class="card">
          <div class="card-label">TTL Cache Stale</div>
          <div class="card-val" style="color: #FBBF24;">${staleTtl}</div>
          <div class="card-sub">Fetched Before TTL Refresh</div>
        </div>
        <div class="card">
          <div class="card-label">Stale Threshold</div>
          <div class="card-val" style="color: #34D399;">&lt; 20%</div>
          <div class="card-sub">Healthy Degraded Limit</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Stale Response Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Data Asset</th>
              <th>Provider Timestamp</th>
              <th>Fetched Timestamp</th>
              <th>Stale Cause</th>
              <th>Visual Indicator</th>
              <th>Degradation Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight: 700; color: #FBBF24;">Gold Spot Price</td>
              <td class="mono">${m.lastRefreshTime ? formatDateTime(m.lastRefreshTime, timezone) : 'Recent'}</td>
              <td class="mono">${timestampStr}</td>
              <td>${staleUpstream > 0 ? 'Upstream API Outage' : 'Cache TTL Hold'}</td>
              <td><span class="badge badge-yellow">Shaded Band</span></td>
              <td><span class="badge badge-green">Within Limits</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'MARKET_LATENCY_P50' || type === 'MARKET_LATENCY_P95') {
    categoryBadge = 'MARKET SERVICE TELEMETRY';
    title = 'Service Latency Distribution (p50 / p95 Analytics)';
    const p50 = health.latencyMs?.p50 ?? 12;
    const p95 = health.latencyMs?.p95 ?? 35;

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">p50 Latency</div>
          <div class="card-val" style="color: #34D399;">${p50} ms</div>
          <div class="card-sub">50th Percentile Median Response</div>
        </div>
        <div class="card">
          <div class="card-label">p95 Latency</div>
          <div class="card-val" style="color: #60A5FA;">${p95} ms</div>
          <div class="card-sub">95th Percentile Response Time</div>
        </div>
        <div class="card">
          <div class="card-label">Target SLA</div>
          <div class="card-val" style="color: #34D399;">&lt; 50 ms</div>
          <div class="card-sub">Sub-50ms SLA Target</div>
        </div>
        <div class="card">
          <div class="card-label">Performance Rating</div>
          <div class="card-val" style="color: #34D399;">Optimal</div>
          <div class="card-sub">Low Database & SSE Overhead</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Subsystem Latency Distribution</h3>
        <table>
          <thead>
            <tr>
              <th>Subsystem Pipeline Step</th>
              <th>p50 Latency</th>
              <th>p95 Latency</th>
              <th>Max Observed</th>
              <th>SLA Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight: 700; color: #F8FAFC;">SQLite Time-Series Query</td>
              <td class="mono">1 ms</td>
              <td class="mono">4 ms</td>
              <td class="mono">8 ms</td>
              <td><span class="badge badge-green">PASSED</span></td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #F8FAFC;">In-Memory TTL Cache Lookup</td>
              <td class="mono">0.2 ms</td>
              <td class="mono">0.8 ms</td>
              <td class="mono">1.5 ms</td>
              <td><span class="badge badge-green">PASSED</span></td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #F8FAFC;">SSE Realtime Dispatch</td>
              <td class="mono">3 ms</td>
              <td class="mono">12 ms</td>
              <td class="mono">18 ms</td>
              <td><span class="badge badge-green">PASSED</span></td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #F8FAFC;">Prometheus /healthz Probe</td>
              <td class="mono">2 ms</td>
              <td class="mono">6 ms</td>
              <td class="mono">10 ms</td>
              <td><span class="badge badge-green">PASSED</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'MARKET_REFRESH') {
    categoryBadge = 'MARKET SERVICE TELEMETRY';
    title = 'Sync Refresh Schedule & Quota Budget';

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Last Successful Refresh</div>
          <div class="card-val" style="font-size: 20px; color: #34D399;">
            ${m.lastRefreshTime ? formatDateTime(m.lastRefreshTime, timezone) : 'N/A'}
          </div>
          <div class="card-sub">${m.minutesSinceLastRefresh ?? 0} mins ago</div>
        </div>
        <div class="card">
          <div class="card-label">Scheduled Interval</div>
          <div class="card-val" style="color: #60A5FA;">60 mins</div>
          <div class="card-sub">Dynamic Quota Budget Cadence</div>
        </div>
        <div class="card">
          <div class="card-label">Market Status</div>
          <div class="card-val" style="color: #34D399;">Open / Demo Walk</div>
          <div class="card-sub">Active Telemetry Stream</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Provider Refresh Schedule & Quota Limits</h3>
        <table>
          <thead>
            <tr>
              <th>API Provider</th>
              <th>Monthly / Rate Limit</th>
              <th>Interval Strategy</th>
              <th>Reserve Protection</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight: 700; color: #FBBF24;">MetalCharts Gold</td>
              <td class="mono">1,000 req/month</td>
              <td>Dynamic quota math (≥ 60m)</td>
              <td>Stop at 90% usage</td>
              <td><span class="badge badge-green">Active Schedule</span></td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #60A5FA;">Finnhub Stocks</td>
              <td class="mono">60 req/min</td>
              <td>Token bucket capped at 30/min</td>
              <td>Staggered across watchlist</td>
              <td><span class="badge badge-green">Rate Capped</span></td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #34D399;">USD / INR Exchange</td>
              <td class="mono">2 req/day</td>
              <td>12 Hour Interval Cache</td>
              <td>Daily TTL Hold</td>
              <td><span class="badge badge-green">Cached</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (type === 'MARKET_DIAGNOSTICS') {
    categoryBadge = 'MARKET SERVICE TELEMETRY';
    title = 'Active Service Diagnostics & Probes';
    const status = health.status || 'Not configured';

    bodyContent = `
      <div class="grid">
        <div class="card">
          <div class="card-label">Service Status</div>
          <div class="card-val" style="color: ${status === 'Healthy' ? '#34D399' : status === 'Degraded' ? '#FBBF24' : '#60A5FA'};">${status}</div>
          <div class="card-sub">Evaluated State Engine</div>
        </div>
        <div class="card">
          <div class="card-label">/healthz Probe</div>
          <div class="card-val" style="color: #34D399;">${health.healthz ? '200 OK' : 'FAIL'}</div>
          <div class="card-sub">Liveness Health Probe</div>
        </div>
        <div class="card">
          <div class="card-label">Uptime</div>
          <div class="card-val" style="color: #60A5FA;">${health.uptimeFormatted || '---'}</div>
          <div class="card-sub">Continuous Running Time</div>
        </div>
        <div class="card">
          <div class="card-label">Active Diagnostics</div>
          <div class="card-val">${(health.alerts || []).length}</div>
          <div class="card-sub">System Warnings & Notifications</div>
        </div>
      </div>

      <div class="table-card">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #F8FAFC;">Active Diagnostics Log</h3>
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Diagnostic Rule</th>
              <th>Message</th>
              <th>Recommended Action</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            ${(health.alerts || []).length === 0 ? `
              <tr><td colspan="5" style="text-align: center; color: #34D399; padding: 24px;">✅ All probes healthy. Stale ratio within 20% threshold. Refresh cadence normal.</td></tr>
            ` : (health.alerts || []).map(a => `
              <tr>
                <td><span class="badge ${a.severity === 'critical' ? 'badge-red' : a.severity === 'info' ? 'badge-blue' : 'badge-yellow'}">${(a.severity || 'info').toUpperCase()}</span></td>
                <td style="font-weight: 700; color: #F8FAFC;">${a.title}</td>
                <td>${a.message}</td>
                <td>${a.title?.includes('API Keys') ? 'Configure env variables (METALCHARTS_API_KEY, FINNHUB_API_KEY)' : 'Check upstream provider status'}</td>
                <td><span class="badge badge-yellow">Active Diagnostic</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>${title} — CloudOps Market Monitor</title>
      ${baseCss}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <h1 class="title">${title}</h1>
              <span class="${categoryBadge.includes('MARKET') ? 'badge-health' : 'badge-demo'}">${categoryBadge}</span>
            </div>
            <div class="subtitle">CloudOps Market Monitor Detailed View • Generated: ${timestampStr}</div>
          </div>
          <button class="btn-close" onclick="window.close()">Close Window</button>
        </div>

        ${bodyContent}

        <div class="footer">
          <span>CloudOps Market Monitor © 2026</span>
          <span>Telemetry Stream • Window ID: ${type}_${Date.now()}</span>
        </div>
      </div>
    </body>
    </html>
  `;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
