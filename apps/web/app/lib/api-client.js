const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const ACCESS_TOKEN_KEY = 'commerce.accessToken';
const REFRESH_TOKEN_KEY = 'commerce.refreshToken';
const TENANT_ID_KEY = 'commerce.tenantId';

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const apiConfig = {
  baseUrl: API_URL,
};

function readSession() {
  if (typeof window === 'undefined') return {};
  return {
    accessToken: sessionStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: sessionStorage.getItem(REFRESH_TOKEN_KEY),
    tenantId: sessionStorage.getItem(TENANT_ID_KEY),
  };
}

function saveSession(session) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  sessionStorage.setItem(TENANT_ID_KEY, session.tenantId);
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(TENANT_ID_KEY);
}

function errorMessage(payload, fallback) {
  const message = payload?.error?.message ?? payload?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? fallback;
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, `Request failed with status ${response.status}`), response.status, payload);
  }
  return payload;
}

async function request(path, options = {}, retry = true) {
  const session = readSession();
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (session.accessToken) headers.set('authorization', `Bearer ${session.accessToken}`);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(`Unable to reach the API at ${API_URL}. Make sure the NestJS API is running.`, 0);
  }

  if (response.status === 401 && retry && session.refreshToken && path !== '/auth/refresh') {
    try {
      const refreshed = await refreshSession(session.refreshToken);
      return request(path, { ...options, headers: { ...options.headers, authorization: `Bearer ${refreshed.accessToken}` } }, false);
    } catch {
      clearSession();
      throw new ApiError('Your session has expired. Please sign in again.', 401);
    }
  }
  return parseResponse(response);
}

async function refreshSession(refreshToken) {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const session = await parseResponse(response);
  saveSession(session);
  return session;
}

