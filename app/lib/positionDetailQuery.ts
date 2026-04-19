/** 列表页 → 详情页 URL 查询参数（与链上 Position 字段一致） */
export const POSITION_DETAIL_KEYS = [
  'id',
  'fee',
  'index',
  'liquidity',
  'tickLower',
  'tickUpper',
  'token0',
  'token1',
  'tokensOwed0',
  'tokensOwed1',
] as const;

export type PositionDetailQueryKey = (typeof POSITION_DETAIL_KEYS)[number];

export type PositionDetailQuery = Record<PositionDetailQueryKey, string>;

export type PositionRowLike = {
  id?: bigint;
  fee?: bigint;
  index?: bigint;
  liquidity?: bigint;
  tickLower?: bigint;
  tickUpper?: bigint;
  token0?: string;
  token1?: string;
  tokensOwed0?: bigint;
  tokensOwed1?: bigint;
};

function asStr(v: unknown): string {
  if (v == null) {
    return '';
  }
  if (typeof v === 'bigint') {
    return v.toString();
  }
  return String(v).trim();
}

export function positionRowToDetailHref(row: PositionRowLike): string {
  const q = new URLSearchParams();
  q.set('id', asStr(row.id));
  q.set('fee', asStr(row.fee));
  q.set('index', asStr(row.index));
  q.set('liquidity', asStr(row.liquidity));
  q.set('tickLower', asStr(row.tickLower));
  q.set('tickUpper', asStr(row.tickUpper));
  q.set('token0', asStr(row.token0));
  q.set('token1', asStr(row.token1));
  q.set('tokensOwed0', asStr(row.tokensOwed0));
  q.set('tokensOwed1', asStr(row.tokensOwed1));
  return `/pages/positionDetail?${q.toString()}`;
}

export function parsePositionDetailQuery(sp: URLSearchParams): Partial<PositionDetailQuery> {
  const out: Partial<PositionDetailQuery> = {};
  for (const k of POSITION_DETAIL_KEYS) {
    const v = sp.get(k);
    if (v != null && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

export function detailQueryToIncreaseLiquidityHref(q: Partial<PositionDetailQuery>): string | null {
  const token0 = (q.token0 ?? '').trim();
  const token1 = (q.token1 ?? '').trim();
  const fee = (q.fee ?? '').trim();
  const index = (q.index ?? '').trim();

  if (!token0.startsWith('0x') || !token1.startsWith('0x')) {
    return null;
  }
  if (!/^\d+$/.test(fee) || !/^\d+$/.test(index)) {
    return null;
  }

  const params = new URLSearchParams();
  for (const key of POSITION_DETAIL_KEYS) {
    const value = (q[key] ?? '').trim();
    if (value) {
      params.set(key, value);
    }
  }
  return `/pages/increaseLiquidity?${params.toString()}`;
}
