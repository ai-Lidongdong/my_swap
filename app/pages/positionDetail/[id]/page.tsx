'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/app/components/Header';

/** 兼容旧链接 `/pages/positionDetail/[id]?…` → `/pages/[id]?…` */
function LegacyNestedRedirectInner() {
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();
  const raw =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const id = (raw ?? '').trim();

  useEffect(() => {
    if (!id) {
      return;
    }
    const qs = sp.toString();
    router.replace(`/pages/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`);
  }, [id, router, sp]);

  if (!id) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-400">
        <Header active="positions" variant="dark" maxWidth="narrow" />
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm">无效链接</p>
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

export default function LegacyPositionDetailNestedRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-400">
          <Header active="positions" variant="dark" maxWidth="narrow" />
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm">加载中…</p>
        </div>
      }
    >
      <LegacyNestedRedirectInner />
    </Suspense>
  );
}
