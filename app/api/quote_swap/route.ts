import { onSwap } from '@/app/lib/path';
import { simulateContract } from 'wagmi/actions';
import { config } from '@/app/wagmi/config';
import { SWAP_ROUTER_ABI } from '@/app/constants/abi';
import { SWAP_ROUTER_ADDRESS } from '@/app/constants/contracts';
import { withApiHandler } from '@/app/api/_utils/response';

const decmials = (10 ** 18);

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

    const {
      bestRoute,  // 最优路径
      myPriceLimit  // 路径价格上限
    } = swapParams
    if(!bestRoute.length) {
      throw new Error('未找到可用交易路径');
    }
    const indexPath = bestRoute.map((item) => {
      const row = item as { index?: number; poolIndex?: number };
      return Number(row.index ?? row.poolIndex);
    });
    let res;
    if (tradeType === 'exactInput') {
      // 固定输入
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


function calcAmountOutMinimumByPercent(
  expectedOut: bigint,
  slippagePercent: number
): bigint {
  // 使用整数运算避免浮点数精度问题
  const scale = 10000n; // 百万分之一精度
  const minPercent = BigInt(10000 - slippagePercent);
  const a = expectedOut * minPercent / scale;
  return a
}

function calcAmountInMaximumByPercent(
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