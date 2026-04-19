'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { parseEventLogs, parseUnits, zeroAddress, type Address } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { sepolia } from 'viem/chains';
import { Header } from '@/app/components/Header';
import { POOL_MANAGER_ABI, POSITION_MANAGER_ABI, TOKEN_ABI } from '@/app/constants/abi';
import { POOL_MANAGER_ADDRESS, POSITION_MANAGER_ADDRESS, TOKENA_ADDRESS, TOKENB_ADDRESS } from '@/app/constants/contracts';

/** 仅用于解析 mint 后 ERC721 Transfer（严格类型） */
const ERC721_TRANSFER_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const;
import { POOL_FEE_TIERS } from '@/app/constants/pool';
import { formatPrice1Per0, humanPrice1Per0FromTick } from '@/app/lib/tickPrice';
import type { Contract } from '@/app/stores/contract';
import { useWalletStore } from '@/app/stores/contract';
import { useWalletSessionStore } from '@/app/stores/wallet';
import { config } from '@/app/wagmi/config';

type PoolInfo = {
  pool: Address;
  token0: Address;
  token1: Address;
  index: bigint;
  fee: bigint;
  feeProtocol: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  tick: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
};

function addrEq(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function shortAddr(a: string) {
  if (a.length <= 12) {
    return a;
  }
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function findPoolByQuery(
  pools: PoolInfo[],
  q0: string,
  q1: string,
  feeNum: number,
  indexNum: number,
): PoolInfo | undefined {
  return pools.find((p) => {
    if (Number(p.fee) !== feeNum || Number(p.index) !== indexNum) {
      return false;
    }
    return (
      (addrEq(p.token0, q0) && addrEq(p.token1, q1)) || (addrEq(p.token0, q1) && addrEq(p.token1, q0))
    );
  });
}

function tokenMeta(list: Contract[], addr: string): { symbol: string; decimals: number } {
  const c = list.find((x) => addrEq(x.address, addr));
  return { symbol: c?.symbol ?? shortAddr(addr), decimals: c?.decimals ?? 18 };
}

function feeTierLabel(fee: number) {
  if (!Number.isFinite(fee)) {
    return '—';
  }
  return `${fee / 10000}%`;
}

function formatAmountInput(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '';
  }
  if (value === 0) {
    return '0';
  }
  if (value >= 1_000_000 || value < 0.000001) {
    return value.toExponential(6);
  }
  return value.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 8,
  });
}

