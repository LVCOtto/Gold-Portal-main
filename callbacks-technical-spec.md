# Callbacks Portal - Technical Specification

## 1. Purpose

This document specifies a new internal-only Callbacks portal for the Gold Portal project.

The portal is intended to solve the operational problem that callback jobs are not being actively driven through to booking and completion. They can linger, become deprioritised, and fall out of view even though they represent customer risk and cashflow risk.

The system should sit on top of the existing Protean-backed job data already imported into the main portal. Protean remains the source of raw job facts and planner allocation. The Callbacks portal becomes the operating layer for comms, chasing, escalation, booking intervention, and audit.

The main V1 goal is simple:

- identify callback jobs reliably
- surface the callbacks that need action today
- reset customer update cadence based on audited outbound comms
- escalate callbacks when repeated updates do not lead to progress
- allow operators to intervene with low-friction actions

The Callbacks portal must be modular so that the same architecture can later support additional job-management workflows beyond callbacks.

## 2. V1 Product Principles

The Callbacks portal should follow these principles.

- Use existing imported operational data rather than creating a second source of truth.
- Treat callback workflow state as portal-owned data, separate from imported job facts.
- Treat outbound comms as the primary measurable progress/reset mechanism in V1.
- Keep human operators in control of difficult intervention points.
- Make daily action obvious through a Today view, not just a raw table.
- Preserve a full audit trail of outbound comms, manual actions, notes, escalation, and workflow changes.
- Design the module so future job types can reuse the same architecture.

## 3. Core V1 Business Rules

### 3.1 Callback Identification

A job is a callback if its job type description contains the word `callback`, case-insensitive.

Initial filter rule:

- `LOWER(job_type) LIKE '%callback%'`

This rule should be implemented centrally in the callback import/sync layer so the UI and automation logic both rely on the same definition.

### 3.2 Progress and Reset Logic

The Callbacks portal should behave as a comms-led workflow system in V1.

The weekly update timer resets when:

- an outbound customer update email is sent from the Callbacks portal and succeeds
- an inferred ETA is derived or materially changed and that event results in an outbound customer update email

The system should not rely primarily on raw Protean status changes to decide whether weekly comms are reset.

### 3.3 Meaningful Progress

For escalation and reporting purposes, V1 should treat the following as meaningful progress:

- the visit date changes from blank or past to a valid future booking date
- an inferred ETA is newly derived
- an inferred ETA changes materially
- the callback is marked booked
- the callback is marked completed

Meaningful progress should be written explicitly into callback state so it is auditable and queryable.

### 3.4 Weekly Update Escalation

If a callback receives two consecutive weekly outbound customer updates without meaningful progress, the callback should be escalated to the team.

The escalation effect in V1 is:

- `escalationFlag = true`
- callback appears in the Today view escalated section
- callback becomes filterable as escalated in the master list

### 3.5 Engineer Notice Window and Team Takeover

V1 should not implement a separate notice timer.

Instead, use an operational rule:

- if the engineer visit date is in the past, the engineer has already had the opportunity to select a booking date
- once the visit date is in the past, the callback becomes eligible for team takeover

This creates a simple derived state:

- `teamTakeoverEligible = visitDate < now`

### 3.6 Warehouse Chase Action

Warehouse chase is a real outbound action in V1.

It should:

- generate a template-backed email
- allow operator edits before send
- send through the same audited email pipeline as other callback comms

## 4. User Experience Model

The Callbacks portal should be a dedicated internal-only portal, parallel to the existing Comms and Workshop portals.

### 4.1 Entry Experience

After login, the operator should land on a `Today` page rather than a generic master list.

### 4.2 Today View Sections

The V1 Today page should include these sections:

- ETAs expiring soon
- ETA expired
- Ready but visit date in the past
- Team takeover required
- Escalated after repeated weekly updates
- Recently actioned today

These sections should be compact, actionable queues rather than long-form reporting widgets.

### 4.3 Master List

The portal should also expose a full callback list with filters.

Recommended filters:

