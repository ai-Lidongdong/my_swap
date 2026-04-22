'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { Header } from '@/app/components/Header';
import { POSITION_MANAGER_ABI } from '@/app/constants/abi';
import { POSITION_MANAGER_ADDRESS } from '@/app/constants/contracts';
import { detailQueryToIncreaseLiquidityHref, parsePositionDetailQuery } from '@/app/lib/positionDetailQuery';
import type { Contract } from '@/app/stores/contract';
import { useWalletStore } from '@/app/stores/contract';
import { config } from '@/app/wagmi/config';

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

function feeToPercent(fee?: string) {
  if (!fee) {
    return '—';
  }
  const feeNum = Number(fee);
  if (!Number.isFinite(feeNum)) {
    return fee;
  }
  return `${feeNum / 10000}%`;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-zinc-800/90 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="shrink-0 text-sm text-zinc-500">{label}</span>
      <div className="min-w-0 text-right text-sm font-medium text-white">{children}</div>
    </div>
  );
}

function PositionDetailInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = useMemo(() => parsePositionDetailQuery(sp), [sp]);
  const { address } = useAccount();
  const [burnLoading, setBurnLoading] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const ContractList = useWalletStore((s) => s.ContractList);
  const getTokenInfo = useWalletStore((s) => s.getTokenInfo);

  useEffect(() => {
    void getTokenInfo();
  }, [getTokenInfo]);

  const token0 = q.token0 ?? '';
  const token1 = q.token1 ?? '';
  const meta0 = useMemo(() => tokenMeta(ContractList, token0), [ContractList, token0]);
  const meta1 = useMemo(() => tokenMeta(ContractList, token1), [ContractList, token1]);

  const owed0Display = useMemo(() => {
    const raw = q.tokensOwed0;
    if (!raw || !/^\d+$/.test(raw)) {
      return '—';
    }
    try {
      return `${formatUnits(BigInt(raw), meta0.decimals)} ${meta0.symbol}`;
    } catch {
      return raw;
    }
  }, [q.tokensOwed0, meta0.decimals, meta0.symbol]);

  const owed1Display = useMemo(() => {
    const raw = q.tokensOwed1;
    if (!raw || !/^\d+$/.test(raw)) {
      return '—';
    }
    try {
      return `${formatUnits(BigInt(raw), meta1.decimals)} ${meta1.symbol}`;
    } catch {
      return raw;
    }
  }, [q.tokensOwed1, meta1.decimals, meta1.symbol]);

  const addLiquidityHref = useMemo(() => {
    return detailQueryToIncreaseLiquidityHref(q);
  }, [q]);

  const missingId = !q.id;
  const hasCollectable = useMemo(() => {
    const owed0 = q.tokensOwed0 && /^\d+$/.test(q.tokensOwed0) ? BigInt(q.tokensOwed0) : 0n;
    const owed1 = q.tokensOwed1 && /^\d+$/.test(q.tokensOwed1) ? BigInt(q.tokensOwed1) : 0n;
    return owed0 > 0n || owed1 > 0n;
  }, [q.tokensOwed0, q.tokensOwed1]);

  const handleBurn = useCallback(async () => {
    if (!q.id || burnLoading || collectLoading) {
      return;
    }
    setActionError('');
    setBurnLoading(true);
    try {
      const positionId = BigInt(q.id);
      const hash = await writeContract(config, {
        address: POSITION_MANAGER_ADDRESS,
        abi: POSITION_MANAGER_ABI,
        functionName: 'burn',
        args: [positionId],
        chainId: sepolia.id,
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      if (receipt.status === 'success') {
        const params = new URLSearchParams({
          tx: hash,
          title: '移出成功',
        });
        router.replace(`/pages/Result?${params.toString()}`);
        return;
      }
      setActionError('交易未成功，请稍后重试。');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '移出流动性失败');
    } finally {
      setBurnLoading(false);
    }
  }, [burnLoading, collectLoading, q.id, router]);

  const handleCollect = useCallback(async () => {
    if (!q.id || !address || burnLoading || collectLoading) {
      return;
    }
    setActionError('');
    setCollectLoading(true);
    try {
      const positionId = BigInt(q.id);
      const hash = await writeContract(config, {
        address: POSITION_MANAGER_ADDRESS,
        abi: POSITION_MANAGER_ABI,
        functionName: 'collect',
        args: [positionId, address],
        chainId: sepolia.id,
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      if (receipt.status === 'success') {
        const params = new URLSearchParams({
          tx: hash,
          title: '领取成功',
        });
        router.replace(`/pages/Result?${params.toString()}`);
        return;
      }
      setActionError('交易未成功，请稍后重试。');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '领取资产与手续费失败');
    } finally {
      setCollectLoading(false);
    }
  }, [address, burnLoading, collectLoading, q.id, router]);

  if (missingId) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
        <Header active="positions" variant="dark" maxWidth="narrow" />
        <main className="mx-auto mt-8 w-full max-w-2xl text-center text-sm text-zinc-500">
          缺少仓位参数，请从
          <Link href="/pages/positionList" className="mx-1 text-fuchsia-400 underline-offset-2 hover:underline">
            仓位列表
          </Link>
          进入详情。
        </main>
      </div>
    );
  }

  const tickLo = q.tickLower ?? '—';
  const tickHi = q.tickUpper ?? '—';
  const liquidity = q.liquidity ?? '—';

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 font-sans text-zinc-100">
      <Header active="positions" variant="dark" maxWidth="narrow" />

      <main className="mx-auto w-full max-w-2xl">
        <Link
          href="/pages/positionList"
          className="mb-5 inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-fuchsia-300"
        >
          <span aria-hidden>←</span>
          Back to positions
        </Link>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl shadow-black/30 sm:p-7">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-5">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Position #{q.id}</h1>
            <span
              className="rounded-full border border-emerald-500/40 bg-emerald-950/50 px-3 py-1 text-xs font-medium text-emerald-200"
              title="参考样式；未接链上 tick 校验"
            >
              In range
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Position info</h2>
            <InfoRow label="token0 / token1">
              <span className="font-semibold">
                {meta0.symbol} / {meta1.symbol}
              </span>
            </InfoRow>
            <InfoRow label="fee">{feeToPercent(q.fee)}</InfoRow>
            <InfoRow label="index">{q.index ?? '—'}</InfoRow>
            <InfoRow label="tickLower ~ tickUpper">
              <span className="font-mono text-[13px] text-zinc-200">
                {tickLo} ~ {tickHi}
              </span>
            </InfoRow>
            <InfoRow label="liquidity">
              <span className="font-mono text-xs text-zinc-300">{liquidity}</span>
            </InfoRow>
            <InfoRow label="currentPrice">
              <span className="text-zinc-500">—</span>
            </InfoRow>
          </div>

          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              可领取余额 (tokensOwed)
            </h2>
            <InfoRow label="token0">{owed0Display}</InfoRow>
            <InfoRow label="token1">{owed1Display}</InfoRow>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            {/* {addLiquidityHref ? (
              <Link
                href={addLiquidityHref}
                className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110"
              >
                增加流动性
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-xl border border-zinc-700 bg-zinc-900 py-3.5 text-sm font-semibold text-zinc-500"
              >
                增加流动性（参数不完整）
              </button>
            )} */}
            <button
              type="button"
              onClick={() => void handleBurn()}
              disabled={burnLoading || collectLoading}
              className="w-full rounded-xl border border-fuchsia-500/40 bg-fuchsia-600/10 py-3.5 text-sm font-semibold text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              title="待接入合约"
            >
              {burnLoading ? '移出中…' : '移出流动性'}
            </button>
            {hasCollectable ? (
              <button
                type="button"
                disabled={burnLoading || collectLoading || !address}
                onClick={() => void handleCollect()}
                className="w-full rounded-xl border border-violet-500/40 bg-violet-600/10 py-3.5 text-sm font-semibold text-violet-200 transition hover:border-violet-400 hover:bg-violet-600/20 disabled:cursor-not-allowed disabled:opacity-60"
                title="待接入合约"
              >
                {collectLoading ? '领取中…' : '领取资产与手续费'}
              </button>
            ) : null}
            {actionError ? (
              <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {actionError}
              </p>
            ) : null}
          </div>
        </div>
        {burnLoading || collectLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-[1px]">
            <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100">
              {burnLoading ? '移出交易确认中，请稍候…' : '领取交易确认中，请稍候…'}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default function PositionDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-400">
          <Header active="positions" variant="dark" maxWidth="narrow" />
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm">加载中…</p>
        </div>
      }
    >
      <PositionDetailInner />
    </Suspense>
  );
}
