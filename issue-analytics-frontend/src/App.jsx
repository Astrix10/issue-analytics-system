import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api, API_LABEL } from "./api";

const OPEN = "#E8890C";
const CLOSED = "#0B7F72";
const DONUT = ["#1E3A8A", "#0B7F72", "#E8890C", "#94A3B8", "#7C3AED"];
const AXIS = { fontSize: 12, fill: "#5B6678" };
const RING = 2 * Math.PI * 44;

const ICONS = {
  dash: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  sync: "M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4",
  search: "M5 11a6 6 0 1 0 12 0a6 6 0 1 0-12 0M20 20l-4-4",
  open: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12h.01",
  closed: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 12.5l2.7 2.7L16 9.5",
  clock: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2",
  layers: "M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4",
  chart: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  menu: "M4 6h16M4 12h16M4 18h16",
};

const fmt = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}

function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Load({ q, children }) {
  if (q.isLoading) return <p className="note">Loading…</p>;
  if (q.isError) return <p className="note err">Couldn’t load data ({q.error.message}). Check that the API is running.</p>;
  return children(q.data);
}

function IssueRows({ items }) {
  if (items.length === 0) return <p className="note">No issues match. Clear the search or a filter to see more.</p>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr><th>#</th><th>Title</th><th>State</th><th>Label</th><th>Author</th><th>Opened</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.number}>
              <td>{i.number}</td>
              <td>{i.title}</td>
              <td><span className={`b ${i.state}`}>{i.state}</span></td>
              <td>{i.labels.map((l) => <span className="chip" key={l}>{l}</span>)}</td>
              <td>{i.author}</td>
              <td>{fmt(i.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Hero({ go }) {
  const summary = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const sync = useQuery({ queryKey: ["sync"], queryFn: api.syncStatus });
  return (
    <section className="hero">
      <Load q={summary}>
        {(s) => {
          const pct = Math.round((s.closed / s.total) * 100);
          return (
            <>
              <div>
                <h1>Dashboard</h1>
                <p>{s.closed} of {s.total} tracked issues are resolved. Issues take about {s.avg_days_to_close} days to close on average.</p>
                <div className="btns">
                  <button className="btn pri" onClick={() => go("Sync")}>Sync now</button>
                  <button className="btn ghost" onClick={() => go("Issues")}>View open issues</button>
                </div>
              </div>
              <div className="ringbox">
                <svg width="132" height="132" viewBox="0 0 120 120" role="img" aria-label={`${pct} percent of issues resolved`}>
                  <circle cx="60" cy="60" r="44" fill="none" stroke="#2C4A6B" strokeWidth="12" />
                  <circle cx="60" cy="60" r="44" fill="none" stroke="#3DD6C0" strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${(pct / 100) * RING} ${RING}`} transform="rotate(-90 60 60)" />
                  <text x="60" y="62" textAnchor="middle" fontSize="24" fontWeight="700" fill="#fff">{pct}%</text>
                  <text x="60" y="80" textAnchor="middle" fontSize="11" fill="#C7D0E0">resolved</text>
                </svg>
                <div className="last">
                  Last sync<br /><b>{sync.data ? ago(sync.data.finished_at) : "…"}</b><br />
                  {sync.data ? `${sync.data.errors} errors` : ""}
                </div>
              </div>
            </>
          );
        }}
      </Load>
    </section>
  );
}

function Kpis() {
  const q = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  return (
    <Load q={q}>
      {(s) => {
        const items = [
          ["Open issues", s.open, "open", "#FDF0DC", "#8A4208"],
          ["Closed issues", s.closed, "closed", "#DDF3F0", "#0A5C53"],
          ["Average time to close", `${s.avg_days_to_close} days`, "clock", "#E3EAFB", "#1E3A8A"],
          ["Total tracked", s.total, "layers", "#EEF1F6", "#3A465C"],
        ];
        return (
          <section className="kpis" aria-label="Key figures">
            {items.map(([label, value, icon, bg, fg]) => (
              <div className="card kpi" key={label}>
                <span className="ico" style={{ background: bg, color: fg }}><Icon name={icon} size={22} /></span>
                <div><b>{value}</b><span>{label}</span></div>
              </div>
            ))}
          </section>
        );
      }}
    </Load>
  );
}

function WeeklyChart() {
  const q = useQuery({ queryKey: ["series"], queryFn: api.timeseries });
  return (
    <div className="card">
      <div className="hd">
        <h2>Opened and closed per week</h2>
        <div className="lg">
          <span><i style={{ background: OPEN }} />Opened</span>
          <span><i style={{ background: CLOSED }} />Closed</span>
        </div>
      </div>
      <div className="chart">
        <Load q={q}>
          {(d) => (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#E3E8F0" vertical={false} />
                <XAxis dataKey="week" tick={AXIS} interval={2} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="opened" stroke={OPEN} fill={OPEN} fillOpacity={0.14} strokeWidth={2.5} />
                <Area type="monotone" dataKey="closed" stroke={CLOSED} fill={CLOSED} fillOpacity={0.14} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Load>
      </div>
    </div>
  );
}

function LabelDonut() {
  const q = useQuery({ queryKey: ["labels"], queryFn: api.labels });
  return (
    <div className="card">
      <div className="hd"><h2>Issues by label</h2></div>
      <Load q={q}>
        {(d) => {
          const rest = d.slice(4).reduce((a, l) => a + l.count, 0);
          const data = rest ? [...d.slice(0, 4), { label: "other", count: rest }] : d.slice(0, 4);
          const total = data.reduce((a, l) => a + l.count, 0);
          return (
            <div className="donut">
              <div className="donutwrap">
                <ResponsiveContainer width={170} height={170}>
                  <PieChart>
                    <Pie data={data} dataKey="count" nameKey="label" innerRadius={52} outerRadius={76} stroke="none">
                      {data.map((_, i) => <Cell key={i} fill={DONUT[i]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="center"><b>{total}</b><span>labels</span></div>
              </div>
              <div className="keys">
                {data.map((l, i) => (
                  <div key={l.label}>
                    <span><i className="dot" style={{ background: DONUT[i] }} />{l.label}</span>
                    <b>{Math.round((l.count / total) * 100)}%</b>
                  </div>
                ))}
              </div>
            </div>
          );
        }}
      </Load>
    </div>
  );
}

function Activity() {
  const q = useQuery({ queryKey: ["activity"], queryFn: api.activity });
  return (
    <div className="card">
      <div className="hd"><h2>Recent activity</h2></div>
      <Load q={q}>
        {(d) => (
          <ul className="act">
            {d.map((a, i) => (
              <li key={i}><i className={`dot ${a.tone}`} /><div>{a.text}<small>{ago(a.at)}</small></div></li>
            ))}
          </ul>
        )}
      </Load>
    </div>
  );
}

function Dashboard({ go }) {
  const [text, setText] = useState("");
  const recent = useQuery({
    queryKey: ["recent", text],
    queryFn: () => api.issues({ q: text, page: 1 }),
    placeholderData: (prev) => prev,
  });
  return (
    <>
      <Hero go={go} />
      <Kpis />
      <section className="row"><WeeklyChart /><LabelDonut /></section>
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" aria-label="Search issues" placeholder="Search issues by title or number" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <section className="row">
        <div className="card">
          <div className="hd"><h2>Recent issues</h2><button className="btn sm" onClick={() => go("Issues")}>View all</button></div>
          <Load q={recent}>{(d) => <IssueRows items={d.items.slice(0, 6)} />}</Load>
        </div>
        <Activity />
      </section>
    </>
  );
}

function Issues() {
  const [state, setState] = useState("");
  const [label, setLabel] = useState("");
  const [page, setPage] = useState(1);
  const labels = useQuery({ queryKey: ["labels"], queryFn: api.labels });
  const q = useQuery({
    queryKey: ["issues", state, label, page],
    queryFn: () => api.issues({ state, label, page }),
    placeholderData: (prev) => prev,
  });
  const change = (setter) => (e) => { setter(e.target.value); setPage(1); };
  return (
    <section className="card">
      <div className="filters">
        <label>State
          <select value={state} onChange={change(setState)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>Label
          <select value={label} onChange={change(setLabel)}>
            <option value="">All</option>
            {(labels.data || []).map((l) => <option key={l.label} value={l.label}>{l.label}</option>)}
          </select>
        </label>
      </div>
      <Load q={q}>
        {(d) => {
          const pages = Math.max(1, Math.ceil(d.total / d.page_size));
          return (
            <>
              <IssueRows items={d.items} />
              <div className="pager">
                <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page} of {pages} · {d.total} issues</span>
                <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </>
          );
        }}
      </Load>
    </section>
  );
}

function Sync() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const status = useQuery({ queryKey: ["sync"], queryFn: api.syncStatus });
  const run = useMutation({ mutationFn: () => api.runSync(key), onSuccess: () => qc.invalidateQueries() });
  return (
    <section className="card">
      <div className="hd"><h2>Last sync</h2></div>
      <Load q={status}>
        {(s) => (
          <dl className="facts">
            <div><dt>Status</dt><dd>{s.status}</dd></div>
            <div><dt>Finished</dt><dd>{fmt(s.finished_at)}</dd></div>
            <div><dt>Records fetched</dt><dd>{s.records_fetched}</dd></div>
            <div><dt>Errors</dt><dd>{s.errors}</dd></div>
          </dl>
        )}
      </Load>
      <div className="syncbox">
        <label>API key
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Enter key to sync" />
        </label>
        <button className="btn pri dark" disabled={!key || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Syncing…" : "Sync now"}
        </button>
      </div>
      <p className="hint">The key stays in this tab’s memory only and is never saved.</p>
      {run.isError && <p className="note err">Sync failed ({run.error.message}). Check the key and try again.</p>}
      {run.isSuccess && <p className="note">Sync finished.</p>}
    </section>
  );
}

const NAV = [["Dashboard", "Dashboard", "dash"], ["Issues", "Issues", "list"], ["Sync", "Sync status", "sync"]];
const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [open, setOpen] = useState(() => !isMobile());
  const go = (id) => { setPage(id); if (isMobile()) setOpen(false); };
  const pages = { Dashboard: <Dashboard go={go} />, Issues: <Issues />, Sync: <Sync /> };
  const title = NAV.find((n) => n[0] === page)[1];
  return (
    <div className={`app${open ? "" : " collapsed"}`}>
      <aside className="side">
        <div className="brand"><span className="mark"><Icon name="chart" size={18} /></span>Issue Analytics</div>
        <nav className="nav" aria-label="Main">
          {NAV.map(([id, label, icon]) => (
            <button key={id} className={id === page ? "on" : ""} onClick={() => go(id)}><Icon name={icon} />{label}</button>
          ))}
        </nav>
        <div className="src">Source: {API_LABEL}</div>
        <div className="user">
          <span className="av" aria-hidden="true">AV</span>
          <div><b>Asha Verma</b><small>Signed in</small></div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <main className="main">
        <div className="top">
          <button className="menu" aria-label={open ? "Hide sidebar" : "Show sidebar"} aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name="menu" />
          </button>
        </div>
        {page !== "Dashboard" && <h2 className="title">{title}</h2>}
        {pages[page]}
      </main>
    </div>
  );
}