- workflow status
- escalation flag
- awaiting parts
- ETA state
- visit date in past
- booked or unbooked
- engineer
- assigned operator
- account code
- free text search

### 4.4 Row-Level Quick Actions

Each callback row should support low-friction actions.

V1 actions:

- Send customer update
- Chase engineer by email
- Call engineer / WhatsApp call handoff
- Chase warehouse by email
- Add note
- Mark booked
- Mark completed
- Assign operator
- Escalate manually
- Clear escalation
- Run schedule scan

## 5. Scope Boundaries

### 5.1 In Scope for V1

- separate Callbacks login and privilege model
- callback-specific read model and workflow state
- Today page and master list
- manual notes and assignment
- outbound templated emails for customer, engineer, and warehouse chases
- audited weekly-update cadence
- escalation after two consecutive weekly updates without progress
- team takeover eligibility based on past visit dates
- schedule scan as a recommendation tool

### 5.2 Explicitly Out of Scope for V1

- Protean writeback
- automatic planner booking
- automatic WhatsApp messaging
- autonomous outbound chasing without operator review
- deep status-semantics engine beyond the callback rule and derived callback workflow state

## 6. Recommended Architecture

The Callbacks portal should reuse the same broad architectural split used by the current Comms module.

### 6.1 Access Layer

Responsible for:

- callback operator login
- callback session persistence
- privilege checks
- route protection

This should mirror the current internal-portal auth pattern already used by Comms.

### 6.2 Snapshot Layer

Responsible for:

- identifying callback jobs from the main imported jobs table
- copying the relevant job facts into a callback-specific snapshot table
- keeping callback snapshots fresh on a schedule

This layer should remain read-only against Protean-backed data.

### 6.3 Workflow Layer

Responsible for:

- workflow status
- escalation state
- weekly comms cadence
- team takeover eligibility
- assignment
- notes and flags
- progress tracking

### 6.4 Comms Layer

Responsible for:

- template selection
- compose and edit before send
- queued or direct email send
- audit logging
- retry behavior

### 6.5 Recommendation Layer

Responsible for:

- inferred ETA integration
- schedule scan suggestions
- recommendation badges such as warehouse chase recommended or engineer chase recommended

This layer should remain advisory in V1.

## 7. Access Model

Add a new internal portal scope:

- `callbacks`

### 7.1 Database Permission Model

Extend the internal access user record with:

- `canCallbacks boolean not null default false`

### 7.2 Server Access Resolution

Extend the internal access resolution helper so it can answer:

- `hasInternalAccess(access, 'callbacks')`

### 7.3 Admin Management UI

Extend the admin settings internal-access grid so admins can:

- grant callback access
- revoke callback access
- keep callback access independent from admin, workshop, and comms access

### 7.4 Client Routing

Add routes:

- `/callbacks/login`
- `/callbacks`
- `/callbacks/jobs`
- `/callbacks/jobs/:jobId`
- `/callbacks/audit`
- `/callbacks/templates`

V1 may launch with `/callbacks`, `/callbacks/jobs`, and `/callbacks/jobs/:jobId` first.

## 8. Data Model

The database should keep imported callback job facts separate from callback-owned operational state.

### 8.1 Callback Job Snapshots

Table: `callback_job_snapshots`

Purpose:

- read model for callback-eligible jobs derived from the main jobs dataset

Suggested fields:

- `id`
- `externalJobId`
- `accountCode`
- `clientName`
- `siteName`
- `jobType`
- `status`
- `priority`
- `shortDescription`
- `engineerName`
- `lastVisitDate`
- `visitDate`
- `nextActionDueDate`
- `createdDate`
- `lastUpdatedDate`
- `sourcePortalStatus`
- `rawImportMetadata`
- `importBatchId`
- `lastSyncedAt`

Notes:

- `externalJobId` should be unique
- store enough copied source data so the callbacks UI can query efficiently without joining too broadly at render time

### 8.2 Callback Job State

Table: `callback_job_states`

Purpose:

- workflow state owned by the portal

