# LVC Customer Service Portal

## Overview

A customer-facing portal where customers can log in and track their jobs, repair quotations, and purchase orders. The system uses snapshot-based data imports (CSV/Excel) rather than live integrations, with clear visibility of when data was last updated.

The application serves two user types:
- **Customers**: Log in to view their own jobs, quotes, and approve quotations
- **Admins**: Upload/import datasets and manage customer accounts

## Demo Credentials

- **Customer Login**: Account Code: `5009440` (ACT Clean), `5008896` (Axminster Services), or any of the 205+ imported accounts, Password: `AdminLVC123`
- **Admin Login**: Password: `AdminLVC123`

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Design System**: Utility-first approach inspired by Linear/modern B2B dashboards, using Inter font

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful JSON APIs under `/api/*` prefix
- **Session Management**: Express-session with MemoryStore
- **File Uploads**: Multer for handling CSV/Excel file imports

### Data Layer
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for schema migrations (`npm run db:push`)

### Authentication & Security
- **Customer Auth**: Account code + hashed password (bcryptjs)
- **Admin Auth**: Single password via `ADMIN_PASSWORD` environment variable
- **Session Storage**: Cookie-based sessions with httpOnly, sameSite, and secure flags
- **Rate Limiting**: Login endpoints limited to 5 failed attempts per 15 minutes per IP
- **API Rate Limiting**: General limit of 100 requests per minute per IP
- **Admin IP Allowlist**: Optional IP restriction via `ADMIN_ALLOWED_IPS` environment variable

### Key Data Models
- `customerAccounts`: Customer login credentials and account info
- `jobs`: Service jobs linked to customer accounts
- `quotes`: Quotations that customers can approve/reject
- `purchaseOrders`: Parts ordering status
- `importBatches`: Tracks CSV/Excel import history with timestamps
- `approvalEvents`: Audit trail for quote approvals
- `systemSettings`: Key-value store for system settings (e.g., last_import timestamp)

## Key Features

### Customer Portal
- **Dashboard**: Metric tiles showing Open Jobs, Awaiting Approval, Awaiting Parts, Recently Closed
- **Jobs List**: Paginated list with search and status/priority filters
- **Job Detail**: Full job information with linked quotes and purchase orders
- **Quotes List**: Paginated list with search and status filters
- **Quote Detail**: Quote summary with approval form for pending quotes
- **Quote Approval**: Capture approver name, email, PO number, and terms acceptance

### Admin Portal
- **Dashboard**: Stats overview with quick actions
- **Data Imports**: Drag-and-drop upload for Jobs, Quotes, and Purchase Orders (CSV/Excel)
- **Accounts Management**: View customer accounts (created via CSV imports), reset passwords
- **Customer View**: Click any account to see all their jobs and add notes/status overrides
- **Approvals**: View all approval events with CSV export

### Job Override System
- **Purpose**: Override job status and add notes when Protean system doesn't reflect reality
- **Admin Notes**: Customer-visible notes displayed as "Update from LVC" on job detail page
- **Internal Notes**: Admin-only notes for internal tracking
- **Display Status**: Override the system status shown to customers
- **Override Persistence**: Overrides persist through data imports (imports don't touch override records)

### Upcoming Date Feature
- **Unified Date Display**: Jobs show an "Upcoming Date" combining two source fields
- **Parts Due** (`Parts Due` CSV column): Expected parts arrival date (used for "Awaiting Parts" jobs)
- **Visit Date** (`Visit Date` CSV column): Assigned engineer visit date
- **Logic**: System selects the earliest future date between the two, past dates are excluded
- **UI Display**: Icon indicates type (Package icon for parts, Calendar icon for engineer visit)

## Standard CSV Import Format

### Jobs CSV Template (Primary Data Source)

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| JobID | Yes | Unique job reference | 57421 |
| Account Code | Yes | Customer account code | 5009440 |
| Account Name | No | Customer name (reference) | ACT Clean / Head Office |
| Site Code | No | Site reference code | 500944063 |
| Site Name | Yes | Site/location name | ACT Clean / The Ritz |
| PostCode | No | Site postcode | SW1A 1RD |
| Job Type | No | Type of service | Breakdown B Rate |
| Status | No | Internal status code | 230, 500, 575 |
| Visit Date | No | Scheduled visit (DD/MM/YYYY) | 13/01/2026 |
| Portal Status | Yes | Customer-facing status | Pending Engineer Visit |
| Allocated Engineer | No | Assigned engineer | Steve Batt |
| Parts Due | No | Parts arrival date (DD/MM/YYYY) | 13/01/2026 |
| Total Job Value | No | Job value in GBP | 122.72 |
| Equipment | No | Equipment details | MATRIX SO8 |

### Portal Status Values
- **Pending Engineer Visit** - Awaiting engineer assignment
- **Awaiting Parts for Repair** - Parts on order (shows arrival window)
- **Attended** - Engineer has visited
- **Attended - In Processing** - Work in progress after visit
- **Processing** - Being processed at workshop
- **Requires Invoicing** - Ready for billing
- **Engineer On-Site** - Engineer currently at location

### Import Behavior
- Duplicate JobIDs are skipped (first occurrence used)
- Customer accounts auto-created if Account Code doesn't exist
- UK date format (DD/MM/YYYY) supported
- Equipment info appended to Job Type for description

### Data Segmentation
- Customers only see data for their own account code
- All API endpoints enforce account-based filtering
- Priority and Age fields hidden from customer view (admin-only)

## Build System
- Development: `npm run dev` starts Vite dev server with HMR, proxied through Express
- Production: Vite builds static assets, esbuild bundles server

## File Structure

```
client/src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── admin-layout.tsx
│   ├── customer-layout.tsx
│   ├── priority-badge.tsx
│   ├── status-badge.tsx
│   └── theme-*.tsx
├── lib/                # Utilities
│   ├── auth.tsx        # Auth context and hooks
│   └── queryClient.ts  # TanStack Query configuration
└── pages/              # Route components
    ├── admin/          # Admin pages
    ├── dashboard.tsx
    ├── jobs.tsx
    ├── job-detail.tsx
    ├── quotes.tsx
    ├── quote-detail.tsx
    └── login.tsx

server/
├── db.ts              # Database connection
├── routes.ts          # API route handlers
├── storage.ts         # Database storage layer
└── index.ts           # Express server entry

shared/
└── schema.ts          # Drizzle ORM schema definitions
```

## Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string (auto-configured)
- `ADMIN_PASSWORD`: Password for admin access
- `SESSION_SECRET`: Secret key for session encryption (optional)
- `ADMIN_ALLOWED_IPS`: Comma-separated list of allowed IPs for admin login (optional, use `*` to allow all)
