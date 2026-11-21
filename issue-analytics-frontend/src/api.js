// Every function here matches a planned FastAPI endpoint.
// With no VITE_API_URL set, they return demo data so the UI works before the backend exists.
const BASE = import.meta.env.VITE_API_URL || "";
export const USE_MOCK = !BASE;
export const API_LABEL = USE_MOCK ? "Demo data" : BASE;

const DAY = 86400000;
const NOW = Date.now();
const PAGE_SIZE = 10;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
const rand = seeded(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const LABELS = ["bug", "feature", "docs", "question", "performance", "security"];
const AUTHORS = ["asha", "ravi", "meera", "tom", "lena", "kofi", "yuki"];
const TITLES = [
  "Validation error on nested models",
  "Add pagination to list endpoint",
  "Docs: clarify dependency injection",
  "Slow response with large payloads",
  "Support async background tasks",
  "Token refresh fails after expiry",
  "Unexpected 422 on optional field",
  "Improve OpenAPI schema examples",
];

const demoIssues = Array.from({ length: 180 }, (_, i) => {
  const created = NOW - Math.floor(rand() * 120) * DAY;
  const closed = rand() < 0.62 ? Math.min(NOW, created + Math.ceil(rand() * 20) * DAY) : null;
  const labels = LABELS.filter(() => rand() < 0.22).slice(0, 2);
  return {
    number: 1000 + i,
    title: pick(TITLES),
    state: closed ? "closed" : "open",
    author: pick(AUTHORS),
    labels: labels.length ? labels : ["question"],
    created_at: new Date(created).toISOString(),
    closed_at: closed ? new Date(closed).toISOString() : null,
  };
}).sort((a, b) => b.created_at.localeCompare(a.created_at));

let demoSync = { status: "success", finished_at: new Date(NOW - 3600000).toISOString(), records_fetched: demoIssues.length, errors: 0 };

const mock = {
  async summary() {
    await wait(300);
    const closed = demoIssues.filter((i) => i.state === "closed");
    const days = closed.map((i) => (new Date(i.closed_at) - new Date(i.created_at)) / DAY);
    return {
      total: demoIssues.length,
      open: demoIssues.length - closed.length,
      closed: closed.length,
      avg_days_to_close: +(days.reduce((a, b) => a + b, 0) / days.length).toFixed(1),
    };
  },
  async timeseries() {
    await wait(300);
    const weekOf = (iso) => Math.floor((NOW - new Date(iso)) / (7 * DAY));
    return Array.from({ length: 18 }, (_, k) => {
      const w = 17 - k;
      return {
        week: new Date(NOW - w * 7 * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        opened: demoIssues.filter((i) => weekOf(i.created_at) === w).length,
        closed: demoIssues.filter((i) => i.closed_at && weekOf(i.closed_at) === w).length,
      };
    });
  },
  async labels() {
    await wait(200);
    const counts = {};
    demoIssues.forEach((i) => i.labels.forEach((l) => (counts[l] = (counts[l] || 0) + 1)));
    return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  },
  async issues({ state, label, page = 1, q = "" }) {
  await wait(250);
  const t = q.trim().toLowerCase();
  const rows = demoIssues.filter((i) =>
    (!state || i.state === state) && (!label || i.labels.includes(label)) &&
    (!t || i.title.toLowerCase().includes(t) || String(i.number).includes(t)));
 return { total: rows.length, page_size: PAGE_SIZE, items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
  },
    async activity() {
    await wait(200);
    const ev = [];
    demoIssues.slice(0, 3).forEach((i) => ev.push({ text: `#${i.number} opened by ${i.author}`, at: i.created_at, tone: "open" }));
    demoIssues.filter((i) => i.closed_at).slice(0, 3).forEach((i) => ev.push({ text: `#${i.number} closed by ${i.author}`, at: i.closed_at, tone: "closed" }));
    ev.push({ text: `Sync finished with ${demoSync.records_fetched} records`, at: demoSync.finished_at, tone: "closed" });
    return ev.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  },
  async syncStatus() {
    await wait(200);
    return demoSync;
  },
  async runSync(key) {
    await wait(900);
    if (!key) throw new Error("401 Unauthorized");
    demoSync = { status: "success", finished_at: new Date().toISOString(), records_fetched: demoIssues.length, errors: 0 };
    return demoSync;
  },
};

async function http(path, options) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const real = {
  summary: () => http("/summary"),
  timeseries: () => http("/timeseries"),
  labels: () => http("/labels"),
  issues: ({ state, label, page = 1, q = "" } = {}) => {
    const p = new URLSearchParams({ page, page_size: PAGE_SIZE });
    if (state) p.set("state", state);
    if (label) p.set("label", label);
    if (q) p.set("q", q);
    return http(`/issues?${p}`);
  },
  activity: () => http("/activity"),
  syncStatus: () => http("/sync/status"),
  runSync: (key) => http("/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-API-Key": key } : {}),
    },
  }),
};

export const api = USE_MOCK ? mock : real;
