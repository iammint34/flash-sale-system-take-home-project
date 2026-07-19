import { useState } from 'react';
import type { SaleStatus } from '../api';
import { usePoll } from '../hooks';
import { api } from '../api';
import { BuyPanel } from './BuyPanel';
import { Header } from './Header';
import { OrderStatus } from './OrderStatus';
import { StatusCard } from './StatusCard';

type Tab = 'sale' | 'buy' | 'order';
const TABS: { key: Tab; label: string }[] = [
  { key: 'sale', label: 'Sale' },
  { key: 'buy', label: 'Buy Now' },
  { key: 'order', label: 'My Order' },
];

export function BuyerApp({
  userId,
  onLogout,
}: {
  userId: string;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>('sale');
  // one status poll shared across tabs — the buy tab gates off it, the sale tab
  // renders it, so we don't hit /sale/status from three places at once.
  const { data: sale } = usePoll<SaleStatus>(api.saleStatus, 2000);

  return (
    <main className="app">
      <Header userId={userId} onLogout={onLogout} />

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'sale' && <StatusCard sale={sale} />}
      {tab === 'buy' && (
        <BuyPanel userId={userId} saleState={sale?.status ?? null} />
      )}
      {tab === 'order' && <OrderStatus userId={userId} />}
    </main>
  );
}
