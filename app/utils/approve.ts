import type { Address } from 'viem';
import { readContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { TOKEN_ABI } from '@/app/constants/abi';
import { config } from '@/app/wagmi/config';

type EnsureTokenApprovalParams = {
  tokenAddress: Address;
  owner: Address;
  spender: Address;
  requiredAmount: bigint;
  chainId?: number;
};

/**
 * ERC20 授权通用方法：
 * 1. 先查询 allowance
 * 2. 若已满足 requiredAmount，直接返回 true
 * 3. 若不足则发起 approve，链上确认成功后返回 true
 */
export async function ensureTokenApproval({
  tokenAddress,
  owner,
  spender,
  requiredAmount,
  chainId,
}: EnsureTokenApprovalParams): Promise<boolean> {
  if (requiredAmount <= 0n) {
    return true;
  }

  const allowance = await readContract(config, {
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'allowance',
    args: [owner, spender],
    chainId,
  });

  if (allowance >= requiredAmount) {
    return true;
  }

  const hash = await writeContract(config, {
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'approve',
    args: [spender, requiredAmount],
    chainId,
  });

  const receipt = await waitForTransactionReceipt(config, {
    hash,
    chainId,
  });

  return receipt.status === 'success';
}
