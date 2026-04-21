interface Pool {
    pool: string;
    token0: string;
    token1: string;
    index: number;
    fee: number;
    feeProtocol: number;
    tickLower: number;
    tickUpper: number;
    tick: number;
    sqrtPriceX96: number;
    liquidity: number;
}


const Q96 = 1n << 96n;
const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO =
  1461446703485210103287273052203988822378723970342n;
const MAX_TICK = 887272n;


function buildGraph(pools: Pool[]) {
  const map = new Map<string, Pool[]>()

  for (const p of pools) {
    if (!map.has(p.token0)) map.set(p.token0, [])
    if (!map.has(p.token1)) map.set(p.token1, [])

    map.get(p.token0)!.push(p)
    map.get(p.token1)!.push(p)
  }

  return map
}
export function findRoutes(pools: Pool[], tokenIn: string, tokenOut: string) {
  const graph = buildGraph(pools)
  const routes: Pool[][] = []

  // 1. 单跳
  for (const p of pools) {
    if (
      (p.token0 === tokenIn && p.token1 === tokenOut) ||
      (p.token1 === tokenIn && p.token0 === tokenOut)
    ) {
      routes.push([p])
    }
  }

  // 2. 两跳 A → C → B
  const firstPools = graph.get(tokenIn) || []

  for (const p1 of firstPools) {
    const mid =
      p1.token0 === tokenIn ? p1.token1 : p1.token0

    const secondPools = graph.get(mid) || []

    for (const p2 of secondPools) {
      if (
        (p2.token0 === mid && p2.token1 === tokenOut) ||
        (p2.token1 === mid && p2.token0 === tokenOut)
      ) {
        routes.push([p1, p2])
      }
    }
  }

  return routes
}


function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  return (a * b) / denominator;
}

function mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const p = a * b;
  const q = p / denominator;
  return p % denominator === 0n ? q : q + 1n;
}

function divRoundingUp(a: bigint, b: bigint): bigint {
  return a / b + (a % b > 0n ? 1n : 0n);
}

/** TickMath.getSqrtRatioAtTick */
function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = BigInt(tick < 0 ? -tick : tick);
  if (absTick > MAX_TICK) throw new Error('T');

  let ratio =
    (absTick & 1n) !== 0n
      ? BigInt('0xfffcb933bd6fad37aa2d162d1a594001')
      : BigInt('0x100000000000000000000000000000000');
  if ((absTick & 2n) !== 0n)
    ratio = (ratio * BigInt('0xfff97272373d413259a46990580e213a')) >> 128n;
  if ((absTick & 4n) !== 0n)
    ratio = (ratio * BigInt('0xfff2e50f5f656932ef12357cf3c7fdcc')) >> 128n;
  if ((absTick & 8n) !== 0n)
    ratio = (ratio * BigInt('0xffe5caca7e10e4e61c3624eaa0941cd0')) >> 128n;
  if ((absTick & 16n) !== 0n)
    ratio = (ratio * BigInt('0xffcb9843d60f6159c9db58835c926644')) >> 128n;
  if ((absTick & 32n) !== 0n)
    ratio = (ratio * BigInt('0xff973b41fa98c081472e6896dfb254c0')) >> 128n;
  if ((absTick & 64n) !== 0n)
    ratio = (ratio * BigInt('0xff2ea16466c96a3843ec78b326b52861')) >> 128n;
  if ((absTick & 128n) !== 0n)
    ratio = (ratio * BigInt('0xfe5dee046a99a2a811c461f1969c3053')) >> 128n;
  if ((absTick & 256n) !== 0n)
    ratio = (ratio * BigInt('0xfcbe86c7900a88aedcffc83b479aa3a4')) >> 128n;
  if ((absTick & 512n) !== 0n)
    ratio = (ratio * BigInt('0xf987a7253ac413176f2b074cf7815e54')) >> 128n;
  if ((absTick & 1024n) !== 0n)
    ratio = (ratio * BigInt('0xf3392b0822b70005940c7a398e4b70f3')) >> 128n;
  if ((absTick & 2048n) !== 0n)
    ratio = (ratio * BigInt('0xe7159475a2c29b7443b29c7fa6e889d9')) >> 128n;
  if ((absTick & 4096n) !== 0n)
    ratio = (ratio * BigInt('0xd097f3bdfd2022b8845ad8f792aa5825')) >> 128n;
  if ((absTick & 8192n) !== 0n)
    ratio = (ratio * BigInt('0xa9f746462d870fdf8a65dc1f90e061e5')) >> 128n;
  if ((absTick & 16384n) !== 0n)
    ratio = (ratio * BigInt('0x70d869a156d2a1b890bb3df62baf32f7')) >> 128n;
  if ((absTick & 32768n) !== 0n)
    ratio = (ratio * BigInt('0x31be135f97d08fd981231505542fcfa6')) >> 128n;
  if ((absTick & 65536n) !== 0n)
    ratio = (ratio * BigInt('0x9aa508b5b7a84e1c677de54f3e99bc9')) >> 128n;
  if ((absTick & 131072n) !== 0n)
    ratio = (ratio * BigInt('0x5d6af8dedb81196699c329225ee604')) >> 128n;
  if ((absTick & 262144n) !== 0n)
    ratio = (ratio * BigInt('0x2216e584f5fa1ea926041bedfe98')) >> 128n;
  if ((absTick & 524288n) !== 0n)
    ratio = (ratio * BigInt('0x48a170391f7dc42444e8fa2')) >> 128n;

  if (tick > 0) ratio = (2n ** 256n - 1n) / ratio;

  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function getNextSqrtPriceFromAmount0RoundingUp(
  sqrtPX96: bigint,
  liquidity: bigint,
  amount: bigint,
  add: boolean,
): bigint {
  if (amount === 0n) return sqrtPX96;
  const numerator1 = liquidity << 96n;
  if (add) {
    const product = amount * sqrtPX96;
    if (amount !== 0n && product / amount === sqrtPX96) {
      const denominator = numerator1 + product;
      if (denominator >= numerator1) return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
    }
    return divRoundingUp(numerator1, numerator1 / sqrtPX96 + amount);
  }
  const product = amount * sqrtPX96;
  if (amount !== 0n && product / amount !== sqrtPX96) throw new Error('product');
  if (!(numerator1 > product)) throw new Error('denom');
  return mulDivRoundingUp(numerator1, sqrtPX96, numerator1 - product);
}

