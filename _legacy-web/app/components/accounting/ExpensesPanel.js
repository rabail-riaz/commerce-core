'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const money = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value ?? 0));
const toISODate = (value) => new Date(value).toISOString().slice(0, 10);

export default function ExpensesPanel() {
  const [categories, setCategories] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [query, setQuery] = useState({ page: 1, limit: 25 });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0, totalAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.listExpenseCategories().then((response) => setCategories(unwrap(response) ?? [])).catch(() => {});
    api.listPurchaseOrders({ limit: 100 }).then((response) => setPurchaseOrders(unwrap(response).items ?? [])).catch(() => {});
  }, [reloadToken]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listExpenses({ categoryId: query.categoryId, page: query.page, limit: query.limit }).then((response) => {
      if (active) { setResult(unwrap(response)); setError(''); }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load expenses.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, reloadToken]);

  async function handleAddCategory(name) {
    const response = await api.createExpenseCategory({ name });
    const created = unwrap(response);
    setCategories((current) => (current.some((category) => category.id === created.id) ? current : [...current, created]));
    return created;
  }

  async function handleSave(form) {
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        categoryId: form.categoryId,
        purchaseOrderId: form.purchaseOrderId || undefined,
        amount: String(form.amount),
        currency: form.currency,
        description: form.description,
        expenseDate: form.expenseDate,
      };
      if (editing?.id) await api.updateExpense(editing.id, payload);
      else await api.createExpense(payload);
      setEditing(null);
      setReloadToken((value) => value + 1);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Unable to save expense.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      await api.deleteExpense(id);
      setEditing(null);
      setReloadToken((value) => value + 1);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Unable to delete expense.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="orders-toolbar">
        <div className="orders-filters">
          <select aria-label="Filter by category" value={query.categoryId ?? ''} onChange={(event) => setQuery((current) => ({ ...current, page: 1, categoryId: event.target.value || undefined }))}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="orders-summary">
          <span>Total: {money(result.totalAmount)}</span>
          <button className="button" type="button" disabled={!categories.length} title={!categories.length ? 'Add an expense category first' : ''} onClick={() => { setFormError(''); setEditing({}); }}>+ Add expense</button>
        </div>
      </div>
      {error && <div className="error orders-error">{error}</div>}
      <section className="panel orders-panel">
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead><tr><th>Date</th><th>Category</th><th>Linked purchase order</th><th>Description</th><th>Amount</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="5" className="table-message">Loading expenses…</td></tr>
                : result.items.length === 0 ? <tr><td colSpan="5" className="table-message">No expenses recorded yet.</td></tr>
                : result.items.map((expense) => (
                  <tr className="order-row" key={expense.id} onClick={() => { setFormError(''); setEditing(expense); }}>
                    <td>{date(expense.expenseDate)}</td>
                    <td><span className="tag">{expense.category?.name}</span></td>
                    <td>{expense.purchaseOrder ? `${expense.purchaseOrder.vendor?.name ?? 'Vendor'} PO` : '—'}</td>
                    <td>{expense.description || '—'}</td>
                    <td>{money(expense.amount, expense.currency)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {result.totalPages > 1 && (
          <div className="pagination">
            <button className="button button-secondary" disabled={query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
            <span>Page {query.page} of {result.totalPages}</span>
            <button className="button button-secondary" disabled={query.page >= result.totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
          </div>
        )}
      </section>
      {editing && (
        <ExpenseDrawer
          expense={editing}
          categories={categories}
          purchaseOrders={purchaseOrders}
          saving={saving}
          error={formError}
          onSave={handleSave}
          onDelete={editing.id ? () => handleDelete(editing.id) : null}
          onAddCategory={handleAddCategory}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ExpenseDrawer({ expense, categories, purchaseOrders, saving, error, onSave, onDelete, onAddCategory, onClose }) {
  const [form, setForm] = useState({
    categoryId: expense.categoryId ?? expense.category?.id ?? categories[0]?.id ?? '',
    purchaseOrderId: expense.purchaseOrderId ?? expense.purchaseOrder?.id ?? '',
    amount: expense.amount ?? '',
    currency: expense.currency ?? 'USD',
    description: expense.description ?? '',
    expenseDate: expense.expenseDate ? toISODate(expense.expenseDate) : toISODate(new Date()),
  });
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    setAddingCategory(true);
    setCategoryError('');
    try {
      const created = await onAddCategory(newCategory.trim());
      update('categoryId', created.id);
      setNewCategory('');
    } catch (requestError) {
      setCategoryError(requestError instanceof ApiError ? requestError.message : 'Unable to add category.');
    } finally {
      setAddingCategory(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div><p className="eyebrow">EXPENSE</p><h2>{expense.id ? 'Edit expense' : 'Add expense'}</h2></div>
          <button className="drawer-close" aria-label="Close expense form" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          <form className="integration-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
            <label>Category
              <select value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)} required>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <div className="add-category-row">
              <input placeholder="New category, e.g. Bilty / Transportation" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
              <button type="button" className="button button-secondary" disabled={addingCategory || !newCategory.trim()} onClick={addCategory}>{addingCategory ? 'Adding…' : 'Add'}</button>
            </div>
            {categoryError && <div className="error">{categoryError}</div>}

            <label>Linked purchase order (optional)
              <select value={form.purchaseOrderId} onChange={(event) => update('purchaseOrderId', event.target.value)}>
                <option value="">None</option>
                {purchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.vendor?.name} — {money(order.totalAmount, order.currency)}</option>)}
              </select>
            </label>
            <label>Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} required /></label>
            <label>Currency<input value={form.currency} onChange={(event) => update('currency', event.target.value)} /></label>
            <label>Date<input type="date" value={form.expenseDate} onChange={(event) => update('expenseDate', event.target.value)} required /></label>
            <label>Description<textarea value={form.description} onChange={(event) => update('description', event.target.value)} /></label>

            {error && <div className="error">{error}</div>}
            <div className="integration-health-actions">
              <button className="button submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : expense.id ? 'Save changes' : 'Add expense'}</button>
              {onDelete && <button className="button button-secondary" type="button" disabled={saving} onClick={onDelete}>Delete</button>}
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
