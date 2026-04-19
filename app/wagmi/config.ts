import { http, fallback, createConfig } from 'wagmi';
import { sepolia } from 'viem/chains';
import { injected, metaMask, walletConnect } from 'wagmi/connectors';
// import {
//   metaMaskWallet,    // MetaMask钱包适配器
// } from '@rainbow-me/rainbowkit/wallets';

// export const localChain = defineChain({
//   id: 31337, // 常见本地链ID，请与你的本地节点配置保持一致
//   name: 'my_next',
//   // network: 'localhost',
//   nativeCurrency: {
//     decimals: 18,
//     name: 'localhost',
//     symbol: 'GO',
//   },
//   rpcUrls: {
//     default: { http: ['http://localhost:8545'] }, // 本地节点的RPC地址
//   },
//   // 可选：配置区块浏览器（本地网络通常没有）
//   blockExplorers: {
//     default: {
//       name: 'Local Explorer',
//       url: 'http://localhost:3000', // 假设本地运行一个浏览器
//     },
//   },
// });

// const chains = [sepolia, polygonAmoy];


const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';

const connectors = [
  metaMask(),
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
        }),
      ]
    : []),
];

// 2. 创建 wagmi 配置对象
export const config = createConfig({
  chains: [sepolia] as const,
  ssr: true,
  syncConnectedChain: true,
  connectors,
  batch: { multicall: true },
  // 4. 配置传输层（指定各链的RPC节点）
  transports: {
    // [localChain.id]: http('http://localhost:8545'), // 替换为真实API
    [sepolia.id]: fallback([
      http('https://sepolia.infura.io/v3/fa962aafbec041adb087971619a3d26d', {
        fetchOptions: {
          // 关键：声明这是一个跨域请求，并尝试携带凭据（如果你的Infura计划允许）
          mode: 'cors', // 或 'no-cors'，但后者会限制响应内容访问
          credentials: 'omit', // 对于Infura公开端点，通常设为 'omit'
          headers: {

          }
        },
      }),
      http('https://backup-1.example.com/rpc'),
    ])
  },

  // 5. 开启自动连接（可选但推荐）
});