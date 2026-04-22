'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { usePublicClient } from 'wagmi';
import { Header } from '@/app/components/Header';

const DEFAULT_TX_HASH: Hex =
  '0x0c824b44573e70e0bddaf162e91c6ae85893aa4cb43b79014bfa548930a53584';

function shortHash(hash: string) {
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function isTxHash(value: string | null): value is Hex {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function ResultInner() {
  const searchParams = useSearchParams();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const resultTitle = useMemo(() => {
    const title = searchParams.get('title')?.trim();
    return title || '交易成功';
  }, [searchParams]);

  const txHash = useMemo<Hex>(() => {
    const txFromUrl = searchParams.get('tx');
    return isTxHash(txFromUrl) ? txFromUrl : DEFAULT_TX_HASH;
  }, [searchParams]);

  const [txData, setTxData] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTx = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    setError('');
    try {
      const [tx, txReceipt] = await Promise.all([
        publicClient.getTransaction({ hash: txHash }),
        publicClient.getTransactionReceipt({ hash: txHash }),
      ]);
      console.log('tx', tx);
      console.log('txReceipt', txReceipt)
      setTxData(tx);
      setReceipt(txReceipt);
    } catch (e) {
      setTxData(null);
      setReceipt(null);
      setError(e instanceof Error ? e.message : '查询交易失败');
    } finally {
      setLoading(false);
    }
  }, [publicClient, txHash]);

  useEffect(() => {
    void loadTx();
  }, [loadTx]);

  return (
    <div className="min-h-screen bg-[#0b0b0c] px-3 py-5 text-zinc-100 sm:px-4 sm:py-6">
      <Header active="swap" variant="dark" maxWidth="narrow" />

      <main className="mx-auto mt-4 w-full max-w-2xl">
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-5 shadow-2xl shadow-black/40">
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <span aria-hidden className="text-xl leading-none">✓</span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-300/80">Success</p>
                <h2 className="text-lg font-semibold text-emerald-200">{resultTitle}</h2>
              </div>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-white">交易结果</h1>
            <button
              type="button"
              onClick={() => void loadTx()}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
            >
              刷新
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs text-zinc-400">交易哈希（来自 URL 参数 `tx`，无效时使用默认调试值）</p>
            <p className="mt-1 break-all font-mono text-sm text-zinc-100">{txHash}</p>
            <Link
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              className="mt-2 inline-block text-xs text-fuchsia-400 hover:text-fuchsia-300"
            >
              在 Etherscan 查看
            </Link>
          </div>

          {loading ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">查询中...</p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>
          ) : null}

          {!loading && !error && txData ? (
            <div className="space-y-3">
              <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <h2 className="mb-2 text-sm font-semibold text-zinc-200">Transaction</h2>
                <ul className="space-y-1 text-sm text-zinc-300">
                  <li><span className="text-zinc-500">hash:</span> <span className="font-mono">{shortHash(txData.hash)}</span></li>
                  <li><span className="text-zinc-500">from:</span> <span className="font-mono break-all">{txData.from}</span></li>
                  <li><span className="text-zinc-500">to:</span> <span className="font-mono break-all">{txData.to ?? 'contract creation'}</span></li>
                  <li><span className="text-zinc-500">nonce:</span> {String(txData.nonce)}</li>
                  <li><span className="text-zinc-500">value(wei):</span> {txData.value?.toString?.() ?? '0'}</li>
                  <li><span className="text-zinc-500">gas:</span> {txData.gas?.toString?.() ?? '--'}</li>
                  <li><span className="text-zinc-500">maxFeePerGas:</span> {txData.maxFeePerGas?.toString?.() ?? '--'}</li>
                </ul>
              </section>

              {receipt ? (
                <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <h2 className="mb-2 text-sm font-semibold text-zinc-200">Receipt</h2>
                  <ul className="space-y-1 text-sm text-zinc-300">
                    <li>
                      <span className="text-zinc-500">status:</span>{' '}
                      <span className={receipt.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                        {receipt.status}
                      </span>
                    </li>
                    <li><span className="text-zinc-500">blockNumber:</span> {receipt.blockNumber?.toString?.() ?? '--'}</li>
                    <li><span className="text-zinc-500">gasUsed:</span> {receipt.gasUsed?.toString?.() ?? '--'}</li>
                    <li><span className="text-zinc-500">effectiveGasPrice:</span> {receipt.effectiveGasPrice?.toString?.() ?? '--'}</li>
                    <li><span className="text-zinc-500">logs:</span> {String(receipt.logs?.length ?? 0)}</li>
                  </ul>
                </section>
              ) : (
                <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-400">
                  暂无 receipt（交易可能还未上链确认）。
                </section>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b0b0c] px-3 py-5 text-zinc-100 sm:px-4 sm:py-6">
          <Header active="swap" variant="dark" maxWidth="narrow" />
          <main className="mx-auto mt-4 w-full max-w-2xl">
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-5 text-sm text-zinc-300">
              查询中...
            </div>
          </main>
        </div>
      }
    >
      <ResultInner />
    </Suspense>
  );
}