export const api = {
  login(credentials) {
    return request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }).then((session) => {
      saveSession(session);
      return session;
    });
  },

  logout() {
    const { refreshToken } = readSession();
    const requestPromise = refreshToken
      ? request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false)
      : Promise.resolve({ success: true });
    return requestPromise.finally(clearSession);
  },

  currentUser() {
    return request('/auth/me');
  },

  currentTenant() {
    return request('/tenants/me');
  },

  dashboardSummary() {
    return request('/dashboard/summary');
  },

  listIntegrations(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/integrations${query ? `?${query}` : ''}`);
  },

  createIntegration(provider, storeId) {
    return request('/integrations', { method: 'POST', body: JSON.stringify({ provider, ...(storeId ? { storeId } : {}) }) });
  },

  saveIntegrationCredentials(id, credentials) {
    return request(`/integrations/${encodeURIComponent(id)}/credentials`, { method: 'POST', body: JSON.stringify({ credentials }) });
  },

  testIntegrationConnection(id) {
    return request(`/integrations/${encodeURIComponent(id)}/test-connection`, { method: 'POST' });
  },

  syncIntegration(id) {
    return request(`/integrations/${encodeURIComponent(id)}/sync`, { method: 'POST' });
  },

  reconcileIntegration(id) {
    return request(`/integrations/${encodeURIComponent(id)}/reconcile`, { method: 'POST' });
  },

  listEmailProviders() {
    return request('/email/providers');
  },

  listEmailAccounts() {
    return request('/email/accounts');
  },

  createEmailAccount(account) {
    return request('/email/accounts', { method: 'POST', body: JSON.stringify(account) });
  },

  saveEmailCredentials(id, credentials) {
    return request(`/email/accounts/${encodeURIComponent(id)}/credentials`, { method: 'POST', body: JSON.stringify({ credentials }) });
  },

  reconnectEmailAccount(id, credentials) {
    return request(`/email/accounts/${encodeURIComponent(id)}/reconnect`, { method: 'POST', body: JSON.stringify({ credentials }) });
  },

  testEmailConnection(id) {
    return request(`/email/accounts/${encodeURIComponent(id)}/test-connection`, { method: 'POST' });
  },

  disconnectEmailAccount(id) {
    return request(`/email/accounts/${encodeURIComponent(id)}/disconnect`, { method: 'POST' });
  },

  updateEmailAccount(id, account) {
    return request(`/email/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(account) });
  },

  listEmailThreads(accountId) {
    const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return request(`/email/threads${query}`);
  },

  getEmailThread(id) {
    return request(`/email/threads/${encodeURIComponent(id)}`);
  },

  markEmailThreadRead(id) {
    return request(`/email/threads/${encodeURIComponent(id)}/read`, { method: 'POST' });
  },

  linkEmailThread(id, links) {
    return request(`/email/threads/${encodeURIComponent(id)}/links`, { method: 'PATCH', body: JSON.stringify(links) });
  },

  ingestEmailMessage(accountId, message) {
    return request(`/email/accounts/${encodeURIComponent(accountId)}/messages`, { method: 'POST', body: JSON.stringify(message) });
  },

  listOrders(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    ).toString();
    return request(`/orders${query ? `?${query}` : ''}`);
  },

  getOrder(id) {
    return request(`/orders/${encodeURIComponent(id)}`);
  },

  bookOrderShipment(id, courierAccountId) {
    return request(`/orders/${encodeURIComponent(id)}/shipment`, {
      method: 'POST',
      body: JSON.stringify({ courierAccountId }),
    });
  },

  listShipments(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)).toString();
    return request(`/shipments${query ? `?${query}` : ''}`);
  },

  getShipment(id) {
    return request(`/shipments/${encodeURIComponent(id)}`);
  },

  trackShipment(id) {
    return request(`/shipments/${encodeURIComponent(id)}/track`, { method: 'POST' });
  },

  listReturns() {
    return request('/returns');
  },

  getReturn(id) {
    return request(`/returns/${encodeURIComponent(id)}`);
  },

  createReturn(payload) {
    return request('/returns', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateReturnStatus(id, status, resolution) {
    return request(`/returns/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(resolution ? { resolution } : {}) }),
    });
  },

  listCustomers(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    ).toString();
    return request(`/customers${query ? `?${query}` : ''}`);
  },

  getCustomer(id) {
    return request(`/customers/${encodeURIComponent(id)}`);
  },

  listProducts(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    ).toString();
    return request(`/products${query ? `?${query}` : ''}`);
  },

  getProduct(id) {
    return request(`/products/${encodeURIComponent(id)}`);
  },

  createProduct(product) {
    return request('/products', { method: 'POST', body: JSON.stringify(product) });
  },

  updateProduct(id, product) {
    return request(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(product) });
  },

  deleteProduct(id) {
    return request(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  listInbox(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
    return request(`/inbox${query ? `?${query}` : ''}`);
  },

  getInboxConversation(channel, id) {
    return request(`/inbox/${encodeURIComponent(channel)}/${encodeURIComponent(id)}`);
  },

  markInboxRead(channel, id) {
    return request(`/inbox/${encodeURIComponent(channel)}/${encodeURIComponent(id)}/read`, { method: 'POST' });
  },

  replyInbox(channel, id, payload) {
    return request(`/inbox/${encodeURIComponent(channel)}/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify(payload) });
  },

  replyEmailThread(id, payload) {
    return request(`/email/threads/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify(payload) });
  },

  listTickets(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null)).toString();
    return request(`/tickets${query ? `?${query}` : ''}`);
  },

  getTicket(id) {
    return request(`/tickets/${encodeURIComponent(id)}`);
  },

  createTicket(payload) {
    return request('/tickets', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateTicket(id, payload) {
    return request(`/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  addTicketMessage(id, body) {
    return request(`/tickets/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
  },

  listTemplates() {
    return request('/templates');
  },

  createTemplate(payload) {
    return request('/templates', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateTemplate(id, payload) {
    return request(`/templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  previewTemplate(id, variables) {
    return request(`/templates/${encodeURIComponent(id)}/preview`, { method: 'POST', body: JSON.stringify({ variables }) });
  },

  deactivateTemplate(id) {
    return request(`/templates/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
  },

  listCampaigns() {
    return request('/campaigns');
  },

  createCampaign(payload) {
    return request('/campaigns', { method: 'POST', body: JSON.stringify(payload) });
  },

  executeCampaign(id) {
    return request(`/campaigns/${encodeURIComponent(id)}/execute`, { method: 'POST' });
  },

  listAutomations() {
    return request('/automations');
  },

  createAutomation(payload) {
    return request('/automations', { method: 'POST', body: JSON.stringify(payload) });
  },

  executeAutomation(id) {
    return request(`/automations/${encodeURIComponent(id)}/execute`, { method: 'POST' });
  },

  getReports(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
    return request(`/reports${query ? `?${query}` : ''}`);
  },

  listNotifications() {
    return request('/notifications');
  },

  markNotificationRead(id) {
    return request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  },

  getSubscription() {
    return request('/billing/subscription');
  },

  getFeatureFlags() {
    return request('/feature-flags');
  },

  getSubscriptionUsage() {
    return request('/billing/usage');
  },

  listUsers() {
    return request('/users');
  },

  listRoles() {
    return request('/roles');
  },

  listWhatsAppAccounts() {
    return request('/whatsapp/accounts');
  },

  saveWhatsAppAccount(payload) {
    return request('/whatsapp/accounts', { method: 'POST', body: JSON.stringify(payload) });
  },

  getWhatsAppConversation(id) {
    return request(`/whatsapp/conversations/${encodeURIComponent(id)}`);
  },

  replyWhatsApp(id, body) {
    return request(`/whatsapp/conversations/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
  },

  recalculateScore(id) {
    return request(`/customers/${encodeURIComponent(id)}/score`, { method: 'POST' });
  },

  exportCsv(type, params = {}) {
    const query = new URLSearchParams({ type, ...Object.fromEntries(Object.entries(params).filter(([, value]) => value)) }).toString();
    return fetch(`${API_URL}/exports?${query}`, {
      headers: { authorization: `Bearer ${readSession().accessToken}` },
    }).then(async (response) => {
      if (!response.ok) throw new ApiError('Export failed', response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  },
};
