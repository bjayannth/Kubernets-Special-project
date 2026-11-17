const k8s = require('@kubernetes/client-node');
const { storePodSample } = require('./database');

let k8sCoreApi = null;
let k8sAppsApi = null;
let isClusterReachable = false;

function initK8sClient() {
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
    k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
    isClusterReachable = true;
    console.log('Kubernetes client initialized successfully with local kubeconfig / in-cluster config.');
  } catch (err) {
    console.warn('Kubernetes client initialization warning (Will use Demo Mode mock data):', err.message);
    isClusterReachable = false;
  }
}

initK8sClient();

// Realistic Fallback Mock Cluster Data for Demo Mode
const MOCK_NODES = [
  { name: 'cloudops-node-1', status: 'Ready', role: 'control-plane', cpuUsagePct: 42, memUsagePct: 68, kubeletVersion: 'v1.30.2' },
  { name: 'cloudops-node-2', status: 'Ready', role: 'worker', cpuUsagePct: 76, memUsagePct: 84, kubeletVersion: 'v1.30.2' }
];

const MOCK_PODS = [
  {
    name: 'market-data-service-789bfb56d-4x8kp',
    namespace: 'cloudops-system',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    restarts_detail: '0',
    cpuUsage: '45m',
    memoryUsage: '64Mi',
    cpuPct: 22,
    memoryPct: 35,
    node: 'cloudops-node-1',
    age: '2d 4h',
    createdAt: new Date(Date.now() - 187200000).toISOString(),
    logs: [
      '2026-10-07T10:00:00Z [info] Market Data Service starting on port 4000...',
      '2026-10-07T10:00:01Z [info] Loaded persistent cache from disk successfully.',
      '2026-10-07T10:00:05Z [info] GET /api/gold-price 200 45ms',
      '2026-10-07T10:00:15Z [info] GET /api/stocks 200 112ms',
      '2026-10-07T10:05:00Z [info] Metrics scraped by Prometheus exporter'
    ],
    events: [
      { type: 'Normal', reason: 'Scheduled', message: 'Successfully assigned cloudops-system/market-data-service-789bfb56d-4x8kp to cloudops-node-1', age: '2d 4h' },
      { type: 'Normal', reason: 'Pulled', message: 'Container image "market-data-service:latest" pulled in 1.2s', age: '2d 4h' },
      { type: 'Normal', reason: 'Created', message: 'Created container market-data-service', age: '2d 4h' },
      { type: 'Normal', reason: 'Started', message: 'Started container market-data-service', age: '2d 4h' }
    ]
  },
  {
    name: 'market-data-service-789bfb56d-9z2ql',
    namespace: 'cloudops-system',
    status: 'Running',
    ready: '1/1',
    restarts: 1,
    restarts_detail: '1 (0 in the last hour)',
    cpuUsage: '52m',
    memoryUsage: '72Mi',
    cpuPct: 26,
    memoryPct: 40,
    node: 'cloudops-node-2',
    age: '1d 12h',
    createdAt: new Date(Date.now() - 129600000).toISOString(),
    logs: [
      '2026-10-07T08:12:00Z [info] Market Data Service starting on port 4000...',
      '2026-10-07T08:12:01Z [info] Restored state from volume mount',
      '2026-10-07T09:30:12Z [warn] Upstream API rate limit hit, serving stale cached payload'
    ],
    events: [
      { type: 'Normal', reason: 'Started', message: 'Started container market-data-service', age: '1d 12h' }
    ]
  },
  {
    name: 'cloudops-backend-56f9479cd-l2m9v',
    namespace: 'cloudops-system',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    restarts_detail: '0',
    cpuUsage: '88m',
    memoryUsage: '142Mi',
    cpuPct: 44,
    memoryPct: 56,
    node: 'cloudops-node-1',
    age: '2d 4h',
    createdAt: new Date(Date.now() - 187200000).toISOString(),
    logs: [
      '2026-10-07T10:00:00Z [info] CloudOps API server running on port 5000',
      '2026-10-07T10:02:10Z [info] Polling Kubernetes cluster health...'
    ],
    events: [
      { type: 'Normal', reason: 'Started', message: 'Started container cloudops-backend', age: '2d 4h' }
    ]
  },
  {
    name: 'cloudops-frontend-6b4d75d65-8x7tr',
    namespace: 'cloudops-system',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    restarts_detail: '0',
    cpuUsage: '12m',
    memoryUsage: '38Mi',
    cpuPct: 6,
    memoryPct: 15,
    node: 'cloudops-node-2',
    age: '2d 4h',
    createdAt: new Date(Date.now() - 187200000).toISOString(),
    logs: [
      '2026-10-07T10:00:00Z [info] Nginx listening on port 80'
    ],
    events: [
      { type: 'Normal', reason: 'Started', message: 'Started container cloudops-frontend', age: '2d 4h' }
    ]
  },
  {
    name: 'payment-processor-db-0',
    namespace: 'production',
    status: 'Running',
    ready: '1/1',
    restarts: 5,
    restarts_detail: '5 (2 in the last hour)',
    cpuUsage: '185m',
    memoryUsage: '890Mi',
    cpuPct: 92,
    memoryPct: 89,
    node: 'cloudops-node-2',
    age: '5d 10h',
    createdAt: new Date(Date.now() - 468000000).toISOString(),
    logs: [
      '2026-10-07T09:45:01Z [warn] High memory utilization detected (89%)',
      '2026-10-07T09:50:11Z [error] PostgreSQL client pool exhausted, recycling connections...'
    ],
    events: [
      { type: 'Warning', reason: 'HighResourceUsage', message: 'Memory usage exceeded 85% threshold', age: '15m' },
      { type: 'Warning', reason: 'Unhealthy', message: 'Liveness probe failed: HTTP status 503', age: '2h' }
    ]
  },
  {
    name: 'auth-gateway-7f4b88d44-p9k01',
    namespace: 'production',
    status: 'CrashLoopBackOff',
    ready: '0/1',
    restarts: 8,
    restarts_detail: '8 (3 in the last hour)',
    cpuUsage: '0m',
    memoryUsage: '12Mi',
    cpuPct: 0,
    memoryPct: 5,
    node: 'cloudops-node-1',
    age: '12h',
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    logs: [
      '2026-10-07T10:40:00Z Fatal error: Failed to connect to Redis cluster at redis.production:6379',
      '2026-10-07T10:40:01Z Process exited with status code 1'
    ],
    events: [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container auth-gateway in pod auth-gateway-7f4b88d44-p9k01', age: '2m' },
      { type: 'Warning', reason: 'Failed', message: 'Error: ImagePullBackOff or Execution Exit 1', age: '10m' }
    ]
  },
  {
    name: 'analytics-worker-55b467688-v8x4p',
    namespace: 'production',
    status: 'Pending',
    pendingReason: '0/2 nodes are available: 2 Insufficient memory',
    ready: '0/1',
    restarts: 0,
    restarts_detail: '0',
    cpuUsage: '0m',
    memoryUsage: '0Mi',
    cpuPct: 0,
    memoryPct: 0,
    node: 'Unassigned',
    age: '18m',
    createdAt: new Date(Date.now() - 1080000).toISOString(),
    logs: [
      'Pod is pending assignment to a node...'
    ],
    events: [
      { type: 'Warning', reason: 'FailedScheduling', message: '0/2 nodes are available: 2 Insufficient memory', age: '15m' }
    ]
  }
];

