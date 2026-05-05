'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from '@/app/wagmi/config';
import { PoolCreatedWatcher } from '@/app/components/PoolCreatedWatcher';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 缓存 1 分钟
      retry: 1, // 失败重试 1 次
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <PoolCreatedWatcher />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}