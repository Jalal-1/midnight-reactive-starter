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
import {
    DAppConnectorAPI,
    DAppConnectorWalletAPI,
    DAppConnectorWalletState,
    ServiceUriConfig,
    APIError,
    ErrorCodes
} from '@midnight-ntwrk/dapp-connector-api';

const STATUS_POLLING_INTERVAL_MS = 3000;
const STATE_POLLING_INTERVAL_MS = 5000;
const APPROVAL_POLLING_INTERVAL_MS = 500;
const APPROVAL_POLLING_TIMEOUT_MS = 15000; // 15 seconds

// --- Context State Definition ---
interface ReactiveMidnightWalletContextState {
    walletApi: DAppConnectorWalletAPI | null;
    serviceUris: ServiceUriConfig | null;
    walletState: DAppConnectorWalletState | null;
    isConnected: boolean;
    isConnecting: boolean;
    isCheckingStatus: boolean;
    error: string | null;
    infoMessage: string | null; // For guiding user during -3 error approval wait
    walletName: string | null;
    connectWallet: () => Promise<void>;
    disconnectWallet: () => void;
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
    const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null); // To guide user
    const [walletName, setWalletName] = useState<string | null>(null);

    const isConnected = !!walletApi;
    const statusPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const statePollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const approvalPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
        if (approvalPollIntervalRef.current) clearInterval(approvalPollIntervalRef.current);
        statusPollIntervalRef.current = null;
        statePollIntervalRef.current = null;
        approvalPollIntervalRef.current = null;
    }, []);

     // --- Internal Function to Fetch State/URIs ---
     const _fetchDetails = useCallback(async (connector: DAppConnectorAPI, enabledApi: DAppConnectorWalletAPI) => {
        console.log("Fetching wallet state and URIs...");
        try {
            const [fetchedState, fetchedUris] = await Promise.all([
                enabledApi.state(),
                connector.serviceUriConfig()
            ]);
             setWalletState(fetchedState);
             setServiceUris(fetchedUris);
             console.log(`Details fetched. Address: ${fetchedState.address}`);
             return true;
        } catch (fetchErr) {
             console.error("Error fetching details after enable:", fetchErr);
             setError("Connected, but failed to fetch wallet details.");
             setWalletState(null);
             setServiceUris(null);
             return false;
        }
    }, []);


    // --- Establish Connection Logic (Internal) ---
    // Tries to get API, then fetches details. Returns success status.
    const _establishConnection = useCallback(async (connector: DAppConnectorAPI, isInitialCheck: boolean = false): Promise<boolean> => {
        console.log(`_establishConnection called (isInitialCheck: ${isInitialCheck})`);
        // Don't clear error/info here, let the caller manage UI state

        try {
            const enabledApi = await connector.enable();
            console.log("enable() successful.");
            setWalletApi(enabledApi);
            setWalletName(connector.name);

            // Fetch details and update state
            const detailsFetched = await _fetchDetails(connector, enabledApi);

            // Only consider fully connected if details were also fetched
            if (detailsFetched) {
                 setError(null); // Clear errors on full success
                 setInfoMessage(null);
                 return true; // Full success
            } else {
                 // State already updated with error by _fetchDetails
                 return false; // Partial success (API obtained, but details failed)
            }

        } catch (err) {
            console.error("Error during _establishConnection:", err);
            const apiError = err as APIError;
            const code = (err as { code?: number | string }).code;
            const msg = (err instanceof Error ? err.message : '') || apiError?.reason || 'Unknown connection error';

            // Reset partial state from this attempt
            setWalletApi(null); setServiceUris(null); setWalletState(null); setWalletName(null);

            const isApprovalError = code === -3 || String(msg).includes('enable() first');

            if (isApprovalError && !isInitialCheck) {
                // Signal specifically that approval polling should start for manual attempts
                console.warn("Detected -3 error during manual connection attempt.");
                return false; // Indicate failure that should trigger polling
            } else if (!isInitialCheck) {
                // For other errors during manual attempt, set the error state
                setError(`Connection failed: ${msg}${code ? ` (Code: ${code})` : ''}`);
                return false; // Indicate failure
            } else {
                 // For errors during initial check (including -3), fail silently
                 console.log("Initial check failed to establish connection silently.");
                 return false;
            }
        }
    }, [targetWalletName, _fetchDetails]); // Added _fetchDetails

    // --- Start Polling for Approval after -3 Error ---
    const _startApprovalPolling = useCallback((connector: DAppConnectorAPI) => {
        clearAllIntervals();
        // Set info message *before* clearing intervals potentially set by _establishConnection error
        setInfoMessage(`Connection prompt likely appeared in ${connector.name}. Please approve it. Checking status...`);
        // Keep isConnecting true

        let attempts = 0;
        const maxAttempts = APPROVAL_POLLING_TIMEOUT_MS / APPROVAL_POLLING_INTERVAL_MS;

        approvalPollIntervalRef.current = setInterval(async () => {
            attempts++;
            console.log(`Polling for approval: attempt ${attempts}`);
            if (attempts > maxAttempts) {
                console.log("Approval polling timed out.");
                clearAllIntervals();
                setError("Connection timed out. Did you approve the request in the wallet?");
                setInfoMessage(null);
                setIsConnecting(false); // Stop loading
                return;
            }

            try {
                const enabled = await connector.isEnabled();
                console.log(`Approval poll check: isEnabled() = ${enabled}`);
                if (enabled) {
                    console.log("Approval detected! Re-attempting connection.");
                    clearAllIntervals(); // Stop this poll
                    setInfoMessage("Approval detected. Finalizing connection...");
                    // Try establishing connection again
                    const success = await _establishConnection(connector, false);
                    setInfoMessage(null); // Clear info message now
                    setIsConnecting(false); // Stop loading
                }
            } catch (pollErr) {
                console.error("Error during approval polling:", pollErr);
                clearAllIntervals();
                setError("An error occurred while checking wallet approval status.");
                setInfoMessage(null);
                setIsConnecting(false);
            }
        }, APPROVAL_POLLING_INTERVAL_MS);

    }, [clearAllIntervals, _establishConnection]);

    // --- Manual Connect Function (Public) ---
    const connectWallet = useCallback(async () => {
        if (isConnecting || isConnected) return;

        console.log("Manual connectWallet triggered.");
        setIsConnecting(true);
        setError(null);
        setInfoMessage(null);
        clearAllIntervals(); // Stop background polling

        const connector = getConnector();
        if (!connector) {
            setError(`Wallet connector '${targetWalletName}' not found.`);
            setIsConnecting(false);
            return;
        }

        const success = await _establishConnection(connector, false);

        if (!success && !error) {
             // Failure without a specific error message implies the -3 code occurred
             _startApprovalPolling(connector);
             // Leave isConnecting = true; polling will set it false
        } else {
             // Success or other error occurred, stop the manual connecting indicator
             setIsConnecting(false);
        }

    }, [isConnected, isConnecting, getConnector, targetWalletName, _establishConnection, _startApprovalPolling, error, clearAllIntervals]);

    // --- Disconnect Function (Public) ---
    const disconnectWallet = useCallback(() => {
        // ... (same as before) ...
        console.log("Disconnecting wallet...");
        clearAllIntervals();
        setWalletApi(null);
        setServiceUris(null);
        setWalletState(null);
        setError(null);
        setInfoMessage(null);
        setIsConnecting(false);
        setIsCheckingStatus(false);
        setWalletName(null);
    }, [clearAllIntervals]);

    // --- Initial Load Check ---
    useEffect(() => {
        console.log("Effect: Initial load check mounting.");
        setIsCheckingStatus(true);
        const connector = getConnector();

        if (connector) {
            connector.isEnabled()
                .then(enabled => {
                    console.log(`Initial isEnabled: ${enabled}`);
                    if (enabled) {
                        // Attempt to establish connection silently
                        return _establishConnection(connector, true);
                    }
                    return false;
                })
                .catch(err => {
                    console.error("Error during initial isEnabled check:", err);
                })
                .finally(() => {
                    setIsCheckingStatus(false); // Initial check complete
                });
        } else {
            console.log("No wallet connector found on mount.");
            setIsCheckingStatus(false);
        }
        // Cleanup function for safety
        return () => { clearAllIntervals() };
    }, [getConnector, _establishConnection, clearAllIntervals]); // Dependencies

    // --- Background Polling Effect ---
    useEffect(() => {
        clearAllIntervals(); // Clear any previous intervals first

        if (isConnected && walletApi) {
            console.log("Effect: Starting background status & state polling.");
            setIsCheckingStatus(true); // Use this to indicate background activity

            // Poll isEnabled
            statusPollIntervalRef.current = setInterval(async () => {
                const connector = getConnector();
                if (!connector) { disconnectWallet(); return; }
                try {
                    if (!(await connector.isEnabled())) {
                        console.log("Background poll detected wallet disabled. Disconnecting.");
                        disconnectWallet();
                    }
                } catch (pollError) { console.error("Error polling isEnabled:", pollError); disconnectWallet(); }
            }, STATUS_POLLING_INTERVAL_MS);

            // Poll state
            statePollIntervalRef.current = setInterval(async () => {
                 const currentWalletApi = walletApi;
                 if (currentWalletApi) {
                    try {
                        const newState = await currentWalletApi.state();
                        if (newState.address !== (walletState ? walletState.address : null)) {
                            console.log("Background poll detected account switch. Updating state.");
                            setWalletState(newState);
                        }
                    } catch (pollError) { console.error("Error polling wallet state:", pollError); disconnectWallet(); }
                 }
            }, STATE_POLLING_INTERVAL_MS);

            setIsCheckingStatus(false); // Background polling is running, not actively 'checking' in terms of UI blocking

        } else {
             setIsCheckingStatus(false); // Ensure false if not connected
        }

        // Cleanup function
        return () => {
            console.log("Effect cleanup: Clearing background polling intervals.");
            clearAllIntervals();
        };
    }, [isConnected, walletApi, walletState?.address, getConnector, disconnectWallet, clearAllIntervals]);

    // --- Context Value ---
    const value: ReactiveMidnightWalletContextState = {
        walletApi,
        serviceUris,
        walletState,
        isConnected,
        isConnecting,
        isCheckingStatus,
        error,
        infoMessage, // Provide info message for the -3 flow
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
export const useReactiveMidnightWallet = (): ReactiveMidnightWalletContextState => {
    const context = useContext(ReactiveMidnightWalletContext);
    if (!context) {
        throw new Error('useReactiveMidnightWallet must be used within a ReactiveMidnightWalletProvider');
    }
    return context;
};