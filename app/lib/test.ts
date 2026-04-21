// npm i @uniswap/v3-sdk
import { TickMath } from "@uniswap/v3-sdk";

const Q96 = 2n ** 96n;
const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;

function mulDiv(a, b, d) {
  return (a * b) / d; // floor
}
function mulDivRoundingUp(a, b, d) {
  const r = (a * b) / d;
  return (a * b) % d === 0n ? r : r + 1n;
}
function divRoundingUp(x, y) {
  return x / y + (x % y === 0n ? 0n : 1n);
}

function getAmount0Delta(sqrtA, sqrtB, liquidity, roundUp) {
  let a = BigInt(sqrtA), b = BigInt(sqrtB);
  if (a > b) [a, b] = [b, a];
  const numerator1 = liquidity << 96n;
  const numerator2 = b - a;
  if (a <= 0n) throw new Error("sqrtA must be > 0");
  if (roundUp) {
    return divRoundingUp(mulDivRoundingUp(numerator1, numerator2, b), a);
  }
  return mulDiv(numerator1, numerator2, b) / a;
}

function getAmount1Delta(sqrtA, sqrtB, liquidity, roundUp) {
  let a = BigInt(sqrtA), b = BigInt(sqrtB);
  if (a > b) [a, b] = [b, a];
  return roundUp
    ? mulDivRoundingUp(liquidity, b - a, Q96)
    : mulDiv(liquidity, b - a, Q96);
}

function getNextSqrtPriceFromAmount0RoundingUp(sqrtP, liquidity, amount, add) {
  if (amount === 0n) return sqrtP;
  const numerator1 = liquidity << 96n;
  if (add) {
    const denominator = numerator1 + amount * sqrtP;
    if (denominator < numerator1) throw new Error("overflow");
    return mulDivRoundingUp(numerator1, sqrtP, denominator);
  } else {
    const product = amount * sqrtP;
    if (numerator1 <= product) throw new Error("underflow");
    const denominator = numerator1 - product;
    return mulDivRoundingUp(numerator1, sqrtP, denominator);
  }
}

function getNextSqrtPriceFromAmount1RoundingDown(sqrtP, liquidity, amount, add) {
  if (add) {
    const quotient = mulDiv(amount, Q96, liquidity);
    return sqrtP + quotient;
  } else {
    const quotient = divRoundingUp(amount * Q96, liquidity);
    if (sqrtP <= quotient) throw new Error("sqrt underflow");
    return sqrtP - quotient;
  }
}

function getNextSqrtPriceFromInput(sqrtP, liquidity, amountIn, zeroForOne) {
  if (sqrtP <= 0n || liquidity <= 0n) throw new Error("invalid sqrt/liquidity");
  return zeroForOne
    ? getNextSqrtPriceFromAmount0RoundingUp(sqrtP, liquidity, amountIn, true)
    : getNextSqrtPriceFromAmount1RoundingDown(sqrtP, liquidity, amountIn, true);
}

function computeSwapStep(
  sqrtRatioCurrentX96,
  sqrtRatioTargetX96,
  liquidity,
  amountRemaining,
  feePips
) {
  const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
  const exactIn = amountRemaining >= 0n;

  let sqrtRatioNextX96;
  let amountIn = 0n;
  let amountOut = 0n;
  let feeAmount = 0n;

  if (exactIn) {
    const amountRemainingLessFee = mulDiv(
      amountRemaining,
      1_000_000n - feePips,
      1_000_000n
    );

    amountIn = zeroForOne
      ? getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
      : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);

    if (amountRemainingLessFee >= amountIn) {
      sqrtRatioNextX96 = sqrtRatioTargetX96;
    } else {
      sqrtRatioNextX96 = getNextSqrtPriceFromInput(
        sqrtRatioCurrentX96,
        liquidity,
        amountRemainingLessFee,
        zeroForOne
      );
    }
  } else {
    throw new Error("this helper only covers exactInput");
  }

  const max = sqrtRatioNextX96 === sqrtRatioTargetX96;

  if (zeroForOne) {
    amountIn =
      max && exactIn
        ? amountIn
        : getAmount0Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
    amountOut =
      getAmount1Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
  } else {
    amountIn =
      max && exactIn
        ? amountIn
        : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, true);
    amountOut =
      getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, false);
  }

  if (exactIn && sqrtRatioNextX96 !== sqrtRatioTargetX96) {
    feeAmount = amountRemaining - amountIn;
  } else {
    feeAmount = mulDivRoundingUp(amountIn, feePips, 1_000_000n - feePips);
  }

  return { sqrtRatioNextX96, amountIn, amountOut, feeAmount, zeroForOne };
}

