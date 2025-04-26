// src/context/ReactiveMidnightWalletContext.tsx
"use client";

import React, {
    createContext,
    useState,
    useContext,
    ReactNode,
    useCallback,
    useEffect,
    useRef
} from 'react';
import type {
    DAppConnectorAPI,
    DAppConnectorWalletAPI,
    DAppConnectorWalletState,
    ServiceUriConfig,
    APIError
} from '@midnight-ntwrk/dapp-connector-api';

const POLLING_INTERVAL_MS = 3000;

// --- Context State Definition ---
// Define the data and functions provided by the context
interface ReactiveMidnightWalletContextState {
    walletApi: DAppConnectorWalletAPI | null;
    serviceUris: ServiceUriConfig | null;
    walletState: DAppConnectorWalletState | null;
    isConnected: boolean; // Derived from walletApi existence
    // Provide the specific loading states:
    isConnecting: boolean; // True during *manual* connection attempts initiated by user click
    isCheckingStatus: boolean; // True during the initial load check or background polling
    error: string | null;
    walletName: string | null;
    connectWallet: () => Promise<void>; // Expose the manual trigger
    disconnectWallet: () => void;
    // Removed infoMessage as we rely on error/loading states now
}

// --- Context Creation ---
const ReactiveMidnightWalletContext = createContext<ReactiveMidnightWalletContextState | null>(null);

// --- Provider Props ---
interface ReactiveMidnightWalletProviderProps {
    children: ReactNode;
    targetWalletName?: string;
}

