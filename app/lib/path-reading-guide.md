# `path.ts` 代码阅读指南

这份文档按“固定输入（exactInput）”与“固定输出（exactOutput）”分开整理，帮助快速定位 `app/lib/path.ts` 的核心逻辑。

---

## 文件职责

`path.ts` 主要做两件事：

1. 对单池做本地 swap 报价（不发链上交易），包含：
   - `quoteExactInputSinglePool`
   - `quoteExactOutputSinglePool`
2. 在候选单池中选最优：
   - 固定输入：选 `amountOut` 最大的池
   - 固定输出：选 `amountIn` 最小的池

---

## 一、固定输入（exactInput）流程

入口：`onSwap(params)`，当 `zeroForOne` 分支为 true 时，走固定输入挑选。

### 1) 预处理与筛池

- 调 `buildPoolBuckets(list, zeroForOne)`：
  - 过滤无流动性池
  - 过滤 tick 已到边界不可交易池
  - 将 `liquidity/sqrtPriceX96` 转为 `bigint`
  - 以 `tokenName_tokenName` 分桶

### 2) 获取当前 token 对候选池

- `currentKey = fromTokenSymbol_toTokenSymbol`
- `singlePath = finalList[currentKey] ?? []`
- 空则返回 `makeEmptySwapResult()`

### 3) 在候选池中选最优（`pickBestExactInputSinglePool`）

对每个池：

- 计算限价：`pathPriceLimit = sqrtPriceX96 * (10000 - slippage) / 10000`
- 调 `quoteExactInputSinglePool(...)` 计算该池输出
- 比较 `amountOut`，保留最大值

最终返回：

- `baseValue`: 最大 `amountOut`
- `bestRoute`: 最优池（单元素数组）
- `myPriceLimit`: 对应限价

---

## 二、固定输出（exactOutput）流程

入口：`onSwap(params)`，当 `zeroForOne` 分支为 false 时，走固定输出挑选。

### 1) 预处理与筛池

与固定输入一致，仍经过 `buildPoolBuckets(...)`。

### 2) 获取候选池

同样使用 `currentKey` 找单池集合。

### 3) 在候选池中选最优（`pickBestExactOutputSinglePool`）

对每个池：

- 计算限价：`pathPriceLimit = sqrtPriceX96 * (10000 + slippage) / 10000`
- 调 `quoteExactOutputSinglePool(...)` 计算满足目标输出所需输入
- 比较 `amountIn`，保留最小值

最终返回：

- `baseValue`: 最小 `amountIn`
- `bestRoute`: 最优池（单元素数组）
- `myPriceLimit`: 对应限价

---

## 三、单池数学核心（两种模式共用）

### `computeSwapStep(...)`

是最核心的单步 swap 数学，逻辑与 v3 的 `SwapMath.computeSwapStep` 对齐：

- 根据 `sqrtRatioCurrentX96` 和 `sqrtRatioTargetX96` 判断方向 `zeroForOne`
- 根据 `amountRemaining` 正负判断是 exactInput 还是 exactOutput
- 计算：
  - 下一价格 `sqrtRatioNextX96`
  - 输入量 `amountIn`
  - 输出量 `amountOut`
  - 手续费 `feeAmount`

### 辅助函数

- `getAmount0Delta` / `getAmount1Delta`
- `getNextSqrtPriceFromAmount0RoundingUp`
- `getNextSqrtPriceFromAmount1RoundingDown`
- `getNextSqrtPriceFromInput`
- `getNextSqrtPriceFromOutput`

---

## 四、与 Router/Pool 的对齐点

- `assertSqrtPriceLimit(...)`：对齐 `Pool.sol` 的 SPL 约束
- `sqrtTargetFromPoolLimit(...)`：在“用户限价”和“池子边界价”中取更紧的一侧
- `poolSwapAmountsFromStep(...)`：按 `Pool.swap` 的 `(amount0, amount1)` 拼装规则复刻

---

## 五、阅读顺序建议

建议按以下顺序看源码：

1. `onSwap`（总入口）
2. `pickBestExactInputSinglePool` / `pickBestExactOutputSinglePool`
3. `quoteExactInputSinglePool` / `quoteExactOutputSinglePool`
4. `computeSwapStep`
5. 各种 `getAmount*` 与 `getNextSqrtPrice*` 细节函数

这样从“业务层”逐步下钻到“数学层”，理解最顺。
