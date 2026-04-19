export type FeeTier = {
  label: string;
  fee: number;
  tickSpacing: number;
};

export const POOL_FEE_TIERS: FeeTier[] = [
  { label: '0.01%', fee: 100, tickSpacing: 1 },
  { label: '0.05%', fee: 500, tickSpacing: 10 },
  { label: '0.3%', fee: 3000, tickSpacing: 60 },
  { label: '1%', fee: 10000, tickSpacing: 200 },
];
