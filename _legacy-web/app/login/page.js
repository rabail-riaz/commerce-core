'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../lib/api-client';

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api.login(data);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page"><div className="login-brand"><span className="brand-mark">C</span><span>Commerce<span className="brand-muted">Core</span></span></div><div className="login-card"><p className="eyebrow">OPERATIONS PORTAL</p><h1>Welcome back</h1><p className="login-copy">Sign in to manage your commerce operations.</p><form onSubmit={submit}><label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@company.com" /></label><label>Password<input name="password" type="password" required autoComplete="current-password" placeholder="Enter your password" /></label><label>Tenant slug <span className="optional">Optional for single-tenant users</span><input name="tenantSlug" placeholder="your-workspace" /></label>{error && <p className="error" role="alert">{error}</p>}<button className="button submit-button" disabled={loading}>{loading ? 'Signing in…' : 'Sign in to workspace'}</button></form><p className="login-footer">Secure tenant-aware access for your team.</p></div></main>;
}