/**
 * 近似/复刻单池 quoteExactInput 的核心结果
 * 对应你项目：SwapRouter.quoteExactInput -> exactInput -> Pool.swap (单次 step)
 */
export function quoteExactInputSinglePool({
  tokenIn,
  tokenOut,
  amountIn, // bigint
  sqrtPriceLimitX96, // bigint
  pool, // { fee, tickLower, tickUpper, sqrtPriceX96, liquidity }
}) {
  const amountSpecified = amountIn
  const sqrtCurrent = pool.sqrtPriceX96
  const L = pool.liquidity
  const feePips = BigInt(pool.fee);

  const zeroForOne = BigInt(tokenIn) < BigInt(tokenOut);

  // Pool.swap 的方向校验
  if (zeroForOne) {
    if (!(BigInt(sqrtPriceLimitX96) < sqrtCurrent && BigInt(sqrtPriceLimitX96) > MIN_SQRT_PRICE)) {
      throw new Error("SPL: invalid sqrtPriceLimitX96 for zeroForOne");
    }
  } else {
    if (!(BigInt(sqrtPriceLimitX96) > sqrtCurrent && BigInt(sqrtPriceLimitX96) < MAX_SQRT_PRICE)) {
      throw new Error("SPL: invalid sqrtPriceLimitX96 for oneForZero");
    }
  }

  const sqrtLower = BigInt(TickMath.getSqrtRatioAtTick(pool.tickLower).toString());
  const sqrtUpper = BigInt(TickMath.getSqrtRatioAtTick(pool.tickUpper).toString());
  const sqrtPoolLimit = zeroForOne ? sqrtLower : sqrtUpper;

  const sqrtTarget =
    zeroForOne
      ? (sqrtPoolLimit < BigInt(sqrtPriceLimitX96) ? BigInt(sqrtPriceLimitX96) : sqrtPoolLimit)
      : (sqrtPoolLimit > BigInt(sqrtPriceLimitX96) ? BigInt(sqrtPriceLimitX96) : sqrtPoolLimit);

  const step = computeSwapStep(
    sqrtCurrent,
    sqrtTarget,
    L,
    amountSpecified, // exactInput 正数
    feePips
  );

  // Pool.swap exactInput 的 amount0/amount1 语义复刻
  const amountSpecifiedRemaining = amountSpecified - (step.amountIn + step.feeAmount);
  const amountCalculated = -step.amountOut; // int256

  let amount0, amount1;
  if (zeroForOne) {
    // zeroForOne == exactInput(true)
    amount0 = amountSpecified - amountSpecifiedRemaining; // >0 输入 token0
    amount1 = amountCalculated; // <0 输出 token1
  } else {
    amount0 = amountCalculated; // <0 输出 token0
    amount1 = amountSpecified - amountSpecifiedRemaining; // >0 输入 token1
  }

  // Router.exactInput 的累计方式（单池）
  const amountInRemainingRouter = amountSpecified - (zeroForOne ? amount0 : amount1);
  const amountOutRouter = zeroForOne ? -amount1 : -amount0;

  return {
    zeroForOne,
    amountOut: amountOutRouter, // 与 quoteExactInput 返回口径一致（原始单位）
    amountInRemaining: amountInRemainingRouter,
    sqrtPriceNextX96: step.sqrtRatioNextX96,
    poolAmount0: amount0, // 调试用
    poolAmount1: amount1, // 调试用
    stepAmountInNoFee: step.amountIn,
    stepFeeAmount: step.feeAmount,
  };
}