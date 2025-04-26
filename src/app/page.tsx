// src/app/page.tsx
import React from 'react';

// Example of a component that might use the wallet state later
// Needs to be a Client Component to use the hook
const WalletInfoDisplay = () => {
    // "use client"; // <-- Add this if you uncomment the hook usage
    // import { useReactiveMidnightWallet } from '@/context/ReactiveMidnightWalletContext';
    // const { isConnected, walletState, serviceUris, isLoading } = useReactiveMidnightWallet();

    // if (isLoading) return <p>Checking wallet status...</p>;
    // if (!isConnected) return <p>Connect your wallet using the button in the navbar.</p>;

    // return (
    //     <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #374151', borderRadius: '5px' }}>
    //         <h2>Wallet Details (Connected)</h2>
    //         <p>Address: {walletState?.address ?? 'N/A'}</p>
    //         {/* Add more details from walletState or serviceUris as needed */}
    //     </div>
    // );

    // Placeholder for Server Component rendering
    return (
        <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #374151', borderRadius: '5px' }}>
            <h2>DApp Content Area</h2>
            <p>Wallet status is shown in the Navbar above.</p>
            <p>Use the button in the Navbar to connect/disconnect.</p>
            <p>(To display wallet details here, make this a Client Component and use the `useReactiveMidnightWallet` hook.)</p>
        </div>
    );
};


export default function Home() {
  return (
    <div>
      <h1>Midnight Reactive Starter</h1>
      <p>This template uses polling to simulate reactive wallet status updates.</p>
      <WalletInfoDisplay />
    </div>
  );
}