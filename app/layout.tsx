import "./globals.css";
import { Providers } from './components/Providers';
import { ensurePoolInfoTableInitialized } from "@/app/models/poolInfoModel";

if (process.env.DB_INIT_ON_STARTUP === "true") {
  void ensurePoolInfoTableInitialized().catch((error) => {
    console.error("[mysql] 初始化 pool_infos 表失败", error);
  });
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
            <Providers>
              {children}
            </Providers>
      </body>
    </html>
  );
}