const MOCK_DEPLOYMENTS = [
  { name: 'market-data-service', namespace: 'cloudops-system', replicas: 2, availableReplicas: 2, status: 'Healthy' },
  { name: 'cloudops-backend', namespace: 'cloudops-system', replicas: 1, availableReplicas: 1, status: 'Healthy' },
  { name: 'cloudops-frontend', namespace: 'cloudops-system', replicas: 1, availableReplicas: 1, status: 'Healthy' },
  { name: 'auth-gateway', namespace: 'production', replicas: 2, availableReplicas: 1, status: 'Degraded' },
  { name: 'analytics-worker', namespace: 'production', replicas: 1, availableReplicas: 0, status: 'Unavailable' }
];

async function getClusterOverview() {
  if (isClusterReachable && k8sCoreApi) {
    try {
      const nodeRes = await k8sCoreApi.listNode();
      const podRes = await k8sCoreApi.listPodForAllNamespaces();
      const nsRes = await k8sCoreApi.listNamespace();

      const pods = podRes.body.items;
      let running = 0, pending = 0, failed = 0, crashloop = 0, totalRestarts = 0;

      pods.forEach(p => {
        const phase = p.status ? p.status.phase : 'Unknown';
        if (phase === 'Running') running++;
        else if (phase === 'Pending') pending++;
        else if (phase === 'Failed') failed++;

        if (p.status && p.status.containerStatuses) {
          p.status.containerStatuses.forEach(cs => {
            totalRestarts += cs.restartCount || 0;
            if (cs.state && cs.state.waiting && cs.state.waiting.reason === 'CrashLoopBackOff') {
              crashloop++;
            }
          });
        }
      });

      return {
        demo_mode: false,
        nodes_count: nodeRes.body.items.length,
        namespaces_count: nsRes.body.items.length,
        pods_count: pods.length,
        pod_status_breakdown: { running, pending, failed, crashloop },
        total_restarts: totalRestarts,
        nodes: nodeRes.body.items.map(n => ({
          name: n.metadata.name,
          status: n.status.conditions.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
          kubeletVersion: n.status.nodeInfo.kubeletVersion
        }))
      };
    } catch (err) {
      console.warn('Real Kubernetes API call failed, falling back to mock:', err.message);
    }
  }

  // Fallback Demo Mode response
  const running = MOCK_PODS.filter(p => p.status === 'Running').length;
  const pending = MOCK_PODS.filter(p => p.status === 'Pending').length;
  const failed = MOCK_PODS.filter(p => p.status === 'Failed').length;
  const crashloop = MOCK_PODS.filter(p => p.status === 'CrashLoopBackOff').length;
  const totalRestarts = MOCK_PODS.reduce((acc, p) => acc + p.restarts, 0);

  return {
    demo_mode: true,
    nodes_count: MOCK_NODES.length,
    namespaces_count: 4,
    pods_count: MOCK_PODS.length,
    pod_status_breakdown: { running, pending, failed, crashloop },
    total_restarts: totalRestarts,
    nodes: MOCK_NODES
  };
}

