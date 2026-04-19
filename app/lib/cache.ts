// lib/cache.ts
import { unstable_cache } from 'next/cache'

/**
 * 带缓存的合约数据获取器
 * @param cacheKey - 缓存键前缀
 * @param fn - 获取数据的异步函数
 * @param options - 缓存选项
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  fn: () => Promise<T>,
  options?: {
    revalidate?: number        // 重新验证时间（秒），默认 60 秒
    tags?: string[]            // 用于按需重新验证的标签
  }
): Promise<T> {
  const { revalidate = 60, tags = [] } = options || {}

  // 注意：unstable_cache 必须在服务端环境调用，不能在客户端组件中使用
  const cachedFn = unstable_cache(
    async () => {
      console.log(`[Cache Miss] Fetching data for key: ${cacheKey}`)
      return await fn()
    },
    [cacheKey],                // 缓存键，变化后重新执行 fn
    {
      revalidate,              // ISR 风格的时间间隔重新验证
      tags,                    // 支持 revalidateTag() 按需刷新
    }
  )

  return cachedFn()
}