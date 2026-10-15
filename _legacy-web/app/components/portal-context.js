'use client';

import { createContext, useContext } from 'react';

export const PortalContext = createContext(null);

export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error('usePortal must be used within the portal layout');
  return value;
}
