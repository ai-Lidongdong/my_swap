import { NextResponse } from 'next/server';
import { encodeFunctionData, decodeFunctionResult } from 'viem';
import { publicClient } from '@/app/lib/viem-server';
import { POOL_MANAGER_ABI, SWAP_ROUTER_ABI } from '@/app/constants/abi';
import { POOL_MANAGER_ADDRESS, SWAP_ROUTER_ADDRESS } from '@/app/constants/contracts';
import {
  computeBestIndexPath,
  computeSqrtPriceLimitX96,
  computeAmountOutMinimum,
  computeAmountInMaximum,
  isZeroForOne,
  type PoolInfoForPath,
} from '@/app/lib/swap-utils';

export type SwapApiRequest = {
  token0: string;
  token1: string;
  recipient: string;
  amount0: string;
  amount1: string;
  slippage: string;
  deadline: string;
};

export type SwapApiResponse = {
  token0: string;
  token1: string;
  recipient: string;
  deadline: string;
  tradeType: 'exactInput' | 'exactOutput';
  amountIn?: string;
  amountOut?: string;
  amountOutMinimum?: string;
  amountInMaximum?: string;
  sqrtPriceLimitX96?: string;
  indexPath: string;
};

type RawPoolInfo = {
  pool: string;
  token0: string;
  token1: string;
  index: bigint;
  fee: bigint;
  feeProtocol: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  tick: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
};

async function fetchAllPools(): Promise<PoolInfoForPath[]> {
  const data = await publicClient.readContract({
    address: POOL_MANAGER_ADDRESS as `0x${string}`,
    abi: POOL_MANAGER_ABI,
    functionName: 'getAllPools',
    args: [],
  });

  if (!Array.isArray(data)) return [];

  return (data as RawPoolInfo[]).map((p) => ({
    pool: p.pool,
    token0: p.token0,
    token1: p.token1,
    index: Number(p.index),
    fee: Number(p.fee),
    tick: Number(p.tick),
    sqrtPriceX96: p.sqrtPriceX96,
    liquidity: p.liquidity,
  }));
}

async function simulateQuote(
  tradeType: 'exactInput' | 'exactOutput',
  tokenIn: string,
  tokenOut: string,
  indexPath: number[],
  amount: bigint,
  sqrtPriceLimitX96: bigint,
): Promise<bigint> {
  const indexPathU32 = indexPath.map((i) => i);

  if (tradeType === 'exactInput') {
    const calldata = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'quoteExactInput',
      args: [
        {
          tokenIn: tokenIn as `0x${string}`,
          tokenOut: tokenOut as `0x${string}`,
          indexPath: indexPathU32,
          amountIn: amount,
          sqrtPriceLimitX96,
        },
      ],
    });

    const { data: resultData } = await publicClient.call({
      account: '0x0000000000000000000000000000000000000000',
      to: SWAP_ROUTER_ADDRESS as `0x${string}`,
      data: calldata,
    });

    if (!resultData) throw new Error('quoteExactInput 返回空');

    const decoded = decodeFunctionResult({
      abi: SWAP_ROUTER_ABI,
      functionName: 'quoteExactInput',
      data: resultData,
    });

    return decoded as bigint;
  }

  const calldata = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: 'quoteExactOutput',
    args: [
      {
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        indexPath: indexPathU32,
        amountOut: amount,
        sqrtPriceLimitX96,
      },
    ],
  });

  const { data: resultData } = await publicClient.call({
    account: '0x0000000000000000000000000000000000000000',
    to: SWAP_ROUTER_ADDRESS as `0x${string}`,
    data: calldata,
  });

  if (!resultData) throw new Error('quoteExactOutput 返回空');

  const decoded = decodeFunctionResult({
    abi: SWAP_ROUTER_ABI,
    functionName: 'quoteExactOutput',
    data: resultData,
  });

  return decoded as bigint;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SwapApiRequest;
    const {
      token0,
      token1,
      recipient,
      amount0,
      amount1,
      slippage,
      deadline,
    } = body;

    if (!token0 || !token1) {
      return NextResponse.json({ error: '缺少 token0 或 token1' }, { status: 400 });
    }

    const hasAmount0 = amount0 && amount0 !== '0' && amount0 !== '';
    const hasAmount1 = amount1 && amount1 !== '0' && amount1 !== '';

    if (!hasAmount0 && !hasAmount1) {
      return NextResponse.json({ error: '缺少金额' }, { status: 400 });
    }

    const tradeType: 'exactInput' | 'exactOutput' = hasAmount0 ? 'exactInput' : 'exactOutput';
    const tokenIn = token0;
    const tokenOut = token1;
    const slippagePercent = Number(slippage) || 2.5;

    const allPools = await fetchAllPools();
    console.log('--allPools', allPools)
    const indexPath = computeBestIndexPath(allPools, tokenIn, tokenOut);

    if (indexPath.length === 0) {
      return NextResponse.json({ error: '未找到可用交易池' }, { status: 400 });
    }

    const zeroForOne = isZeroForOne(tokenIn, tokenOut);
    const sqrtPriceLimitX96 = computeSqrtPriceLimitX96(zeroForOne);
    const amount = BigInt(tradeType === 'exactInput' ? amount0 : amount1);

    const quoteResult = await simulateQuote(
      tradeType,
      tokenIn,
      tokenOut,
      indexPath,
      amount,
      sqrtPriceLimitX96,
    );

    const response: SwapApiResponse = {
      token0: tokenIn,
      token1: tokenOut,
      recipient: recipient || '',
      deadline: deadline || '',
      tradeType,
      indexPath: JSON.stringify(indexPath),
      sqrtPriceLimitX96: sqrtPriceLimitX96.toString(),
    };

    if (tradeType === 'exactInput') {
      response.amountIn = amount.toString();
      response.amountOut = quoteResult.toString();
      response.amountOutMinimum = computeAmountOutMinimum(quoteResult, slippagePercent).toString();
    } else {
      response.amountOut = amount.toString();
      response.amountIn = quoteResult.toString();
      response.amountInMaximum = computeAmountInMaximum(quoteResult, slippagePercent).toString();
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[swap API error]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '报价失败' },
      { status: 500 },
    );
  }
}
