'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api-client';
import { DATE_PRESETS, dateRangeForPreset, previousPeriod, toISODate } from '../lib/date-presets';

const DASHBOARD_DEFAULT_DATE_PRESET = 'this_month';

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const STATUS_COLORS = {
  PENDING: '#b47a1a',
  RETURN_REQUESTED: '#b47a1a',
  CONFIRMED: '#5570d7',
  PROCESSING: '#5570d7',
  SHIPPED: '#2d83b8',
  OUT_FOR_DELIVERY: '#2d83b8',
  DELIVERED: '#2d9b5b',
  CANCELLED: '#c95b69',
  RETURNED: '#c95b69',
  FAILED: '#c95b69',
  OTHER: '#8793a7',
};

const STATUS_ICONS = {
  PENDING: '•', RETURN_REQUESTED: '↺', CONFIRMED: '•', PROCESSING: '•',
  SHIPPED: '→', OUT_FOR_DELIVERY: '→', DELIVERED: '✓', CANCELLED: '✕',
  RETURNED: '↺', FAILED: '✕', OTHER: '•',
};

const BRAND_HUE = '#6178ed';

function formatMoney(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value ?? 0));
}
function formatCompact(value) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value ?? 0));
}
function formatCompactMoney(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value ?? 0));
}
function formatShortDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function fillDailySeries(rows, dateFrom, dateTo) {
  const map = new Map((rows ?? []).map((row) => [toISODate(new Date(row.day)), row]));
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const days = [];
  for (let cursor = new Date(start); cursor <= end && days.length < 400; cursor.setDate(cursor.getDate() + 1)) {
    const iso = toISODate(cursor);
    const row = map.get(iso);
    days.push({ day: iso, revenue: Number(row?.revenue ?? 0), count: Number(row?.count ?? 0) });
  }
  return days;
}

function niceMax(value) {
  if (!value || value <= 0) return 10;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * base) return step * base;
  }
  return 10 * base;
}

function delta(current, previous) {
  const curr = Number(current ?? 0);
  const prev = Number(previous ?? 0);
  if (prev === 0) return curr > 0 ? { kind: 'new' } : { kind: 'flat' };
  const pct = ((curr - prev) / prev) * 100;
  return { kind: pct >= 0 ? 'up' : 'down', pct };
}

