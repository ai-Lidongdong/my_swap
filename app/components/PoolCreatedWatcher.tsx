'use client';

import { useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { sepolia } from 'viem/chains';
import { POOL_MANAGER_ABI } from '@/app/constants/abi';
import { POOL_MANAGER_ADDRESS } from '@/app/constants/contracts';

const POOL_CREATED_EVENT_NAME = 'pool-created';

async function refreshPoolsFromApi() {
  try {
    await fetch('/api/update_pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error('[PoolCreated] 调用 /api/update_pools 失败', error);
  }
}

function onPoolCreated(log: unknown) {
  // 默认回调：打印日志 + 对外广播事件，页面可通过 window.addEventListener 订阅
  console.log('[PoolCreated]', log);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(POOL_CREATED_EVENT_NAME, {
        detail: log,
      }),
    );
  }
}

export function PoolCreatedWatcher() {

  const publicClient = usePublicClient({ chainId: sepolia.id });

  useEffect(() => {
    if (!publicClient) {
      return;
    }
    console.log('---onPoolCreated', onPoolCreated)
    const unwatch = publicClient.watchContractEvent({
      address: POOL_MANAGER_ADDRESS,
      abi: POOL_MANAGER_ABI,
      eventName: 'PoolCreated',
      poll: true,
      pollingInterval: 3_000,
      onLogs: (logs) => {
        void refreshPoolsFromApi();
        console.log('监听回调', logs);
        logs.forEach(onPoolCreated);
      },
      onError: (error) => {
        console.error('[PoolCreated][watch error]', error);
      },
    });

    return () => {
      unwatch();
    };
  }, [publicClient]);

  return null;
}

