# Ordermailing — User Flows

## Roles & Access

| Role    | Pages accessible                                          |
|---------|-----------------------------------------------------------|
| `admin` | All pages                                                 |
| `user`  | `/`, `/orders/new`, `/orders`, `/settings`                |
| `kassa` | `/` (dashboard only)                                      |

Unauthenticated users are redirected to `/login`. After login they are sent to the originally intended URL (stored in `sessionStorage`).

---

## 1. Authentication

### 1.1 Login
1. Visit any protected page → redirected to `/login` (intended URL saved).
2. Enter email + password → `Sign in`.
3. **Success** → redirected to intended URL (or `/`).
4. **Invalid credentials** → inline error; user can retry.
5. **Too many attempts** → rate-limit error shown.
6. If already authenticated on mount → skip form, redirect immediately.

### 1.2 Register (invite-only)
1. Admin generates an invite link from the Users page.
2. New user opens `/register?token=<token>`.
3. Token is validated on mount; invalid/used token → error state, no form shown.
4. User fills email, full name, password, confirm password.
5. **Success** → account created + signed in via custom Firebase token → redirect to `/`.
6. **Password mismatch** → inline validation before submit.
7. **Submit error** (token already used, server error) → inline error.

### 1.3 Sign Out
1. Click avatar in sidebar footer → dropdown → **Log out**.
2. Firebase session cleared → redirect to `/login`.

---

## 2. Dashboard (`/`)

On mount, the last 50 orders are fetched (up to 5 paginated API calls).

**Elements:**
- **Stat cards** — Total orders, Sent this week, Sent today, Drafts.
- **Suggestions panel** (amber) — Suppliers ordered on today's weekday in the past but not yet today. Each card has an "Order now" button → `/orders/new`.
- **Bar chart** — Orders per day for the last 14 days. Hover a bar → shows count.
- **Recent orders list** — Last 7 orders with supplier name, date, and status badge. "View all orders →" link at the bottom.
- **New order** button (top right) → `/orders/new`.

---

## 3. New Order (`/orders/new`) — 2-step flow

### Step 1 — Choose a supplier
1. List of all active suppliers with ≥1 product is shown as cards.
2. Optional search filters the list in real-time.
3. Click a supplier card → move to Step 2.
   - A `draft` order is eagerly created in the DB; `draftId` stored in `localStorage`.

### Step 2 — Fill quantities
1. Products for the chosen supplier are loaded sorted by `displayOrder`.
2. Two input modes depending on Settings:
   - **Default mode**: enter "counted in stock" → system calculates `idealStock − counted = order qty`.
   - **Nolan mode**: enter the order quantity directly.
3. `manualOrder` products always accept direct quantity input (no upper limit).
4. Stepper buttons (−/+) support **hold-to-repeat**: short delay then accelerating repeat.
5. Every change is saved to `localStorage` immediately and debounced 2 s to the server (PATCH draft).
6. A safety-net timer syncs to the server every 30 s.
7. Offline state is detected; quantities are re-synced when the connection is restored.
8. **Save status indicator** (bottom bar): `saving` → `saved` → `idle` / `offline` / `saved locally`.

#### Generate Template (AI)
1. Click **Generate Template** (purple button).
2. AI analyses past orders + Belgian holidays → returns per-product quantity suggestions.
3. Dialog shows suggestion table with optional warning notes.
4. **Accept** → quantities applied to the form; `fromAiTemplate` flag set (visible in order list as a ✨ icon).
5. **Reject** → quantities unchanged.

#### Review & Send
1. Click **Review order** (bottom-right sticky bar, disabled if no items).
2. Review dialog/drawer opens: order lines table + optional notes textarea.
3. **Send order** → PATCH draft to `status: sent` → success dialog.
4. Success dialog: **New order** button resets the page to Step 1.

#### Leave confirmation (when a draft exists)
Triggered by: back button, browser history, or clicking a sidebar link away.
- **Save & leave** → syncs draft to cloud, clears `localStorage`, navigates away.
- **Discard & leave** → deletes draft from DB, clears `localStorage`, navigates away.
- **Stay** → dismisses dialog, stays on page.

#### Resume draft
On app startup (any page except `/orders/new`), if `localStorage` contains a draft:
- A dialog asks "Resume order for `<SupplierName>`?"
- **Continue** → navigate to `/orders/new`, draft is restored.
- **Discard** → draft is deleted from DB and `localStorage`.

---

## 4. Orders List (`/orders`)

**Filters:** All / Drafts / Sent — toggle buttons that reset pagination/scroll.

### Mobile (infinite scroll)
- Cards showing supplier, date, item count, status badge.
- Scroll to bottom → loads next page automatically.

### Desktop (paginated table)
- Columns: Supplier, Status, Items, Created by, Date, Actions.
- Previous / Next pagination buttons.

### Actions per order
| Order status | Available actions                              |
|--------------|------------------------------------------------|
| `draft`      | View detail · Continue draft · Delete          |
| `sent`       | View detail · Resend email · Delete            |

#### View detail
- Dialog with full order metadata, line items table, notes, status badge.
- Action buttons in footer (Continue / Resend / Delete).

#### Continue draft
- Saves draft data to `localStorage` + `sessionStorage`, navigates to `/orders/new` and restores the draft.

#### Delete order
- Confirmation dialog → DELETE API call → row removed from list.

