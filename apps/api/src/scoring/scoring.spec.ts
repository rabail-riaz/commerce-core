import { computeCustomerScore, ScoreStats } from './scoring';

describe('computeCustomerScore', () => {
  const perfect: ScoreStats = { delivered: 10, returned: 0, cancelled: 0, refused: 0, totalOrders: 10, ordersLast90Days: 8 };
  const risky: ScoreStats = { delivered: 1, returned: 5, cancelled: 3, refused: 1, totalOrders: 10, ordersLast90Days: 1 };

  it('scores a strong delivery history highly', () => {
    expect(computeCustomerScore(perfect).score).toBeGreaterThanOrEqual(90);
  });

  it('scores high-return customers lower', () => {
    expect(computeCustomerScore(risky).score).toBeLessThan(computeCustomerScore(perfect).score);
  });

  it('returns 0-100 even with no orders', () => {
    const result = computeCustomerScore({ delivered: 0, returned: 0, cancelled: 0, refused: 0, totalOrders: 0, ordersLast90Days: 0 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
