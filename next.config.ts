import type { NextConfig } from "next";

// Товароучёт — отдельное Next.js-приложение, деплоится отдельно на Vercel.
// Монтируется в эту CRM по /inventory через Multi-Zones rewrites.
// INVENTORY_URL — прод-URL того деплоя, например https://<домен-товароучёта>.vercel.app
// (без завершающего слэша). Если не задан — rewrites выключены.
const inventoryUrl = process.env.INVENTORY_URL;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!inventoryUrl) return [];
    return [
      { source: "/shop", destination: `${inventoryUrl}/shop` },
      { source: "/shop/:path+", destination: `${inventoryUrl}/shop/:path+` },
      { source: "/cashier", destination: `${inventoryUrl}/cashier` },
      { source: "/inventory", destination: `${inventoryUrl}/inventory` },
      { source: "/inventory/:path+", destination: `${inventoryUrl}/inventory/:path+` },
      { source: "/inventory-static/:path+", destination: `${inventoryUrl}/inventory-static/:path+` },
    ];
  },
};

export default nextConfig;