Suggested fields:

- `id`
- `externalJobId`
- `workflowStatus`
- `assignedOperator`
- `escalationFlag`
- `escalationReason`
- `manualAttentionRequired`
- `teamTakeoverEligible`
- `visitDateIsPast`
- `partsEtaDate`
- `inferredEtaDate`
- `inferredEtaDerivedAt`
- `lastKnownJobStatus`
- `lastCustomerUpdateSentAt`
- `weeklyUpdateDueAt`
- `consecutiveWeeklyUpdatesWithoutProgress`
- `lastMeaningfulProgressAt`
- `lastMeaningfulProgressType`
- `lastManualActionAt`
- `lastManualActionBy`
- `internalTags`
- `bookedAt`
- `completedAt`
- `createdAt`
- `updatedAt`

Recommended `workflowStatus` values:

- `awaiting_parts`
- `eta_due_soon`
- `eta_expired`
- `ready_to_book`
- `visit_date_lapsed`
- `team_takeover`
- `booked`
- `completed`
- `on_hold`

### 8.3 Callback Notes

Table: `callback_notes`

Purpose:

- operator notes per callback job

Suggested fields:

- `id`
- `externalJobId`
- `note`
- `createdBy`
- `createdAt`

### 8.4 Callback Action Log

Table: `callback_action_log`

Purpose:

- immutable record of manual internal actions, including non-email actions

Suggested fields:

- `id`
- `externalJobId`
- `actionType`
- `performedBy`
- `payload`
- `createdAt`

Recommended `actionType` values:

- `assigned_operator`
- `manual_escalation`
- `clear_escalation`
- `marked_booked`
- `marked_completed`
- `schedule_scan_requested`
- `phone_call_handoff`
- `team_takeover_started`

### 8.5 Callback Email Templates

Table: `callback_email_templates`

Purpose:

- operator-editable templates specific to callback workflows

Suggested fields:

- `id`
- `displayName`
- `routeKey`
- `audience`
- `subject`
- `body`
- `enabled`
- `sortOrder`
- `updatedBy`
- `updatedAt`
- `createdAt`

Recommended `audience` values:

- `customer`
- `engineer`
- `warehouse`
- `supplier`

### 8.6 Callback Email Audit

Table: `callback_email_audit`

Purpose:

- immutable record of every outbound email attempt and result

Suggested fields:

- `id`
- `externalJobId`
- `templateId`
- `audience`
- `recipientEmail`
- `recipientName`
- `renderedSubject`
- `renderedBody`
- `outcome`
- `errorMessage`
- `triggerType`
- `operatorId`
- `metadata`
- `queuedAt`
- `sentAt`
- `completedAt`
- `createdAt`

Recommended `triggerType` values:

- `weekly_update`
- `manual_customer_update`
- `engineer_chase`
- `warehouse_chase`
- `eta_triggered`

## 9. Workflow Derivation Rules

The system should derive the primary workflow state from a small, explicit set of rules.

### 9.1 Awaiting Parts

Set `workflowStatus = awaiting_parts` when parts are still outstanding and there is no present booking readiness.

### 9.2 ETA Due Soon

Set `workflowStatus = eta_due_soon` when an ETA exists and the date falls within a configurable near-term window.

Recommended initial window:

- within the next 3 days

### 9.3 ETA Expired

Set `workflowStatus = eta_expired` when an ETA exists and is now in the past without follow-up progress.

### 9.4 Ready to Book

Set `workflowStatus = ready_to_book` when parts are available or the job otherwise becomes operationally ready for booking.

### 9.5 Visit Date Lapsed

Set `workflowStatus = visit_date_lapsed` when a visit date exists and is in the past.

This state should imply:

- `visitDateIsPast = true`
- `teamTakeoverEligible = true`

### 9.6 Team Takeover

Set `workflowStatus = team_takeover` when the operator actively moves the callback into team-driven intervention.

### 9.7 Booked and Completed

Set `workflowStatus = booked` or `completed` when the callback is explicitly marked or reliably derivable.

