import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Contract {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
}
interface ContractState  {
    ContractList: Contract[];
    getTokenInfo: () => Promise<void>;
}
export const useWalletStore = create<ContractState>()(
    persist(
        (set, get) => ({
            ContractList: [],
            getTokenInfo: async() =>{
                const res = await fetch(`/api/tokens`, {
                    method: 'GET',
                });
                const data = await res.json();

                if (!Array.isArray(data)) {
                    return;
                }

                const nextList: Contract[] = data
                    .map((item) => ({
                        address: String(item.address ?? ''),
                        symbol: String(item.symbol ?? ''),
                        name: String(item.name ?? ''),
                        decimals: Number(item.decimals ?? 18),
                    }))
                    .filter((item) => item.address && item.symbol);

                set({ ContractList: nextList });
            }
        }),
        {
            name: 'wallet-storage',
            storage: createJSONStorage(() => ({
                getItem: (name: string) => {
                    return localStorage.getItem(name);
                },
                setItem: (name: string, value: string) => {
                    localStorage.setItem(name, value);
                },
                removeItem: (name: string) => {
                    localStorage.removeItem(name);
                }
            })),
            partialize: (state): Partial<ContractState> => ({
                ContractList: state.ContractList,
            })
        }
    )
);