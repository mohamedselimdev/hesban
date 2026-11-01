import { useState } from 'react';

export function App() {
  const [status, setStatus] = useState<string>('');

  async function ping() {
    const result = await window.hesban.system.ping(crypto.randomUUID());
    setStatus(result.ok ? `متصل — الإصدار ${result.data.appVersion}` : `خطأ: ${result.error.code}`);
  }

  return (
    <main>
      <h1>حسبان</h1>
      <button type="button" onClick={() => void ping()}>
        فحص الاتصال
      </button>
      <p>{status}</p>
    </main>
  );
}
