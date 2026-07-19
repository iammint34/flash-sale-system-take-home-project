import { useEffect, useState } from 'react';
import { api, type SecureStatus } from '../api';
import { usePoll } from '../hooks';

// mirrors GET /sale/purchase/:userId — the "did I secure an item?" endpoint.
// polls until the worker confirms the order, then stops.
const COPY: Record<SecureStatus, { tone: string; title: string; sub: string }> =
  {
    none: {
      tone: 'muted',
      title: 'No order yet',
      sub: 'Head to “Buy Now” while the sale is live.',
    },
    reserved: {
      tone: 'ok',
      title: 'Reserved',
      sub: 'Your spot is locked — finalizing the order…',
    },
    confirmed: {
      tone: 'ok',
      title: 'Confirmed',
      sub: 'Your order is persisted. It’s yours.',
    },
  };

export function OrderStatus({ userId }: { userId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const { data } = usePoll(() => api.secured(userId), 1500, !confirmed);
  useEffect(() => {
    if (data?.status === 'confirmed') setConfirmed(true);
  }, [data]);

  const status = data?.status ?? 'none';
  const c = COPY[status];

  return (
    <section className="card">
      <p className="muted">Order status for <strong>{userId}</strong></p>
      <div className="order-state">
        <span className={`dot dot-${status}`} />
        <div>
          <div className={`order-title ${c.tone}`}>{c.title}</div>
          <div className="muted">{c.sub}</div>
        </div>
      </div>
    </section>
  );
}
