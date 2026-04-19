/**
 * 测试网 ERC20 水龙头常见接口：`mint(address to, uint256 amount)`。
 * 若链上合约签名不同（例如仅有 `mint(uint256)`），请按实际 ABI 调整本文件。
 */
export const TEST_ERC20_MINT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;
