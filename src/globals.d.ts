// src/globals.d.ts
import type { DAppConnectorAPI } from '@midnight-ntwrk/dapp-connector-api';

declare global {
  interface Window {
    midnight?: {
      [key: string]: DAppConnectorAPI | undefined;
    };
  }
}
// export {}; // Ensure module mode