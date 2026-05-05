type PoolLike = {
  token0: string;
  token1: string;
  sqrtPriceX96: bigint | number | string;
};

function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.floor(value));
  return BigInt(value);
}

export function findRoutes(pools: PoolLike[], tokenIn: string, tokenOut: string): PoolLike[][] {
  const routes: PoolLike[][] = [];

  for (const p of pools) {
    if (
      (p.token0 === tokenIn && p.token1 === tokenOut) ||
      (p.token1 === tokenIn && p.token0 === tokenOut)
    ) {
      routes.push([p]);
    }
  }

  for (const p1 of pools) {
    const mid = p1.token0 === tokenIn ? p1.token1 : p1.token1 === tokenIn ? p1.token0 : null;
    if (!mid) continue;
    for (const p2 of pools) {
      if (
        (p2.token0 === mid && p2.token1 === tokenOut) ||
        (p2.token1 === mid && p2.token0 === tokenOut)
      ) {
        routes.push([p1, p2]);
      }
    }
  }

  return routes;
}

export function quoteExactInputSinglePoolJs(
  pool: PoolLike,
  _tokenIn: string,
  amountIn: bigint,
  _sqrtPriceLimitX96: bigint,
): bigint {
  const sqrt = toBigInt(pool.sqrtPriceX96);
  if (sqrt <= 0n || amountIn <= 0n) return 0n;
  return amountIn;
}

export function quoteExactInputMultiPoolJs(
  _pools: PoolLike[],
  _tokenPath: string[],
  amountIn: bigint,
  _options?: { sqrtPriceLimitX96?: bigint[] },
): bigint {
  if (amountIn <= 0n) return 0n;
  return amountIn;
}
