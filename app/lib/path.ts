// npm i @uniswap/v3-sdk
import { TickMath } from "@uniswap/v3-sdk";
import { classTokens } from '@/app/constants/contracts';
// ========================
// 单池 exactInput
// ========================
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
type TradeType = 'exactInput' | 'exactOutput';

const Q96 = 2n ** 96n;
const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE =
    1461446703485210103287273052203988822378723970342n;


export const onSwap = (params: {
    fromToken: any;
    toToken: any;
    amountFrom: bigint;
    amountTo: bigint;
    list: any;
    slippagePercent: number;
    tradeType: TradeType;
}): {
    bestRoute: Pool[]
    baseValue: bigint
    myPriceLimit: bigint | undefined
} => {
    const {
        fromToken,
        toToken,
        amountFrom,
        amountTo,
        slippagePercent,
        list,
        tradeType
    } = params
    // console.log('---params', params)
    const zeroForOne = tradeType === 'exactInput'
    let finalList: any = {};
    const otherList: any = []
    list.forEach((item: any) => {
        if (item.liquidity === 0n ||
            item.liquidity === 0 ||
            (zeroForOne && item.tick <= item.tickLower ||
                !zeroForOne && item.tick >= item.tickUpper)) {
            return
        }
        const name1 = classTokens.find((token: any) => token?.address?.toLowerCase() === item?.token0?.toLowerCase())?.name;
        const name2 = classTokens.find((token: any) => token.address.toLowerCase() === item.token1.toLowerCase())?.name;
        const key = `${name1}_${name2}`
        item.liquidity = BigInt(item.liquidity)
        item.sqrtPriceX96 = BigInt(item.sqrtPriceX96)
        if (Array.isArray(finalList[key])) {
            finalList[key].push(item);
        } else {
            finalList[key] = [item];
        }
        if ([fromToken, toToken].includes(item.token0 || item.token1)) {
            otherList.push(item)
        }
    })
    const fromTokenSymbal = classTokens.find((item: any) => { return item.address === fromToken })?.name;
    const toTokenSymbol = classTokens.find((item: any) => { return item.address === toToken })?.name;
    const currentKey = `${fromTokenSymbal}_${toTokenSymbol}`;

    // 单路径池
    const singlePath = finalList[currentKey];
    // 多池子路径
    let maxSinglePrice = 0n;
    let maxSinglePath = {} as any;
    let singlePoolPriceLimit;
    // 1987663184508497093n
    // 1993391932207890960n
    if (zeroForOne) {
        for (const path of singlePath) {
            const pathPriceLimit = path.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
            const inputRes = quoteExactInputSinglePool({
                tokenIn: path.token0, // 你实际想换入哪个就填哪个
                tokenOut: path.token1,
                amountIn: amountFrom, // 示例: 10 token(18位)
                sqrtPriceLimitX96: pathPriceLimit, // 例子，需满足方向校验
                pool: path
            })

            if (maxSinglePrice < inputRes.amountOut) {
                maxSinglePrice = inputRes.amountOut
                maxSinglePath = path
                singlePoolPriceLimit = pathPriceLimit
            }
        }

        singlePoolPriceLimit = maxSinglePath.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
        // console.log('----单池预估价格', maxSinglePrice);
        // console.log('----单池预估路径', maxSinglePath)

        return {
            baseValue: maxSinglePrice,
            bestRoute: [maxSinglePath],
            myPriceLimit: singlePoolPriceLimit
        }
    } else {
        let minAmountIn: bigint | null = null;
        let maxSinglePath: any = null;
        let singlePoolPriceLimit: bigint | undefined;
        for (const path of singlePath) {
            const pathPriceLimit = path.sqrtPriceX96 * BigInt(10000 + slippagePercent) / 10000n;
            const outPutRes = quoteExactOutputSinglePool({
                tokenIn: toToken,
                tokenOut: fromToken,
                amountOut: amountTo,
                sqrtPriceLimitX96: pathPriceLimit,
                pool: path,
            });
            if (minAmountIn === null || outPutRes.amountIn < minAmountIn) {
                minAmountIn = outPutRes.amountIn;
                maxSinglePath = path;
                singlePoolPriceLimit = pathPriceLimit;
            }
        }
        singlePoolPriceLimit = maxSinglePath.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;

        return {
            baseValue: minAmountIn,
            bestRoute: [maxSinglePath],
            myPriceLimit: singlePoolPriceLimit
        }
    }
}

