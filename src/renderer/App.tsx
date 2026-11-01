import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { IpcResult, ResponseOf } from '../shared/contracts/ipc';
import { ar } from './i18n/ar';

// Component gallery exists only in builds made with VITE_GALLERY=1 (UI checks); the
// constant comparison lets the bundler drop it from production builds.
const Gallery = import.meta.env.VITE_GALLERY === '1' ? lazy(() => import('./spike/Gallery')) : null;

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

type Status = ResponseOf<'auth:status'>;
type ErrorCode = keyof typeof ar.auth.errors;
type Failed = { ok: false; error: ErrorCode; retryAfterSeconds?: number | undefined };

/** Message for a failed call: a service error code, or a transport-level denial. */
function failureText(transport: IpcResult<unknown>, inner: Failed | null): string {
  if (inner) {
    const base = ar.auth.errors[inner.error];
    return inner.error === 'LOCKED' && inner.retryAfterSeconds !== undefined
      ? `${base} ${inner.retryAfterSeconds} ${ar.auth.seconds}`
      : base;
  }
  if (!transport.ok && transport.error.code === 'FORBIDDEN') return ar.auth.errors.FORBIDDEN;
  return ar.auth.errors.INTERNAL;
}

export function App() {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash);
  const [status, setStatus] = useState<Status | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.hesban.auth.status();
    if (result.ok) setStatus(result.data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (Gallery && hash === '#/gallery') {
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  }

  if (!status) {
    return (
      <main>
        <p>{ar.auth.loading}</p>
      </main>
    );
  }

  if (recoveryKey) {
    return (
      <main className="auth-card">
        <h1>{ar.auth.recoveryTitle}</h1>
        <p role="alert">{ar.auth.recoveryWarning}</p>
        <p className="recovery-key" dir="ltr" data-testid="recovery-key">
          {recoveryKey}
        </p>
        <button
          type="button"
          onClick={() => {
            setRecoveryKey(null);
            void refresh();
          }}
        >
          {ar.auth.recoverySaved}
        </button>
      </main>
    );
  }

  if (!status.hasUsers) {
    return (
      <SetupForm
        onDone={(key) => {
          setRecoveryKey(key);
          void refresh();
        }}
      />
    );
  }
  if (!status.user) return <LoginForm onDone={() => void refresh()} />;

  return (
    <main className="auth-card">
      <h1>
        {ar.auth.welcome} {status.user.displayName}
      </h1>
      <p>
        {ar.auth.role}: {ar.auth.roles[status.user.role]}
      </p>
      {status.user.mustChangePassword ? <p role="alert">{ar.auth.mustChangePassword}</p> : null}
      <button
        type="button"
        onClick={() => {
          void window.hesban.auth.logout().then(() => refresh());
        }}
      >
        {ar.auth.logout}
      </button>
    </main>
  );
}

function SetupForm({ onDone }: { onDone: (recoveryKey: string) => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password !== confirm) return setError(ar.auth.passwordMismatch);
    setBusy(true);
    const result = await window.hesban.auth.setup({ username, displayName, password });
    setBusy(false);
    if (result.ok && result.data.ok) return onDone(result.data.value.recoveryKey);
    setError(failureText(result, result.ok && !result.data.ok ? result.data : null));
  }

  return (
    <main className="auth-card">
      <h1>{ar.auth.setupTitle}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field id="s-user" label={ar.auth.username} value={username} onChange={setUsername} ltr />
        <Field
          id="s-name"
          label={ar.auth.displayName}
          value={displayName}
          onChange={setDisplayName}
        />
        <Field
          id="s-pass"
          label={ar.auth.password}
          value={password}
          onChange={setPassword}
          secret
        />
        <Field
          id="s-conf"
          label={ar.auth.confirmPassword}
          value={confirm}
          onChange={setConfirm}
          secret
        />
        <p className="error" role="alert">
          {error}
        </p>
        <button type="submit" disabled={busy}>
          {ar.auth.createOwner}
        </button>
      </form>
    </main>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result = await window.hesban.auth.login({ username, password });
    setBusy(false);
    setPassword('');
    if (result.ok && result.data.ok) return onDone();
    setError(failureText(result, result.ok && !result.data.ok ? result.data : null));
  }

  return (
    <main className="auth-card">
      <h1>{ar.auth.loginTitle}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field id="l-user" label={ar.auth.username} value={username} onChange={setUsername} ltr />
        <Field
          id="l-pass"
          label={ar.auth.password}
          value={password}
          onChange={setPassword}
          secret
        />
        <p className="error" role="alert" data-testid="login-error">
          {error}
        </p>
        <button type="submit" disabled={busy}>
          {ar.auth.login}
        </button>
      </form>
    </main>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  ltr?: boolean;
}) {
  return (
    <div>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        data-testid={props.id}
        type={props.secret ? 'password' : 'text'}
        className={props.ltr ? 'ltr-field' : undefined}
        autoComplete="off"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
