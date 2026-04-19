// lib/viem-server.ts
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'


export const publicClient = createPublicClient({
    chain: sepolia, // 使用与消息中 chainId 对应的链
    transport: http('https://sepolia.infura.io/v3/fa962aafbec041adb087971619a3d26d')
});