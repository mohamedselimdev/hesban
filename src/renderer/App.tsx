import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { ar } from './i18n/ar';

// Component gallery exists only in builds made with VITE_GALLERY=1 (UI checks); the
// constant comparison lets the bundler drop it from production builds.
const Gallery = import.meta.env.VITE_GALLERY === '1' ? lazy(() => import('./spike/Gallery')) : null;

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function App() {
  const [status, setStatus] = useState<string>('');
  const hash = useSyncExternalStore(subscribeHash, () => location.hash);

  if (Gallery && hash === '#/gallery') {
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  }

  async function ping() {
    const result = await window.hesban.system.ping(crypto.randomUUID());
    setStatus(result.ok ? `متصل — الإصدار ${result.data.appVersion}` : `خطأ: ${result.error.code}`);
  }

  return (
    <main>
      <h1>{ar.appName}</h1>
      <button type="button" onClick={() => void ping()}>
        فحص الاتصال
      </button>
      <p>{status}</p>
    </main>
  );
}