## 10. Automation Rules

V1 automation should remain narrow and explainable.

### 10.1 Callback Snapshot Sync

Create a callback sync worker that:

- reads from the existing `jobs` table
- includes only jobs whose `jobType` contains `callback`
- copies relevant fields into `callback_job_snapshots`
- upserts corresponding `callback_job_states`
- recalculates derived workflow state

### 10.2 Weekly Update Due Logic

Each callback should maintain `weeklyUpdateDueAt`.

Initial rule:

- when a successful outbound customer update is sent, set `weeklyUpdateDueAt = sentAt + 7 days`

When no customer update has yet been sent, the system should initialise the due date based on callback entry into the portal.

### 10.3 ETA Suppression Rule

If an inferred ETA exists and is still in the future, the weekly customer update should not become due until that ETA passes.

This means the due date should effectively be the later of:

- `lastCustomerUpdateSentAt + 7 days`
- `inferredEtaDate`

### 10.4 Escalation Rule

When two consecutive weekly customer updates are sent without meaningful progress, set:

- `escalationFlag = true`

The counter should reset when meaningful progress is recorded.

### 10.5 Recommendation Generation

The sync layer should also populate recommendation flags such as:

- warehouse chase recommended
- engineer chase recommended
- team takeover recommended

These are advisory and should not trigger automatic outbound actions in V1.

## 11. Outbound Comms Model

V1 should support editable, audited email generation for customer, engineer, and warehouse comms.

### 11.1 Send Customer Update

Purpose:

- maintain weekly comms cadence
- inform customer of current callback status
- reset the weekly timer

Behavior:

- choose a template
- prefill subject/body from callback context
- allow operator edits before send
- send via Resend
- write audit row
- update `lastCustomerUpdateSentAt`
- update `weeklyUpdateDueAt`

### 11.2 Chase Engineer by Email

Purpose:

- request a booking date or confirmation

Behavior:

- editable template-backed email
- audited send
- may create a recommendation or follow-up marker

### 11.3 Call Engineer / WhatsApp Call

Purpose:

- operator initiates a call outside the portal

Behavior:

- launch external handoff action where possible
- always write an internal action log event
- no automatic outbound message required

### 11.4 Chase Warehouse

Purpose:

- confirm part arrival or chase internal stock progress

Behavior:

- editable template-backed outbound email
- audited send

### 11.5 Schedule Scan

Purpose:

- suggest suitable booking opportunities in the following two weeks

Behavior:

- recommendation only in V1
- no writeback to planner
- results can be shown inline or in a detail drawer

## 12. API Surface

The Callbacks module should expose its own API namespace.

Recommended prefix:

- `/api/callbacks`

### 12.1 Auth Endpoints

- `POST /api/callbacks/auth/request-otp`
- `POST /api/callbacks/auth/verify-otp`
- `GET /api/callbacks/auth/me`
- `POST /api/callbacks/auth/logout`

### 12.2 Board and Job Endpoints

- `GET /api/callbacks/today`
- `GET /api/callbacks/jobs`
- `GET /api/callbacks/jobs/:jobId`
- `PATCH /api/callbacks/jobs/:jobId/state`
- `POST /api/callbacks/jobs/:jobId/note`
- `POST /api/callbacks/jobs/:jobId/assign`
- `POST /api/callbacks/jobs/:jobId/escalate`
- `POST /api/callbacks/jobs/:jobId/clear-escalation`
- `POST /api/callbacks/jobs/:jobId/mark-booked`
- `POST /api/callbacks/jobs/:jobId/mark-completed`
- `POST /api/callbacks/jobs/:jobId/team-takeover`

### 12.3 Comms Endpoints

- `GET /api/callbacks/templates`
- `GET /api/callbacks/jobs/:jobId/compose/:routeKey`
- `POST /api/callbacks/jobs/:jobId/send-email`
- `GET /api/callbacks/jobs/:jobId/email-audit`

### 12.4 Recommendation Endpoints

