/** 列表页 → 详情页 URL 查询参数（与链上 Position 字段一致） */
export const POSITION_DETAIL_KEYS = [
  'id',
  'fee',
  'index',
  'liquidity',
  'priceRange',
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
  priceRange?: string;
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

function rowToDetailSearchParams(row: PositionRowLike): URLSearchParams {
  const q = new URLSearchParams();
  q.set('fee', asStr(row.fee));
  q.set('index', asStr(row.index));
  q.set('liquidity', asStr(row.liquidity));
  q.set('priceRange', asStr(row.priceRange));
  q.set('tickLower', asStr(row.tickLower));
  q.set('tickUpper', asStr(row.tickUpper));
  q.set('token0', asStr(row.token0));
  q.set('token1', asStr(row.token1));
  q.set('tokensOwed0', asStr(row.tokensOwed0));
  q.set('tokensOwed1', asStr(row.tokensOwed1));
  return q;
}

/** 详情页路径：`/pages/[id]?` + 其余字段（无 id 时仍走 `/pages/positionDetail?` 由该页重定向） */
export function positionRowToDetailHref(row: PositionRowLike): string {
  const id = asStr(row.id);
  if (!id) {
    const legacy = new URLSearchParams();
    for (const k of POSITION_DETAIL_KEYS) {
      legacy.set(k, asStr(row[k as keyof PositionRowLike]));
    }
    return `/pages/positionDetail?${legacy.toString()}`;
  }
  const q = rowToDetailSearchParams(row);
  const qs = q.toString();
  return `/pages/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}

/** 从当前详情 query（含 id）生成动态路由 href，供 increaseLiquidity 等返回详情 */
export function detailQueryToPositionDetailHref(q: Partial<PositionDetailQuery>): string {
  const id = (q.id ?? '').trim();
  if (!id) {
    const params = new URLSearchParams();
    for (const key of POSITION_DETAIL_KEYS) {
      const value = (q[key] ?? '').trim();
      if (value) {
        params.set(key, value);
      }
    }
    return `/pages/positionDetail?${params.toString()}`;
  }
  const params = new URLSearchParams();
  for (const key of POSITION_DETAIL_KEYS) {
    if (key === 'id') {
      continue;
    }
    const value = (q[key] ?? '').trim();
    if (value) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return `/pages/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
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
