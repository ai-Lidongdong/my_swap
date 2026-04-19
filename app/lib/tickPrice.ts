/** Uniswap V3 风格：tick 表示 log_{1.0001}(token1/token0 的原始价比) */

const TICK_BASE_LN = Math.log(1.0001);

export function humanPrice1Per0FromTick(tick: bigint, dec0: number, dec1: number): number {
  const t = Number(tick);
  if (!Number.isFinite(t)) {
    return Number.NaN;
  }
  return Math.exp(t * TICK_BASE_LN) * 10 ** (dec0 - dec1);
}

/** 展示用：与原型类似，大数偏整数、小数保留有效位 */
export function formatPrice1Per0(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return '—';
  }
  if (n === 0) {
    return '0';
  }
  if (n >= 100) {
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 2, useGrouping: false });
  }
  if (n >= 1) {
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 6, useGrouping: false });
  }
  return n.toPrecision(6);
}
