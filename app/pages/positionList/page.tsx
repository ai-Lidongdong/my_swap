'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useReadContract } from 'wagmi';
import { Header } from '@/app/components/Header';
import { POOL_MANAGER_ABI, POSITION_MANAGER_ABI } from '@/app/constants/abi';
import { POOL_MANAGER_ADDRESS, POSITION_MANAGER_ADDRESS } from '@/app/constants/contracts';
import { positionRowToDetailHref } from '@/app/lib/positionDetailQuery';
import { useWalletStore } from '@/app/stores/contract';
import { useWalletSessionStore } from '@/app/stores/wallet';

type PositionRow = {
  id?: bigint;
  fee?: bigint;
  index?: bigint;
  liquidity?: bigint;
  tickLower?: bigint;
  tickUpper?: bigint;
  token0?: `0x${string}`;
  token1?: `0x${string}`;
  tokensOwed0?: bigint;
  tokensOwed1?: bigint;
  owner?: `0x${string}`;
};

type PoolInfo = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  index: bigint;
  fee: bigint;
  tick: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
};

function tokenTail3(addr: string) {
  const a = addr.trim();
  if (a.length <= 3) {
    return a;
  }
  return `…${a.slice(-3)}`;
}

function formatBigint(v: unknown): string {
  if (v == null) {
    return '—';
  }
  if (typeof v === 'bigint') {
    return v.toString();
  }
  return String(v);
}

function monoCell(value: string, title?: string) {
  return (
    <span
      className="break-all font-mono text-[11px] leading-snug text-zinc-300"
      title={title ?? value}
    >
      {value}
    </span>
  );
}

function tickToPrice(tick?: bigint) {
  if (typeof tick !== 'bigint') {
    return null;
  }
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

function sqrtPriceX96ToPrice(sqrtPriceX96?: bigint) {
  if (typeof sqrtPriceX96 !== 'bigint' || sqrtPriceX96 <= 0n) {
    return null;
  }
  const q192 = 2n ** 192n;
  const ratio = Number((sqrtPriceX96 * sqrtPriceX96) / q192);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }
  return ratio;
}

