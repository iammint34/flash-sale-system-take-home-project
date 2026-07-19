import { useEffect, useState } from 'react';
import type { SaleState, SaleStatus } from '../api';

const LABEL: Record<SaleState, string> = {
  upcoming: 'Upcoming',
  active: 'Live now',
  ended: 'Ended',
};

// ticks once a second so the countdown moves between the 2s status polls
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function countdown(ms: number) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const parts = [
    [Math.floor(s / 3600), 'h'],
    [Math.floor((s % 3600) / 60), 'm'],
    [s % 60, 's'],
  ] as const;
  return parts
    .filter(([v], i) => v > 0 || i === 2)
    .map(([v, u]) => `${v}${u}`)
    .join(' ');
}

export function StatusCard({ sale }: { sale: SaleStatus | null }) {
  const now = useNow();
  if (!sale) return <section className="card">loading…</section>;

  const start = new Date(sale.startTime).getTime();
  const end = new Date(sale.endTime).getTime();
  const sold = Math.max(0, sale.totalStock - sale.remaining);
  const pct = sale.totalStock ? (sale.remaining / sale.totalStock) * 100 : 0;

  return (
    <section className="card">
      <div className="row">
        <span className={`badge badge-${sale.status}`}>
          {LABEL[sale.status]}
        </span>
        {sale.status === 'upcoming' && (
          <span className="muted">opens in {countdown(start - now)}</span>
        )}
        {sale.status === 'active' && (
          <span className="muted">closes in {countdown(end - now)}</span>
        )}
      </div>

      <div className="stock">
        <span className="stock-num">{sale.remaining}</span>
        <span className="muted"> of {sale.totalStock} left</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">{sold} sold so far</p>
    </section>
  );
}
