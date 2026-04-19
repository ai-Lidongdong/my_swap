import { TOKENS_LIST, classTokens } from '@/app/constants/contracts'
const hopMax = 3;   // 最大hop

// ========================
// 类型定义
// ========================
type Pool = {
  fee: number
  liquidity: bigint
  sqrtPriceX96: bigint
  tick: number
  tickLower: number
  tickUpper: number
  token0: string
  token1: string
}

// ========================
// 常量
// ========================
const Q96 = 2n ** 96n
const FEE_DENOMINATOR = 1_000_000n

// ========================
// Tick → sqrtPrice
// ⚠️ 生产环境建议用官方 TickMath
// ========================
function getSqrtRatioAtTick(tick: number): bigint {
  const ratio = Math.sqrt(Math.pow(1.0001, tick))
  return BigInt(Math.floor(ratio * 2 ** 96))
}
function mulDiv(
  a: bigint,
  b: bigint,
  denominator: bigint
): bigint {
  return (a * b) / denominator
}

// ========================
// 单个 pool 安全报价（支持 tick 区间限制）
// ========================
function getAmountOutSafe(
  pool: Pool,
  amountIn: bigint,
  tokenIn: string
): bigint {
  const zeroForOne =
    tokenIn.toLowerCase() === pool.token0.toLowerCase() //zeroForOne = true 时 token0 → token1, 否则 token1 → token0

  // 1️⃣ 扣手续费
const amountInAfterFee = mulDiv(
    amountIn,
    FEE_DENOMINATOR - BigInt(pool.fee),
    FEE_DENOMINATOR
  )

  const sqrtP = pool.sqrtPriceX96
  const L = pool.liquidity

  const sqrtLower = getSqrtRatioAtTick(pool.tickLower)
  const sqrtUpper = getSqrtRatioAtTick(pool.tickUpper)


  // ❌ 当前价格不在区间 → 无效池子
  if (sqrtP <= sqrtLower || sqrtP >= sqrtUpper) {
    return 0n
  }

  // ========================
  // token0 → token1
  // ========================
  if (zeroForOne) {

    // 👉 最大可用输入（推到 tickLower）
    const maxAmountIn =
      (L * (sqrtP - sqrtLower)) /
      (sqrtP * sqrtLower / Q96)

    const usedAmount =
      amountInAfterFee > maxAmountIn
        ? maxAmountIn
        : amountInAfterFee

    // 👉 单 tick 公式
    const numerator = L * sqrtP
    const denominator = L + (usedAmount * sqrtP) / Q96
    const sqrtPNew = numerator / denominator

    const amountOut =
      (L * (sqrtP - sqrtPNew)) / Q96

    return amountOut
  }

  // ========================
  // token1 → token0
  // ========================
  else {
    // 👉 最大可用输入（推到 tickUpper）
    const maxAmountIn =
      (L * (sqrtUpper - sqrtP)) / Q96

    const usedAmount =
      amountInAfterFee > maxAmountIn
        ? maxAmountIn
        : amountInAfterFee

    const sqrtPNew =
      sqrtP + (usedAmount * Q96) / L

    const amountOut =
      (L * (sqrtPNew - sqrtP)) /
      (sqrtPNew * sqrtP / Q96)

    return amountOut
  }
}

// ========================
// 找最优 pool
// ========================
function findBestPool(
  pools: Pool[],
  amountIn: bigint,
  tokenIn: string
) {
  let bestPool: Pool | null = null
  let bestAmountOut = 0n

  for (const pool of pools) {
    const amountOut = getAmountOutSafe(
      pool,
      amountIn,
      tokenIn
    )
    if (amountOut > bestAmountOut) {
      bestAmountOut = amountOut
      bestPool = pool
    }
  }

  return {
    bestPool,
    amountOut: bestAmountOut
  }
}


export const onSwap = (params: {
    fromToken: any;
    toToken: any;
    amountFrom: string;
    amountTo: string;
    list: any;
    slippagePercent: number;
    tradeType: string;
}) => {
    const {
        fromToken,
        toToken,
        amountFrom,
        amountTo,
        list,
        tradeType
    } = params
    // 另外两种代币作为中间代币
    const midTokens = TOKENS_LIST.filter((item) => { return item !== fromToken.address && item !== toToken.address });
    const zeroForOne = tradeType === 'exactInput'
    let finalList: any = {}
    list.forEach((item: any) => {
        if(item.liquidity === 0n ||
            (zeroForOne && item.tick <= item.tickLower ||
            !zeroForOne && item.tick >= item.tickUpper)) {
            return
        }
        const name1 = classTokens.find(token => token.address === item.token0)?.name
        const name2 = classTokens.find(token => token.address === item.token1)?.name
        const key = `${name1}_${name2}`
        if (Array.isArray(finalList[key])) {
            finalList[key].push(item);
        } else {
            finalList[key] = [item];
        }
    })

    const currentPools = finalList[`${fromToken.symbol}_${toToken.symbol}`]
    
    const result = findBestPool(currentPools, BigInt(amountFrom), fromToken.address);
    const { bestPool } = result || {};
    const slippagePercentIn: number = (100 - params?.slippagePercent) / 100
    const myPriceLimit = Number(bestPool?.sqrtPriceX96) * slippagePercentIn;

    return {
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        indexPath: [`${bestPool?.index.toString()}`],
        amountIn: amountFrom,
        sqrtPriceLimitX96: myPriceLimit,

    }
    console.log('result', result);
}

