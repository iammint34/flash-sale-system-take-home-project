import { useEffect, useRef, useState } from 'react';
import { api, HttpError, type SaleStatus } from '../api';
import { usePoll } from '../hooks';
import { Header } from './Header';
import { StatusCard } from './StatusCard';

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm"; the api speaks ISO.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function AdminConsole({
  userId,
  onLogout,
}: {
  userId: string;
  onLogout: () => void;
}) {
  const { data: sale } = usePoll<SaleStatus>(api.saleStatus, 2000);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [stock, setStock] = useState('');
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // prefill the form from the live sale once, so polling doesn't stomp edits
  const seeded = useRef(false);
  useEffect(() => {
    if (sale && !seeded.current) {
      seeded.current = true;
      setStart(toLocalInput(sale.startTime));
      setEnd(toLocalInput(sale.endTime));
      setStock(String(sale.totalStock));
    }
  }, [sale]);

  const save = async () => {
    const n = Number(stock);
    if (!Number.isInteger(n) || n < 0) {
      setMsg({ tone: 'bad', text: 'stock must be a non-negative integer' });
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateSale(
        {
          startTime: new Date(start).toISOString(),
          endTime: new Date(end).toISOString(),
          totalStock: n,
        },
        userId,
      );
      setMsg({
        tone: 'ok',
        text: `saved — ${updated.status}, ${updated.remaining}/${updated.totalStock} left`,
      });
    } catch (e) {
      const text =
        e instanceof HttpError && e.status === 400
          ? 'start must be before end'
          : 'update failed';
      setMsg({ tone: 'bad', text });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="app">
      <Header userId={userId} onLogout={onLogout} />
      <p className="muted admin-tag">Admin console</p>

      <StatusCard sale={sale ?? null} />

      <section className="card">
        <h2 className="card-h">Configure sale</h2>
        <label className="field">
          <span className="muted">Start</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="muted">End</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="muted">Total stock</span>
          <input
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </label>
        <button
          className="buy"
          onClick={save}
          disabled={saving || !start || !end || !stock}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {msg && <p className={`feedback ${msg.tone}`}>{msg.text}</p>}
        <p className="muted hint">
          Re-totalling stock respects items already reserved.
        </p>
      </section>
    </main>
  );
}
