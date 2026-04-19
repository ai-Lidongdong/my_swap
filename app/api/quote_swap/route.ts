import { NextResponse } from 'next/server';
import { encodeFunctionData, decodeFunctionResult, formatUnits } from 'viem';
import { publicClient } from '@/app/lib/viem-server';
import { onSwap } from '@/app/lib/utils';
import { simulateContract } from 'wagmi/actions';
import { request, gql } from 'graphql-request';
import { config } from '@/app/wagmi/config';
import { SWAP_ROUTER_ABI } from '@/app/constants/abi';
import { SWAP_ROUTER_ADDRESS, TOKENS_LIST } from '@/app/constants/contracts';

const decmials = (10n ** 18n);
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
        const amountFrom = BigInt(body.amountFrom) * decmials;
        const amountTo = BigInt(body.amountTo) * decmials;
        const swapParams = onSwap({
            fromToken,
            toToken,
            amountFrom,
            amountTo,
            list: JSON.parse(pools),
            slippagePercent: slippage,
            tradeType
        })
        console.log('路径和价格计算结果：', swapParams)
        const { bestRoute, myPriceLimit } = swapParams
        const indexPath = bestRoute.map(item=>{
          return item.index.toString();
        });

        const res = await simulateContract(config, {
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
        console.log('-result', res)
      const { result } = res
        const amountOutMinimum = calcAmountOutMinimumByPercent(result, slippage);
        const exactInputParams = {
                tokenIn: fromToken,
                tokenOut: toToken,
                indexPath: indexPath,
                recipient: address,
                deadline: Date.now() + 60000,
                amountIn: Number(amountFrom),
                amountOutMinimum: Number(amountOutMinimum),
                sqrtPriceLimitX96: Number(myPriceLimit)
        }
        console.log('exactInputParams', exactInputParams);
        return NextResponse.json({
            exactInputParams,
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
  return  a
}