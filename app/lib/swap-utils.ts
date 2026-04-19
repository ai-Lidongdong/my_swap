/**
 * Swap 工具函数：最优路径计算、限价边界、滑点保护
 * 不依赖第三方 SDK，纯 TypeScript 实现
 */

export type PoolInfoForPath = {
  pool: string;
  token0: string;
  token1: string;
  index: number;
  fee: number;
  tick: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
};

// Uniswap V3 常量
const MIN_SQRT_RATIO = BigInt('4295128739');
const MAX_SQRT_RATIO = BigInt('1461446703485210103287273052203988822378723970342');

function addrEq(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * 从全部池子中筛选出 tokenIn/tokenOut 对应的池子，
 * 按 liquidity 从大到小 + fee 从小到大 贪心排序，
 * 返回排好序的 index 数组供合约遍历。
 */
export function computeBestIndexPath(
  allPools: PoolInfoForPath[],
  tokenIn: string,
  tokenOut: string,
): number[] {
  const matched = allPools.filter((p) => {
    const match1 = addrEq(p.token0, tokenIn) && addrEq(p.token1, tokenOut);
    const match2 = addrEq(p.token0, tokenOut) && addrEq(p.token1, tokenIn);
    return match1 || match2;
  });

  if (matched.length === 0) {
    return [];
  }

  matched.sort((a, b) => {
    if (b.liquidity > a.liquidity) return 1;
    if (b.liquidity < a.liquidity) return -1;
    return a.fee - b.fee;
  });

  return matched.map((p) => p.index);
}

/**
 * 计算 sqrtPriceLimitX96：
 * - zeroForOne (token0 -> token1) 时价格下跌 => 用 MIN_SQRT_RATIO + 1
 * - 反向时价格上涨 => 用 MAX_SQRT_RATIO - 1
 */
export function computeSqrtPriceLimitX96(zeroForOne: boolean): bigint {
  return zeroForOne ? MIN_SQRT_RATIO + BigInt(1) : MAX_SQRT_RATIO - BigInt(1);
}

/**
 * exactInput 滑点保护：amountOutMinimum = quoteAmountOut * (1 - slippage/100)
 * slippagePercent 例如 2.5 表示 2.5%
 */
export function computeAmountOutMinimum(
  quoteAmountOut: bigint,
  slippagePercent: number,
): bigint {
  if (slippagePercent <= 0 || slippagePercent >= 100) {
    return quoteAmountOut;
  }
  const bps = BigInt(Math.round(slippagePercent * 100));
  return (quoteAmountOut * (BigInt(10000) - bps)) / BigInt(10000);
}

/**
 * exactOutput 滑点保护：amountInMaximum = quoteAmountIn * (1 + slippage/100)
 */
export function computeAmountInMaximum(
  quoteAmountIn: bigint,
  slippagePercent: number,
): bigint {
  if (slippagePercent <= 0 || slippagePercent >= 100) {
    return quoteAmountIn;
  }
  const bps = BigInt(Math.round(slippagePercent * 100));
  return (quoteAmountIn * (BigInt(10000) + bps)) / BigInt(10000);
}

/**
 * 判断交易方向：tokenIn 地址 < tokenOut 地址 => zeroForOne = true
 */
export function isZeroForOne(tokenIn: string, tokenOut: string): boolean {
  return tokenIn.toLowerCase() < tokenOut.toLowerCase();
}
