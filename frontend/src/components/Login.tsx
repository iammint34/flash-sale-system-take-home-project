import { useState } from 'react';
import { ADMIN_USER_ID } from '../config';

export function Login({ onLogin }: { onLogin: (id: string) => void }) {
  const [id, setId] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id.trim()) onLogin(id);
  };

  return (
    <main className="app app-center">
      <form className="card login" onSubmit={submit}>
        <h1>Flash Sale</h1>
        <p className="muted">Sign in with a user id — no password.</p>
        <input
          autoFocus
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="e.g. alice"
          spellCheck={false}
        />
        <button className="buy" type="submit" disabled={!id.trim()}>
          Enter
        </button>
        <p className="muted hint">
          Tip: sign in as <code>{ADMIN_USER_ID}</code> for the admin console.
        </p>
      </form>
    </main>
  );
}