// --- Provider Component ---
export const ReactiveMidnightWalletProvider: React.FC<ReactiveMidnightWalletProviderProps> = ({
    children,
    targetWalletName = 'mnLace'
}) => {
    // --- State Management ---
    const [walletApi, setWalletApi] = useState<DAppConnectorWalletAPI | null>(null);
    const [serviceUris, setServiceUris] = useState<ServiceUriConfig | null>(null);
    const [walletState, setWalletState] = useState<DAppConnectorWalletState | null>(null);
    const [isConnecting, setIsConnecting] = useState<boolean>(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(true); // Start true for initial check
    const [error, setError] = useState<string | null>(null);
    const [walletName, setWalletName] = useState<string | null>(null);

    // Derived state for convenience (used internally and potentially by consumers)
    const isConnected = !!walletApi;
    const statusPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const statePollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // --- Get Connector ---
    const getConnector = useCallback((): DAppConnectorAPI | null => {
        if (typeof window !== 'undefined' && window.midnight && window.midnight[targetWalletName]) {
            return window.midnight[targetWalletName];
        }
        return null;
    }, [targetWalletName]);

    // --- Clear All Intervals ---
    const clearAllIntervals = useCallback(() => {
        if (statusPollIntervalRef.current) clearInterval(statusPollIntervalRef.current);
        if (statePollIntervalRef.current) clearInterval(statePollIntervalRef.current);
        statusPollIntervalRef.current = null;
        statePollIntervalRef.current = null;
        // console.log("Polling intervals cleared."); // Optional debug log
    }, []);

    // --- Establish Connection Logic (Internal) ---
    // Fetches API, state, URIs, sets connected state. Returns success status.
    const _establishConnection = useCallback(async (connector: DAppConnectorAPI, initialCheck: boolean = false) => {
        console.log(`_establishConnection called (initialCheck: ${initialCheck})`);
        // Don't set isConnecting here, that's for manual attempts.
        // isCheckingStatus should already be true if called initially.
        setError(null); // Clear previous errors before attempting

        try {
            const enabledApi = await connector.enable();
            console.log("enable() successful.");

            const [fetchedState, fetchedUris] = await Promise.all([
                enabledApi.state(),
                connector.serviceUriConfig()
            ]);
            console.log("Wallet state and URIs fetched.");

            // --- Success Path ---
            setWalletApi(enabledApi);
            setWalletName(connector.name);
            setWalletState(fetchedState);
            setServiceUris(fetchedUris);
            // isConnected is derived, no need to set directly
            setError(null);
            console.log(`Connection established. Address: ${fetchedState.address}`);
            return true; // Indicate success

        } catch (err) {
            console.error("Error during _establishConnection:", err);
            const apiError = err as APIError;
            const code = (err as any)?.code ?? apiError?.code;
            const msg = (err as Error)?.message || apiError?.reason || 'Unknown connection error';

            // Only show error if it wasn't the silent initial check OR if it's not the -3 code
            if (!initialCheck && !(code === -3 || String(msg).includes('enable() first'))) {
                 setError(`Connection failed: ${msg}${code ? ` (Code: ${code})` : ''}`);
            } else if (!initialCheck) {
                // If it *was* the -3 error during a manual connect, maybe log differently or ignore UI error
                 console.warn("Enable() failed, likely waiting for user prompt (or prompt was cancelled).");
                 // Optionally set an info message here if needed, but often just letting the button re-enable is enough
            }

            // Reset state on any error during establishment
            setWalletApi(null); setServiceUris(null); setWalletState(null); setWalletName(null);
            return false; // Indicate failure
        }
    }, [targetWalletName]); // dependency

    // --- Manual Connect Function (Public) ---
    const connectWallet = useCallback(async () => {
        // Prevent connect if already connected or a manual connection is in progress
        if (isConnected || isConnecting) {
            console.log(`Connect wallet called but already ${isConnected ? 'connected' : 'connecting'}.`);
            return;
        }

        console.log("Manual connectWallet triggered.");
        setIsConnecting(true); // Set flag for manual attempt
        setError(null);        // Clear errors

        const connector = getConnector();
        if (!connector) {
            setError(`Wallet connector '${targetWalletName}' not found.`);
            setIsConnecting(false);
            return;
        }

        // Call the internal logic, wait for it to finish
        await _establishConnection(connector, false); // false indicates it's a manual (non-initial) attempt

        setIsConnecting(false); // Mark manual attempt finished regardless of outcome
    }, [isConnected, isConnecting, getConnector, targetWalletName, _establishConnection]);

    // --- Disconnect Function (Public) ---
    const disconnectWallet = useCallback(() => {
        console.log("Disconnecting wallet...");
        clearAllIntervals();
        setWalletApi(null);
        setServiceUris(null);
        setWalletState(null);
        setError(null);
        setIsConnecting(false);
        setIsCheckingStatus(false);
        setWalletName(null);
    }, [clearAllIntervals]);

    // --- Initial Load Check ---
    useEffect(() => {
        console.log("Effect: Initial load check mounting.");
        setIsCheckingStatus(true); // Indicate we are checking status
        const connector = getConnector();

        if (connector) {
            connector.isEnabled()
                .then(enabled => {
                    console.log(`Initial isEnabled: ${enabled}`);
                    if (enabled) {
                        return _establishConnection(connector, true); // true = initial silent check
                    }
                    return false; // Not enabled, no connection needed yet
                })
                .catch(err => {
                    console.error("Error during initial isEnabled check:", err);
                    setError("Could not check initial wallet status."); // Let user know check failed
                })
                .finally(() => {
                    // Fix 1: Add setIsLoading to dependency array
                    setIsCheckingStatus(false); // Mark initial check as complete
                });
        } else {
            console.log("No wallet connector found on initial load.");
            setIsCheckingStatus(false); // Mark initial check as complete
        }
    // Fix 1: Add setIsLoading (and others used inside) to dependency array
    }, [getConnector, _establishConnection, setIsCheckingStatus]); // Ensure effect runs once

    // --- Polling Effect ---
    useEffect(() => {
        // Only poll if connected
        if (isConnected && walletApi) {
            console.log("Effect: Starting status & state polling.");

            // Polling for isEnabled (detects disconnect from extension)
            statusPollIntervalRef.current = setInterval(async () => {
                const connector = getConnector();
                if (!connector) { // Stop if connector disappears
                    disconnectWallet();
                    return;
                }
                try {
                    const enabled = await connector.isEnabled();
                    if (!enabled) {
                        console.log("Polling detected wallet disabled. Disconnecting.");
                        disconnectWallet();
                    }
                } catch (pollError) {
                    console.error("Error polling isEnabled:", pollError);
                    disconnectWallet(); // Disconnect on error
                }
            }, POLLING_INTERVAL_MS);

            // Polling for state changes (detects account switch)
            statePollIntervalRef.current = setInterval(async () => {
                 const currentWalletApi = walletApi; // Use captured API
                 if (currentWalletApi) {
                    try {
                        const newState = await currentWalletApi.state();
                        if (newState.address !== walletState?.address) {
                            console.log("Polling detected account switch. Updating state.");
                            setWalletState(newState); // Update local state
                        }
                    } catch (pollError) {
                        console.error("Error polling wallet state:", pollError);
                        disconnectWallet(); // Disconnect on error
                    }
                 } else {
                     // Should not happen if isConnected is true, but clear just in case
                     clearAllIntervals();
                 }
            }, POLLING_INTERVAL_MS);

        } else {
            // If not connected, ensure intervals are cleared
             clearAllIntervals();
        }

        // Cleanup: clear intervals on unmount or when connection status changes
        return () => {
            console.log("Effect cleanup: Clearing polling intervals.");
            clearAllIntervals();
        };
        // Added walletState?.address to dependencies to restart state polling if address changes
    }, [isConnected, walletApi, walletState?.address, getConnector, disconnectWallet, clearAllIntervals]);

    // --- Context Value ---
    // Fix 2: Provide the individual loading states, not the derived one.
    const value: ReactiveMidnightWalletContextState = {
        walletApi,
        serviceUris,
        walletState,
        isConnected, // Keep the derived boolean for convenience
        isConnecting, // Provide the manual connection attempt flag
        isCheckingStatus, // Provide the background check/initial load flag
        error,
        // infoMessage removed, using error state or button state now
        walletName,
        connectWallet,
        disconnectWallet,
    };

    // --- Render Provider ---
    return (
        <ReactiveMidnightWalletContext.Provider value={value}>
            {children}
        </ReactiveMidnightWalletContext.Provider>
    );
};

// --- Custom Hook ---
// Update the hook name if you changed the context name
export const useReactiveMidnightWallet = (): ReactiveMidnightWalletContextState => {
    const context = useContext(ReactiveMidnightWalletContext);
    if (!context) {
        throw new Error('useReactiveMidnightWallet must be used within a ReactiveMidnightWalletProvider');
    }
    return context;
};