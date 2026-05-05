import { onSwap } from '@/app/lib/path';
import { simulateContract } from 'wagmi/actions';
import { TickMath } from "@uniswap/v3-sdk";

import { request, gql } from 'graphql-request';
import { config } from '@/app/wagmi/config';
import { SWAP_ROUTER_ABI } from '@/app/constants/abi';
import { SWAP_ROUTER_ADDRESS, TOKENS_LIST } from '@/app/constants/contracts';
import { withApiHandler } from '@/app/api/_utils/response';


const decmials = (10 ** 18);
//   OR: [
//         { token0_in: ${TOKENS_LIST} },
//         { token1_in: ${TOKENS_LIST} }
//       ]
// const data = await request(NEXT_PUBLIC_GRAPHQL_ENDPOINT, query, {
//     first: 10,
//     skip: 0,
// }, headers);
// const { poolCreateds } = data;
const NEXT_PUBLIC_GRAPHQL_ENDPOINT = "https://api.studio.thegraph.com/query/1721416/swap-graph/version/latest"
const headers = { Authorization: 'Bearer {api-key}' }
const query = gql`{
  poolCreateds(
  first: 300,
  where: {
    fee_in: [100, 500, 3000, 10000],
    token0_in: ${JSON.stringify(TOKENS_LIST)},
    token1_in: ${JSON.stringify(TOKENS_LIST)}
  },
  ) {
    id
    token0
    token1
    tickLower
    tickUpper
    fee
    pool
    index
    liquidity
  }
}`
export async function POST(payload: Request) {
  return withApiHandler(
    async () => {
    const body = (await payload.json());
    const {
      fromToken,
      toToken,
      slippage,
      tradeType,
      address
    } = body;
    const amountFrom = BigInt(body.amountFrom * decmials);
    const amountTo = BigInt(body.amountTo * decmials);

    const origin = new URL(payload.url).origin;
    const poolsResponse = await fetch(`${origin}/api/pools`, {
      method: 'GET',
      cache: 'no-store',
    });
    const poolsJson = await poolsResponse.json();
    if (!poolsResponse.ok || !poolsJson?.success) {
      throw new Error(poolsJson?.error ?? poolsJson?.message ?? '获取池子数据失败');
    }
    const poolList = Array.isArray(poolsJson?.data?.list) ? poolsJson.data.list : [];
    // 计算最佳路径
    const swapParams = onSwap({
      fromToken,
      toToken,
      amountFrom,
      amountTo,
      list: poolList,
      slippagePercent: slippage,
      tradeType
    });
    console.log('-------------swapParams---------->', swapParams)

    const {
      bestRoute,  // 最优路径
      myPriceLimit  // 路径价格上限
    } = swapParams
    if(!bestRoute.length) {
      throw new Error('未找到可用交易路径');
    }
    const indexPath = bestRoute.map(item => {
      return Number(item.poolIndex)
    });
    let res;
    if (tradeType === 'exactInput') {
      // 固定输入
    console.log('-------------8---------->', fromToken,toToken,indexPath,amountFrom,myPriceLimit  )
      res = await simulateContract(config, {
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: 'quoteExactInput',
        args: [{
          tokenIn: fromToken,
          tokenOut: toToken,
          indexPath: indexPath,
          amountIn: amountFrom,
          sqrtPriceLimitX96: myPriceLimit
        }],
        account: address,
      })
    console.log('-------------res1---------->', res)
    } else {
      res = await simulateContract(config, {
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: 'quoteExactOutput',
        args: [{
          tokenIn: fromToken,
          tokenOut: toToken,
          indexPath: indexPath,
          amountOut: amountTo,
          sqrtPriceLimitX96: myPriceLimit
        }],
        account: address,
      })
    }
    console.log('-------------res---------->', res)
    const { result } = res;
    let amountOutMinimum;
    let amountInMaximum;
    const commonRes = {
      tokenIn: fromToken,
      tokenOut: toToken,
      indexPath: indexPath,
      recipient: address,
      deadline: Date.now() + 60000,
      sqrtPriceLimitX96: Number(myPriceLimit)
    }
    let exactInputParams;
    let exactOutputParams;
    if (tradeType === 'exactInput') {
      amountOutMinimum = calcAmountOutMinimumByPercent(result, slippage);
      exactInputParams = {
        ...commonRes,
        amountIn: Number(amountFrom),
        amountOutMinimum: Number(amountOutMinimum),
      }
    } else {
      amountInMaximum = calcAmountInMaximumByPercent(result, slippage)
      exactOutputParams = {
        ...commonRes,
        amountOut: Number(amountTo),
        amountInMaximum: Number(amountInMaximum)
      }
    }
    return {
      exactInputParams,
      exactOutputParams,
      extimatePrice: Number(result),
    };
    },
    {
      successMessage: '报价成功',
      errorMessage: '报价失败',
    },
  );
}


export function calcAmountOutMinimumByPercent(
  expectedOut: bigint,
  slippagePercent: number
): bigint {
  // 使用整数运算避免浮点数精度问题
  const scale = 10000n; // 百万分之一精度
  const minPercent = BigInt(10000 - slippagePercent);
  const a = expectedOut * minPercent / scale;
  return a
}

export function calcAmountInMaximumByPercent(
  expectedIn: bigint,
  slippagePercent: number
): bigint {
  if (expectedIn <= 0n) return 0n;
  if (slippagePercent <= 0) return expectedIn;
  const scale = 10000n;
  const bps = BigInt(Math.floor(slippagePercent));
  const maxPercent = 10000n + bps;
  return (expectedIn * maxPercent) / scale;
}