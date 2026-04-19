// app/api/token-info/route.ts
import { NextResponse } from 'next/server'
import { publicClient } from '@/app/lib/viem-server'
import { fetchWithCache } from '@/app/lib/cache'
import { erc20Abi } from 'viem';
import { TOKENA_ADDRESS, TOKENB_ADDRESS, TOKENC_ADDRESS, TOKEND_ADDRESS } from '@/app/constants/contracts'


export async function GET() {
  try {
    const data = await fetchWithCache(
      'token-info-usdc',
      async () => {
        // 使用 Viem 的 multicall 一次性获取多个数据
        const tokenAList = await publicClient.multicall({
          contracts: [
            { address: TOKENA_ADDRESS, abi: erc20Abi, functionName: 'symbol' },
            { address: TOKENA_ADDRESS, abi: erc20Abi, functionName: 'name' },
            { address: TOKENA_ADDRESS, abi: erc20Abi, functionName: 'decimals' },
            { address: TOKENA_ADDRESS, abi: erc20Abi, functionName: 'totalSupply' },
          ],
          // allowFailure: false 表示任何一个调用失败都会抛出异常
          allowFailure: false,
        });
        const tokenBList = await publicClient.multicall({
          contracts: [
            { address: TOKENB_ADDRESS, abi: erc20Abi, functionName: 'symbol' },
            { address: TOKENB_ADDRESS, abi: erc20Abi, functionName: 'name' },
            { address: TOKENB_ADDRESS, abi: erc20Abi, functionName: 'decimals' },
            { address: TOKENB_ADDRESS, abi: erc20Abi, functionName: 'totalSupply' },
          ],
          // allowFailure: false 表示任何一个调用失败都会抛出异常
          allowFailure: false,
        })
        const tokenCList = await publicClient.multicall({
          contracts: [
            { address: TOKENC_ADDRESS, abi: erc20Abi, functionName: 'symbol' },
            { address: TOKENC_ADDRESS, abi: erc20Abi, functionName: 'name' },
            { address: TOKENC_ADDRESS, abi: erc20Abi, functionName: 'decimals' },
            { address: TOKENC_ADDRESS, abi: erc20Abi, functionName: 'totalSupply' },
          ],
          // allowFailure: false 表示任何一个调用失败都会抛出异常
          allowFailure: false,
        })
        const tokenDList = await publicClient.multicall({
          contracts: [
            { address: TOKEND_ADDRESS, abi: erc20Abi, functionName: 'symbol' },
            { address: TOKEND_ADDRESS, abi: erc20Abi, functionName: 'name' },
            { address: TOKEND_ADDRESS, abi: erc20Abi, functionName: 'decimals' },
            { address: TOKEND_ADDRESS, abi: erc20Abi, functionName: 'totalSupply' },
          ],
          // allowFailure: false 表示任何一个调用失败都会抛出异常
          allowFailure: false,
        })
        const list = [TOKENA_ADDRESS, TOKENB_ADDRESS, TOKENC_ADDRESS, TOKEND_ADDRESS].map((item, index)=>{
          const [symbol, name, decimals, totalSupply] = [tokenAList, tokenBList, tokenCList, tokenDList][index]
          return {
            address: item,
            symbol,
            name,
            decimals,
            totalSupply: totalSupply.toString(),
          }
        })
        return list
      },
      {
        revalidate: 60,      // 1 小时后重新验证
        tags: ['token-info'],  // 需要时可调用 revalidateTag('token-info') 强制刷新
      }
    )
    return NextResponse.json(data)
  } catch (error) {
    console.error('Failed to fetch token info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch token data' },
      { status: 500 }
    )
  }
}