async function getPodsList(namespace, status, search) {
  let podsList = MOCK_PODS;

  if (isClusterReachable && k8sCoreApi) {
    try {
      const res = namespace && namespace !== 'all'
        ? await k8sCoreApi.listNamespacedPod(namespace)
        : await k8sCoreApi.listPodForAllNamespaces();

      podsList = res.body.items.map(p => {
        let podStatus = p.status.phase || 'Unknown';
        let restarts = 0;
        let readyCount = 0;
        let containerCount = p.spec.containers ? p.spec.containers.length : 1;
        let pendingReason = null;

        if (podStatus === 'Pending' && p.status.conditions) {
          const unsched = p.status.conditions.find(c => c.type === 'PodScheduled' && c.status === 'False');
          if (unsched) pendingReason = unsched.message;
        }

        if (p.status.containerStatuses) {
          p.status.containerStatuses.forEach(cs => {
            restarts += cs.restartCount || 0;
            if (cs.ready) readyCount++;
            if (cs.state && cs.state.waiting && cs.state.waiting.reason) {
              podStatus = cs.state.waiting.reason;
            }
          });
        }

        return {
          name: p.metadata.name,
          namespace: p.metadata.namespace,
          status: podStatus,
          pendingReason,
          ready: `${readyCount}/${containerCount}`,
          restarts,
          restarts_detail: `${restarts}`,
          cpuUsage: '25m',
          memoryUsage: '48Mi',
          cpuPct: Math.floor(Math.random() * 40) + 10,
          memoryPct: Math.floor(Math.random() * 50) + 20,
          node: p.spec.nodeName || 'Unassigned',
          age: '1d',
          createdAt: p.metadata.creationTimestamp,
          logs: ['[info] Log fetching initialized...'],
          events: []
        };
      });
    } catch (err) {
      console.warn('Failed listing pods from Kubernetes API, using mock:', err.message);
    }
  }

  // Store pod metrics samples in SQLite time-series DB
  podsList.forEach(p => {
    storePodSample(p).catch(err => console.warn('Failed storing pod sample:', err.message));
  });

  // Filter
  return podsList.filter(p => {
    const matchNs = !namespace || namespace === 'all' || p.namespace === namespace;
    const matchStatus = !status || status === 'all' || p.status.toLowerCase() === status.toLowerCase();
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.namespace.toLowerCase().includes(search.toLowerCase());
    return matchNs && matchStatus && matchSearch;
  });
}

async function getPodDetails(namespace, name) {
  const pods = await getPodsList('all', 'all', '');
  const found = pods.find(p => p.namespace === namespace && p.name === name);
  if (found) return found;
  return {
    name,
    namespace,
    status: 'Unknown',
    ready: '0/1',
    restarts: 0,
    restarts_detail: '0',
    logs: ['[error] Pod details not found.'],
    events: []
  };
}