function addrEq(a?: string, b?: string) {
  if (!a || !b) {
    return false;
  }
  return a.toLowerCase() === b.toLowerCase();
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

function feeToPercent(fee?: bigint) {
  const feeValue = Number(fee);
  if (!Number.isFinite(feeValue)) {
    return '--';
  }
  return `${feeValue / 10000}%`;
}

export default function PositionListPage() {
  const contractList = useWalletStore((state) => state.ContractList);
  const address = useWalletSessionStore.getState().address;
  const { data: allPositions, isLoading, isError, refetch, error } = useReadContract({
    address: POSITION_MANAGER_ADDRESS,
    abi: POSITION_MANAGER_ABI,
    functionName: 'getAllPositions',
    args: [],
  });
  const { data: allPools } = useReadContract({
    address: POOL_MANAGER_ADDRESS,
    abi: POOL_MANAGER_ABI,
    functionName: 'getAllPools',
    args: [],
  });
  const allRows = useMemo(() => {
    if (!allPositions || !Array.isArray(allPositions)) {
      return [] as PositionRow[];
    }
    return [...(allPositions as PositionRow[])].reverse();
  }, [allPositions]);
  const pools = useMemo(() => {
    if (!allPools || !Array.isArray(allPools)) {
      return [] as PoolInfo[];
    }
    return allPools as PoolInfo[];
  }, [allPools]);

  const myPositions = useMemo(() => {
    return allRows.filter(
      (item) => item.owner?.toLowerCase() === address?.toLowerCase(),
    );
  }, [allRows]);
  console.log('----myPositions', myPositions)


  const symbolMap = useMemo(() => {
    const map = new Map<string, string>();
    contractList.forEach((token) => {
      map.set(token.address.toLowerCase(), token.symbol);
    });
    return map;
  }, [contractList]);

  useEffect(() => {
    if (contractList.length === 0) {
      void useWalletStore.getState().getTokenInfo();
    }
  }, [contractList.length]);

  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');
  const positions = activeTab === 'my' ? myPositions : allRows;
  const [pageSize, setPageSize] = useState(10);
  const total = positions.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  useEffect(() => {
    setPage(1);
  }, [activeTab]);
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const start = (currentPage - 1) * pageSize;
  const slice = positions.slice(start, start + pageSize);

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 font-sans text-zinc-100">
      <Header active="positions" variant="dark" />

      <main className="mx-auto w-full max-w-[1600px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTab === 'my'
                  ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-900/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              My Positions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTab === 'all'
                  ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-900/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              All Positions
            </button>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-fuchsia-500/40 hover:bg-zinc-800"
          >
            刷新
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-xl shadow-black/40">
          {isLoading ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-400">加载中…</div>
          ) : isError ? (
            <div className="border-b border-red-500/20 px-6 py-8 text-sm text-red-200">
              读取失败：{error?.message ?? '未知错误'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/90">
                    {(
                      [
                        'ID',
                        'Token',
                        'FEE',
                        'Price range',
                        'Current price',
                        'TOKEN0',
                        'TOKEN1',
                        'Liquidity',
                        '操作',
                      ] as const
                    ).map((label) => (
                      <th
                        key={label}
                        className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {total === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-14 text-center text-sm text-zinc-500">
                        暂无仓位
                      </td>
                    </tr>
                  ) : (
                    slice.map((row, i) => {
                      const t0 = row.token0 ?? '';
                      const t1 = row.token1 ?? '';
                      const token0Symbol = t0 ? symbolMap.get(t0.toLowerCase()) ?? tokenTail3(t0) : '—';
                      const token1Symbol = t1 ? symbolMap.get(t1.toLowerCase()) ?? tokenTail3(t1) : '—';
                      const pool = pools.find((p) => {
                        const samePair =
                          (addrEq(p.token0, t0) && addrEq(p.token1, t1)) ||
                          (addrEq(p.token0, t1) && addrEq(p.token1, t0));
                        return (
                          samePair &&
                          Number(p.fee) === Number(row.fee) &&
                          Number(p.index) === Number(row.index)
                        );
                      });
                      const lowerRaw = tickToPrice(row.tickLower);
                      const upperRaw = tickToPrice(row.tickUpper);
                      const lowerPrice =
                        lowerRaw !== null && upperRaw !== null ? Math.min(lowerRaw, upperRaw) : null;
                      const upperPrice =
                        lowerRaw !== null && upperRaw !== null ? Math.max(lowerRaw, upperRaw) : null;
                      const currentPriceByTick = tickToPrice(pool?.tick);
                      const currentPriceBySqrt = sqrtPriceX96ToPrice(pool?.sqrtPriceX96);
                      const currentPrice = currentPriceByTick ?? currentPriceBySqrt;
                      const token0Price = currentPrice && currentPrice > 0 ? 1 / currentPrice : null;
                      const rangeDisplay =
                        typeof pool?.liquidity === 'bigint' && pool.liquidity > 0n
                          ? `${formatPrice(lowerPrice)} - ${formatPrice(upperPrice)}`
                          : `${formatPrice(lowerPrice)} - ${formatPrice(upperPrice)}`;
                      const key = `${formatBigint(row.id)}-${start + i}`;
                      return (
                        <tr
                          key={key}
                          className="border-b border-zinc-800/80 align-top last:border-b-0 hover:bg-zinc-800/25"
                        >
                          <td className="px-4 py-4 text-zinc-200">{formatBigint(row.id)}</td>
                          <td className="max-w-[300px] px-4 py-4">
                            {monoCell(
                              `${token0Symbol} (${formatPrice(token0Price)})  /  ${token1Symbol} (${formatPrice(currentPrice)})`,
                            )}
                          </td>
                          <td className="px-4 py-4 text-zinc-200">{feeToPercent(row.fee)}</td>
                          <td className="max-w-[220px] px-4 py-4">
                            {monoCell(rangeDisplay)}
                          </td>
                          <td className="max-w-[140px] px-4 py-4">{monoCell(formatPrice(currentPrice))}</td>
                          <td className="max-w-[220px] px-4 py-4">{monoCell(t0 || '—')}</td>
                          <td className="max-w-[220px] px-4 py-4">{monoCell(t1 || '—')}</td>
                          <td className="max-w-[160px] px-4 py-4">{monoCell(formatBigint(row.liquidity))}</td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <Link
                              href={positionRowToDetailHref(row)}
                              className="text-sm font-medium text-fuchsia-400 underline-offset-2 transition hover:text-fuchsia-300 hover:underline"
                            >
                              详情
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

          {!isLoading && !isError && total > 0 && (
            <div className="flex flex-col gap-3 border-t border-zinc-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500">
                {total === 0 ? '0' : `${start + 1}–${Math.min(start + pageSize, total)}`} of {total}{' '}
                items
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>Rows</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200 outline-none focus:border-fuchsia-500/50"
                  >
                    {[5, 10, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 disabled:opacity-40 hover:border-fuchsia-500/40"
                  >
                    ←
                  </button>
                  <span className="min-w-[2rem] rounded-lg border border-fuchsia-500/60 bg-fuchsia-950/30 px-2 py-1 text-center text-xs font-medium text-fuchsia-100">
                    {currentPage}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 disabled:opacity-40 hover:border-fuchsia-500/40"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
