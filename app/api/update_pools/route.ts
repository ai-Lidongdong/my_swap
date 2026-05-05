import { publicClient } from '@/app/lib/viem-server';
import { POOL_MANAGER_CONTRACT, TOKENS_LIST } from '@/app/constants/contracts';
import { apiOk, apiError } from '@/app/api/_utils/response';
import { listPoolInfoAddresses, upsertPoolInfo, type Address } from '@/app/models/poolInfoModel';

export async function POST() {
  try {
    const pools = await publicClient.readContract({
      address: POOL_MANAGER_CONTRACT.address,
      abi: POOL_MANAGER_CONTRACT.abi,
      functionName: 'getAllPools',
      args: [],
    });

    console.log('[update_pools] getAllPools result:', pools);
    

    if (!Array.isArray(pools)) {
      return apiError(null, 'getAllPools 调用失败');
    }
    console.log('pools..', pools?.length)
    const validPools =  pools.filter((item: any) => {
      return (
        [100, 500, 3000, 10000].includes(Number(item.fee)) &&
        (TOKENS_LIST.includes(item.token0) && TOKENS_LIST.includes(item.token1))
      );
    });
    console.log('--validPools.length', validPools.length)
    console.log('--validPools', validPools)
    // BigInt 需要转字符串后再返回给前端
    const poolList = JSON.parse(
      JSON.stringify(validPools, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
    console.log('--poolList.length', poolList.length)
    console.log('--poolList', poolList)

    // 存入数据库：只新增数据库中不存在的池子
    const dbPoolAddresses = await listPoolInfoAddresses();
    console.log('---dbPoolAddresses', dbPoolAddresses)
    const existingAddressSet = new Set(
      dbPoolAddresses.map((address) => address.toLowerCase()),
    );
    console.log('---existingAddressSet', existingAddressSet)

    const newPools = poolList.filter((pool: { pool: string }) => {
      return !existingAddressSet.has(pool.pool.toLowerCase());
    });
    console.log('---newPools', newPools)

    for (const pool of newPools) {
      await upsertPoolInfo({
        poolAddress: pool.pool as Address,
        token0: pool.token0 as Address,
        token1: pool.token1 as Address,
        poolIndex: Number(pool.index),
        fee: Number(pool.fee),
        feeProtocol: Number(pool.feeProtocol),
        tickLower: Number(pool.tickLower),
        tickUpper: Number(pool.tickUpper),
        tick: Number(pool.tick),
        sqrtPriceX96: String(pool.sqrtPriceX96),
        liquidity: String(pool.liquidity),
      });
    }

    return apiOk({
      fetchedCount: poolList.length,
      insertedCount: newPools.length,
      skippedCount: poolList.length - newPools.length,
    });
  } catch (error) {
    console.error('[update_pools] getAllPools failed:', error);
    return apiError(error, 'getAllPools 调用失败1');
  }
}
