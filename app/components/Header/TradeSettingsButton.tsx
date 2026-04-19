'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWalletSessionStore } from '@/app/stores/wallet';

type TradeSettingsButtonProps = {
  isDark: boolean;
};

/** 滑点以 % 为单位展示/回填（避免浮点长尾） */
function slippageToInputValue(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return '2.5';
  }
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  return String(rounded);
}

export function TradeSettingsButton({ isDark }: TradeSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const slippageAuto = useWalletSessionStore((s) => s.slippageAuto);
  const slippagePercent = useWalletSessionStore((s) => s.slippagePercent);
  const transactionDeadlineMinutes = useWalletSessionStore((s) => s.transactionDeadlineMinutes);
  const applyTradeSettings = useWalletSessionStore((s) => s.applyTradeSettings);

  const [draftAuto, setDraftAuto] = useState(slippageAuto);
  const [draftSlippage, setDraftSlippage] = useState(() => slippageToInputValue(slippagePercent));
  const [draftDeadline, setDraftDeadline] = useState(String(transactionDeadlineMinutes));

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncDraftFromStore = useCallback(() => {
    setDraftAuto(slippageAuto);
    setDraftSlippage(slippageToInputValue(slippagePercent));
    setDraftDeadline(String(transactionDeadlineMinutes));
  }, [slippageAuto, slippagePercent, transactionDeadlineMinutes]);

  useEffect(() => {
    if (open) {
      syncDraftFromStore();
    }
  }, [open, syncDraftFromStore]);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const panelWidth = 320;
    setPos({
      top: r.bottom + 8,
      left: Math.max(8, r.right - panelWidth),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onDocDown);
      document.addEventListener('keydown', onKey);
    }
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleSave() {
    const deadline = Number(draftDeadline);
    if (!Number.isFinite(deadline) || deadline < 1 || !Number.isInteger(deadline)) {
      window.alert('交易截止日期须为不小于 1 的整数（分钟）。');
      return;
    }
    if (draftAuto) {
      applyTradeSettings({
        slippageAuto: true,
        transactionDeadlineMinutes: deadline,
      });
    } else {
      const slip = Number(draftSlippage);
      if (!Number.isFinite(slip) || slip <= 0 || slip > 50) {
        window.alert('滑点请输入 0–50 之间的数字（%）。');
        return;
      }
      applyTradeSettings({
        slippageAuto: false,
        slippagePercent: slip,
        transactionDeadlineMinutes: deadline,
      });
    }
    setOpen(false);
  }

  const btnClass = isDark
    ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-300 transition hover:border-zinc-600 hover:text-white'
    : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-300';

  const panel =
    mounted && open && pos ? (
      <div
        ref={panelRef}
        className="fixed z-[11000] w-[min(100vw-24px,320px)] rounded-2xl border border-zinc-700 bg-zinc-900/98 p-4 shadow-2xl ring-1 ring-black/40 backdrop-blur-sm"
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-settings-title"
      >
        <h2 id="trade-settings-title" className="text-sm font-semibold text-white">
          交易设置
        </h2>

        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-sm text-zinc-200">
            <span>滑点上限</span>
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] text-zinc-500"
              title="允许的最小收到量偏差"
            >
              i
            </span>
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-stretch overflow-hidden rounded-full border border-zinc-700 bg-zinc-950">
            <button
              type="button"
              onClick={() => {
                setDraftAuto(true);
                setDraftSlippage(slippageToInputValue(slippagePercent));
              }}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium transition ${
                draftAuto ? 'text-fuchsia-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              自动
            </button>
            <div className="flex min-h-10 min-w-0 items-center border-l border-zinc-800">
              <input
                id="trade-settings-slippage"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="2.5"
                readOnly={draftAuto}
                value={draftSlippage}
                onChange={(e) => setDraftSlippage(e.target.value)}
                onFocus={() => {
                  if (draftAuto) {
                    setDraftAuto(false);
                    setDraftSlippage(slippageToInputValue(slippagePercent));
                  }
                }}
                aria-label="滑点上限（%）"
                className="h-full min-w-0 w-full bg-transparent px-3 py-2 text-right text-sm font-semibold text-white outline-none read-only:cursor-default read-only:text-zinc-400 focus:text-white"
              />
            </div>
            <div className="flex items-center pr-3 text-sm font-medium text-zinc-500" aria-hidden>
              %
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-sm text-zinc-200">
            <span>交易截止日期</span>
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] text-zinc-500"
              title="交易在链上有效的最长时间"
            >
              i
            </span>
          </div>
          <div className="mt-2 flex overflow-hidden rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2">
            <input
              type="number"
              min={1}
              step={1}
              value={draftDeadline}
              onChange={(e) => setDraftDeadline(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none"
            />
            <span className="shrink-0 text-sm text-zinc-500">minutes</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              syncDraftFromStore();
              setOpen(false);
            }}
            className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-fuchsia-900/30 transition hover:brightness-110"
          >
            保存
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={btnClass}
        aria-label="交易设置"
        title="滑点与交易截止时间"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
