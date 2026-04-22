// @ts-nocheck
// npm i @uniswap/v3-sdk
// -----------------------------------------------------------------------------
// 该文件目标：
// 1) 基于本地池子快照，预估 single pool 的 exactInput / exactOutput 报价
// 2) 选择“最优单池路径”（固定输入取最大输出；固定输出取最小输入）
// 3) 数学过程尽量对齐 Pool.sol 中 SwapMath.computeSwapStep 的单步行为
// -----------------------------------------------------------------------------
import { TickMath } from "@uniswap/v3-sdk";
import { classTokens } from '@/app/constants/contracts';
// 池子快照（供前端本地估算）
// @ts-nocheck
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
    sqrtPriceX96: bigint;
    liquidity: bigint;
}
type TradeType = 'exactInput' | 'exactOutput';
type Address = `0x${string}`;

type TokenMeta = {
    address: Address;
    name: string;
};

type PoolLikeInput = {
    pool: Address | string;
    token0: Address | string;
    token1: Address | string;
    index: number;
    fee: number;
    feeProtocol: number;
    tickLower: number;
    tickUpper: number;
    tick: number;
    sqrtPriceX96: bigint | number | string;
    liquidity: bigint | number | string;
};

type OnSwapParams = {
    fromToken: Address;
    toToken: Address;
    amountFrom: bigint;
    amountTo: bigint;
    list: PoolLikeInput[];
    slippagePercent: number;
    tradeType: TradeType;
};

type PoolBucketMap = Record<string, Pool[]>;

// Q64.96 定点常量
const Q96 = 2n ** 96n;
// TickMath 边界（与合约保持一致）
const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE =
    1461446703485210103287273052203988822378723970342n;

type OnSwapResult = {
    bestRoute: Pool[];
    baseValue: bigint;
    myPriceLimit: bigint | undefined;
};

type BucketBuildResult = {
    finalList: PoolBucketMap;
    fromTokenSymbal?: string;
    toTokenSymbol?: string;
};

function makeEmptySwapResult(): OnSwapResult {
    return {
        bestRoute: [],
        baseValue: 0n,
        myPriceLimit: undefined,
    };
}

/**
 * 将输入的池子列表分桶（按 tokenName_tokenName 维度）：
 * - 过滤掉无流动性或当前 tick 已在不可交易边界的池子
 * - 统一把 liquidity/sqrtPriceX96 归一为 bigint
 */
function buildPoolBuckets(
    list: PoolLikeInput[],
    zeroForOne: boolean
): BucketBuildResult {
    const finalList: PoolBucketMap = {};
    list.forEach((item: PoolLikeInput) => {
        if (
            item.liquidity === 0n ||
            item.liquidity === 0 ||
            (zeroForOne && item.tick <= item.tickLower) ||
            (!zeroForOne && item.tick >= item.tickUpper)
        ) {
            return;
        }
        const name1 = classTokens.find((token: any) => token?.address?.toLowerCase() === item?.token0?.toLowerCase())?.name;
        const name2 = classTokens.find((token: any) => token.address.toLowerCase() === item.token1.toLowerCase())?.name;
        const key = `${name1}_${name2}`;
        const normalized: Pool = {
            ...(item as Omit<Pool, 'sqrtPriceX96' | 'liquidity'>),
            liquidity: BigInt(item.liquidity),
            sqrtPriceX96: BigInt(item.sqrtPriceX96),
        };
        if (Array.isArray(finalList[key])) {
            finalList[key].push(normalized);
        } else {
            finalList[key] = [normalized];
        }
    });

    return { finalList };
}

/**
 * 固定输入：在 singlePath 中挑出 amountOut 最大的池子。
 * 同时保留该池对应的 sqrtPriceLimitX96（用于后续链上 quote）。
 */
function pickBestExactInputSinglePool(
    singlePath: Pool[],
    amountFrom: bigint,
    slippagePercent: number
): OnSwapResult {
    let maxSinglePrice: bigint = 0n;
    let maxSinglePath: Pool | null = null;
    let singlePoolPriceLimit: bigint | undefined;

    for (const path of singlePath) {
        const pathPriceLimit = path.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
        const inputRes = quoteExactInputSinglePool({
            tokenIn: path.token0,
            tokenOut: path.token1,
            amountIn: amountFrom,
            sqrtPriceLimitX96: pathPriceLimit,
            pool: path
        });
        const amountOut = BigInt(inputRes.amountOut);

        if (maxSinglePrice < amountOut) {
            maxSinglePrice = amountOut;
            maxSinglePath = path;
            singlePoolPriceLimit = pathPriceLimit;
        }
    }

    if (!maxSinglePath) return makeEmptySwapResult();

    singlePoolPriceLimit = maxSinglePath.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
    return {
        baseValue: maxSinglePrice,
        bestRoute: [maxSinglePath],
        myPriceLimit: singlePoolPriceLimit,
    };
}

