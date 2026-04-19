'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/app/components/Header';
import { parsePositionDetailQuery } from '@/app/lib/positionDetailQuery';
import type { Contract } from '@/app/stores/contract';
import { useWalletStore } from '@/app/stores/contract';

function addrEq(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function shortAddr(a: string) {
  if (a.length <= 12) {
    return a;
  }
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function tokenMeta(list: Contract[], addr: string): { symbol: string; decimals: number } {
  const c = list.find((x) => addrEq(x.address, addr));
  return { symbol: c?.symbol ?? shortAddr(addr), decimals: c?.decimals ?? 18 };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/80 py-2.5 last:border-b-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-right text-sm font-medium text-zinc-200">{value}</span>
    </div>
  );
}

function IncreaseLiquidityInner() {
  const sp = useSearchParams();
  const q = useMemo(() => parsePositionDetailQuery(sp), [sp]);
  const [amount0, setAmount0] = useState('0.1');
  const [amount1, setAmount1] = useState('280');

  const contractList = useWalletStore((s) => s.ContractList);
  const getTokenInfo = useWalletStore((s) => s.getTokenInfo);

  useEffect(() => {
    void getTokenInfo();
  }, [getTokenInfo]);

  const token0 = q.token0 ?? '';
  const token1 = q.token1 ?? '';
  const meta0 = useMemo(() => tokenMeta(contractList, token0), [contractList, token0]);
  const meta1 = useMemo(() => tokenMeta(contractList, token1), [contractList, token1]);

  if (!q.id) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
        <Header active="positions" variant="dark" maxWidth="narrow" />
        <main className="mx-auto mt-8 w-full max-w-2xl text-center text-sm text-zinc-500">
          缺少 position 参数，请从
          <Link href="/pages/positionList" className="mx-1 text-fuchsia-400 underline-offset-2 hover:underline">
            列表页
          </Link>
          进入。
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 font-sans text-zinc-100">
      <Header active="positions" variant="dark" maxWidth="narrow" />
      <main className="mx-auto w-full max-w-2xl">
        <Link
          href={`/pages/positionDetail?${sp.toString()}`}
          className="mb-5 inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-fuchsia-300"
        >
          <span aria-hidden>←</span>
          Back to position
        </Link>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl shadow-black/30 sm:p-7">
          <h1 className="text-3xl font-bold tracking-tight text-white">Add Liquidity</h1>

          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <InfoRow label="tokenId" value={q.id ?? '—'} />
            <InfoRow label="pair / fee" value={`${meta0.symbol}/${meta1.symbol} · ${q.fee ?? '—'}`} />
            <InfoRow label="价格区间" value={`${q.tickLower ?? '—'} ~ ${q.tickUpper ?? '—'}`} />
            <InfoRow label="池价格" value="slot0" />
            <InfoRow
              label="liquidity"
              value={<span className="font-mono text-xs text-zinc-300">{q.liquidity ?? '—'}</span>}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-zinc-400">amount0Desired</label>
              <input
                value={amount0}
                onChange={(e) => setAmount0(e.target.value)}
                placeholder="0.0"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-lg font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-fuchsia-500/40"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-zinc-400">amount1Desired</label>
              <input
                value={amount1}
                onChange={(e) => setAmount1(e.target.value)}
                placeholder="0.0"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-lg font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-fuchsia-500/40"
              />
            </div>
          </div>

          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-zinc-600 bg-transparent py-3.5 text-lg font-bold text-white transition hover:border-fuchsia-500/40 hover:bg-zinc-800/40"
          >
            预估流动性
          </button>

          <button
            type="button"
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-4 text-2xl font-bold text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110 active:scale-[0.995]"
            title="待接入 increaseLiquidity 合约调用"
          >
            Confirm increase
          </button>
        </div>
      </main>
    </div>
  );
}

export default function IncreaseLiquidityPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-400">
          <Header active="positions" variant="dark" maxWidth="narrow" />
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm">加载中…</p>
        </div>
      }
    >
      <IncreaseLiquidityInner />
    </Suspense>
  );
}
