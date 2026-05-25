"use client";

import dynamic from "next/dynamic";

export const WalletConnectButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  {
    ssr: false,
    loading: () => (
      <button className="wallet-adapter-button wallet-adapter-button-trigger" disabled>
        Connect Wallet
      </button>
    ),
  },
);