/**
 * 固定输出：在 singlePath 中挑出满足目标输出时 amountIn 最小的池子。
 * 同时保留该池对应的 sqrtPriceLimitX96（用于后续链上 quote）。
 */
function pickBestExactOutputSinglePool(
    singlePath: Pool[],
    fromToken: Address,
    toToken: Address,
    amountTo: bigint,
    slippagePercent: number
): OnSwapResult {
    let minAmountIn: bigint | null = null;
    let maxSinglePath: Pool | null = null;
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
        const amountIn = BigInt(outPutRes.amountIn);
        if (minAmountIn === null || amountIn < minAmountIn) {
            minAmountIn = amountIn;
            maxSinglePath = path;
            singlePoolPriceLimit = pathPriceLimit;
        }
    }

    if (!maxSinglePath) return makeEmptySwapResult();

    singlePoolPriceLimit = maxSinglePath.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
    return {
        baseValue: minAmountIn ?? 0n,
        bestRoute: [maxSinglePath],
        myPriceLimit: singlePoolPriceLimit,
    };
}


export const onSwap = (params: OnSwapParams): {
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
    // 这里沿用当前文件既有逻辑：用 tradeType 判断方向分支（不改现有语义）
    const zeroForOne = tradeType === 'exactInput'
    const { finalList } = buildPoolBuckets(list, zeroForOne);
    const fromTokenSymbal = classTokens.find((item: any) => { return item.address === fromToken })?.name;
    const toTokenSymbol = classTokens.find((item: any) => { return item.address === toToken })?.name;
    const currentKey = `${fromTokenSymbal}_${toTokenSymbol}`;
    // 当前只做单池候选；没有候选池直接返回空结果
    const singlePath = finalList[currentKey] ?? [];
    if (singlePath.length === 0) return makeEmptySwapResult();

    if (zeroForOne) {
        return pickBestExactInputSinglePool(singlePath, amountFrom, slippagePercent);
    }
    return pickBestExactOutputSinglePool(singlePath, fromToken, toToken, amountTo, slippagePercent);
}

/**
 * 整数乘除（向下取整）。
 * 用途：模拟 Solidity 里的 floor(a * b / d)。
 * 注意：这里全部是 bigint 运算，不会有浮点精度问题。
 */
function mulDiv(a, b, d) {
    return (a * b) / d;
}

/**
 * 整数乘除（向上取整）。
 * 用途：当公式要求“至少要覆盖到目标值”时，不能少算 1 wei。
 * 逻辑：先算 floor(a*b/d)，若有余数再 +1。
 */
function mulDivRoundingUp(a, b, d) {
    const r = (a * b) / d;
    return (a * b) % d === 0n ? r : r + 1n;
}

/**
 * 整数除法（向上取整）。
 * 用途：和 mulDivRoundingUp 类似，避免因为向下取整导致“差 1”。
 * 逻辑：x / y 后如果有余数，则结果 +1。
 */
function divRoundingUp(x, y) {
    return x / y + (x % y === 0n ? 0n : 1n);
}

/**
 * 计算 token0 数量变化（delta），对应 Uniswap V3 的 getAmount0Delta。
 *
 * 直观理解：
 * - 给定价格区间 [sqrtA, sqrtB] 与流动性 L，算“跨过这段价格需要多少 token0”。
 * - 这是 SwapMath 中最核心的子公式之一。
 *
 * 参数说明：
 * - sqrtA / sqrtB：价格区间两端（Q64.96 的 sqrt price，顺序可颠倒，函数内部会自动排序）
 * - liquidity：当前可用流动性 L
 * - roundUp：
 *   - true  -> 向上取整（常用于 exactInput 的输入侧，保证输入足够）
 *   - false -> 向下取整（常用于输出侧）
 *
 * 返回值：
 * - 在该价格区间内需要/变化的 token0 数量（bigint，最小单位）
 */
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

