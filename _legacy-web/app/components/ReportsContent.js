'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value ?? 0));

export default function ReportsContent() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', storeId: '' });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try { setReport(unwrap(await api.getReports(filters))); setError(''); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load reports.'); }
  }
  useEffect(() => { load(); }, [filters.dateFrom, filters.dateTo, filters.storeId]);

  return (
    <>
      <div className="orders-toolbar">
        <div className="orders-filters">
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
          <input placeholder="Store ID" value={filters.storeId} onChange={(event) => setFilters({ ...filters, storeId: event.target.value })} />
          <button className="button button-secondary" onClick={() => api.exportCsv('reports', filters)}>Export report CSV</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {report && (
        <>
          <div className="stat-grid">
            <div className="stat-card"><span>Orders</span><strong>{report.orderCount}</strong></div>
            <div className="stat-card"><span>Revenue</span><strong>{money(report.revenue)}</strong></div>
            <div className="stat-card"><span>AOV</span><strong>{money(report.averageOrderValue)}</strong></div>
            <div className="stat-card"><span>New customers</span><strong>{report.newCustomers}</strong></div>
          </div>
          <div className="panel-grid">
            <section className="panel"><h2>Orders by status</h2>{report.ordersByStatus?.map((row) => <div className="money-line" key={row.status}><span>{row.status}</span><strong>{row.count} · {money(row.revenue)}</strong></div>)}</section>
            <section className="panel"><h2>Orders by city</h2>{report.ordersByCity?.map((row) => <div className="money-line" key={row.city}><span>{row.city}</span><strong>{row.count}</strong></div>)}</section>
            <section className="panel"><h2>Orders by day</h2>{report.ordersByDay?.map((row) => <div className="money-line" key={String(row.day)}><span>{new Date(row.day).toLocaleDateString()}</span><strong>{row.count} · {money(row.revenue)}</strong></div>)}</section>
            <section className="panel"><h2>Courier success</h2>{report.courierSuccessRate?.map((row) => <div className="money-line" key={row.courier}><span>{row.courier}</span><strong>{Math.round(row.successRate * 100)}% delivered</strong></div>)}</section>
          </div>
        </>
      )}
    </>
  );
}
