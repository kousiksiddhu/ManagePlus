import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner, Field } from '../components/ui';

const DEMO_ACCOUNTS = [
  { label: 'Manager', email: 'snallasivam@presidio.com' },
  { label: 'Admin', email: 'admin@presidio.com' },
  { label: 'Employee', email: 'kreddy@presidio.com' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
          <span className="logo-mark" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-contrast)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17 }}>
            M
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>ManagePlus</span>
        </div>
        <form className="card" onSubmit={(e) => void submit(e)}>
          <h2 style={{ marginBottom: 16 }}>Sign in</h2>
          <ErrorBanner message={error} />
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@presidio.com"
              autoFocus
              required
            />
          </Field>
          <Field label="Password">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="card" style={{ marginTop: 14, padding: '14px 20px' }}>
          <div className="card-title">Demo accounts · password: welcome123</div>
          {DEMO_ACCOUNTS.map((a) => (
            <div key={a.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
              <span className="small text-secondary">{a.label}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEmail(a.email);
                  setPassword('welcome123');
                }}
              >
                {a.email}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
