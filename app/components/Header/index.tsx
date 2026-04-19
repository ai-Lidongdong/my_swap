'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnectButton } from '@/app/components/Wallet/WalletConnectButton';
import { TradeSettingsButton } from '@/app/components/Header/TradeSettingsButton';

type HeaderProps = {
  active?: 'swap' | 'pool' | 'positions';
  /** 暗黑顶栏（与 pool 原型一致） */
  variant?: 'light' | 'dark';
  /**
   * wide：与宽表格页主内容一致（默认 max-w-[1600px]）
   * narrow：与表单卡片页一致（max-w-2xl）
   */
  maxWidth?: 'wide' | 'narrow';
};

function navClass(isActive: boolean, variant: 'light' | 'dark') {
  if (variant === 'dark') {
    return isActive
      ? 'rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-white ring-1 ring-zinc-600'
      : 'rounded-full px-4 py-2 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800/80 hover:text-zinc-100';
  }
  return isActive
    ? 'rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white'
    : 'rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900';
}

export function Header({ active = 'pool', variant = 'light', maxWidth = 'wide' }: HeaderProps) {
  const pathname = usePathname();
  const isDark = variant === 'dark';
  const maxWidthClass = maxWidth === 'narrow' ? 'max-w-2xl' : 'max-w-[1600px]';
  const routeActive: HeaderProps['active'] | undefined =
    pathname === '/pages/swap'
      ? 'swap'
      : pathname === '/pages/poolList'
        ? 'pool'
        : pathname === '/pages/positionList'
          ? 'positions'
          : undefined;
  const currentActive = routeActive ?? active;

  if (isDark) {
    return (
      <header
        className={`mx-auto mb-6 w-full ${maxWidthClass} rounded-2xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-lg shadow-black/20 backdrop-blur-sm`}
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 shadow-md shadow-fuchsia-900/40"
              aria-hidden
            />
            <span className="text-lg font-bold text-white">MetaSwap</span>
          </Link>
          <WalletConnectButton variant="dark" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4">
          <nav className="flex flex-wrap items-center gap-2">
            <Link href="/pages/swap" className={navClass(currentActive === 'swap', 'dark')}>
              Swap
            </Link>
            <Link href="/pages/poolList" className={navClass(currentActive === 'pool', 'dark')}>
              Pool
            </Link>
            <Link href="/pages/positionList" className={navClass(currentActive === 'positions', 'dark')}>
              Positions
            </Link>
          </nav>
          <TradeSettingsButton isDark />
        </div>
      </header>
    );
  }

  return (
    <header
      className={`mx-auto mb-6 w-full ${maxWidthClass} rounded-xl border border-zinc-200 bg-white/90 p-4 shadow-sm`}
    >
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-fuchsia-900/30"
            aria-hidden
          />
          <span className="text-lg font-bold text-zinc-900">MetaSwap</span>
        </Link>
        <WalletConnectButton variant="light" />
      </div>

      <nav className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/pages/swap" className={navClass(currentActive === 'swap', 'light')}>
          Swap
        </Link>
        <Link href="/pages/poolList" className={navClass(currentActive === 'pool', 'light')}>
          Pool
        </Link>
        <Link href="/pages/positionList" className={navClass(currentActive === 'positions', 'light')}>
          Positions
        </Link>
      </nav>
    </header>
  );
}
