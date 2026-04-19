'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { useAccount, useReadContract } from 'wagmi';
import { writeContract, waitForTransactionReceipt, simulateContract } from 'wagmi/actions';
import { Header } from '@/app/components/Header';
import { SWAP_ROUTER_ABI, TOKEN_ABI, POOL_MANAGER_ABI } from '@/app/constants/abi';
import { SWAP_ROUTER_ADDRESS, TOKENS_LIST, POOL_MANAGER_ADDRESS } from '@/app/constants/contracts';
import type { Contract } from '@/app/stores/contract';
import { useWalletStore } from '@/app/stores/contract';
import { useWalletSessionStore } from '@/app/stores/wallet';
import { config } from '@/app/wagmi/config';
import type { SwapApiResponse } from '@/app/api/swap/route';
import { pools } from '@/app/constants/mock';

type PickerTarget = 'from' | 'to' | null;
type TradeType = 'exactInput' | 'exactOutput';

function addrEq(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function shortAddress(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function safeFormatUnits(raw: string | undefined, decimals: number): string {
  if (!raw || raw === '0') return '0';
  try {
    return formatUnits(BigInt(raw), decimals);
  } catch {
    return '0';
  }
}

export default function SwapPage() {
  const contractList = useWalletStore((s) => s.ContractList);
  const getTokenInfo = useWalletStore((s) => s.getTokenInfo);
  const slippagePercent = useWalletSessionStore((s) => s.slippagePercent);
  const transactionDeadlineMinutes = useWalletSessionStore((s) => s.transactionDeadlineMinutes);
  const { address, isConnected } = useAccount();

  const [fromToken, setFromToken] = useState<Contract | null>(null);
  const [toToken, setToToken] = useState<Contract | null>(null);
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>('exactInput');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [keyword, setKeyword] = useState('');
  const [mounted, setMounted] = useState(false);

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<SwapApiResponse | null>(null);
  const [quoteError, setQuoteError] = useState('');

  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState('');
  const [swapTxHash, setSwapTxHash] = useState('');
  const [swapParams, setSwapParams] = useState<any>(null);

  const skipNextQuoteRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // const {
  //   data: xValue,
  //   isLoading,
  //   isError,
  //   refetch,
  //   error,
  // } = useReadContract({
  //   address: POOL_MANAGER_ADDRESS,
  //   abi: POOL_MANAGER_ABI,
  //   functionName: 'getAllPools',
  //   args: [],
  // });
  // console.log('xValue', xValue);

  const xValue = pools.map(p => ({
    ...p,
    sqrtPriceX96: BigInt(p.sqrtPriceX96),
    liquidity: BigInt(p.liquidity),
  }));
  const list = useMemo(() => {
    if (!Array.isArray(xValue)) {
      return [];
    }
    return xValue.filter((item: any) => {
      return (
        [100, 500, 3000, 10000].includes(Number(item.fee)) &&
        (TOKENS_LIST.includes(item.token0) && TOKENS_LIST.includes(item.token1)) &&
        Number(item.liquidity) > 0
      );
    });
  }, [xValue]);
  const liquidityList = list.map((item: any) => {
    return {
      ...item,
      liquidity: Number(item.liquidity),
      sqrtPriceX96: Number(item.sqrtPriceX96),
    }
  })

  // const { data: allowanceRes, isLoading, isError, refetch, error } = useReadContract({
  //   address: tokenIn,
  //   abi: TOKEN_ABI,
  //   functionName: 'allowance',
  //   args: [address, SWAP_ROUTER_ADDRESS],
  // });
  // console.log('------allowanceRes------>', allowanceRes);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (contractList.length === 0) void getTokenInfo();
  }, [contractList.length, getTokenInfo]);

  useEffect(() => {
    if (contractList.length === 0 || fromToken) return;
    setFromToken(contractList[0] ?? null);
  }, [contractList, fromToken]);

  // --- token picker ---
  const filteredTokens = useMemo(() => {
    const input = keyword.trim().toLowerCase();
    if (!input) return contractList;
    return contractList.filter((item) =>
      item.symbol.toLowerCase().includes(input) ||
      item.name.toLowerCase().includes(input) ||
      item.address.toLowerCase().includes(input),
    );
  }, [contractList, keyword]);

  const excludedAddress =
    pickerTarget === 'from' ? toToken?.address : pickerTarget === 'to' ? fromToken?.address : undefined;

  const openTokenModal = useCallback((field: 'from' | 'to') => {
    setKeyword('');
    setPickerTarget(field);
    if (useWalletStore.getState().ContractList.length === 0) {
      void useWalletStore.getState().getTokenInfo();
    }
  }, []);

  const closeTokenModal = useCallback(() => {
    setPickerTarget(null);
    setKeyword('');
  }, []);

  const handleSelectToken = useCallback(
    (token: Contract) => {
      if (excludedAddress && addrEq(token.address, excludedAddress)) return;
      if (pickerTarget === 'from') setFromToken(token);
      else if (pickerTarget === 'to') setToToken(token);
      closeTokenModal();
    },
    [pickerTarget, excludedAddress, closeTokenModal],
  );

  useEffect(() => {
    if (!pickerTarget) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeTokenModal();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickerTarget, closeTokenModal]);

  const fromSymbol = fromToken?.symbol ?? '—';
  const toSymbol = toToken?.symbol ?? '—';

  const swapDirection = useCallback(() => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmountFrom(amountTo);
    setAmountTo(amountFrom);
    setTradeType((t) => (t === 'exactInput' ? 'exactOutput' : 'exactInput'));
  }, [fromToken, toToken, amountFrom, amountTo]);

  // --- amount handlers: mark tradeType ---
  const handleAmountFromChange = useCallback((raw: string) => {
    setAmountFrom(raw);
    setTradeType('exactInput');
  }, []);

  const handleAmountToChange = useCallback((raw: string) => {
    setAmountTo(raw);
    setTradeType('exactOutput');
  }, []);

  // --- quote effect with debounce ---
  useEffect(() => {
    if (skipNextQuoteRef.current) {
      skipNextQuoteRef.current = false;
      return;
    }

    if (!fromToken || !toToken) return;

    const activeAmount = tradeType === 'exactInput' ? amountFrom : amountTo;
    const parsedVal = Number(activeAmount);
    if (!activeAmount || !Number.isFinite(parsedVal) || parsedVal <= 0) {
      setQuoteResult(null);
      setQuoteError('');
      return;
    }


    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setQuoteLoading(true);
      setQuoteError('');

      const deadlineSec = Math.floor(Date.now() / 1000) + transactionDeadlineMinutes * 60;
      fetch('/api/quote_swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          fromToken: fromToken.address,
          toToken: toToken.address,
          amountFrom: amountFrom,
          amountTo: amountTo,
          slippage: slippagePercent * 100,
          deadline: String(deadlineSec),
          tradeType,
          pools: JSON.stringify(liquidityList),
          address
        }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '报价失败');
          return data as SwapApiResponse;
        })
        .then((data: any) => {
          const { exactInputParams, extimatePrice } = data;
          setQuoteResult(data);
          setQuoteError('');

          skipNextQuoteRef.current = true;
          setSwapParams(exactInputParams)
          const toAmount = safeFormatUnits(extimatePrice, toToken.decimals);
          if (tradeType === 'exactInput' && extimatePrice) {
            setAmountTo(toAmount);
          } else if (tradeType === 'exactOutput' && data.extimatePrice) {
            const formatted = safeFormatUnits(data.extimatePrice, fromToken.decimals);
            setAmountFrom(formatted);
          }
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setQuoteError(e instanceof Error ? e.message : '报价失败');
          setQuoteResult(null);
        })
        .finally(() => setQuoteLoading(false));
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [fromToken, toToken, amountFrom, amountTo, tradeType, address, slippagePercent, transactionDeadlineMinutes]);

  // --- execute swap ---
  const canSwap = isConnected && quoteResult && !quoteLoading && !swapLoading;

  // 点击交易
  const handleSwap = useCallback(async () => {
    if (!quoteResult || !fromToken || !toToken || !address) return;

    setSwapError('');
    setSwapTxHash('');
    setSwapLoading(true);

    try {
      if (tradeType === 'exactInput') {
        console.log('---swapParams', swapParams)
        const { tokenIn, amountIn } = swapParams


        await writeContract(config, {
          address: tokenIn,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [SWAP_ROUTER_ADDRESS as `0x${string}`, amountIn],
          gas: BigInt(16000000), // 明确指定低于上限的值
          chainId: sepolia.id,
        });


        const hash = await writeContract(config, {
          address: SWAP_ROUTER_ADDRESS as `0x${string}`,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInput',
          args: [swapParams],
          chainId: sepolia.id,
          gas: 300000n,
        });

        setSwapTxHash(hash);
        await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      } else {
        const amountOut = BigInt(quoteResult.amountOut!);
        const amountInMaximum = BigInt(quoteResult.amountInMaximum!);
        const sqrtPriceLimitX96 = BigInt(quoteResult.sqrtPriceLimitX96!);
        await writeContract(config, {
          address: fromToken.address as `0x${string}`,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [SWAP_ROUTER_ADDRESS as `0x${string}`, amountInMaximum],
          chainId: sepolia.id,
        });

        const hash = await writeContract(config, {
          address: SWAP_ROUTER_ADDRESS as `0x${string}`,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactOutput',
          args: [
            {
              tokenIn: fromToken.address as `0x${string}`,
              tokenOut: toToken.address as `0x${string}`,
              // indexPath,
              recipient: address,
              // deadline: deadlineSec,
              amountOut,
              amountInMaximum,
              sqrtPriceLimitX96,
            },
          ],
          chainId: sepolia.id,
        });

        setSwapTxHash(hash);
        await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      }
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : 'Swap 失败');
    } finally {
      setSwapLoading(false);
    }
  }, [quoteResult, fromToken, toToken, address, transactionDeadlineMinutes]);

  // --- button label ---
  const buttonLabel = useMemo(() => {
    if (swapLoading) return '交易中…';
    if (!isConnected) return '请先连接钱包';
    if (!fromToken || !toToken) return '请选择代币';
    if (!amountFrom && !amountTo) return '输入金额';
    if (quoteLoading) return '获取报价中…';
    if (quoteError) return '报价失败，请重试';
    if (!quoteResult) return '输入金额';
    return 'Swap';
  }, [swapLoading, isConnected, fromToken, toToken, amountFrom, amountTo, quoteLoading, quoteError, quoteResult]);

  const buttonEnabled = Boolean(canSwap) && buttonLabel === 'Swap';

  // --- pill component ---
  function TokenSelectPill({ token, onOpen }: { token: Contract | null; onOpen: () => void }) {
    if (!token) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-fuchsia-900/25 transition hover:brightness-110"
        >
          选择代币
          <span className="text-white/90">▾</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex max-w-[11rem] shrink-0 items-center gap-2 rounded-full border border-zinc-600/80 bg-zinc-800/90 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-white transition hover:border-zinc-500"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xs font-bold text-white">
          {(token.symbol?.[0] ?? '?').toUpperCase()}
        </span>
        <span className="truncate">{token.symbol}</span>
        <span className="shrink-0 text-zinc-400">▾</span>
      </button>
    );
  }

  // --- token modal ---
  const tokenModal =
    mounted && pickerTarget ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-token-modal-title"
      >
        <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭" onClick={closeTokenModal} />
        <div className="relative z-[1] w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/50">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="swap-token-modal-title" className="text-lg font-semibold text-white">Select token</h2>
            <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white" onClick={closeTokenModal}>Close</button>
          </div>
          <input
            className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
            placeholder="Search by symbol / name / address"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            autoFocus
          />
          <div className="max-h-72 space-y-2 overflow-auto pr-1">
            {filteredTokens.map((item) => {
              const disabled = Boolean(excludedAddress && addrEq(item.address, excludedAddress));
              return (
                <button
                  type="button"
                  key={item.address}
                  disabled={disabled}
                  title={disabled ? '已在另一侧选择该代币' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${disabled
                    ? 'cursor-not-allowed border-zinc-800/80 bg-zinc-950/40 opacity-45'
                    : 'border-zinc-800 bg-zinc-950/80 hover:border-fuchsia-500/40 hover:bg-zinc-800/60'
                    }`}
                  onClick={() => handleSelectToken(item)}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${disabled ? 'bg-zinc-700' : 'bg-gradient-to-br from-violet-600 to-fuchsia-600'}`}>
                    {(item.symbol?.[0] ?? '?').toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{item.symbol}</div>
                    <div className="truncate text-xs text-zinc-500">{shortAddress(item.address)}</div>
                    {disabled ? <div className="mt-0.5 truncate text-[11px] text-zinc-600">已在另一侧选择</div> : null}
                  </div>
                </button>
              );
            })}
            {filteredTokens.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">ContractList 中暂无代币，请确认已请求 /api/tokens 或稍后重试。</p>
            ) : null}
          </div>
        </div>
      </div>
    ) : null;

  const tabs = ['交换', '限额', '购买', '出售'] as const;

  return (
    <div className="min-h-screen bg-[#0b0b0c] px-3 py-5 text-zinc-100 sm:px-4 sm:py-6">
      <Header active="swap" variant="dark" maxWidth="narrow" />

      <main className="mx-auto mt-4 w-full max-w-[420px]">
        <div className="rounded-[28px] border border-zinc-800/90 bg-[#131316] p-3 shadow-2xl shadow-black/50 sm:p-4">
          {/* tabs */}
          <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
            <div className="flex flex-wrap items-center gap-0.5 rounded-full bg-zinc-900/90 p-1 ring-1 ring-zinc-800/80">
              {tabs.map((label) => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${label === '交换' ? 'bg-zinc-800 text-white shadow-inner ring-1 ring-zinc-700/80' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-900/80 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200" aria-label="设置">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M5.64 18.36l-1.42 1.42M19.78 4.22l-1.42 1.42" />
              </svg>
            </button>
          </div>

          {/* 出售 */}
          <div className="rounded-2xl border border-zinc-800/90 bg-[#1a1a1e] px-4 pb-4 pt-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500">出售</span>
              <span className="text-xs font-medium text-zinc-600">
                {tradeType === 'exactInput' && quoteLoading ? '报价中…' : ''}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={amountFrom}
                  onChange={(e) => handleAmountFromChange(e.target.value)}
                  className="w-full bg-transparent text-[2.25rem] font-medium leading-tight tracking-tight text-white placeholder:text-zinc-600 focus:outline-none sm:text-[2.5rem]"
                />
              </div>
              <TokenSelectPill token={fromToken} onOpen={() => openTokenModal('from')} />
            </div>
          </div>

          {/* 交换按钮 */}
          <div className="relative z-10 flex justify-center py-1">
            <button
              type="button"
              onClick={swapDirection}
              className="-my-2 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 bg-[#1f1f24] text-lg text-white shadow-lg shadow-black/40 transition hover:border-zinc-500 hover:bg-zinc-800"
              title="交换方向"
              aria-label="交换方向"
            >
              ↓
            </button>
          </div>

          {/* 购买 */}
          <div className="rounded-2xl border border-zinc-800/90 bg-[#1a1a1e] px-4 pb-4 pt-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500">购买</span>
              <span className="text-xs font-medium text-zinc-600">
                {tradeType === 'exactOutput' && quoteLoading ? '报价中…' : ''}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={amountTo}
                  onChange={(e) => handleAmountToChange(e.target.value)}
                  className="w-full bg-transparent text-[2.25rem] font-medium leading-tight tracking-tight text-white placeholder:text-zinc-600 focus:outline-none sm:text-[2.5rem]"
                />
              </div>
              <TokenSelectPill token={toToken} onOpen={() => openTokenModal('to')} />
            </div>
          </div>

          {/* 报价信息 */}
          {quoteResult && !quoteError ? (
            <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>模式</span>
                <span className="text-zinc-200">{quoteResult.tradeType === 'exactInput' ? '固定输入' : '固定输出'}</span>
              </div>
              {quoteResult.amountOutMinimum ? (
                <div className="mt-1 flex justify-between">
                  <span>最少收到</span>
                  <span className="font-mono text-zinc-200">
                    {safeFormatUnits(quoteResult.amountOutMinimum, toToken?.decimals ?? 18)} {toSymbol}
                  </span>
                </div>
              ) : null}
              {quoteResult.amountInMaximum ? (
                <div className="mt-1 flex justify-between">
                  <span>最多支付</span>
                  <span className="font-mono text-zinc-200">
                    {safeFormatUnits(quoteResult.amountInMaximum, fromToken?.decimals ?? 18)} {fromSymbol}
                  </span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between">
                <span>滑点</span>
                <span className="text-zinc-200">{slippagePercent}%</span>
              </div>
            </div>
          ) : null}

          {quoteError ? (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {quoteError}
            </p>
          ) : null}

          {swapError ? (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {swapError}
            </p>
          ) : null}

          {swapTxHash ? (
            <p className="mt-2 break-all rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
              tx: {swapTxHash}
            </p>
          ) : null}

          {/* 主按钮 */}
          <button
            type="button"
            disabled={!buttonEnabled}
            onClick={() => void handleSwap()}
            className={`mt-5 w-full rounded-2xl py-4 text-base font-semibold transition ${buttonEnabled
              ? 'bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white shadow-lg shadow-fuchsia-900/30 hover:brightness-110'
              : 'border border-fuchsia-950/40 bg-[#2a1522] text-fuchsia-400 hover:bg-[#331a28]'
              } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            {buttonLabel}
          </button>
        </div>
      </main>

      {mounted ? createPortal(tokenModal, document.body) : null}

      {swapLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-[1px]">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100">
            交易确认中，请稍候…
          </div>
        </div>
      ) : null}
    </div>
  );
}