// 计算 token1 方向 delta（对应 SqrtPriceMath.getAmount1Delta）
function getAmount1Delta(sqrtA, sqrtB, liquidity, roundUp) {
    let a = BigInt(sqrtA),
        b = BigInt(sqrtB);
    if (a > b) [a, b] = [b, a];
    console.log('-----最终结算', liquidity, b, a, Q96)
    return roundUp
        ? mulDivRoundingUp(liquidity, b - a, Q96)
        : mulDiv(liquidity, b - a, Q96);
}

// 输入 token0 后，按“向上取整”推进下一价格
function getNextSqrtPriceFromAmount0RoundingUp(sqrtP, liquidity, amount, add) {
    // console.log('-------计算过程---》', sqrtP, liquidity, amount, add)
    if (sqrtP === 79010097725641869778661408768n) {
        console.log('-------计算过程---》', sqrtP, liquidity, amount, add)
    }
    if (amount === 0n) return sqrtP;
    const numerator1 = liquidity << 96n;
    if (add) {
        const denominator = numerator1 + amount * sqrtP;
        if (denominator < numerator1) throw new Error("overflow");
        if (sqrtP === 79010097725641869778661408768n) {
            console.log('----这一步', numerator1, sqrtP, denominator)
        }
        return mulDivRoundingUp(numerator1, sqrtP, denominator);
    } else {
        const product = amount * sqrtP;
        if (numerator1 <= product) throw new Error("underflow");
        const denominator = numerator1 - product;
        return mulDivRoundingUp(numerator1, sqrtP, denominator);
    }
}

// 输入 token1 后，按“向下取整”推进下一价格
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

// exactInput 场景下的下一价格计算（按方向选 token0/token1 公式）
function getNextSqrtPriceFromInput(sqrtP, liquidity, amountIn, zeroForOne) {
    if (sqrtP <= 0n || liquidity <= 0n) throw new Error("invalid sqrt/liquidity");
    return zeroForOne
        ? getNextSqrtPriceFromAmount0RoundingUp(sqrtP, liquidity, amountIn, true)
        : getNextSqrtPriceFromAmount1RoundingDown(sqrtP, liquidity, amountIn, true);
}