#### Resend email
- Confirmation dialog → POST `/api/orders/:id/resend`.
- **Success** → success dialog.
- **Failure / offline** → mailto fallback dialog with a pre-composed link to open in the user's email client.

---

## 5. Suppliers (`/suppliers`) — Admin only

### Supplier list
- Search bar filters by name.
- Desktop: sortable table (Name, Status). Mobile: card grid.
- Badges: Active / Inactive.

### Add / Edit supplier
- Dialog (desktop) or Drawer (mobile).
- Fields: Name, Email, Active toggle.
- **Save** → POST or PATCH → list refreshed.

### Delete supplier
- Confirmation dialog warns that all products will also be deleted.
- **Remove** → DELETE → list refreshed.

### Product management (side sheet)
Open by clicking the product count badge on a supplier.

- Products list with search.
- **Drag-and-drop** reordering (disabled during search) → `displayOrder` updated for all products in a single batch PATCH.

#### Add / Edit product
- Dialog (desktop) or Drawer (mobile).
- Fields: Supplier name, Internal name, Display order, Ideal stock, Manual order toggle, Active toggle.

#### Delete product
- Confirmation dialog → DELETE → list refreshed, supplier product count updated.

---

## 6. Users (`/users`) — Admin only

### User list
- Table: Name, Email, Role (badge), Added date.
- Current user's row: role dropdown disabled, no delete button.

### Change role
- Click the role badge on any other user → dropdown (admin / user / kassa).
- Optimistic update; reverts on API failure.

### Generate invite link
1. Click **Add user** → POST `/api/users/invite`.
2. One-time invite link shown in a dialog with a copy button.
3. Link expires after first use at `/register?token=<token>`.

### Delete user
- Confirmation dialog → DELETE → list refreshed.

---

## 7. History (`/history`) — Admin only

Two tabs: **Statistics** and **Product Lookup**.

### Statistics tab
Range selector: Last 30 days / 90 days / 6 months / All time.

- **KPI cards**: Orders sent, Items ordered, Avg items/order, Top supplier.
- **Timeline chart**: Daily (30d), Weekly (90d), Monthly (6m / all). Hover bars show count.
- **Top suppliers** — horizontal bar chart, top 8 by order count.
- **Day of week** — horizontal bar chart showing which weekday has the most orders; busiest day highlighted.
- **Top products** — grid of top 16 products by total quantity ordered.
- **Order log** — table of all sent orders in the range (up to 50 rows shown).

### Product Lookup tab
- **Date range picker** with quick presets (Last 7d / 30d / 90d / This year).
- **Product selector** — checkbox list with search, Select all / None.
- **Results summary** — orders matched, total qty, average qty.
- **Results table** — per-product: order count, total qty, avg qty, share bar.
- **Per-order breakdown** — chronological list of matched orders (up to 50).

---

## 8. Applications (`/sollicitaties`) — Admin only

Manages job applications submitted externally.

### List view
- Search by name, email, or phone.
- Status filter dropdown: All / New / In progress / Accepted / Rejected.
- Desktop: table with inline status dropdown per row. Mobile: cards.

### View application detail
- Click any row/card → detail dialog.
- Sections: Status selector, Personal info, Administrative info (national register, IBAN), Languages (Dutch / French proficiency), Motivation & hobbies.

### Update status
- Change the status dropdown (table row, detail dialog, or mobile card) → PATCH API call.
- Available statuses: `nieuw` / `in behandeling` / `aangenomen` / `afgewezen`.

### Delete application
- Trash icon → confirmation dialog → DELETE → removed from list.

---

## 9. Settings (`/settings`)

Available to all authenticated roles.

### Profile
- Edit display name → **Save profile** → Firebase `updateProfile`.

### Password
- Enter current password + new password + confirm → **Change password**.
- Re-authenticates with Firebase before updating.
- Inline errors: wrong current password, mismatch.

### Language
- Toggle between **English** 🇬🇧 and **French** 🇫🇷.
- Stored in `localStorage` key `app_lang`; all UI strings update immediately.

### Appearance
- **Dark mode** toggle (sun/moon icon) — persisted in `localStorage`.
- **Nolan mode** toggle — changes how quantities are entered on the New Order page (direct order qty instead of counted stock).

### Import suppliers (JSON)
1. Drop or pick a `.json` file.
2. File is parsed client-side; preview table shows up to 10 suppliers with product counts.
3. Click **Import** → confirmation dialog warns about overwriting existing data.
4. **Overwrite & import** → POST `/api/suppliers/import` → success banner shows counts.

---

## 10. Cross-cutting flows

### What's New dialog
- Shown once per app version on first load after login (keyed by `whats_new_dismissed` in `localStorage`).
- Dismissed by clicking **Got it** → suppressed for that version.

### Push notifications (sidebar footer)
- Displayed only when the browser supports Firebase Messaging.
- **Notifications on** (green bell) — permission granted, FCM token synced to server.
- **Notifications blocked** (red bell) — browser permission denied.

### Auth guard
- All non-public pages check Firebase auth state on every load.
- Unauthenticated → redirect to `/login` (saves intended path in `sessionStorage`).
- `kassa` role on any path other than `/` → forced back to `/`.
- `user` role on restricted paths (anything outside `/`, `/orders/new`, `/orders`, `/settings`) → forced back to `/`.

### Error page (`/_error`)
Rendered by the framework when an unhandled route or server error occurs.