function getNextSqrtPriceFromAmount1RoundingDown(
  sqrtPX96: bigint,
  liquidity: bigint,
  amount: bigint,
  add: boolean,
): bigint {
  const max160 = (1n << 160n) - 1n;
  if (add) {
    const quotient =
      amount <= max160 ? (amount << 96n) / liquidity : mulDiv(amount, Q96, liquidity);
    return sqrtPX96 + quotient;
  }
  const quotient =
    amount <= max160 ? divRoundingUp(amount << 96n, liquidity) : mulDivRoundingUp(amount, Q96, liquidity);
  if (sqrtPX96 <= quotient) throw new Error('sqrt');
  return sqrtPX96 - quotient;
}

function getNextSqrtPriceFromInput(
  sqrtPX96: bigint,
  liquidity: bigint,
  amountIn: bigint,
  zeroForOne: boolean,
): bigint {
  if (sqrtPX96 <= 0n || liquidity <= 0n) throw new Error('price');
  return zeroForOne
    ? getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
    : getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
}

function getNextSqrtPriceFromOutput(
  sqrtPX96: bigint,
  liquidity: bigint,
  amountOut: bigint,
  zeroForOne: boolean,
): bigint {
  if (sqrtPX96 <= 0n || liquidity <= 0n) throw new Error('price');
  return zeroForOne
    ? getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountOut, false)
    : getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountOut, false);
}

function getAmount0Delta(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
): bigint {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];
  const numerator1 = liquidity << 96n;
  const numerator2 = b - a;
  if (a <= 0n) throw new Error('sqrt');
  return roundUp
    ? divRoundingUp(mulDivRoundingUp(numerator1, numerator2, b), a)
    : mulDiv(numerator1, numerator2, b) / a;
}

function getAmount1Delta(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
): bigint {
  let ra = sqrtRatioAX96;
  let rb = sqrtRatioBX96;
  if (ra > rb) [ra, rb] = [rb, ra];
  const diff = rb - ra;
  return roundUp ? mulDivRoundingUp(liquidity, diff, Q96) : mulDiv(liquidity, diff, Q96);
}

