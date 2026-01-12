# Plan: Combine Login and Shift Open Events

## Goal
Streamline the authentication and shift opening process into a unified flow. This solves two problems:
1.  Eliminates the "double log" (User Login + Shift Open) which confuses the audit trail.
2.  Ensures the "Shift Open" log contains the full context: User, Terminal ID, and the Security Photo captured during login.

## Strategy
1.  **Capture Metadata Early:** The `AuthFlow` captures the User, Terminal ID, and Photo.
2.  **Pass Forward:** Instead of logging "User Login" immediately, we pass this metadata to the next step (`POSPage`).
3.  **Unified Action:** When the user confirms the "Open Shift" dialog, we send all the data (User, Terminal, Photo, Fund) to the `/api/shifts/current` endpoint, creating a single, complete audit record.

## Implementation Steps

### 1. Update `app/api/auth/login/route.ts`
*   Add `skipAudit` parameter.
*   If `skipAudit: true`, verify the PIN but **do not** insert into `audit_logs`.
*   (We keep the logging logic for *failed* attempts).

### 2. Update `components/auth/auth-flow.tsx`
*   Accept `terminalId` prop.
*   Call login API with `skipAudit: true` and `terminalId`.
*   Update `onAuthenticated` callback to return `(user, auditResult)`.

### 3. Update `app/pos/page.tsx`
*   Pass `terminalId` (from `useTerminal`) to `AuthFlow`.
*   Store the returned `auditResult` in state.
*   Pass `auditResult` to `handleOpenShift`.

### 4. Verify `app/api/shifts/current/route.ts`
*   Ensure it correctly handles the passed `auditImage` and `terminalId` to create the "SHIFT_OPEN" log. (Verified: It does).

## Outcome
*   **Before:** Log 1 (User Login, has photo, no terminal) -> Log 2 (Shift Open, has terminal, no photo).
*   **After:** Log 1 (Shift Open, has User, Terminal, AND Photo).
