// typed client for the flash-sale backend. paths are proxied to :3000 in dev
// (see vite.config.ts), so relative urls work in both dev and a built bundle.

export type SaleState = 'upcoming' | 'active' | 'ended';
export type PurchaseResult =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'not_active';
export type SecureStatus = 'none' | 'reserved' | 'confirmed';

export type SaleStatus = {
  status: SaleState;
  startTime: string;
  endTime: string;
  totalStock: number;
  remaining: number;
};

export type SalePatch = {
  startTime?: string;
  endTime?: string;
  totalStock?: number;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new HttpError(res.status, await res.text());
  return res.json() as Promise<T>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`${status}: ${body}`);
  }
}

export const api = {
  saleStatus: () => fetch('/sale/status').then(json<SaleStatus>),

  purchase: (userId: string) =>
    fetch('/sale/purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).then(json<{ result: PurchaseResult }>),

  secured: (userId: string) =>
    fetch(`/sale/purchase/${encodeURIComponent(userId)}`).then(
      json<{ status: SecureStatus }>,
    ),

  // admin authorizes by presenting the admin user id — no separate token
  updateSale: (patch: SalePatch, adminId: string) =>
    fetch('/admin/sale', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-user-id': adminId },
      body: JSON.stringify(patch),
    }).then(json<SaleStatus>),
};
