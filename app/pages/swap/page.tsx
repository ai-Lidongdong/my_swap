import { redirect } from 'next/navigation';

/** 交换页已迁至站点根路径 `/` */
export default function SwapPage() {
  redirect('/');
}
