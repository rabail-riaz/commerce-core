export type ScoreStats = {
  delivered: number;
  returned: number;
  cancelled: number;
  refused: number;
  totalOrders: number;
  ordersLast90Days: number;
};

export const DEFAULT_SCORE_WEIGHTS = {
  delivery: 40,
  returns: 20,
  cancellations: 15,
  refusals: 10,
  frequency: 10,
  volume: 5,
};

export function ratio(part: number, total: number) {
  return total > 0 ? part / total : 0;
}

export function computeCustomerScore(stats: ScoreStats, weights = DEFAULT_SCORE_WEIGHTS) {
  const deliveryRatio = ratio(stats.delivered, stats.totalOrders);
  const returnRatio = ratio(stats.returned, stats.totalOrders);
  const cancelRatio = ratio(stats.cancelled, stats.totalOrders);
  const refusalRatio = ratio(stats.refused, stats.totalOrders);
  const frequencyScore = Math.min(stats.ordersLast90Days / 8, 1);
  const volumeScore = Math.min(stats.totalOrders / 20, 1);
  const score = Math.max(0, Math.min(100, Math.round(
    deliveryRatio * weights.delivery
    + (1 - returnRatio) * weights.returns
    + (1 - cancelRatio) * weights.cancellations
    + (1 - refusalRatio) * weights.refusals
    + frequencyScore * weights.frequency
    + volumeScore * weights.volume,
  )));
  const classification = score >= 80 ? 'VIP' : score >= 60 ? 'GOOD' : score >= 40 ? 'STANDARD' : 'HIGH_RISK';
  return {
    score,
    classification,
    breakdown: { deliveryRatio, returnRatio, cancelRatio, refusalRatio, frequencyScore, volumeScore, weights, classification },
  };
}