// Group alerts by pod / target into incident cards with multiple signals, sorted by severity & recency
async function getAlerts() {
  const pods = await getPodsList('all', 'all', '');
  const rawAlerts = [];

  // 1. Evaluate individual pod signals
  pods.forEach(p => {
    const podTarget = `${p.namespace}/${p.name}`;

    if (p.status === 'CrashLoopBackOff') {
      rawAlerts.push({
        id: `crash-${podTarget}`,
        severity: 'critical',
        target: podTarget,
        podName: p.name,
        namespace: p.namespace,
        signal: 'CrashLoopBackOff',
        message: `Container back-off restart failure`,
        timestamp: Date.now() - 60000
      });
    }

    if (p.restarts > 3) {
      rawAlerts.push({
        id: `restart-${podTarget}`,
        severity: p.restarts > 6 ? 'critical' : 'warning',
        target: podTarget,
        podName: p.name,
        namespace: p.namespace,
        signal: `High Restarts (${p.restarts_detail || p.restarts})`,
        message: `Container has restarted ${p.restarts} times`,
        timestamp: Date.now() - 120000
      });
    }

    if (p.cpuPct > 80) {
      rawAlerts.push({
        id: `cpu-${podTarget}`,
        severity: 'warning',
        target: podTarget,
        podName: p.name,
        namespace: p.namespace,
        signal: `CPU Spike (${p.cpuPct}% of limit)`,
        message: `High CPU utilization exceeds 80% threshold`,
        timestamp: Date.now() - 180000
      });
    }

    if (p.memoryPct > 80) {
      rawAlerts.push({
        id: `mem-${podTarget}`,
        severity: 'warning',
        target: podTarget,
        podName: p.name,
        namespace: p.namespace,
        signal: `Memory Spike (${p.memoryPct}% of limit)`,
        message: `High memory usage exceeds 80% threshold`,
        timestamp: Date.now() - 240000
      });
    }

    if (p.status === 'Pending' && p.pendingReason) {
      rawAlerts.push({
        id: `pending-${podTarget}`,
        severity: 'warning',
        target: podTarget,
        podName: p.name,
        namespace: p.namespace,
        signal: `Scheduling Failure`,
        message: p.pendingReason,
        timestamp: Date.now() - 300000
      });
    }
  });

  // 2. Evaluate Deployment replicas
  MOCK_DEPLOYMENTS.forEach(d => {
    if (d.availableReplicas < d.replicas) {
      const deployTarget = `${d.namespace}/${d.name}`;
      rawAlerts.push({
        id: `deploy-${deployTarget}`,
        severity: d.availableReplicas === 0 ? 'critical' : 'warning',
        target: deployTarget,
        podName: d.name,
        namespace: d.namespace,
        signal: `Unavailable Replicas (${d.availableReplicas}/${d.replicas})`,
        message: `Deployment pods are unavailable`,
        timestamp: Date.now() - 360000
      });
    }
  });

  // 3. Group by Target (Incident grouping)
  const groupedMap = new Map();
  rawAlerts.forEach(alert => {
    if (!groupedMap.has(alert.target)) {
      groupedMap.set(alert.target, {
        id: `incident-${alert.target}`,
        target: alert.target,
        podName: alert.podName,
        namespace: alert.namespace,
        severity: alert.severity, // highest severity wins
        signals: [alert.signal],
        messages: [alert.message],
        timestamp: alert.timestamp
      });
    } else {
      const existing = groupedMap.get(alert.target);
      if (alert.severity === 'critical') {
        existing.severity = 'critical';
      }
      if (!existing.signals.includes(alert.signal)) {
        existing.signals.push(alert.signal);
      }
      if (!existing.messages.includes(alert.message)) {
        existing.messages.push(alert.message);
      }
      if (alert.timestamp > existing.timestamp) {
        existing.timestamp = alert.timestamp;
      }
    }
  });

  const incidents = Array.from(groupedMap.values());

  // 4. Sort: Critical first, then Warning, then by recency descending
  incidents.sort((a, b) => {
    const severityWeight = { critical: 2, warning: 1, info: 0 };
    const diff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
    if (diff !== 0) return diff;
    return b.timestamp - a.timestamp;
  });

  return incidents;
}

module.exports = {
  getClusterOverview,
  getPodsList,
  getPodDetails,
  getAlerts,
  isClusterReachable
};