- `POST /api/callbacks/jobs/:jobId/schedule-scan`
- `GET /api/callbacks/jobs/:jobId/recommendations`

### 12.5 Admin/Worker Endpoints

- `POST /api/callbacks/admin/run-sync`
- `POST /api/callbacks/admin/run-weekly-pass`

## 13. Frontend Structure

The client should follow the same app-level routing pattern as existing internal portals.

### 13.1 New Client Surfaces

Recommended files:

- `client/src/lib/callbacks-auth.tsx`
- `client/src/pages/callbacks/login.tsx`
- `client/src/pages/callbacks/layout.tsx`
- `client/src/pages/callbacks/today.tsx`
- `client/src/pages/callbacks/jobs.tsx`
- `client/src/pages/callbacks/job-detail.tsx`
- `client/src/pages/callbacks/templates.tsx`
- `client/src/pages/callbacks/audit.tsx`

### 13.2 Layout Expectations

Reuse the existing internal portal shell conventions:

- left navigation on desktop
- sheet navigation on mobile
- consistent typography and table density
- existing toast and dialog patterns

### 13.3 Initial Navigation

Recommended nav items:

- Today
- Master List
- Templates
- Audit

V1 can defer Templates and Audit UI if needed, but the routes and data model should anticipate them.

## 14. Template Catalog

V1 should launch with a small, explicit template set.

Recommended templates:

- `customer_weekly_update`
- `customer_eta_update`
- `engineer_chase_date_request`
- `warehouse_parts_arrival_check`
- `team_takeover_customer_update`

Each template should support operator editing before send.

## 15. Delivery Plan

### Phase 1 - Access and Data Foundation

- add `canCallbacks` to internal access users
- extend internal access resolution and admin settings UI
- add callback auth provider, routes, and middleware
- add callback schema and migrations
- add callback sync worker from existing jobs data

### Phase 2 - Operational Board

- build Today endpoint and Today page
- build callback master list and filters
- build callback job detail view
- add notes, assignment, manual escalation, and state actions

### Phase 3 - Outbound Comms

- add callback templates
- add compose-and-send flow
- add callback email audit log
- wire weekly update reset logic to successful outbound customer comms

### Phase 4 - Escalation and Recommendations

- add consecutive weekly update tracking
- add automatic escalation after two weekly updates without progress
- add inferred ETA suppression logic
- add schedule scan recommendations

## 16. Acceptance Criteria

The V1 Callbacks portal is successful when all of the following are true.

- An internal operator with callback access can log in independently of Comms and Workshop.
- Jobs whose type contains `callback` appear in the callback sync and nowhere else needs to define callback membership.
- Operators land on a Today view that clearly surfaces callbacks needing action.
- Sending a customer update records a full audit trail and resets the weekly update timer.
- If two weekly customer updates are sent without meaningful progress, the callback is escalated automatically.
- If a visit date is in the past, the callback is visibly eligible for team takeover.
- Warehouse chase emails can be generated, edited, sent, and audited.
- All manual actions and outbound emails are queryable from a callback-specific audit surface.

## 17. Key Risks and Implementation Notes

- The exact quality of ETA-driven logic depends on inferred ETA availability. The callback state model should allow inferred ETA fields to be null without breaking the board.
- Schedule scan logic should begin as a recommendation engine only; planner writeback should remain out of scope.
- Callback workflow state should not be derived inside React components. It should be computed server-side and stored explicitly.
- Reusing the Comms architecture is strongly recommended, but the Callbacks workflow should not be forced into a queue-first model where the business object is only a message. The primary business object here is the callback job.

## 18. Immediate Build Checklist

1. Extend `internal_access_users` with `canCallbacks`.
2. Add callback auth and route guards in server and client.
3. Add callback snapshot/state/note/audit schema.
4. Build callback sync worker from `jobs` and related data.
5. Ship Today page with the five key action queues.
6. Add master list filters and job detail view.
7. Add customer update, engineer chase, and warehouse chase email flows.
8. Add weekly reset and escalation logic.