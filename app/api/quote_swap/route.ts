import { NextResponse } from 'next/server';
import { onSwap } from '@/app/lib/path';
import { simulateContract } from 'wagmi/actions';
import { TickMath } from "@uniswap/v3-sdk";

import { request, gql } from 'graphql-request';
import { config } from '@/app/wagmi/config';
import { SWAP_ROUTER_ABI } from '@/app/constants/abi';
import { SWAP_ROUTER_ADDRESS, TOKENS_LIST } from '@/app/constants/contracts';


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
  try {
    const body = (await payload.json());
    const {
      fromToken,
      toToken,
      slippage,
      tradeType,
      pools,
      address
    } = body;
    const amountFrom = BigInt(body.amountFrom * decmials);
    const amountTo = BigInt(body.amountTo * decmials);
    // 计算最佳路径
    const swapParams = onSwap({
      fromToken,
      toToken,
      amountFrom,
      amountTo,
      list: JSON.parse(pools),
      slippagePercent: slippage,
      tradeType
    });
    console.log('swapParams', swapParams)
    const {
      bestRoute,  // 最优路径
      myPriceLimit  // 路径价格上限
    } = swapParams
    const indexPath = bestRoute.map(item => {
      return Number(item.index)
    });
    let res;
    if (tradeType === 'exactInput') {
      // 固定输入
      console.log('quoteExactInput入参', indexPath, amountFrom)
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
    } else {
      console.log('quoteExactOutput入参', indexPath, amountTo)
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
    console.log('估价结果:', res)
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
    console.log('--exactOutputParams', exactOutputParams)
    return NextResponse.json({
      exactInputParams,
      exactOutputParams,
      extimatePrice: Number(result)
    });
  } catch (error) {
    console.error('[swap API error]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '报价失败' },
      { status: 500 },
    );
  }
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