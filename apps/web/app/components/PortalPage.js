'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PortalShell from './PortalShell';
import { api, ApiError, clearSession } from '../lib/api-client';

export default function PortalPage({ section }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, user: null, tenant: null, error: '' });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!sessionStorage.getItem('commerce.accessToken')) {
        router.replace('/login');
        return;
      }
      try {
        const [userResult, tenantResult] = await Promise.all([api.currentUser(), api.currentTenant()]);
        if (active) setState({ loading: false, user: userResult.data ?? userResult, tenant: tenantResult.data ?? tenantResult, error: '' });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status === 401) clearSession();
        if (active) {
          setState({ loading: false, user: null, tenant: null, error: error.message });
          router.replace('/login');
        }
      }
    }
    load();
    return () => { active = false; };
  }, [router]);

  if (state.loading) return <main className="portal-loading">Loading workspace…</main>;
  if (!state.user || !state.tenant) return null;
  return <PortalShell section={section} user={state.user} tenant={state.tenant} />;
}