/** SwapMath.computeSwapStep */
function computeSwapStep(
  sqrtRatioCurrentX96: bigint,
  sqrtRatioTargetX96: bigint,
  liquidity: bigint,
  amountRemaining: bigint,
  feePips: number,
): { sqrtRatioNextX96: bigint; amountIn: bigint; amountOut: bigint; feeAmount: bigint } {
  const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
  const exactIn = amountRemaining >= 0n;

  let sqrtRatioNextX96: bigint;
  let amountIn = 0n;
  let amountOut = 0n;
  let feeAmount = 0n;

  if (exactIn) {
    const amountRemainingLessFee = mulDiv(
      amountRemaining,
      BigInt(1_000_000 - feePips),
      1_000_000n,
    );
    amountIn = zeroForOne
      ? getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
      : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);
    if (amountRemainingLessFee >= amountIn) sqrtRatioNextX96 = sqrtRatioTargetX96;
    else
      sqrtRatioNextX96 = getNextSqrtPriceFromInput(
        sqrtRatioCurrentX96,
        liquidity,
        amountRemainingLessFee,
        zeroForOne,
      );
  } else {
    amountOut = zeroForOne
      ? getAmount1Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, false)
      : getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, false);
    const negRem = -amountRemaining;
    if (negRem >= amountOut) sqrtRatioNextX96 = sqrtRatioTargetX96;
    else sqrtRatioNextX96 = getNextSqrtPriceFromOutput(sqrtRatioCurrentX96, liquidity, negRem, zeroForOne);
  }

  const max = sqrtRatioTargetX96 === sqrtRatioNextX96;

  if (zeroForOne) {
    amountIn =
      max && exactIn
        ? amountIn
        : getAmount0Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
    amountOut =
      max && !exactIn
        ? amountOut
        : getAmount1Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
  } else {
    amountIn =
      max && exactIn
        ? amountIn
        : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, true);
    amountOut =
      max && !exactIn
        ? amountOut
        : getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, false);
  }

  if (!exactIn && amountOut > -amountRemaining) {
    amountOut = -amountRemaining;
  }

  if (exactIn && sqrtRatioNextX96 !== sqrtRatioTargetX96) {
    feeAmount = amountRemaining - amountIn;
  } else {
    feeAmount = mulDivRoundingUp(amountIn, BigInt(feePips), BigInt(1_000_000 - feePips));
  }

  return { sqrtRatioNextX96, amountIn, amountOut, feeAmount };
}

/** 与 Router / Pool 一致：tokenIn 地址 < tokenOut 地址 => zeroForOne */
function isZeroForOne(tokenIn: string, tokenOut: string): boolean {
  return tokenIn.toLowerCase() < tokenOut.toLowerCase();
}

/** 全区间限价：MIN+1 / MAX-1（与常见 periphery 用法一致） */
function defaultSqrtPriceLimitX96(zeroForOne: boolean): bigint {
  return zeroForOne ? MIN_SQRT_RATIO + 1n : MAX_SQRT_RATIO - 1n;
}

export type PoolLike = {
  token0: string;
  token1: string;
  fee: number;
  sqrtPriceX96: bigint | number | string;
  liquidity: bigint | number | string;
  tickLower?: number;
  tickUpper?: number;
};

/**
 * 单池 exactInput 输出量：对齐 Pool.sol —— SPL 校验、tick 边界与 sqrtPriceLimit 取目标价、再 SwapMath.computeSwapStep。
 * @param sqrtPriceLimitX96 不传则用全区间默认限价
 * @returns 输出 token 数量（与链上同精度 bigint）
 */