// exactOutput 场景下的下一价格计算（按方向选 token0/token1 公式）
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
    sqrtRatioCurrentX96,    // 当前池子的sqrtPriceX96
    sqrtRatioTargetX96, // 交易最低可达下限
    liquidity,
    amountRemaining,    // 本次的固定输入金额 wei
    feePips               // 费率 250
) {
    // 通过“当前价格是否高于目标价格”判断方向：
    // true 代表 zeroForOne（价格向下走），false 代表 oneForZero（价格向上走）
    const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
    // amountRemaining >= 0 代表固定输入；< 0 代表固定输出
    const exactIn = amountRemaining >= 0n;

    // 下一价格（本 step 执行后）
    let sqrtRatioNextX96;
    // 本 step 真实输入（不含/含 fee 的语义在后续统一处理）
    let amountIn = 0n;
    // 本 step 真实输出
    let amountOut = 0n;
    // 本 step fee
    let feeAmount = 0n;

    // 把负数转为绝对值（exactOutput 分支会用到）
    const absNeg = (x) => (x >= 0n ? x : -x);

    if (exactIn) {
        // exactInput: 先把“可用于做市商曲线推进”的输入扣掉手续费=> 这里返回去掉fee后的金额
        const amountRemainingLessFee = mulDiv(  // mulDiv(a, b, c) => a * b / c
            amountRemaining,
            1_000_000n - feePips,
            1_000_000n
        );

        // 计算“若直接打到 target 价格”需要多少输入
        amountIn = zeroForOne
            ? getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
            : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);

        // 若扣费后输入足够，直接触达 target 价格，否则推进到某个中间价格
        if (amountRemainingLessFee >= amountIn) {
            sqrtRatioNextX96 = sqrtRatioTargetX96;
        } else {
            // 输入不够，只能推进到某个中间价格
            sqrtRatioNextX96 = getNextSqrtPriceFromInput(
                sqrtRatioCurrentX96,
                liquidity,
                amountRemainingLessFee,
                zeroForOne
            );
        }
    } else {
        // exactOutput: 先算“打到 target 价格”最多可输出多少
        amountOut = zeroForOne
            ? getAmount1Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, false)
            : getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, false);

        // 如果目标输出（绝对值）小于可输出上限，只需推进到中间价格即可
        if (absNeg(amountRemaining) >= amountOut) {
            sqrtRatioNextX96 = sqrtRatioTargetX96;
        } else {
            // 否则推进到“刚好满足目标输出”的价格
            sqrtRatioNextX96 = getNextSqrtPriceFromOutput(
                sqrtRatioCurrentX96,
                liquidity,
                absNeg(amountRemaining),
                zeroForOne
            );
        }
    }

    // max=true 表示本次 step 触达 target 价格
    const max = sqrtRatioNextX96 === sqrtRatioTargetX96;

    // 统一用 [current, next] 重新计算 amountIn/amountOut，避免分支中间值语义差异
    // amountOut计算本质：用当前的sqrtPriceX96 - 下一个sqrtPriceX96，再乘以流动性 ，再除以Q96
    if (zeroForOne) {
        // zeroForOne: 输入是 token0，输出是 token1
        amountIn =
            max && exactIn
                ? amountIn
                : getAmount0Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
        amountOut =
            max && !exactIn
                ? amountOut
                : getAmount1Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
    } else {
        // oneForZero: 输入是 token1，输出是 token0
        amountIn =
            max && exactIn
                ? amountIn
                : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, true);
        amountOut =
            max && !exactIn
                ? amountOut
                : getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, false);
    }

    // exactOutput 安全裁剪：输出不能超过剩余目标
    if (!exactIn && amountOut > absNeg(amountRemaining)) {
        amountOut = absNeg(amountRemaining);
    }

    // fee 计算：
    // - exactInput 且未触达 target：fee = 用户给的输入 - 实际用于曲线推进的输入
    // - 其它情况：按费率向上取整
    if (exactIn && sqrtRatioNextX96 !== sqrtRatioTargetX96) {
        feeAmount = absNeg(amountRemaining) - amountIn;
    } else {
        feeAmount = mulDivRoundingUp(amountIn, feePips, 1_000_000n - feePips);
    }

    // 返回一个 step 的全部中间量，供上层拼装 amount0/amount1 使用
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
    // amountSpecified > 0: exactInput；<0: exactOutput
    const exactInput = amountSpecified > 0n;

    // 仿照 Pool.swap 内部 state 字段：剩余 amountSpecified
    let amountSpecifiedRemaining;
    // 仿照 Pool.swap 内部 state 字段：已计算得到的另一侧金额
    let amountCalculated;

    if (exactInput) {
        // exactInput: 剩余输入 = 原输入 - (本步用于推进 + fee)
        amountSpecifiedRemaining = amountSpecified - (stepAmountIn + stepFee);
        // amountCalculated 在 exactInput 下记为负输出（池子视角）
        amountCalculated = -stepAmountOut;
    } else {
        // exactOutput: 剩余输出 = 原目标输出(负数) + 本步输出
        amountSpecifiedRemaining = amountSpecified + stepAmountOut;
        // amountCalculated 在 exactOutput 下记为需要的输入（池子视角）
        amountCalculated = stepAmountIn + stepFee;
    }

    // 最终返回给 Router 的 amount0/amount1
    let amount0, amount1;
    // 这里严格复刻 Pool.sol 的三元表达式逻辑
    if (zeroForOne === exactInput) {
        // 命中分支时：amount0 走 amountSpecified 侧，amount1 走 amountCalculated 侧
        amount0 = amountSpecified - amountSpecifiedRemaining;
        amount1 = amountCalculated;
    } else {
        // 否则交换两边
        amount0 = amountCalculated;
        amount1 = amountSpecified - amountSpecifiedRemaining;
    }

    // amountSpecifiedRemaining 也返回，便于上层复核
    return { amount0, amount1, amountSpecifiedRemaining };
}