function mulDiv(a, b, d) {
    return (a * b) / d;
}
function mulDivRoundingUp(a, b, d) {
    const r = (a * b) / d;
    return (a * b) % d === 0n ? r : r + 1n;
}
function divRoundingUp(x, y) {
    return x / y + (x % y === 0n ? 0n : 1n);
}

function getAmount0Delta(sqrtA, sqrtB, liquidity, roundUp) {
    let a = BigInt(sqrtA),
        b = BigInt(sqrtB);
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
    let a = BigInt(sqrtA),
        b = BigInt(sqrtB);
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

function getNextSqrtPriceFromOutput(sqrtP, liquidity, amountOut, zeroForOne) {
    if (sqrtP <= 0n || liquidity <= 0n) throw new Error("invalid sqrt/liquidity");
    return zeroForOne
        ? getNextSqrtPriceFromAmount1RoundingDown(sqrtP, liquidity, amountOut, false)
        : getNextSqrtPriceFromAmount0RoundingUp(sqrtP, liquidity, amountOut, false);
}

/**
 * 与合约 SwapMath.computeSwapStep 一致（含 exactIn / exactOut）
 * exact output 时 amountRemaining 为负数，绝对值 = 期望输出数量
 */
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

    const absNeg = (x) => (x >= 0n ? x : -x);

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
        amountOut = zeroForOne
            ? getAmount1Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, false)
            : getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, false);

        if (absNeg(amountRemaining) >= amountOut) {
            sqrtRatioNextX96 = sqrtRatioTargetX96;
        } else {
            sqrtRatioNextX96 = getNextSqrtPriceFromOutput(
                sqrtRatioCurrentX96,
                liquidity,
                absNeg(amountRemaining),
                zeroForOne
            );
        }
    }

    const max = sqrtRatioNextX96 === sqrtRatioTargetX96;

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

    if (!exactIn && amountOut > absNeg(amountRemaining)) {
        amountOut = absNeg(amountRemaining);
    }

    if (exactIn && sqrtRatioNextX96 !== sqrtRatioTargetX96) {
        feeAmount = absNeg(amountRemaining) - amountIn;
    } else {
        feeAmount = mulDivRoundingUp(amountIn, feePips, 1_000_000n - feePips);
    }

    return { sqrtRatioNextX96, amountIn, amountOut, feeAmount, zeroForOne, exactIn };
}

/** 复刻 Pool.swap 里 exactInput / exactOutput 后 (amount0, amount1) 的拼装 */
function poolSwapAmountsFromStep({
    amountSpecified,
    stepAmountIn,
    stepAmountOut,
    stepFee,
    zeroForOne,
}) {
    const exactInput = amountSpecified > 0n;

    let amountSpecifiedRemaining;
    let amountCalculated;

    if (exactInput) {
        amountSpecifiedRemaining = amountSpecified - (stepAmountIn + stepFee);
        amountCalculated = -stepAmountOut;
    } else {
        amountSpecifiedRemaining = amountSpecified + stepAmountOut;
        amountCalculated = stepAmountIn + stepFee;
    }

    let amount0, amount1;
    if (zeroForOne === exactInput) {
        amount0 = amountSpecified - amountSpecifiedRemaining;
        amount1 = amountCalculated;
    } else {
        amount0 = amountCalculated;
        amount1 = amountSpecified - amountSpecifiedRemaining;
    }

    return { amount0, amount1, amountSpecifiedRemaining };
}

function assertSqrtPriceLimit(zeroForOne, sqrtCurrent, sqrtPriceLimitX96) {
    const lim = BigInt(sqrtPriceLimitX96);
    if (zeroForOne) {
        if (!(lim < sqrtCurrent && lim > MIN_SQRT_PRICE)) {
            throw new Error("SPL: invalid sqrtPriceLimitX96 for zeroForOne");
        }
    } else {
        if (!(lim > sqrtCurrent && lim < MAX_SQRT_PRICE)) {
            throw new Error("SPL: invalid sqrtPriceLimitX96 for oneForZero");
        }
    }
}

function sqrtTargetFromPoolLimit(zeroForOne, sqrtPoolLimit, sqrtPriceLimitX96) {
    const lim = BigInt(sqrtPriceLimitX96);
    return zeroForOne
        ? sqrtPoolLimit < lim
            ? lim
            : sqrtPoolLimit
        : sqrtPoolLimit > lim
            ? lim
            : sqrtPoolLimit;
}

