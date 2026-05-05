'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/app/components/Header';
import { parsePositionDetailQuery } from '@/app/lib/positionDetailQuery';

/** 兼容旧链接 `/pages/positionDetail?id=…&…`，重定向到 `/pages/[id]?…` */
function PositionDetailLegacyRedirect() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = parsePositionDetailQuery(sp);
  const id = (q.id ?? '').trim();

  useEffect(() => {
    if (!id) {
      return;
    }
    const next = new URLSearchParams();
    for (const [k, v] of sp.entries()) {
      if (k === 'id') {
        continue;
      }
      next.set(k, v);
    }
    const qs = next.toString();
    router.replace(`/pages/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`);
  }, [id, router, sp]);

  if (!id) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
        <Header active="positions" variant="dark" maxWidth="narrow" />
        <main className="mx-auto mt-8 w-full max-w-2xl text-center text-sm text-zinc-500">
          缺少仓位参数，请从
          <Link href="/pages/positionList" className="mx-1 text-fuchsia-400 underline-offset-2 hover:underline">
            仓位列表
          </Link>
          进入详情。
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-400">
      <Header active="positions" variant="dark" maxWidth="narrow" />
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm">跳转中…</p>
    </div>
  );
}

export default function PositionDetailLegacyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-400">
          <Header active="positions" variant="dark" maxWidth="narrow" />
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm">加载中…</p>
        </div>
      }
    >
      <PositionDetailLegacyRedirect />
    </Suspense>
  );
}