function assertSqrtPriceLimit(zeroForOne, sqrtCurrent, sqrtPriceLimitX96) {
    const lim = BigInt(sqrtPriceLimitX96);
    // 对齐 Pool.sol 的 SPL 校验
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
    // 目标价格取“用户限价”和“池子可达边界”中更紧的一侧
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
    // 1) 把输入 amountIn 转成 Pool.swap 里的 amountSpecified（正数 => exactInput）
    const amountSpecified = BigInt(amountIn);
    // 2) 读取池子当前价格
    const sqrtCurrent = BigInt(pool.sqrtPriceX96);
    // 3) 读取池子流动性
    const L = BigInt(pool.liquidity);
    // 4) 读取 fee（百万分比）
    const feePips = BigInt(pool.fee);
    // 5) 由 token 地址大小判方向（与 Router/Pool 一致）
    const zeroForOne = BigInt(tokenIn) < BigInt(tokenOut);

    // 6) 校验用户给的 sqrtPriceLimit 是否满足 SPL 约束
    assertSqrtPriceLimit(zeroForOne, sqrtCurrent, sqrtPriceLimitX96);

    // 7) 根据 tickLower 取池子下边界价格
    const sqrtLower = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickLower).toString()
    );
    // 8) 根据 tickUpper 取池子上边界价格
    const sqrtUpper = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickUpper).toString()
    );
    // 9) 根据方向选池子可达边界
    const sqrtPoolLimit = zeroForOne ? sqrtLower : sqrtUpper;
    // 10) 从“池子边界”与“用户限价”中取更紧目标价
    const sqrtTarget = sqrtTargetFromPoolLimit(
        zeroForOne,
        sqrtPoolLimit,
        sqrtPriceLimitX96
    );

    // 11) 执行单步 SwapMath：得到 next price / in / out / fee
    const step = computeSwapStep(
        sqrtCurrent,
        sqrtTarget,
        L,
        amountSpecified,
        feePips
    );

    // 12) 把 step 结果拼装成 Pool.swap 返回的 amount0/amount1 语义
    const { amount0, amount1 } = poolSwapAmountsFromStep({
        amountSpecified,
        stepAmountIn: step.amountIn,
        stepAmountOut: step.amountOut,
        stepFee: step.feeAmount,
        zeroForOne,
    });

    // 13) 对齐 Router.exactInput:
    //     amountInRemaining = amountSpecified - 输入侧delta
    const amountInRemaining = amountSpecified - (zeroForOne ? amount0 : amount1);
    // 14) 对齐 Router.exactInput:
    //     amountOut = 输出侧delta 取反（池子视角 -> 用户视角）
    const amountOut = zeroForOne ? -amount1 : -amount0;

    // 15) 返回调试友好的中间量，便于对拍链上
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
    // 1) 目标输出 wantOut（正数）
    const wantOut = BigInt(amountOut);
    // 2) amountSpecified 设为负数，表示 exactOutput
    const amountSpecified = -wantOut;

    // 3) 读取当前池子价格
    const sqrtCurrent = BigInt(pool.sqrtPriceX96);
    // 4) 读取池子流动性
    const L = BigInt(pool.liquidity);
    // 5) 读取 fee
    const feePips = BigInt(pool.fee);
    // 6) 判方向（与合约一致）
    const zeroForOne = BigInt(tokenIn) < BigInt(tokenOut);

    // 7) 校验 sqrtPriceLimit 合法性（SPL）
    assertSqrtPriceLimit(zeroForOne, sqrtCurrent, sqrtPriceLimitX96);

    // 8) 池子下边界价格
    const sqrtLower = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickLower).toString()
    );
    // 9) 池子上边界价格
    const sqrtUpper = BigInt(
        TickMath.getSqrtRatioAtTick(pool.tickUpper).toString()
    );
    // 10) 按方向取池子边界
    const sqrtPoolLimit = zeroForOne ? sqrtLower : sqrtUpper;
    // 11) 取更紧目标价
    const sqrtTarget = sqrtTargetFromPoolLimit(
        zeroForOne,
        sqrtPoolLimit,
        sqrtPriceLimitX96
    );

    // 12) 执行单步 SwapMath：输出反推输入
    const step = computeSwapStep(
        sqrtCurrent,
        sqrtTarget,
        L,
        amountSpecified,
        feePips
    );

    // 13) 按 Pool.swap 语义组装 amount0/amount1
    const { amount0, amount1 } = poolSwapAmountsFromStep({
        amountSpecified,
        stepAmountIn: step.amountIn,
        stepAmountOut: step.amountOut,
        stepFee: step.feeAmount,
        zeroForOne,
    });

    // 14) 本步实际拿到的输出（用户视角）
    const gotOut = zeroForOne ? -amount1 : -amount0;
    // 15) 还差多少输出（用于多步时继续推进）
    const amountOutRemaining = wantOut - gotOut;
    // 16) 本步需要支付的输入（用户视角）
    const amountIn = zeroForOne ? amount0 : amount1;

    // 17) 返回包含中间量，便于排查与链上差异
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