// @ts-nocheck
import { classTokens } from '@/app/constants/contracts';
import { findRoutes, quoteExactInputSinglePoolJs, quoteExactInputMultiPoolJs } from './route-utils';

// import { quoteExactInputSinglePool } from './test'
import { quoteExactInputSinglePool } from './path'
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
  console.log('---params', params)
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
    if([fromToken, toToken].includes(item.token0 || item.token1)) {
      otherList.push(item)
    }
  })
  const fromTokenSymbal = classTokens.find((item: any) => { return item.address === fromToken })?.name;
  const toTokenSymbol = classTokens.find((item: any) => { return item.address === toToken })?.name;
  const currentKey = `${fromTokenSymbal}_${toTokenSymbol}`;

  // 单路径池
  const singlePath = finalList[currentKey];
  // 多池子路径
  const multiList = otherList.filter(item => !new Set(singlePath).has(item));
  const multiPath: any = findRoutes(multiList, fromToken, toToken)
  let maxSinglePrice = 0n;
  let maxSinglePath = {} as any;
  let singlePoolPriceLimit;
  const accs = 
    {
      pool: '0xa55A3897b38B1DDb169eE9BE571a097449BD09dF',
      token0: '0x4798388e3adE569570Df626040F07DF71135C48E',
      token1: '0x5A4eA3a013D42Cfd1B1609d19f6eA998EeE06D30',
      index: 17,
      fee: 100,
      feeProtocol: 0,
      tickLower: -3466,
      tickUpper: 3465,
      tick: -27,
      sqrtPriceX96: 79123908133459668292727734272n,
      liquidity: 3466213731708364652544n
    }
    // 1987663184508497093n
    // 1993391932207890960n
    const adddc = accs.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
    console.log('---adddc', adddc)
      const abcc = quoteExactInputSinglePool({
          tokenIn: accs.token0, // 你实际想换入哪个就填哪个
          tokenOut: accs.token1,
          amountIn: amountFrom, // 示例: 10 token(18位)
          sqrtPriceLimitX96: adddc, // 例子，需满足方向校验
          pool: accs,
        })
        console.log('----------->', abcc)
  for(const path of singlePath) {
    const pathPriceLimit = path.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
    console.log('-here--', pathPriceLimit)
    const abb = quoteExactInputSinglePoolJs(path, fromToken, amountFrom, pathPriceLimit)

    if(maxSinglePrice < abb) {
      maxSinglePrice = abb;
      maxSinglePath = path
    }
  }

  let maxMultiPrice = 0n;
  let maxMultiPath = {} as any;
  let hop0Limit;
  let hop1Limit
  for(const kids of multiPath) {
    hop0Limit = kids[0].sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
    hop1Limit = kids[1].sqrtPriceX96 * BigInt(10000 + slippagePercent) / 10000n;
    const allToken = [...new Set(kids.flatMap(p => [p.token0, p.token1]))]
    // console.log('--', allToken)
    // console.log('--', fromToken, toToken)
    const midToken =  allToken.filter(item => ![fromToken, toToken].includes(item));
    const amountOut = quoteExactInputMultiPoolJs(
      kids,
      [fromToken, midToken[0], toToken],
      amountFrom,
      { sqrtPriceLimitX96: [hop0Limit, hop1Limit] }, // 可选
    );
    if(maxMultiPrice < amountOut) {
      maxMultiPrice = amountOut;
      maxMultiPath = kids
    }
  }
  singlePoolPriceLimit = maxSinglePath.sqrtPriceX96 * BigInt(10000 - slippagePercent) / 10000n;
  const useMulti = maxMultiPrice > maxSinglePrice;  // 是否多池路径为更优
  console.log('----单池预估价格', maxSinglePrice);
  console.log('----单池预估路径', maxSinglePath)
  console.log('----多池预估价格', maxMultiPrice);
  console.log('----多池预估路径', maxMultiPath)
  const myPriceLimit = useMulti ? hop0Limit : singlePoolPriceLimit
  const bestPath = useMulti ? maxMultiPath : [maxSinglePath]
  // console.log('--myPriceLimit', myPriceLimit)

  // 本地:1993391932207890960
  // 线上：1989951716431134225n

  return {
    baseValue: useMulti ? maxMultiPrice : maxSinglePrice,
    bestRoute: bestPath,
    myPriceLimit
  }
}