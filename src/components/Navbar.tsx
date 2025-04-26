// src/components/Navbar.tsx
"use client"; // This component uses hooks and interacts with browser state

import React from 'react';
// Import the updated hook name
import { useReactiveMidnightWallet } from '@/context/ReactiveMidnightWalletContext';

// --- Connection Indicator Component ---
// Visually represents the connection status (dot + text)
const ConnectionIndicator: React.FC<{ isConnected: boolean; isChecking: boolean; isConnectingManual: boolean }> = ({
    isConnected,
    isChecking,
    isConnectingManual
}) => {
    const size = '12px';
    let color = '#facc15'; // Default: Yellow (Disconnected)
    let title = 'Disconnected';

    // Determine status based on priority: Manual Connecting > Checking > Connected > Disconnected
    if (isConnectingManual) {
        color = '#60a5fa'; // Blue
        title = 'Connecting...';
    } else if (isChecking) {
        color = '#60a5fa'; // Blue
        title = 'Checking...';
    } else if (isConnected) {
        color = '#4ade80'; // Green
        title = 'Connected';
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={title}>
            {/* The colored dot */}
            <span style={{
                height: size,
                width: size,
                backgroundColor: color,
                borderRadius: '50%',
                display: 'inline-block',
                border: '1px solid rgba(255, 255, 255, 0.5)',
                // Optional: Add a subtle animation for loading states
                animation: (isChecking || isConnectingManual) ? 'pulse 1.5s infinite ease-in-out' : 'none',
            }}></span>
            {/* The status text */}
            <span style={{ fontSize: '0.9em' }}>{title}</span>
            {/* CSS for pulsing animation (add to a global CSS file or use styled-components/tailwind) */}
            <style jsx>{`
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

// --- Main Navbar Component ---
export const Navbar: React.FC = () => {
    // Use the updated hook to get context state and functions
    const {
        isConnected,
        isConnecting,      // State for manual connection button press
        isCheckingStatus,  // State for initial load or background polling checks
        error,
        walletState,
        walletName,
        connectWallet,     // Function to initiate manual connection
        disconnectWallet,  // Function to clear DApp state
    } = useReactiveMidnightWallet();

    // Handler for the connect button click
    const handleConnect = () => {
        // connectWallet is already debounced in the context, safe to call directly
        connectWallet();
    };

    // Shorten address for display in the disconnect button
    const displayAddress = walletState?.address
        ? `${walletState.address.substring(0, 6)}...${walletState.address.substring(walletState.address.length - 4)}`
        : '';

    // Combine loading states for the indicator
    const isLoadingOverall = isConnecting || isCheckingStatus;

    return (
        <nav style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 2rem',
            backgroundColor: '#1f2937', // Dark gray background
            color: '#e5e7eb',          // Light gray text
            borderBottom: '1px solid #374151' // Slightly lighter border
        }}>
            {/* Left side: Application Title/Logo */}
            <div>
                <span style={{ fontWeight: 'bold', fontSize: '1.2em' }}>Midnight Reactive Starter</span>
            </div>

            {/* Right side: Status Indicator, Error Display, Connect/Disconnect Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                 {/* Display error message if present and not loading */}
                 {error && !isLoadingOverall && (
                     <span
                        style={{ color: '#f87171', fontSize: '0.8em', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid #ef4444', padding: '2px 5px', borderRadius: '3px'}}
                        title={error} // Show full error on hover
                     >
                         ⚠️ Error: {error.split(':')[1]?.trim() ?? error} {/* Show simplified error */}
                    </span>
                 )}

                {/* Connection Status Indicator */}
                <ConnectionIndicator
                    isConnected={isConnected}
                    isChecking={isCheckingStatus}
                    isConnectingManual={isConnecting}
                />

                {/* Conditional Connect/Disconnect Button */}
                {isConnected && walletState ? (
                    // --- Disconnect Button ---
                     <button
                        onClick={disconnectWallet} // Use disconnectWallet from context
                        style={buttonStyle('#ef4444')} // Red background
                        title={`Disconnect wallet: ${walletState.address}`} // Tooltip with full address
                     >
                         Disconnect {displayAddress} {/* Show shortened address */}
                     </button>
                ) : (
                    // --- Connect Button ---
                    <button
                        onClick={handleConnect}
                        // Disable button only during an *explicit manual* connection attempt
                        disabled={isConnecting || isCheckingStatus} // Disable during initial check too
                        style={buttonStyle('#3b82f6', isConnecting || isCheckingStatus)} // Blue background, grayed out if disabled
                    >
                        {isConnecting ? 'Connecting...' : (isCheckingStatus ? 'Checking...' : `Connect ${walletName ?? 'Wallet'}`)}
                    </button>
                )}
            </div>
        </nav>
    );
};

// --- Helper for Button Styling ---
// Consistent styles for buttons, handling disabled state
const buttonStyle = (backgroundColor: string, disabled: boolean = false): React.CSSProperties => ({
    padding: '8px 16px',
    backgroundColor: disabled ? '#6b7280' : backgroundColor, // Use gray when disabled
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.9em',
    opacity: disabled ? 0.6 : 1, // Dim when disabled
    transition: 'background-color 0.2s ease, opacity 0.2s ease',
    whiteSpace: 'nowrap', // Prevent text wrapping
});