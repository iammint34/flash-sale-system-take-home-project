export type SaleStatus = 'upcoming' | 'active' | 'ended';

// active window is [start, end): open at start, closed once end is reached
export function saleStatus(now: Date, start: Date, end: Date): SaleStatus {
  if (now < start) return 'upcoming';
  if (now >= end) return 'ended';
  return 'active';
}
