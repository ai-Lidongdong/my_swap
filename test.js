// // // 100 100 
// // 10 -> 10
// // 110 100 // 11 : 10
// // // 110 91

// // 10 -> 10
// // //   110


// 100 100

// 110 100
// 11 : 10

// => 9.090909
// ------------------------------------------------
// 250 250 fee = 0.1
let amount0 = 250n, amount1 = 250n, fee = 0.01%;
let a0 = amount0 * (10n ** 18n);
let a1 = amount1 * (10n ** 18n);
let L = a0 * a1;
console.log('L', L)

// 注入 20 token0
let amountIn = 20n * (10n ** 18n);
// 实际注入
let actualAmountIn = amountIn - (amountIn * 100n / 1000000n);
console.log('---实际注入', actualAmountIn);

let afterInAmount0 = a0 + actualAmountIn;
console.log('---注入后 token0', afterInAmount0);
const afterInAmount1 = L / afterInAmount0;
console.log('---注入后 token1', afterInAmount1);

const getAmount1 = a1 - afterInAmount1
console.log('---获取 token1', getAmount1);
console.log('ss', 10n ** 18n);
console.log('---最终结果', getAmount1 / (10n ** 18n));