function PositionCreateInner() {
  const sp = useSearchParams();
  const qToken0 = (sp.get('token0') ?? '').trim();
  const qToken1 = (sp.get('token1') ?? '').trim();
  const qFee = sp.get('fee') ?? '';
  const qIndex = sp.get('index') ?? '';
  const qCurrentPrice = sp.get('currentPrice') ?? '';

  const feeNum = Number(qFee);
  const indexNum = Number(qIndex);
  const queryValid =
    qToken0.startsWith('0x') &&
    qToken1.startsWith('0x') &&
    Number.isInteger(feeNum) &&
    feeNum > 0 &&
    Number.isInteger(indexNum) &&
    indexNum >= 0;

  const { address, isConnected } = useAccount();
  const contractList = useWalletStore((s) => s.ContractList);
  const getTokenInfo = useWalletStore((s) => s.getTokenInfo);
  const transactionDeadlineMinutes = useWalletSessionStore((s) => s.transactionDeadlineMinutes);

  const {
    data: rawPools,
    isLoading: poolsLoading,
    isError: poolsError,
    error: poolsReadError,
    refetch,
  } = useReadContract({
    address: POOL_MANAGER_ADDRESS,
    abi: POOL_MANAGER_ABI,
    functionName: 'getAllPools',
    args: [],
    query: { enabled: queryValid },
  });

  const pools = useMemo(() => {
    if (!rawPools || !Array.isArray(rawPools)) {
      return [] as PoolInfo[];
    }
    return rawPools as PoolInfo[];
  }, [rawPools]);

  const matched = useMemo(() => {
    if (!queryValid) {
      return undefined;
    }
    return findPoolByQuery(pools, qToken0, qToken1, feeNum, indexNum);
  }, [pools, queryValid, qToken0, qToken1, feeNum, indexNum]);

  const meta0 = matched ? tokenMeta(contractList, matched.token0) : { symbol: '—', decimals: 18 };
  const meta1 = matched ? tokenMeta(contractList, matched.token1) : { symbol: '—', decimals: 18 };

  const currentPriceHuman = matched
    ? humanPrice1Per0FromTick(matched.tick, meta0.decimals, meta1.decimals)
    : Number.NaN;
  const priceLowerHuman = matched
    ? humanPrice1Per0FromTick(matched.tickLower, meta0.decimals, meta1.decimals)
    : Number.NaN;
  const priceUpperHuman = matched
    ? humanPrice1Per0FromTick(matched.tickUpper, meta0.decimals, meta1.decimals)
    : Number.NaN;

  const rangeStatus = useMemo(() => {
    if (!matched) {
      return { label: '—', className: 'bg-zinc-700 text-zinc-200' };
    }
    const { tick, tickLower, tickUpper } = matched;
    if (tick < tickLower) {
      return { label: '低于区间 · 单边入金', className: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40' };
    }
    if (tick > tickUpper) {
      return { label: '高于区间 · 单边入金', className: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40' };
    }
    return { label: '区间内 · 双边入金', className: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40' };
  }, [matched]);

  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [mintedId, setMintedId] = useState<string>('');

  const queryCurrentPrice = Number(qCurrentPrice);
  const effectivePrice1Per0 =
    Number.isFinite(queryCurrentPrice) && queryCurrentPrice > 0
      ? queryCurrentPrice
      : currentPriceHuman;
  const effectivePrice0Per1 =
    Number.isFinite(effectivePrice1Per0) && effectivePrice1Per0 > 0 ? 1 / effectivePrice1Per0 : Number.NaN;

  const handleAmount0Change = useCallback(
    (raw: string) => {
      setAmount0(raw);
      const next = raw.trim();
      if (!next) {
        setAmount1('');
        return;
      }
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isFinite(effectivePrice1Per0) || effectivePrice1Per0 <= 0) {
        return;
      }
      setAmount1(formatAmountInput(parsed * effectivePrice1Per0));
    },
    [effectivePrice1Per0],
  );

  const handleAmount1Change = useCallback(
    (raw: string) => {
      setAmount1(raw);
      const next = raw.trim();
      if (!next) {
        setAmount0('');
        return;
      }
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isFinite(effectivePrice1Per0) || effectivePrice1Per0 <= 0) {
        return;
      }
      setAmount0(formatAmountInput(parsed / effectivePrice1Per0));
    },
    [effectivePrice1Per0],
  );

  useEffect(() => {
    if (contractList.length === 0) {
      void getTokenInfo();
    }
  }, [contractList.length, getTokenInfo]);

  const handleMint = useCallback(async () => {
    setFormError('');
    setTxHash('');
    setMintedId('');
    if (!matched || !address) {
      setFormError(!isConnected ? '请先连接钱包。' : '未找到对应池子，请从 Pool 列表重新进入。');
      return;
    }
    let a0: bigint;
    let a1: bigint;
    try {
      a0 = parseUnits(amount0 || '0', meta0.decimals);
      a1 = parseUnits(amount1 || '0', meta1.decimals);
    } catch {
      setFormError('数量格式无效，请检查小数位。');
      return;
    }
    if (a0 <= BigInt(0) && a1 <= BigInt(0)) {
      setFormError('至少一种代币数量须大于 0。');
      return;
    }

    const deadlineSec = BigInt(Math.floor(Date.now() / 1000) + transactionDeadlineMinutes * 60);
    setSubmitting(true);
    console.log(a0, a1, deadlineSec);
    try {
      const resA = await writeContract(config, {
        address: matched.token0,
        abi: TOKEN_ABI,
        functionName: 'approve',
        args: [POSITION_MANAGER_ADDRESS, a0],
        gas: BigInt(16000000), // 明确指定低于上限的值
        chainId: sepolia.id,

      })
      const resB = await writeContract(config, {
        address: matched.token1,
        abi: TOKEN_ABI,
        functionName: 'approve',
        args: [POSITION_MANAGER_ADDRESS, a1],
        gas: BigInt(16000000), // 明确指定低于上限的值
        chainId: sepolia.id,

      })
      const hash = await writeContract(config, {
        address: POSITION_MANAGER_ADDRESS,
        abi: POSITION_MANAGER_ABI,
        functionName: 'mint',
        args: [
          {
            token0: matched.token0,
            token1: matched.token1,
            index: Number(matched.index),
            amount0Desired: a0,
            amount1Desired: a1,
            recipient: address,
            deadline: deadlineSec,
          },
        ],
        gas: BigInt(16000000), // 明确指定低于上限的值
        chainId: sepolia.id,
      });
      setTxHash(hash);
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      const pmLogs = receipt.logs.filter(
        (l) => l.address.toLowerCase() === POSITION_MANAGER_ADDRESS.toLowerCase(),
      );
      const transfers = parseEventLogs({
        abi: ERC721_TRANSFER_ABI,
        eventName: 'Transfer',
        logs: pmLogs,
      });
      const mintEv = [...transfers].reverse().find((l) => l.args.from === zeroAddress);
      const id = mintEv?.args.tokenId;
      if (id !== undefined) {
        setMintedId(id.toString());
        location.href = '/pages/positionList';
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Mint 失败');
    } finally {
      setSubmitting(false);
    }
  }, [
    matched,
    address,
    isConnected,
    amount0,
    amount1,
    meta0.decimals,
    meta1.decimals,
    transactionDeadlineMinutes,
  ]);

  const feeDisplay = matched ? feeTierLabel(Number(matched.fee)) : '—';

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
      <Header active="positions" variant="dark" maxWidth="narrow" />

      <main className="mx-auto mt-4 max-w-2xl">
        {!queryValid ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6">
            <h1 className="text-lg font-semibold text-white">缺少路由参数</h1>
            <p className="mt-2 text-sm text-zinc-500">
              请从{' '}
              <Link href="/pages/poolList" className="text-fuchsia-400 underline-offset-2 hover:underline">
                Pool 列表
              </Link>{' '}
              点击「PositionCreate」进入，需携带 token0、token1、fee、index。
            </p>
          </div>
        ) : poolsLoading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-6 py-16 text-center text-zinc-400">
            正在读取池子数据…
          </div>
        ) : poolsError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/40 px-6 py-8 text-sm text-red-200">
            读取失败：{poolsReadError?.message ?? '未知错误'}
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 block rounded-lg border border-red-400/40 px-3 py-2 text-red-100 transition hover:bg-red-900/40"
            >
              重试
            </button>
          </div>
        ) : !matched ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6">
            <h1 className="text-lg font-semibold text-white">未匹配到池子</h1>
            <p className="mt-2 text-sm text-zinc-500">
              当前链上 getAllPools 中找不到 fee={feeNum}、index={indexNum} 且代币地址一致的池子。请返回列表刷新后重试。
            </p>
            <Link
              href="/pages/poolList"
              className="mt-4 inline-block text-sm text-fuchsia-400 underline-offset-2 hover:underline"
            >
              返回 Pool 列表
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-xl shadow-black/30">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                {meta0.symbol} / {meta1.symbol}
              </h1>
              <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 ring-1 ring-zinc-700">
                {POOL_FEE_TIERS.find((t) => t.fee === Number(matched.fee))?.label ?? `${Number(matched.fee)}`}
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-zinc-500">currentPrice（slot0）</span>
                <span className="font-mono text-base font-semibold text-white">
                  {formatPrice1Per0(effectivePrice1Per0)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-zinc-500">区间状态</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rangeStatus.className}`}>
                  {rangeStatus.label}
                </span>
              </div>
              <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-zinc-600" title="slot0.sqrtPriceX96">
                sqrtPriceX96 {matched.sqrtPriceX96.toString()}
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400" htmlFor="amt0">
                  amount0Desired（{meta0.symbol}）
                </label>
                <input
                  id="amt0"
                  type="text"
                  inputMode="decimal"
                  value={amount0}
                  onChange={(e) => handleAmount0Change(e.target.value)}
                  placeholder="0.0"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none ring-fuchsia-500/0 transition focus:border-fuchsia-500/50 focus:ring-2 focus:ring-fuchsia-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400" htmlFor="amt1">
                  amount1Desired（{meta1.symbol}）
                </label>
                <input
                  id="amt1"
                  type="text"
                  inputMode="decimal"
                  value={amount1}
                  onChange={(e) => handleAmount1Change(e.target.value)}
                  placeholder="0.0"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none ring-fuchsia-500/0 transition focus:border-fuchsia-500/50 focus:ring-2 focus:ring-fuchsia-500/20"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-4">
              <p className="text-xs font-medium text-zinc-400">价值换算（按 currentPrice）</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-zinc-500">{meta0.symbol} → {meta1.symbol}</span>
                <span className="font-mono text-zinc-100">
                  {amount0 || '0'} {meta0.symbol} ≈{' '}
                  {amount0 && Number.isFinite(Number(amount0)) && Number.isFinite(effectivePrice1Per0)
                    ? formatAmountInput(Number(amount0) * effectivePrice1Per0)
                    : '0'}{' '}
                  {meta1.symbol}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-zinc-500">{meta1.symbol} → {meta0.symbol}</span>
                <span className="font-mono text-zinc-100">
                  {amount1 || '0'} {meta1.symbol} ≈{' '}
                  {amount1 && Number.isFinite(Number(amount1)) && Number.isFinite(effectivePrice0Per1)
                    ? formatAmountInput(Number(amount1) * effectivePrice0Per1)
                    : '0'}{' '}
                  {meta0.symbol}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm">
              <div className="flex justify-between gap-2 text-zinc-400">
                <span>最低价格</span>
                <span className="text-right font-medium text-zinc-100">
                  {formatPrice1Per0(priceLowerHuman)} {meta1.symbol} / {meta0.symbol}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-2 text-zinc-400">
                <span>最高价格</span>
                <span className="text-right font-medium text-zinc-100">
                  {formatPrice1Per0(priceUpperHuman)} {meta1.symbol} / {meta0.symbol}
                </span>
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400" htmlFor="feeSel">
                fee
              </label>
              <div className="relative">
                <select
                  id="feeSel"
                  disabled
                  value={Number(matched.fee)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pr-10 pl-3 text-sm text-zinc-200 opacity-90"
                >
                  <option value={Number(matched.fee)}>{feeDisplay}</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">▾</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-600">费率由所选池子固定，不可在此页修改。</p>
            </div>

            {formError ? (
              <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {formError}
              </p>
            ) : null}
            {txHash ? (
              <div className="mt-3 space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200/95">
                <p className="break-all">已确认 tx：{txHash}</p>
                {mintedId ? <p>positionId：{mintedId}</p> : null}
                <Link
                  href={`/pages/poolList${mintedId ? `?minted=${encodeURIComponent(mintedId)}` : `?tx=${encodeURIComponent(txHash)}`}`}
                  className="inline-block font-medium text-fuchsia-300 underline-offset-2 hover:underline"
                >
                  返回 Pool 列表
                </Link>
              </div>
            ) : null}

            <button
              type="button"
              disabled={submitting || !isConnected}
              onClick={() => void handleMint()}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? '提交中…' : 'Mint position'}
            </button>
            {!isConnected ? (
              <p className="mt-2 text-center text-xs text-amber-200/90">连接钱包后即可提交。</p>
            ) : null}

            <p className="mt-4 text-center text-[11px] text-zinc-600">
              提交后 txResult → 将跳转回 Pool 列表（minted=positionId）；positionDetail 页后续接入。
            </p>

            <Link
              href="/pages/poolList"
              className="mt-4 inline-block text-sm text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              返回 Pool 列表
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PositionCreatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-400">
          <Header active="positions" variant="dark" maxWidth="narrow" />
          <p className="mx-auto mt-8 max-w-2xl text-center">加载中…</p>
        </div>
      }
    >
      <PositionCreateInner />
    </Suspense>
  );
}