export default function DashboardContent({ tenant }) {
  const [datePreset, setDatePreset] = useState(DASHBOARD_DEFAULT_DATE_PRESET);
  const [range, setRange] = useState(() => dateRangeForPreset(DASHBOARD_DEFAULT_DATE_PRESET));
  const [report, setReport] = useState(null);
  const [previousReport, setPreviousReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoverIndex, setHoverIndex] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const prevRange = previousPeriod(range.dateFrom, range.dateTo);
    Promise.all([api.getReports(range), api.getReports(prevRange)])
      .then(([current, previous]) => {
        if (!active) return;
        setReport(unwrap(current));
        setPreviousReport(unwrap(previous));
        setError('');
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load dashboard metrics.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  function updateDatePreset(key) {
    setDatePreset(key);
    const computed = dateRangeForPreset(key);
    if (computed) setRange(computed);
  }

  const series = useMemo(() => report ? fillDailySeries(report.ordersByDay, range.dateFrom, range.dateTo) : [], [report, range]);
  const statusRows = useMemo(() => {
    if (!report) return [];
    const sorted = [...(report.ordersByStatus ?? [])].filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
    if (sorted.length <= 7) return sorted;
    const head = sorted.slice(0, 7);
    const tail = sorted.slice(7);
    return [...head, { status: 'OTHER', count: tail.reduce((sum, row) => sum + row.count, 0), revenue: tail.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0) }];
  }, [report]);
  const cityRows = useMemo(() => [...(report?.ordersByCity ?? [])].sort((a, b) => b.count - a.count).slice(0, 5), [report]);

  const kpis = report ? [
    { key: 'revenue', icon: '$', title: 'Revenue', value: formatMoney(report.revenue), change: delta(report.revenue, previousReport?.revenue) },
    { key: 'orders', icon: '▤', title: 'Orders', value: formatCompact(report.orderCount), change: delta(report.orderCount, previousReport?.orderCount) },
    { key: 'aov', icon: '◷', title: 'Avg order value', value: formatMoney(report.averageOrderValue), change: delta(report.averageOrderValue, previousReport?.averageOrderValue) },
    { key: 'new', icon: '＋', title: 'New customers', value: formatCompact(report.newCustomers), change: delta(report.newCustomers, previousReport?.newCustomers) },
    { key: 'returning', icon: '↻', title: 'Returning customers', value: formatCompact(report.returningCustomers), change: delta(report.returningCustomers, previousReport?.returningCustomers) },
  ] : [];

  const rangeLabel = range.dateFrom === range.dateTo
    ? formatShortDate(range.dateFrom)
    : `${formatShortDate(range.dateFrom)} – ${formatShortDate(range.dateTo)}`;

  return (
    <>
      <div className="dashboard-toolbar">
        <select aria-label="Filter dashboard by date range" value={datePreset} onChange={(event) => updateDatePreset(event.target.value)}>
          {DATE_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
        </select>
        {datePreset === 'custom' && (
          <>
            <input aria-label="Dashboard from date" type="date" value={range.dateFrom} onChange={(event) => setRange((current) => ({ ...current, dateFrom: event.target.value }))} />
            <input aria-label="Dashboard to date" type="date" value={range.dateTo} onChange={(event) => setRange((current) => ({ ...current, dateTo: event.target.value }))} />
          </>
        )}
        <span className="dashboard-range-label">{rangeLabel}</span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className={`dashboard-fade ${loading ? 'is-loading' : ''}`}>
        <div className="stat-grid dashboard-kpi-grid">
          {(report ? kpis : Array.from({ length: 5 })).map((kpi, index) => <KpiCard key={kpi?.key ?? index} kpi={kpi} />)}
        </div>

        <div className="dashboard-chart-grid">
          <section className="panel chart-panel">
            <div className="panel-title"><div><h2>Revenue trend</h2><p>Daily revenue across the selected period.</p></div></div>
            <RevenueTrendChart data={series} hoverIndex={hoverIndex} onHover={setHoverIndex} />
          </section>
          <section className="panel chart-panel">
            <div className="panel-title"><div><h2>Orders by status</h2><p>Where orders stand right now.</p></div></div>
            <StatusBreakdownChart rows={statusRows} />
          </section>
        </div>

        <div className="dashboard-chart-grid">
          <section className="panel">
            <div className="panel-title"><div><h2>Top cities</h2><p>Highest order volume by destination city.</p></div></div>
            <TopCitiesList rows={cityRows} />
          </section>
          <div className="panel-grid-stack">
            <div className="panel">
              <div className="panel-title"><div><h2>Getting started</h2><p>Set up your workspace for daily operations.</p></div><span className="panel-badge">Phase 1</span></div>
              <div className="check-row"><span className="check done">✓</span><div><strong>Workspace created</strong><small>{tenant.name} is ready to configure.</small></div></div>
              <div className="check-row"><span className="check">2</span><div><strong>Connect an integration</strong><small>Bring orders and customers into one place.</small></div><Link href="/integrations" className="text-link">View integrations →</Link></div>
              <div className="check-row"><span className="check">3</span><div><strong>Invite your team</strong><small>Give operators the right access.</small></div><Link href="/settings" className="text-link">Manage settings →</Link></div>
            </div>
            <div className="panel quick-panel">
              <h2>Quick actions</h2>
              <Link href="/orders" className="quick-action"><span>＋</span><div><strong>View orders</strong><small>Review operational order activity</small></div><b>→</b></Link>
              <Link href="/integrations" className="quick-action"><span>◈</span><div><strong>Manage integrations</strong><small>Connect a commerce platform</small></div><b>→</b></Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function KpiCard({ kpi }) {
  if (!kpi) return <div className="stat-card kpi-card kpi-card-skeleton" />;
  const change = kpi.change;
  const changeClass = change.kind === 'up' ? 'kpi-delta-up' : change.kind === 'down' ? 'kpi-delta-down' : 'kpi-delta-flat';
  const changeText = change.kind === 'up' ? `+${change.pct.toFixed(1)}%` : change.kind === 'down' ? `${change.pct.toFixed(1)}%` : change.kind === 'new' ? 'New' : '—';
  return (
    <div className="stat-card kpi-card">
      <div className="kpi-card-head">
        <span className="kpi-icon">{kpi.icon}</span>
        <span className={`kpi-delta ${changeClass}`}>{changeText}</span>
      </div>
      <strong>{kpi.value}</strong>
      <span>{kpi.title}</span>
      <small>vs previous period</small>
    </div>
  );
}

function RevenueTrendChart({ data, hoverIndex, onHover }) {
  const width = 760;
  const height = 230;
  const padding = { top: 20, right: 16, bottom: 28, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (!data.length) {
    return <div className="chart-empty">No orders in this period yet.</div>;
  }

  const maxRevenue = Math.max(...data.map((point) => point.revenue), 0);
  const yMax = niceMax(maxRevenue * 1.05);
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const pointX = (index) => padding.left + index * xStep;
  const pointY = (value) => padding.top + plotHeight - (yMax ? (value / yMax) * plotHeight : 0);
  const baselineY = padding.top + plotHeight;

  const linePath = data.map((point, index) => `${index === 0 ? 'M' : 'L'}${pointX(index)},${pointY(point.revenue)}`).join(' ');
  const areaPath = `${linePath} L${pointX(data.length - 1)},${baselineY} L${pointX(0)},${baselineY} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => yMax * fraction);
  const lastIndex = data.length - 1;
  const activeIndex = hoverIndex ?? lastIndex;
  const activePoint = data[activeIndex];

  function handlePointerMove(event) {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const x = (event.clientX - rect.left) * scaleX - padding.left;
    const clamped = Math.min(Math.max(x, 0), plotWidth);
    const index = xStep > 0 ? Math.round(clamped / xStep) : 0;
    onHover(Math.min(Math.max(index, 0), lastIndex));
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" onPointerMove={handlePointerMove} onPointerLeave={() => onHover(null)}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={pointY(tick)} y2={pointY(tick)} className="chart-gridline" />
            <text x={padding.left - 8} y={pointY(tick)} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">{formatCompactMoney(tick)}</text>
          </g>
        ))}
        <path d={areaPath} fill={BRAND_HUE} opacity="0.1" stroke="none" />
        <path d={linePath} fill="none" stroke={BRAND_HUE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hoverIndex != null && (
          <line x1={pointX(hoverIndex)} x2={pointX(hoverIndex)} y1={padding.top} y2={baselineY} className="chart-crosshair" />
        )}
        <circle cx={pointX(activeIndex)} cy={pointY(activePoint.revenue)} r="5" fill={BRAND_HUE} stroke="#fff" strokeWidth="2" />
        <text x={padding.left} y={height - 6} className="chart-axis-label">{formatShortDate(data[0].day)}</text>
        <text x={width - padding.right} y={height - 6} textAnchor="end" className="chart-axis-label">{formatShortDate(data[lastIndex].day)}</text>
        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="transparent" onPointerMove={handlePointerMove} onPointerLeave={() => onHover(null)} />
      </svg>
      <div className="chart-tooltip" style={{ left: `${(pointX(activeIndex) / width) * 100}%` }}>
        <strong>{formatMoney(activePoint.revenue)}</strong>
        <span>{formatShortDate(activePoint.day)} · {activePoint.count} order{activePoint.count === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

function StatusBreakdownChart({ rows }) {
  if (!rows.length) return <div className="chart-empty">No orders in this period yet.</div>;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="status-bar-list">
      {rows.map((row) => (
        <div className="status-bar-row" key={row.status}>
          <span className="status-bar-label"><span className="status-bar-icon" style={{ color: STATUS_COLORS[row.status] ?? STATUS_COLORS.OTHER }}>{STATUS_ICONS[row.status] ?? '•'}</span>{row.status === 'OTHER' ? 'Other' : label(row.status)}</span>
          <div className="status-bar-track">
            <div className="status-bar-fill" style={{ width: `${(row.count / maxCount) * 100}%`, background: STATUS_COLORS[row.status] ?? STATUS_COLORS.OTHER }} />
          </div>
          <span className="status-bar-value">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

function TopCitiesList({ rows }) {
  if (!rows.length) return <div className="chart-empty">No orders in this period yet.</div>;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="status-bar-list">
      {rows.map((row) => (
        <div className="status-bar-row" key={row.city}>
          <span className="status-bar-label">{row.city}</span>
          <div className="status-bar-track">
            <div className="status-bar-fill" style={{ width: `${(row.count / maxCount) * 100}%`, background: BRAND_HUE }} />
          </div>
          <span className="status-bar-value">{row.count}</span>
        </div>
      ))}
    </div>
  );
}
