import { useState } from 'react';
import { api, type PurchaseResult, type SaleState } from '../api';

const RESULT: Record<PurchaseResult, { tone: string; text: string }> = {
  success: { tone: 'ok', text: 'You secured an item! Check “My Order”.' },
  already_purchased: { tone: 'ok', text: 'You already have one — nice.' },
  sold_out: { tone: 'bad', text: 'Sold out. Better luck next drop.' },
  not_active: { tone: 'bad', text: 'The sale is not open right now.' },
};

export function BuyPanel({
  userId,
  saleState,
}: {
  userId: string;
  saleState: SaleState | null;
}) {
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [busy, setBusy] = useState(false);

  const secured = result === 'success' || result === 'already_purchased';

  const buy = async () => {
    setBusy(true);
    try {
      const { result } = await api.purchase(userId);
      setResult(result);
    } catch {
      setResult('not_active'); // network/validation error → treat as closed
    } finally {
      setBusy(false);
    }
  };

  const canBuy = saleState === 'active' && !busy && !secured;

  return (
    <section className="card">
      <p className="muted">
        Buying as <strong>{userId}</strong> — one item per person.
      </p>

      <button className="buy big" onClick={buy} disabled={!canBuy}>
        {busy ? 'Buying…' : secured ? 'Secured' : 'Buy Now'}
      </button>

      {saleState && saleState !== 'active' && !result && (
        <p className="muted">
          {saleState === 'upcoming'
            ? 'The sale hasn’t opened yet.'
            : 'The sale has ended.'}
        </p>
      )}

      {result && (
        <p className={`feedback ${RESULT[result].tone}`}>
          {RESULT[result].text}
        </p>
      )}
    </section>
  );
}
