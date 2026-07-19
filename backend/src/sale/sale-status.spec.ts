import { saleStatus } from './sale-status';

describe('saleStatus', () => {
  const start = new Date('2026-01-01T10:00:00Z');
  const end = new Date('2026-01-01T11:00:00Z');

  it('is upcoming before start', () => {
    expect(saleStatus(new Date('2026-01-01T09:59:59Z'), start, end)).toBe(
      'upcoming',
    );
  });

  it('is active at start and mid-window', () => {
    expect(saleStatus(start, start, end)).toBe('active');
    expect(saleStatus(new Date('2026-01-01T10:30:00Z'), start, end)).toBe(
      'active',
    );
  });

  it('is ended exactly at end (window is half-open)', () => {
    expect(saleStatus(end, start, end)).toBe('ended');
    expect(saleStatus(new Date('2026-01-01T11:00:01Z'), start, end)).toBe(
      'ended',
    );
  });
});
