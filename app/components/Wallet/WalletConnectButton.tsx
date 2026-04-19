'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { useWalletSessionStore } from '@/app/stores/wallet';

type WalletConnectButtonProps = {
  variant?: 'dark' | 'light';
};

function shortenAddress(addr: string) {
  if (addr.length < 12) {
    return addr;
  }
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

function walletRowMeta(connector: { id?: string; name: string }): { letter: string; title: string; subtitle: string } {
  const id = (connector.id ?? '').toLowerCase();
  const name = connector.name.toLowerCase();
  if (id === 'metamask' || name.includes('metamask')) {
    return {
      letter: 'M',
      title: 'MetaMask',
      subtitle: '浏览器扩展',
    };
  }
  if (id === 'walletconnect' || name.includes('walletconnect')) {
    return {
      letter: 'W',
      title: 'WalletConnect',
      subtitle: '扫码连接',
    };
  }
  return {
    letter: (connector.name?.[0] ?? '?').toUpperCase(),
    title: connector.name,
    subtitle: '浏览器内钱包',
  };
}

export function WalletConnectButton({ variant = 'dark' }: WalletConnectButtonProps) {
  const isDark = variant === 'dark';
  const { address, isConnected, status, chainId, connector } = useAccount();
  const { connectAsync, connectors, isPending, error, reset } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const tokenBalances = useWalletSessionStore((s) => s.tokenBalances);
  const balancesLoading = useWalletSessionStore((s) => s.balancesLoading);
  const balancesError = useWalletSessionStore((s) => s.balancesError);

  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      useWalletSessionStore.getState().syncConnection({
        address,
        chainId: chainId ?? undefined,
        connectorName: connector?.name ?? null,
      });
      void useWalletSessionStore.getState().fetchWatchTokenBalances();
    } else {
      useWalletSessionStore.getState().clear();
    }
  }, [isConnected, address, chainId, connector?.name]);

  useEffect(() => {
    if (menuOpen && isConnected && address) {
      void useWalletSessionStore.getState().fetchWatchTokenBalances();
    }
  }, [menuOpen, isConnected, address]);

  useEffect(() => {
    if (!modalOpen) {
      reset();
    }
  }, [modalOpen, reset]);

  const updateMenuPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const menuWidth = 280;
    setMenuPos({
      top: r.bottom + 8,
      left: Math.max(8, r.right - menuWidth),
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || dropdownRef.current?.contains(t)) {
        return;
      }
      setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener('mousedown', onDocMouseDown);
    }
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [menuOpen]);

  const sortedConnectors = useMemo(() => {
    const order = (id: string) => {
      const x = id.toLowerCase();
      if (x === 'metamask') {
        return 0;
      }
      if (x === 'walletconnect') {
        return 2;
      }
      return 1;
    };
    return [...connectors].sort((a, b) => order(a.id ?? '') - order(b.id ?? ''));
  }, [connectors]);

  const handleConnect = useCallback(
    async (connector: (typeof connectors)[number]) => {
      try {
        await connectAsync({ connector, chainId: sepolia.id });
        setModalOpen(false);
      } catch {
        // error 由 useConnect.error 展示
      }
    },
    [connectAsync, connectors]
  );

  const handleDisconnect = useCallback(async () => {
    setMenuOpen(false);
    await disconnectAsync();
  }, [disconnectAsync]);

  const handleSwitchWallet = useCallback(async () => {
    setMenuOpen(false);
    await disconnectAsync();
    setModalOpen(true);
  }, [disconnectAsync]);

  const connectBtnClass = isDark
    ? 'rounded-full bg-gradient-to-r from-[#f0147a] to-[#e11d8c] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110 active:scale-[0.98]'
    : 'rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800';

  const accountBtnClass = isDark
    ? 'flex items-center gap-2 rounded-full border border-fuchsia-500/70 bg-zinc-950/80 px-3 py-1.5 text-sm font-semibold text-white shadow-inner shadow-black/20 transition hover:border-fuchsia-400'
    : 'flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400';

  const connectBusy = mounted && (status === 'connecting' || isPending);

  const accountMenu =
    mounted && menuOpen && menuPos && isConnected && address ? (
      <div
        ref={dropdownRef}
        className="fixed z-[10000] min-w-[280px] max-w-[min(100vw-24px,360px)] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl ring-1 ring-black/40"
        style={{ top: menuPos.top, left: menuPos.left }}
        role="menu"
      >
        <div className="border-b border-zinc-800 px-4 py-3">
          <p className="text-xs font-medium text-zinc-500">合约代币余额（constants）</p>
          <p className="mt-1 truncate font-mono text-[11px] text-zinc-400" title={address}>
            {address}
          </p>
          {chainId ? (
            <p className="mt-0.5 text-[11px] text-zinc-500">chainId · {chainId}</p>
          ) : null}
          {balancesLoading ? (
            <p className="mt-2 text-sm text-zinc-400">余额加载中…</p>
          ) : balancesError ? (
            <p className="mt-2 text-sm text-rose-400">{balancesError}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {tokenBalances.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-2 text-sm text-zinc-200"
                >
                  <span className="font-medium text-white">{row.symbol}</span>
                  <span className="truncate font-mono text-xs text-fuchsia-200/90" title={row.balanceRaw}>
                    {row.balanceFormatted}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white hover:bg-zinc-800"
          onClick={() => void handleSwitchWallet()}
        >
          <span className="text-zinc-400">⇄</span>
          切换钱包
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white hover:bg-zinc-800"
          onClick={() => {
            setMenuOpen(false);
            window.alert('Solana 钱包接入尚未配置。');
          }}
        >
          <span className="text-zinc-400">＋</span>
          连接 Solana 钱包
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-400 hover:bg-zinc-800"
          onClick={() => void handleDisconnect()}
        >
          <span>⏻</span>
          断开连接
        </button>
      </div>
    ) : null;

  const modal = mounted && modalOpen ? (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭"
        onClick={() => setModalOpen(false)}
      />
      <div className="relative z-[1] w-full max-w-md rounded-2xl border border-zinc-700 bg-[#1a1b1f] p-6 shadow-2xl">
        <h2 id="wallet-modal-title" className="text-lg font-bold text-white">
          连接钱包
        </h2>
        <p className="mt-2 text-sm text-zinc-400">选择钱包以在链上交易与管理流动性。</p>

        <div className="mt-6 space-y-3">
          {sortedConnectors.map((connector) => {
            const meta = walletRowMeta(connector);
            const installed = Boolean(connector.ready);
            const id = (connector.id ?? '').toLowerCase();
            const isWalletConnect =
              id.includes('walletconnect') || connector.name.toLowerCase().includes('walletconnect');
            const dim = !installed && !isWalletConnect;

            return (
              <button
                key={connector.uid}
                type="button"
                disabled={isPending}
                onClick={() => void handleConnect(connector)}
                className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                  dim
                    ? 'border-zinc-800 bg-zinc-900/40 opacity-60 hover:opacity-90'
                    : 'border-zinc-700 bg-zinc-900/80 hover:border-fuchsia-500/40 hover:bg-zinc-800/80'
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-base font-bold text-white">
                  {meta.letter}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{meta.title}</div>
                  <div className="text-xs text-zinc-500">
                    {meta.subtitle}
                    {dim ? ' · 未检测到扩展（仍可尝试）' : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error.message}
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setModalOpen(false)}
            className="w-full rounded-xl bg-gradient-to-r from-[#f0147a] to-[#8e00fe] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/40 transition hover:brightness-110 disabled:opacity-50"
          >
            {isPending ? '连接中…' : '完成连接'}
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="w-full rounded-xl border border-zinc-600 bg-transparent px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800/60"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="relative flex shrink-0 items-center gap-2">
      {!isConnected || !address ? (
        <button
          type="button"
          className={connectBtnClass}
          onClick={() => setModalOpen(true)}
          disabled={connectBusy}
        >
          {connectBusy ? '连接中…' : '连接'}
        </button>
      ) : (
        <>
          <button
            ref={anchorRef}
            type="button"
            className={accountBtnClass}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span
              className="h-8 w-8 shrink-0 rounded-full bg-[conic-gradient(at_30%_30%,#60a5fa,#a78bfa,#f472b6,#60a5fa)]"
              aria-hidden
            />
            <span className="max-w-[140px] truncate">{shortenAddress(address)}</span>
          </button>
        </>
      )}

      {mounted ? createPortal(modal, document.body) : null}
      {mounted ? createPortal(accountMenu, document.body) : null}
    </div>
  );
}
