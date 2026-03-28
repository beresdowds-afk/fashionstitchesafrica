

## Plan: Create "Wallet Management" tab in Organization Dashboard

### What changes

1. **Remove from PremiumFeaturesTab** (`src/components/premium/PremiumFeaturesTab.tsx`)
   - Remove the "Credits" tab trigger and content (`CreditWalletPanel`)
   - Remove the "Usage & Billing" tab trigger and content (`PremiumUsagePanel`)
   - Remove unused imports (`Wallet`, `BarChart3`, `CreditWalletPanel`, `PremiumUsagePanel`)

2. **Create new WalletManagementTab** (`src/components/wallet/WalletManagementTab.tsx`)
   - New component with a heading (Wallet icon + "Wallet Management")
   - Contains two sub-tabs: "Credits" (renders `CreditWalletPanel`) and "Usage & Billing" (renders `PremiumUsagePanel`)
   - Accepts `orgId` prop

3. **Add to Dashboard** (`src/pages/Dashboard.tsx`)
   - Add `"wallet"` to the `activeTab` union type
   - Add a sidebar button with `Wallet` icon labeled "Wallet" in the navigation list (placed near Billing/Invoicing)
   - Add to mobile tab list
   - Render `WalletManagementTab` when `activeTab === "wallet"`
   - Import the new component

### Technical details
- No database changes needed
- No new dependencies
- Admin-only visibility (same `isAdmin` check already used in PremiumFeaturesTab)

