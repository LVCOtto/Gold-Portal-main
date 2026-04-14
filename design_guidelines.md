# LVC Customer Service Portal - Design Guidelines

## Design Approach
**Utility-First Design System** - Inspired by Linear and modern B2B dashboards (Asana, Stripe Dashboard). Prioritizes clarity, information density, and efficient workflows over visual storytelling. This is a productivity tool where users need to quickly find job status, review quotes, and complete approvals.

## Typography System
- **Primary Font**: Inter (Google Fonts) - optimized for screens and data-heavy interfaces
- **Hierarchy**:
  - Page Titles: text-2xl font-semibold
  - Section Headers: text-lg font-semibold
  - Card/Component Titles: text-base font-medium
  - Body Text: text-sm font-normal
  - Data Labels: text-xs font-medium uppercase tracking-wide
  - Metadata/Timestamps: text-xs font-normal

## Layout System
**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 for all spacing
- Component padding: p-6
- Card spacing: space-y-4
- Section gaps: gap-6 or gap-8
- Page margins: px-6 py-8

**Grid System**:
- Max content width: max-w-7xl mx-auto
- Dashboard tiles: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Table layouts: Full-width with horizontal scroll on mobile
- Two-column details: grid-cols-1 lg:grid-cols-3 (2/3 split for main content + sidebar)

## Component Library

### Navigation & Structure
**Admin Layout**:
- Fixed left sidebar (w-64, hidden on mobile with hamburger menu)
- Top bar with "Data current as of [timestamp]" badge (prominent, always visible)
- Main content area with breadcrumbs

**Customer Layout**:
- Top navigation bar with logo, dashboard link, logout
- "Data current as of [timestamp]" in top-right corner
- Mobile: hamburger menu

### Dashboard Components
**Metric Tiles** (Customer Dashboard):
- Grid of 4 cards showing: Open Jobs, Awaiting Approval, Awaiting Parts, Recently Closed
- Each tile: Large number (text-3xl font-bold), label below, optional trend indicator
- Height: h-32, with subtle border and shadow-sm

**Jobs Table**:
- Compact rows with key columns: Job ID, Site, Status (badge), Created Date, Last Updated
- Status badges: Inline pill-shaped badges with text-xs
- Row actions: View Details icon button
- Pagination controls at bottom
- Search bar above table with filters in dropdown

### Job Detail Page
**Layout**: Two-column on desktop (lg:grid-cols-3)
- **Main Column (col-span-2)**:
  - Job header: Job ID (text-xl font-semibold), status badge, priority badge
  - Info grid: 2-column layout showing site, dates, engineer, description
  - Timeline section: Simple vertical timeline with milestones (use before: pseudo-element for connecting line)
  
- **Sidebar Column**:
  - "Quick Actions" card (if applicable)
  - Related quotes list (compact cards)
  - Related POs (if applicable)

### Quote Detail & Approval
**Quote Summary Card**:
- Line items table (if available) or summary text
- Totals breakdown: Net, VAT, Gross (right-aligned, text-base to text-lg for gross)
- Lead time and key terms

**Approval Form** (for awaiting-approval quotes):
- Contained in prominent card with subtle border emphasis
- Form fields: Full name, Email, PO Number (optional), Terms checkbox
- Primary CTA button: "Submit Approval" (w-full on mobile, w-auto on desktop)
- Success state: Replace form with confirmation message and checkmark icon

**Approval Audit Trail**:
- Timeline-style list showing who approved when
- Each entry: Avatar placeholder, name, timestamp, status

### Admin Components
**Import Interface**:
- Dropzone area for CSV/Excel (border-2 border-dashed, h-48)
- Template download links above dropzone
- Import history table below showing: Timestamp, File name, Row counts, Status
- Error accordion: Expandable sections showing validation errors per import

**Account Management Table**:
- Columns: Account Code, Account Name, Created Date, Actions
- Inline "Reset Password" and "Edit" buttons
- "Create Account" modal/form

**Approvals List**:
- Filterable table: Account, Quote ID, Job ID, Approver, Timestamp, Status
- Export CSV button in top-right
- Search by account code or quote ID

## Form Elements
- Input fields: Consistent height (h-10), border, rounded-md, px-4
- Labels: text-sm font-medium, mb-2
- Required field indicator: Text "(required)" not asterisk
- Error states: Red border + error message text-sm below field
- Dropdowns: Native select styled consistently with inputs

## Data Visualization
**Status Badges**: Inline rounded-full px-3 py-1 text-xs font-medium
**Priority Indicators**: Small badges or colored dots next to job titles
**Timeline**: Vertical line with circle nodes, using before/after pseudo-elements
**Empty States**: Centered icon + message for empty tables/lists

## Responsive Behavior
- Mobile: Stack all multi-column layouts to single column
- Tables: Horizontal scroll with fixed first column on mobile
- Dashboard tiles: 1 column mobile, 2 tablet, 4 desktop
- Navigation: Hamburger menu on mobile collapsing to sidebar on desktop
- Forms: Full-width on mobile, max-w-md on desktop

## Key UX Patterns
- "Data current as of [timestamp]" must be visible on every customer-facing page (sticky top bar or prominent badge)
- Loading states: Skeleton loaders for tables, spinner for forms
- Confirmation modals for destructive actions
- Toast notifications for success/error messages (top-right corner)
- Breadcrumbs on all detail pages
- Back buttons on mobile views

## Accessibility
- Semantic HTML throughout
- ARIA labels for icon-only buttons
- Focus states on all interactive elements (ring-2)
- Sufficient contrast ratios
- Keyboard navigation support for tables and forms

No animations except: Smooth dropdown transitions, toast slide-in, and modal fade-in (duration-200).