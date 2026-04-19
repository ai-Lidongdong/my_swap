'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useReadContract } from 'wagmi';
import { Header } from '@/app/components/Header';
import { POOL_MANAGER_ABI } from '@/app/constants/abi';
import { POOL_MANAGER_ADDRESS, TOKENS_LIST } from '@/app/constants/contracts';
import { useWalletStore } from '@/app/stores/contract';
import { isArray } from 'util';

type PoolInfo = {
  pool: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  index: bigint;
  fee: bigint;
  feeProtocol: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  tick: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
};

/** token 地址仅展示末尾 3 位，前面用 … 代替 */
function tokenTail3(addr: string) {
  const a = addr.trim();
  if (a.length <= 3) {
    return a;
  }
  return `…${a.slice(-3)}`;
}

function monoCell(value: string) {
  return (
    <span className="break-all font-mono text-[11px] leading-snug text-zinc-300" title={value}>
      {value}
    </span>
  );
}

function tickToPrice(tick: bigint) {
  const tickNum = Number(tick);
  if (!Number.isFinite(tickNum)) {
    return null;
  }

  const price = 1.0001 ** tickNum;
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return price;
}

function formatPrice(price: number | null) {
  if (price === null) {
    return '--';
  }

  if (price >= 10000 || price < 0.0001) {
    return price.toExponential(6);
  }

  return price.toFixed(6);
}

export default function PoolListPage() {
  const contractList = useWalletStore((state) => state.ContractList);
  const {
    data: xValue,
    isLoading,
    isError,
    refetch,
    error,
  } = useReadContract({
    address: POOL_MANAGER_ADDRESS,
    abi: POOL_MANAGER_ABI,
    functionName: 'getAllPools',
    args: [],
  });
  // console.log('xValue', xValue);
  const list = useMemo(() => {
    if (!Array.isArray(xValue)) {
      return [];
    }
    return xValue.filter((item: any) => {
      return (
        [100, 500, 3000, 10000].includes(Number(item.fee)) &&
        (TOKENS_LIST.includes(item.token0) && TOKENS_LIST.includes(item.token1))
      );
    });
  }, [xValue]);
  const zi = list.filter(tiem=>tiem.token0 === "0x5A4eA3a013D42Cfd1B1609d19f6eA998EeE06D30" && tiem.token1 === "0x86B5df6FF459854ca91318274E47F4eEE245CF28")
  console.log('--list', list)
  console.log('--zi', zi)


  const pools = useMemo(() => {
    if (!list || !Array.isArray(list)) {
      return [] as PoolInfo[];
    }
    return list as PoolInfo[];
  }, [list]);

  const symbolMap = useMemo(() => {
    const map = new Map<string, string>();
    contractList.forEach((token) => {
      map.set(token.address.toLowerCase(), token.symbol);
    });
    return map;
  }, [contractList]);

  const feeToPercent = (fee: bigint) => {
    const feeValue = Number(fee);
    if (!Number.isFinite(feeValue)) {
      return '--';
    }
    return `${(feeValue / 10000).toString()}%`;
  };

  useEffect(() => {
    useWalletStore.getState().getTokenInfo();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
      <Header active="pool" variant="dark" />

      <main className="mx-auto w-full max-w-[1600px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Pool 列表</h1>
            <p className="mt-1 text-sm text-zinc-500">链上数据来自 getAllPools</p>
          </div>
          <Link
            href="/pages/poolCreate"
            className="inline-flex rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-fuchsia-900/30 transition hover:brightness-110"
          >
            Add Pool
          </Link>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-6 py-16 text-center text-zinc-400">
            加载中…
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/40 px-6 py-8 text-sm text-red-200">
            读取失败：{error?.message ?? '未知错误'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-xl">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/80">
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">index</th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">Token</th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">
                    currentPrice
                  </th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">fee</th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">tick</th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">tickLower</th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">tickUpper</th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">liquidity</th>
                  <th className="whitespace-normal px-3 py-3 font-medium text-zinc-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {pools.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                      暂无池子数据
                    </td>
                  </tr>
                ) : (
                  pools.map((row, i) => {
                    const fee = Number(row.fee);
                    const index = Number(row.index);
                    const token0Symbol = symbolMap.get(row.token0.toLowerCase()) ?? tokenTail3(row.token0);
                    const token1Symbol = symbolMap.get(row.token1.toLowerCase()) ?? tokenTail3(row.token1);
                    const priceToken1PerToken0 = tickToPrice(row.tick);
                    const priceToken0PerToken1 =
                      priceToken1PerToken0 && priceToken1PerToken0 > 0
                        ? 1 / priceToken1PerToken0
                        : null;
                    const href = `/pages/positionCreate?token0=${encodeURIComponent(row.token0)}&token1=${encodeURIComponent(row.token1)}&fee=${fee}&index=${index}&currentPrice=${encodeURIComponent(String(priceToken1PerToken0 ?? ''))}`;
                    return (
                      <tr
                        key={`${row.pool}-${i}`}
                        className="border-b border-zinc-800/80 align-top hover:bg-zinc-800/30"
                      >
                        <td className="max-w-[min(100vw,100px)] px-3 py-3 text-zinc-200">{index}</td>
                        <td className="max-w-[300px] px-3 py-3">
                          {monoCell(
                            `${token0Symbol} (${formatPrice(priceToken0PerToken1)})  /  ${token1Symbol} (${formatPrice(priceToken1PerToken0)})`,
                          )}
                        </td>
                        <td className="max-w-[180px] px-3 py-3">
                          {monoCell(formatPrice(priceToken1PerToken0))}
                        </td>
                        <td className="max-w-[min(100vw,120px)] px-3 py-3 text-zinc-200">
                          {feeToPercent(row.fee)}
                        </td>
                        <td className="px-3 py-3 text-zinc-200">{Number(row.tick)}</td>
                        <td className="px-3 py-3 text-zinc-200">{Number(row.tickLower)}</td>
                        <td className="px-3 py-3 text-zinc-200">{Number(row.tickUpper)}</td>
                        <td className="max-w-[140px] px-3 py-3">{monoCell(row.liquidity.toString())}</td>
                        <td className="px-3 py-3">
                          <Link
                            href={href}
                            className="inline-flex rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-fuchsia-900/30 transition hover:brightness-110"
                          >
                            PositionCreate
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
