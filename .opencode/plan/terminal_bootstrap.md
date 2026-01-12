# Plan: Robust Terminal Bootstrap Workflow

## Overview
Implement an industry-standard "Terminal Bootstrap" workflow.
1.  **First Launch:** App checks for a persisted `terminalId`. If missing, redirect to a "Registration Wizard" to capture BIR details (Serial, PTU).
2.  **Registration:** Server generates a UUID.
3.  **Persistence:** Electron Main process saves this UUID to `config.json` via `electron-store`.
4.  **Normal Op:** App loads `terminalId` from config and attaches it to shift operations automatically.

## Architecture

### 1. Electron Main Process (`electron/main.js`)
*   **Role:** The "File System Guardian".
*   **Action:** Add IPC handlers to read/write `terminalId` securely using `electron-store` (or a simple JSON file helper if we want to avoid new deps, but user approved `electron-store` pattern).
*   **Handlers:**
    *   `get-terminal-id`: Returns persisted ID or null.
    *   `save-terminal-id`: Writes ID to disk.

### 2. Registration Page (`app/register/page.tsx`)
*   **Role:** The "Setup Wizard".
*   **UI:** Form for PTU Number, Serial Number, Lane Name.
*   **Action:**
    *   `POST /api/terminals` to create record.
    *   Call `window.electronAPI.saveTerminalId(response.id)`.
    *   Redirect to `/pos`.

### 3. POS Logic (`app/pos/page.tsx` & `hooks/use-terminal.ts`)
*   **Role:** The "Daily Driver".
*   **Action:**
    *   `useTerminal` hook calls `window.electronAPI.getTerminalId()`.
    *   If null -> Redirect to `/register`.
    *   If found -> Store in state, enable POS.
    *   Shift Opening uses this ID automatically.

## Implementation Steps

### Step 1: Install Dependencies
*   Add `electron-store` to `package.json`.

### Step 2: Update Electron Main Process (`electron/main.js` + `preload.js`)
*   Initialize `electron-store`.
*   Expose `getTerminalConfig` and `setTerminalConfig` via IPC.

### Step 3: Create Registration Page
*   Create `app/register/page.tsx`.
*   Form logic to POST to API and save result via Electron.

### Step 4: Update API (`app/api/terminals/route.ts`)
*   Ensure it accepts registration data and returns the UUID. (Already mostly there, just verify).

### Step 5: Update POS Page (`app/pos/page.tsx`)
*   Add startup check:
    ```typescript
    useEffect(() => {
      const id = await window.electronAPI.getTerminalId()
      if (!id) router.push('/register')
    }, [])
    ```

### Step 6: Simplify `ShiftOpeningDialog`
*   Remove inputs.
*   Use the loaded ID.

## Verification
*   **Fresh Install:** App should go to `/register`.
*   **After Reg:** App should go to `/pos`.
*   **Shift Open:** Should work instantly without asking for Terminal ID.
