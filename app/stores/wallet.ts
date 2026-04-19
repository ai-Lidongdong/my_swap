import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { erc20Abi, formatUnits, isAddress, type Address } from 'viem';
import { getPublicClient } from 'wagmi/actions';
import { config } from '@/app/wagmi/config';
import {
  TOKENA_ADDRESS,
  TOKENB_ADDRESS,
  TOKENC_ADDRESS,
  TOKEND_ADDRESS,
} from '@/app/constants/contracts';
import { sepolia } from 'viem/chains';

export type WatchTokenKey = 'TOKENA' | 'TOKENB' | 'TOKENC' | 'TOKEND';

export type WatchTokenBalance = {
  key: WatchTokenKey;
  address: Address;
  symbol: string;
  decimals: number;
  /** 链上 balanceOf 原始值（字符串化 bigint） */
  balanceRaw: string;
  /** 按 decimals 格式化后的展示用字符串 */
  balanceFormatted: string;
};

type TradeSettingsSlice = {
  /** 滑点是否使用自动策略（关闭时以 slippagePercent 为准） */
  slippageAuto: boolean;
  /** 手动滑点上限（百分比，如 2.5 表示 2.5%） */
  slippagePercent: number;
  /** 交易截止时间（分钟） */
  transactionDeadlineMinutes: number;
  applyTradeSettings: (
    patch: Partial<Pick<TradeSettingsSlice, 'slippageAuto' | 'slippagePercent' | 'transactionDeadlineMinutes'>>,
  ) => void;
};

type WalletSessionState = TradeSettingsSlice & {
  address: Address | null;
  chainId: number | null;
  connectorName: string | null;
  tokenBalances: WatchTokenBalance[];
  balancesLoading: boolean;
  balancesError: string | null;
  /** 与当前连接同步：断开时传 null */
  syncConnection: (payload: {
    address: string | null | undefined;
    chainId?: number | null;
    connectorName?: string | null;
  } | null) => void;
  /** 读取 constants 中四个 ERC20 对当前 address 的余额（需已 sync 地址） */
  fetchWatchTokenBalances: () => Promise<void>;
  clear: () => void;
};

const WATCHED: readonly { key: WatchTokenKey; address: Address }[] = [
  { key: 'TOKENA', address: TOKENA_ADDRESS as Address },
  { key: 'TOKENB', address: TOKENB_ADDRESS as Address },
  { key: 'TOKENC', address: TOKENC_ADDRESS as Address },
  { key: 'TOKEND', address: TOKEND_ADDRESS as Address },
];

function trimDisplayAmount(formatted: string, maxFractionDigits = 6): string {
  if (!formatted.includes('.')) {
    return formatted;
  }
  const [i, f] = formatted.split('.');
  if (f.length <= maxFractionDigits) {
    return formatted;
  }
  return `${i}.${f.slice(0, maxFractionDigits)}…`;
}

const TRADE_DEFAULTS: Pick<WalletSessionState, 'slippageAuto' | 'slippagePercent' | 'transactionDeadlineMinutes'> = {
  slippageAuto: true,
  slippagePercent: 2.5,
  transactionDeadlineMinutes: 30,
};

export const useWalletSessionStore = create<WalletSessionState>()(
  persist(
    (set, get) => ({
      ...TRADE_DEFAULTS,
      address: null,
      chainId: null,
      connectorName: null,
      tokenBalances: [],
      balancesLoading: false,
      balancesError: null,

      applyTradeSettings: (patch) => set(patch),

      syncConnection: (payload) => {
        if (!payload || !payload.address || !isAddress(payload.address)) {
          set({
            address: null,
            chainId: null,
            connectorName: null,
            tokenBalances: [],
            balancesLoading: false,
            balancesError: null,
          });
          return;
        }
        set({
          address: payload.address as Address,
          chainId: payload.chainId ?? sepolia.id,
          connectorName: payload.connectorName ?? null,
        });
      },

      clear: () => {
        get().syncConnection(null);
      },

      fetchWatchTokenBalances: async () => {
        const { address } = get();
        if (!address) {
          return;
        }

        set({ balancesLoading: true, balancesError: null });

        try {
          const client = getPublicClient(config);

          const contracts = WATCHED.flatMap((t) => [
            { address: t.address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [address] },
            { address: t.address, abi: erc20Abi, functionName: 'symbol' as const },
            { address: t.address, abi: erc20Abi, functionName: 'decimals' as const },
          ]);

          const results = await client.multicall({ contracts, allowFailure: true });

          const tokenBalances: WatchTokenBalance[] = [];

          for (let i = 0; i < WATCHED.length; i++) {
            const meta = WATCHED[i];
            const base = i * 3;
            const balR = results[base];
            const symR = results[base + 1];
            const decR = results[base + 2];

            if (balR.status !== 'success' || symR.status !== 'success' || decR.status !== 'success') {
              tokenBalances.push({
                key: meta.key,
                address: meta.address,
                symbol: '?',
                decimals: 18,
                balanceRaw: '0',
                balanceFormatted: '—',
              });
              continue;
            }

            const balance = balR.result as bigint;
            const symbol = String(symR.result);
            const decimals = Number(decR.result);
            const formatted = trimDisplayAmount(formatUnits(balance, decimals));

            tokenBalances.push({
              key: meta.key,
              address: meta.address,
              symbol,
              decimals,
              balanceRaw: balance.toString(),
              balanceFormatted: formatted,
            });
          }

          set({ tokenBalances, balancesLoading: false });
        } catch (e) {
          set({
            balancesLoading: false,
            balancesError: e instanceof Error ? e.message : '余额查询失败',
            tokenBalances: [],
          });
        }
      },
    }),
    {
      name: 'meta-swap-wallet-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        slippageAuto: s.slippageAuto,
        slippagePercent: s.slippagePercent,
        transactionDeadlineMinutes: s.transactionDeadlineMinutes,
      }),
    },
  ),
);
