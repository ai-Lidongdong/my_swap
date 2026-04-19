'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { Header } from '@/app/components/Header';
import { POOL_MANAGER_ABI } from '@/app/constants/abi';
import { POOL_MANAGER_ADDRESS } from '@/app/constants/contracts';
import { POOL_FEE_TIERS } from '@/app/constants/pool';
import type { Contract } from '@/app/stores/contract';
import { useWalletStore } from '@/app/stores/contract';
import { config } from '@/app/wagmi/config';
import { sepolia } from 'wagmi/chains';

type TokenField = 'token0' | 'token1';

const Q192 = BigInt(1) << BigInt(192);
const INT24_MIN = -8_388_608;
const INT24_MAX = 8_388_607;

function bigintSqrt(value: bigint): bigint {
  const two = BigInt(2);
  if (value < two) {
    return value;
  }

  let x0 = value;
  let x1 = (x0 + value / x0) >> BigInt(1);

  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> BigInt(1);
  }

  return x0;
}

function shortAddress(address: string) {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tokenDisplay(token?: Contract | null) {
  if (!token) {
    return 'Select token';
  }
  return `${token.symbol} ${shortAddress(token.address)}`;
}

function computeSqrtPriceX96(
  token0Amount: string,
  token1Amount: string,
  token0Decimals: number,
  token1Decimals: number
): bigint | null {
  if (!token0Amount || !token1Amount) {
    return null;
  }

  const rawAmount0 = parseUnits(token0Amount, token0Decimals);
  const rawAmount1 = parseUnits(token1Amount, token1Decimals);

  if (rawAmount0 <= BigInt(0) || rawAmount1 <= BigInt(0)) {
    return null;
  }

  const ratioX192 = (rawAmount1 * Q192) / rawAmount0;
  if (ratioX192 <= BigInt(0)) {
    return null;
  }

  return bigintSqrt(ratioX192);
}

export default function PoolCreatePage() {
  const { isConnected } = useAccount();
  const contractList = useWalletStore((state) => state.ContractList);
  const getTokenInfo = useWalletStore((state) => state.getTokenInfo);

  const [token0, setToken0] = useState<Contract | null>(null);
  const [token1, setToken1] = useState<Contract | null>(null);
  const [fee, setFee] = useState<number>(3000);
  const [token0Amount, setToken0Amount] = useState('1');
  const [token1Amount, setToken1Amount] = useState('3000');
  const [tickLower, setTickLower] = useState('-193050');
  const [tickUpper, setTickUpper] = useState('-192000');

  const [activeTokenField, setActiveTokenField] = useState<TokenField | null>(null);
  const [keyword, setKeyword] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (contractList.length === 0) {
      getTokenInfo().catch((error) => {
        console.error('[PoolCreate] getTokenInfo failed:', error);
      });
    }
  }, [contractList.length, getTokenInfo]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const feeTier = useMemo(() => {
    return POOL_FEE_TIERS.find((item) => item.fee === fee) ?? POOL_FEE_TIERS[2];
  }, [fee]);

  const sqrtPriceX96 = useMemo(() => {
    try {
      return computeSqrtPriceX96(
        token0Amount,
        token1Amount,
        token0?.decimals ?? 18,
        token1?.decimals ?? 18
      );
    } catch {
      return null;
    }
  }, [token0Amount, token1Amount, token0?.decimals, token1?.decimals]);

  const filteredTokens = useMemo(() => {
    const input = keyword.trim().toLowerCase();
    if (!input) {
      return contractList;
    }
    return contractList.filter((item) => {
      return (
        item.symbol.toLowerCase().includes(input) ||
        item.name.toLowerCase().includes(input) ||
        item.address.toLowerCase().includes(input)
      );
    });
  }, [contractList, keyword]);

  const validationMessage = useMemo(() => {
    if (!token0 || !token1) {
      return '请先选择 token0 和 token1。';
    }

    if (token0.address.toLowerCase() >= token1.address.toLowerCase()) {
      return 'token0 必须小于 token1（按地址字典序）。';
    }

    const lower = Number(tickLower);
    const upper = Number(tickUpper);
    if (!Number.isInteger(lower) || !Number.isInteger(upper)) {
      return 'tickLower / tickUpper 必须是整数。';
    }
    if (lower < INT24_MIN || upper > INT24_MAX) {
      return 'tick 超出 int24 范围。';
    }
    if (lower >= upper) {
      return 'tickLower 必须小于 tickUpper。';
    }
    if (lower % feeTier.tickSpacing !== 0 || upper % feeTier.tickSpacing !== 0) {
      return `tick 必须是 tickSpacing=${feeTier.tickSpacing} 的整数倍。`;
    }

    if (!sqrtPriceX96 || sqrtPriceX96 <= BigInt(0)) {
      return '请输入有效的 token0Amount 和 token1Amount。';
    }

    return '';
  }, [feeTier.tickSpacing, sqrtPriceX96, tickLower, tickUpper, token0, token1]);

  const canSubmit = isConnected && !validationMessage && !submitting;

  function handleSelectToken(token: Contract) {
    if (!activeTokenField) {
      return;
    }
    if (activeTokenField === 'token0') {
      setToken0(token);
    } else {
      setToken1(token);
    }
    setActiveTokenField(null);
    setKeyword('');
  }

  function openTokenModal(field: TokenField) {
    setKeyword('');
    setActiveTokenField(field);
    const list = useWalletStore.getState().ContractList;
    if (list.length === 0) {
      void useWalletStore.getState().getTokenInfo();
    }
  }

  useEffect(() => {
    if (!activeTokenField && !confirmOpen) {
      return;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveTokenField(null);
        setConfirmOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTokenField, confirmOpen]);

  async function submitCreatePool() {
    if (!token0 || !token1 || !sqrtPriceX96) {
      return;
    }
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setTxHash('');

    try {
      const hash = await writeContract(config, {
        abi: POOL_MANAGER_ABI,
        address: POOL_MANAGER_ADDRESS,
        functionName: 'createAndInitializePoolIfNecessary',
        args: [
          {
            token0: token0.address as `0x${string}`,
            token1: token1.address as `0x${string}`,
            fee,
            tickLower: Number(tickLower),
            tickUpper: Number(tickUpper),
            sqrtPriceX96,
          },
        ],
        chainId: sepolia.id,
      });

      setTxHash(hash);
      await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      setConfirmOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '创建池子失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  const tokenModal =
    mounted && activeTokenField ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-modal-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="关闭"
          onClick={() => {
            setActiveTokenField(null);
            setKeyword('');
          }}
        />
        <div className="relative z-[1] w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/50">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="token-modal-title" className="text-lg font-semibold text-white">
              Select token
            </h2>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              onClick={() => {
                setActiveTokenField(null);
                setKeyword('');
              }}
            >
              Close
            </button>
          </div>

          <input
            className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
            placeholder="Search by symbol / name / address"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            autoFocus
          />

          <div className="max-h-72 space-y-2 overflow-auto pr-1">
            {filteredTokens.map((item) => (
              <button
                type="button"
                key={item.address}
                className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-left transition hover:border-fuchsia-500/40 hover:bg-zinc-800/60"
                onClick={() => handleSelectToken(item)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-bold text-white">
                  {item.symbol.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{item.symbol}</div>
                  <div className="truncate text-xs text-zinc-500">{shortAddress(item.address)}</div>
                </div>
              </button>
            ))}
            {filteredTokens.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                ContractList 中暂无代币，请确认已请求 /api/tokens 或稍后重试。
              </p>
            ) : null}
          </div>
        </div>
      </div>
    ) : null;

  const confirmModal =
    mounted && confirmOpen ? (
      <div
        className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="关闭"
          onClick={() => !submitting && setConfirmOpen(false)}
        />
        <div className="relative z-[1] w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/50">
          <h2 id="confirm-modal-title" className="text-lg font-semibold text-white">
            Confirm · createAndInitializePoolIfNecessary
          </h2>
          <div className="mt-4 space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="text-zinc-500">token0</span>
              <span className="break-all font-mono text-xs text-fuchsia-200">{token0?.address ?? '-'}</span>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="text-zinc-500">token1</span>
              <span className="break-all font-mono text-xs text-fuchsia-200">{token1?.address ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500">fee</span>
              <span className="text-white">{fee}</span>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
              <span className="shrink-0 text-zinc-500">sqrtPriceX96</span>
              <span className="break-all font-mono text-xs text-zinc-300">{sqrtPriceX96?.toString() ?? '-'}</span>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              className="flex-1 rounded-xl border border-zinc-600 bg-zinc-800/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/40 transition hover:from-fuchsia-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={submitCreatePool}
              disabled={!canSubmit}
            >
              {submitting ? 'Submitting...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
      <Header active="pool" variant="dark" maxWidth="narrow" />

      <main className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl shadow-black/30 backdrop-blur-sm">
        <div className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">Create pool</h1>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          token0 &lt; token1（地址排序）。价格区间由 tickLower / tickUpper 指定（需与所选 fee 的 tickSpacing 对齐）。
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-300">token0</span>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-left text-sm text-white transition hover:border-fuchsia-500/40 hover:bg-zinc-900"
              onClick={() => openTokenModal('token0')}
            >
              <span className="truncate">{tokenDisplay(token0)}</span>
              <span className="shrink-0 text-zinc-500" aria-hidden>
                ▾
              </span>
            </button>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-300">token1</span>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-left text-sm text-white transition hover:border-fuchsia-500/40 hover:bg-zinc-900"
              onClick={() => openTokenModal('token1')}
            >
              <span className="truncate">{tokenDisplay(token1)}</span>
              <span className="shrink-0 text-zinc-500" aria-hidden>
                ▾
              </span>
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="fee">
              fee（uint24）
            </label>
            <select
              id="fee"
              className="w-full cursor-pointer rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
              value={fee}
              onChange={(event) => setFee(Number(event.target.value))}
            >
              {POOL_FEE_TIERS.map((item) => (
                <option key={item.fee} value={item.fee} className="bg-zinc-900">
                  {item.label} · {item.fee} · tickSpacing {item.tickSpacing}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="token0Amount">
                token0Amount
              </label>
              <input
                id="token0Amount"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
                value={token0Amount}
                onChange={(event) => setToken0Amount(event.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="token1Amount">
                token1Amount
              </label>
              <input
                id="token1Amount"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
                value={token1Amount}
                onChange={(event) => setToken1Amount(event.target.value)}
                placeholder="3000"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="tickLower">
                tickLower（int24）
              </label>
              <input
                id="tickLower"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
                value={tickLower}
                onChange={(event) => setTickLower(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="tickUpper">
                tickUpper（int24）
              </label>
              <input
                id="tickUpper"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
                value={tickUpper}
                onChange={(event) => setTickUpper(event.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-zinc-500">提交前校验 tickLower &lt; tickUpper，且均为 spacing 的整数倍。</p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-500">sqrtPriceX96</span>
              <span className="max-w-[70%] truncate font-mono text-xs text-fuchsia-200/90">
                {sqrtPriceX96 ? sqrtPriceX96.toString() : '—'}
              </span>
            </div>
          </div>

          {validationMessage ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
              {validationMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </p>
          ) : null}

          {txHash ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              交易已发送: {txHash}
            </p>
          ) : null}

          <button
            type="button"
            className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/40 transition hover:from-fuchsia-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
          >
            Create pool
          </button>

          <p className="mt-2 text-center text-xs text-zinc-500">
            <Link
              href={`/pages/positionCreate?token0=${encodeURIComponent(token0?.address ?? '')}&token1=${encodeURIComponent(token1?.address ?? '')}&fee=${fee}`}
              className="text-fuchsia-400 underline-offset-2 hover:text-fuchsia-300 hover:underline"
            >
              成功后跳转 position create（透传 token0, token1, fee）
            </Link>
          </p>
        </div>
      </main>

      {mounted ? createPortal(tokenModal, document.body) : null}
      {mounted ? createPortal(confirmModal, document.body) : null}
    </div>
  );
}