export function quoteExactInputSinglePoolJs(
  pool: PoolLike,
  fromToken: string,
  amountFrom: bigint,
  sqrtPriceLimitX96?: bigint,
): bigint {
  if (amountFrom <= 0n) return 0n;

  const t0 = pool.token0.toLowerCase();
  const t1 = pool.token1.toLowerCase();
  const tin = fromToken.toLowerCase();
  if (tin !== t0 && tin !== t1) throw new Error('fromToken 必须是该池的 token0 或 token1');

  const tokenOutAddr = tin === t0 ? pool.token1 : pool.token0;
  const zeroForOne = isZeroForOne(fromToken, tokenOutAddr);

  const sqrtP = BigInt(pool.sqrtPriceX96);
  let L = BigInt(pool.liquidity);
  if (L <= 0n || sqrtP <= 0n) return 0n;

  const UINT128_MAX = (1n << 128n) - 1n;
  if (L > UINT128_MAX) L = UINT128_MAX;
  const limit = sqrtPriceLimitX96 ?? defaultSqrtPriceLimitX96(zeroForOne);
  if (zeroForOne) {
    if (!(limit < sqrtP && limit > MIN_SQRT_RATIO)) throw new Error('INPUT_SPL');
  } else {
    if (!(limit > sqrtP && limit < MAX_SQRT_RATIO)) throw new Error('OUTPUT_SPL');
  }

  const tickLower = pool.tickLower ?? -887272;
  const tickUpper = pool.tickUpper ?? 887272;
  const sqrtPoolLo = getSqrtRatioAtTick(tickLower);
  const sqrtPoolHi = getSqrtRatioAtTick(tickUpper);
  const sqrtPriceX96PoolLimit = zeroForOne ? sqrtPoolLo : sqrtPoolHi;

  const sqrtTarget = zeroForOne
    ? sqrtPriceX96PoolLimit < limit
      ? limit
      : sqrtPriceX96PoolLimit
    : sqrtPriceX96PoolLimit > limit
      ? limit
      : sqrtPriceX96PoolLimit;

  const { amountOut } = computeSwapStep(sqrtP, sqrtTarget, L, amountFrom, pool.fee);
  return amountOut;
}

// 同文件内应已存在：quoteExactInputSinglePoolJs(pool, fromToken, amountFrom, sqrtPriceLimitX96?)
export type MultiPoolHop = {
  pool: string;
  token0: string;
  token1: string;
  index?: number;
  fee: number;
  feeProtocol?: number;
  tickLower?: number;
  tickUpper?: number;
  tick?: number;
  sqrtPriceX96: bigint | number | string;
  liquidity: bigint | number | string;
};

function addrLo(a: string): string {
  return a.toLowerCase();
}

function hopConnectsPool(hopTokenIn: string, hopTokenOut: string, p: MultiPoolHop): boolean {
  const t0 = addrLo(p.token0);
  const t1 = addrLo(p.token1);
  const a = addrLo(hopTokenIn);
  const b = addrLo(hopTokenOut);
  return (a === t0 && b === t1) || (a === t1 && b === t0);
}

export type QuoteMultiExactInputOptions = {
  /** 每跳一个；或传一个 bigint 表示每跳共用；不传则各跳用单池默认限价 */
  sqrtPriceLimitX96?: bigint | bigint[];
};

/**
 * 多池 exactInput：path[0] 输入 amountIn，得到 path 最后一项 token 数量。
 * 内部按顺序调用 quoteExactInputSinglePoolJs，不再把单池函数当参数传入。
 */
export function quoteExactInputMultiPoolJs(
  pools: MultiPoolHop[],
  path: string[],
  amountIn: bigint,
  options?: QuoteMultiExactInputOptions,
): bigint {
    // console.log('-00000000000--pools', pools, path, amountIn, options)
  if (amountIn <= 0n) return 0n;
  if (pools.length === 0) return 0n;
  if (path.length !== pools.length + 1) {
    throw new Error(`path 长度应为 pools.length+1，当前 path=${path.length} pools=${pools.length}`);
  }

  const limits = options?.sqrtPriceLimitX96;
  const limitForHop = (i: number): bigint | undefined => {
    if (limits === undefined) return undefined;
    if (typeof limits === 'bigint') return limits;
    if (!Array.isArray(limits) || limits.length !== pools.length) {
      throw new Error('sqrtPriceLimitX96 为数组时长度须等于 pools.length');
    }
    return limits[i];
  };

  let amount = amountIn;
  for (let i = 0; i < pools.length; i++) {
    const tokenIn = path[i]!;
    const tokenOut = path[i + 1]!;
    if (!hopConnectsPool(tokenIn, tokenOut, pools[i]!)) {
      throw new Error(
        `第 ${i} 跳池子与 path 不匹配：需要 ${tokenIn} -> ${tokenOut}，池为 ${pools[i]!.token0} / ${pools[i]!.token1}`,
      );
    }
    amount = quoteExactInputSinglePoolJs(pools[i]!, tokenIn, amount, limitForHop(i));
    if (amount <= 0n) return 0n;
  }
  return amount;
}