/** 单池：固定输入 amountIn -> 可得 amountOut */
export function quoteExactInputSinglePool({
    tokenIn,
    tokenOut,
    amountIn,
    sqrtPriceLimitX96,
    pool,
}) {
    const amountSpecified = BigInt(amountIn);
    const sqrtCurrent = BigInt(pool.sqrtPriceX96);
    const L = BigInt(pool.liquidity);
    const feePips = BigInt(pool.fee);
    const zeroForOne = BigInt(tokenIn) < BigInt(tokenOut);
    // console.log('--------222222222---------', zeroForOne)

    assertSqrtPriceLimit(zeroForOne, sqrtCurrent, sqrtPriceLimitX96);

    const sqrtLower = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickLower).toString()
    );
    const sqrtUpper = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickUpper).toString()
    );
    const sqrtPoolLimit = zeroForOne ? sqrtLower : sqrtUpper;
    const sqrtTarget = sqrtTargetFromPoolLimit(
        zeroForOne,
        sqrtPoolLimit,
        sqrtPriceLimitX96
    );

    const step = computeSwapStep(
        sqrtCurrent,
        sqrtTarget,
        L,
        amountSpecified,
        feePips
    );

    const { amount0, amount1 } = poolSwapAmountsFromStep({
        amountSpecified,
        stepAmountIn: step.amountIn,
        stepAmountOut: step.amountOut,
        stepFee: step.feeAmount,
        zeroForOne,
    });

    const amountInRemaining = amountSpecified - (zeroForOne ? amount0 : amount1);
    const amountOut = zeroForOne ? -amount1 : -amount0;

    return {
        zeroForOne,
        amountOut,
        amountInRemaining,
        sqrtPriceNextX96: step.sqrtRatioNextX96,
        poolAmount0: amount0,
        poolAmount1: amount1,
        stepAmountInNoFee: step.amountIn,
        stepFeeAmount: step.feeAmount,
    };
}

/** 单池：固定输出 amountOut -> 需要支付 amountIn（与 Router.exactOutput 单池累计一致） */
export function quoteExactOutputSinglePool({
    tokenIn,
    tokenOut,
    amountOut,
    sqrtPriceLimitX96,
    pool,
}) {
    // // console.log('--哈哈哈-', tokenIn,
    //     tokenOut,
    //     amountOut,
    //     sqrtPriceLimitX96,
    //     pool)
    const wantOut = BigInt(amountOut);
    const amountSpecified = -wantOut;

    const sqrtCurrent = BigInt(pool.sqrtPriceX96);
    const L = BigInt(pool.liquidity);
    const feePips = BigInt(pool.fee);
    const zeroForOne = BigInt(tokenIn) < BigInt(tokenOut);
    // console.log('---zeroForOne', zeroForOne)

    assertSqrtPriceLimit(zeroForOne, sqrtCurrent, sqrtPriceLimitX96);

    const sqrtLower = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickLower).toString()
    );
    const sqrtUpper = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickUpper).toString()
    );
    const sqrtPoolLimit = zeroForOne ? sqrtLower : sqrtUpper;
    const sqrtTarget = sqrtTargetFromPoolLimit(
        zeroForOne,
        sqrtPoolLimit,
        sqrtPriceLimitX96
    );

    const step = computeSwapStep(
        sqrtCurrent,
        sqrtTarget,
        L,
        amountSpecified,
        feePips
    );

    const { amount0, amount1 } = poolSwapAmountsFromStep({
        amountSpecified,
        stepAmountIn: step.amountIn,
        stepAmountOut: step.amountOut,
        stepFee: step.feeAmount,
        zeroForOne,
    });

    const gotOut = zeroForOne ? -amount1 : -amount0;
    const amountOutRemaining = wantOut - gotOut;
    const amountIn = zeroForOne ? amount0 : amount1;

    return {
        zeroForOne,
        amountIn,
        amountOutRemaining,
        sqrtPriceNextX96: step.sqrtRatioNextX96,
        poolAmount0: amount0,
        poolAmount1: amount1,
        stepAmountInNoFee: step.amountIn,
        stepFeeAmount: step.feeAmount,
    };
}