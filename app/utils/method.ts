
import { TickMath, FullMath } from "@uniswap/v3-sdk";
const fn1 = () => {
    let amount0 = 250n, amount1 = 250n, fee = 0.01
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

}
// 一笔 swap交易过程计算
// fn1()

const fn2 = () => {
    const amount0 = 100n;
    const amount1 = 100n;
    const sqrt  = 2n ** 96n;
    const a0 = amount0 * (10n ** 18n);
    const a1 = amount0 * (10n ** 18n);
    const tickLower = -192000;
    const tickUpper = 192000;

    // const Pa = 1.0001 ** tickLower;
    // const Pb = 1.0001 ** tickUpper;
    const P = TickMath.getSqrtRatioAtTick(1).toString();
    const Pa = TickMath.getSqrtRatioAtTick(tickLower).toString();
    const Pb = TickMath.getSqrtRatioAtTick(tickUpper).toString();
    console.log('P:', P)
    console.log('Pa:', Pa)
    console.log('Pb:', Pb)

    // const method0 = Number(a0) / ( 1 / Number(P) - 1 / Number(Pb));
    const fenzi =  Number(a0) * Number(P) * Number(Pb);
    const fenmu =  Number(Pb) - Number(P);
    const method0 = fenzi / fenmu;
    // const method1 = Number(a1) / ( 1/Math.sqrt(Pa) - 1/Math.sqrt(Pb));
    console.log('--method0', method0)
}
fn2()


export const fn = () =>{
    console.log('222', 100n * (10n ** 18n))
    fn2()
}
100006776584381818549
100000000000000000000n


