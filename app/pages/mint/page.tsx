'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { erc20Abi, parseUnits, type Address } from 'viem';
import { useAccount } from 'wagmi';
import { readContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { sepolia } from 'wagmi/chains';
import { Header } from '@/app/components/Header';
import { TEST_ERC20_MINT_ABI } from '@/app/constants/testErc20MintAbi';
import {
  TOKENA_ADDRESS,
  TOKENB_ADDRESS,
  TOKENC_ADDRESS,
  TOKEND_ADDRESS,
} from '@/app/constants/contracts';
import { config } from '@/app/wagmi/config';
import { useWalletSessionStore } from '@/app/stores/wallet';

type MintTokenKey = 'TOKENA' | 'TOKENB' | 'TOKENC' | 'TOKEND';

const MINT_TOKENS: readonly { key: MintTokenKey; address: Address }[] = [
  { key: 'TOKENA', address: TOKENA_ADDRESS as Address },
  { key: 'TOKENB', address: TOKENB_ADDRESS as Address },
  { key: 'TOKENC', address: TOKENC_ADDRESS as Address },
  { key: 'TOKEND', address: TOKEND_ADDRESS as Address },
];

type TokenMeta = {
  key: MintTokenKey;
  address: Address;
  symbol: string;
  decimals: number;
};

export default function MintPage() {
  const { address, isConnected } = useAccount();
  const [meta, setMeta] = useState<TokenMeta[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<MintTokenKey, string>>({
    TOKENA: '1000',
    TOKENB: '1000',
    TOKENC: '1000',
    TOKEND: '1000',
  });
  const [pending, setPending] = useState<Record<MintTokenKey, boolean>>({
    TOKENA: false,
    TOKENB: false,
    TOKENC: false,
    TOKEND: false,
  });
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const metaByKey = useMemo(() => {
    const m = new Map<MintTokenKey, TokenMeta>();
    for (const row of meta) {
      m.set(row.key, row);
    }
    return m;
  }, [meta]);

  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      setMetaError(null);
      try {
        const rows: TokenMeta[] = [];
        for (const t of MINT_TOKENS) {
          const [symbol, decimals] = await Promise.all([
            readContract(config, {
              address: t.address,
              abi: erc20Abi,
              functionName: 'symbol',
              chainId: sepolia.id,
            }),
            readContract(config, {
              address: t.address,
              abi: erc20Abi,
              functionName: 'decimals',
              chainId: sepolia.id,
            }),
          ]);
          rows.push({
            key: t.key,
            address: t.address,
            symbol: String(symbol),
            decimals: Number(decimals),
          });
        }
        if (!cancelled) {
          setMeta(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setMetaError(e instanceof Error ? e.message : '读取代币信息失败');
        }
      }
    }
    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  const mintToSelf = useCallback(
    async (key: MintTokenKey) => {
      if (!address || !isConnected) {
        setGlobalMessage('请先连接钱包');
        return;
      }
      const row = metaByKey.get(key);
      if (!row) {
        setGlobalMessage('代币元数据尚未加载完成');
        return;
      }
      const raw = amounts[key]?.trim() ?? '';
      if (!raw) {
        setGlobalMessage('请输入铸造数量');
        return;
      }

      let amountWei: bigint;
      try {
        amountWei = parseUnits(raw, row.decimals);
      } catch {
        setGlobalMessage('数量格式无效');
        return;
      }
      if (amountWei <= BigInt(0)) {
        setGlobalMessage('数量必须大于 0');
        return;
      }

      setGlobalMessage(null);
      setPending((p) => ({ ...p, [key]: true }));

      try {
        const hash = await writeContract(config, {
          address: row.address,
          abi: TEST_ERC20_MINT_ABI,
          functionName: 'mint',
          args: [address, amountWei],
          chainId: sepolia.id,
        });
        await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
        setGlobalMessage(`已铸造 ${row.symbol} · tx: ${hash}`);
        void useWalletSessionStore.getState().fetchWatchTokenBalances();
      } catch (e) {
        setGlobalMessage(e instanceof Error ? e.message : '铸造失败');
      } finally {
        setPending((p) => ({ ...p, [key]: false }));
      }
    },
    [address, amounts, isConnected, metaByKey]
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
      <Header active="pool" variant="dark" maxWidth="narrow" />

      <main className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl">
        <h1 className="text-2xl font-bold text-white">Mint 测试代币</h1>
        <p className="mt-2 text-sm text-zinc-400">
          调用四个 ERC20 合约的 <code className="text-fuchsia-300">mint(address to, uint256 amount)</code>，
          <code className="text-fuchsia-300">to</code> 固定为当前连接地址；你只需输入人类可读数量（按各币
          <code className="text-fuchsia-300">decimals</code> 解析）。
        </p>

        {!isConnected || !address ? (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            请先连接钱包后再铸造。
          </p>
        ) : (
          <p className="mt-4 truncate font-mono text-xs text-zinc-500" title={address}>
            接收地址：<span className="text-zinc-300">{address}</span>
          </p>
        )}

        {metaError ? (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {metaError}
          </p>
        ) : null}

        {globalMessage ? (
          <p className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-200">
            {globalMessage}
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          {MINT_TOKENS.map((t) => {
            const row = metaByKey.get(t.key);
            return (
              <div
                key={t.key}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">
                      {row?.symbol ?? t.key}{' '}
                      <span className="text-xs font-normal text-zinc-500">({t.key})</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{t.address}</div>
                    {row ? (
                      <div className="mt-1 text-xs text-zinc-500">decimals = {row.decimals}</div>
                    ) : (
                      <div className="mt-1 text-xs text-zinc-500">加载中…</div>
                    )}
                  </div>
                </div>
                <label className="mt-3 block text-xs font-medium text-zinc-400" htmlFor={`amt-${t.key}`}>
                  数量（代币最小单位按 decimals 换算）
                </label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    id={`amt-${t.key}`}
                    className="w-full flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
                    value={amounts[t.key]}
                    onChange={(e) =>
                      setAmounts((a) => ({
                        ...a,
                        [t.key]: e.target.value,
                      }))
                    }
                    placeholder="例如 1000"
                    disabled={pending[t.key]}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110 disabled:opacity-40"
                    disabled={!isConnected || !address || !row || pending[t.key]}
                    onClick={() => void mintToSelf(t.key)}
                  >
                    {pending[t.key] ? '铸造中…' : 'Mint'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
