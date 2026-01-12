# Plan: Auto-Initialize Terminal and Simplify Shift Opening

## Goal
Simplify the "Open Shift" flow by removing manual Terminal selection and Audit Photo capture (since it's done at login). Automatically initialize and persist a Terminal ID for the device.

## Steps

1.  **Create `hooks/use-terminal.ts`**
    *   **Purpose:** Automatically manage the Terminal identity.
    *   **Logic:**
        *   Check `localStorage` for `pos_terminal_id`.
        *   If found, use it.
        *   If not found, call `/api/terminals` to register a new terminal with auto-generated PTU/Serial (e.g., `PTU-XXXX`, `SN-XXXX-YYYY`).
        *   Save the returned UUID to `localStorage`.

2.  **Modify `components/pos/shift-opening-dialog.tsx`**
    *   **Remove:** `TerminalSelector` and `AuditCamera`.
    *   **Update:** `onConfirm` callback signature to `(openingFund: number) => void`.
    *   **UI:** Only show "Beginning Fund" input.

3.  **Modify `app/pos/page.tsx`**
    *   **Import:** `useTerminal` hook.
    *   **Logic:**
        *   Initialize `const { terminalId } = useTerminal()`.
        *   Update `handleOpenShift` to use this `terminalId`.
        *   Pass `null` for `auditImage` in the API call.
        *   Add check: Ensure `terminalId` is available before calling API.

## Code Preview

### `hooks/use-terminal.ts`
```typescript
// Auto-registration logic
const deviceId = crypto.randomUUID().split('-')[0].toUpperCase()
// Calls POST /api/terminals
// Saves to localStorage
```

### `ShiftOpeningDialog`
```tsx
// Simplified Dialog
export function ShiftOpeningDialog({ isOpen, onConfirm }: Props) {
  // ... only openingFund state ...
  return (
    // ... Input for Fund ...
    <Button onClick={() => onConfirm(parseFloat(openingFund))}>Open Shift</Button>
  )
}
```
