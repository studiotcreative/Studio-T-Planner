// src/lib/NavigationTracker.jsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pagesConfig } from '@/pages.config';

/**
 * NavigationTracker (Base44 replacement)
 * - Base44 had appLogs.logUserInApp(pageName)
 * - For migration stability, we intentionally do NOTHING here.
 * - Later we can add Supabase logging to an `app_logs` table if you want.
 */
export default function NavigationTracker() {
  const location = useLocation();
  const { Pages, mainPage } = pagesConfig;
  const mainPageKey = mainPage ?? Object.keys(Pages)[0];

  useEffect(() => {
    // Keep pageName parsing in case we re-enable logging later
    const pathname = location.pathname;
    let pageName;

    if (pathname === '/' || pathname === '') {
      pageName = mainPageKey;
    } else {
      const pathSegment = pathname.replace(/^\//, '').split('/')[0];

      const pageKeys = Object.keys(Pages);
      const matchedKey = pageKeys.find(
        (key) => key.toLowerCase() === pathSegment.toLowerCase()
      );

      pageName = matchedKey || null;
    }

    // NO-OP (tracking disabled during migration)
    void pageName;
  }, [location, Pages, mainPageKey]);

  return null;
}
