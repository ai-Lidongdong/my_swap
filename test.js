const list =   [
    {
      pool: '0xf2121617Fd3B1cD452B979f61010c8F4d9ab4C5a',
      token0: '0x4798388e3adE569570Df626040F07DF71135C48E',
      token1: '0x86B5df6FF459854ca91318274E47F4eEE245CF28',
      index: 13,
      fee: 3000,
      feeProtocol: 0,
      tickLower: -6932,
      tickUpper: 6931,
      tick: -305,
      sqrtPriceX96: 78031133090864244405932392448n,
      liquidity: 3244596918572667904n
    },
    {
      pool: '0x70c5cabc31210938e52df145695f13f09c33326E',
      token0: '0x5A4eA3a013D42Cfd1B1609d19f6eA998EeE06D30',
      token1: '0x86B5df6FF459854ca91318274E47F4eEE245CF28',
      index: 0,
      fee: 3000,
      feeProtocol: 0,
      tickLower: -887220,
      tickUpper: 887220,
      tick: -152,
      sqrtPriceX96: 79228162514264337593543950336n,
      liquidity: 100000000000000000000n
    }
  ]
  const midToken = [...new Set(list.flatMap(p => [p.token0, p.token1]))];
    console.log('--midToken', midToken)
