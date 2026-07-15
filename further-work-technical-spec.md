# Further Work Management System - Technical Specification

## 1. Purpose

This document specifies a new, separate Further Work management system inspired by the existing automated comms architecture in the Gold Portal project.

The system is designed to sit on top of a dynamically exported single-sheet data source containing machine/job rows that require further work. Its job is to turn that export into an auditable operational workflow for admin staff, with communication tracking, supplier and engineer contact management, and automated email actions via Resend.

Primary goals:

- Overlay a workflow UI on top of imported machine/job rows without turning the source sheet into the system of record.
- Track where each row is in the further work process.
- Record who was contacted, when, why, and by which automation or operator.
- Maintain a reliable supplier contact book and engineer contact book.
- Support manual and automated outbound comms through Resend.
- Preserve a full audit trail of imports, state changes, template changes, queue actions, and send outcomes.

## 2. Design Principles

The new system should follow the same architectural separation used in the current comms section:

- Import data into a read model.
- Keep workflow state separate from imported source data.
- Use an append-only log for comms actions and operational events.
- Use queued email sending with idempotent worker processing.
- Store operator-editable templates with version history.
- Treat import sync and comms sending as distinct concerns.

This keeps the system explainable, auditable, and safe to operate even when the source spreadsheet changes frequently.

## 3. Core Concepts

### 3.1 Source Row

A source row is one line from the exported spreadsheet. It represents a machine on a job that needs further work handling.

Important fields from the sample import include:

- Job Number
- Equip ID
- Make/Model
- Customer Site Name
- Equipment Notes
- Job Equipment Notes
- Date Logged
- Job Type
- Parent/Default Job Type
- Engineer Name

The source row should be treated as imported data, not editable portal state.

### 3.2 Work Item

A work item is the portal-owned record that tracks the workflow for a source row.

It contains the current phase, operational status, contacts involved, due dates, and comms settings.

### 3.3 Phase

The phase is the manual business-stage marker the user asked for. At minimum, it should support:

- part_numbers_missing
- pricing_required
- pricing_received
- ready_to_progress
- awaiting_engineer
- awaiting_supplier
- closed
- on_hold

Phase is not the same as comms status. The phase describes where the row is in the further work process. The comms status describes whether the portal is allowed to send messages.

### 3.4 Contact Book

The contact book is a reusable directory of supplier and engineer contacts.

It must allow:

- Creating a supplier by entering a name and email.
- Reusing that supplier later by selecting the saved contact.
- Storing engineer contacts in the same way.
- Supporting multiple contacts under one supplier company.

### 3.5 Comms Event

A comms event is an immutable record of any attempted or successful communication.

It must record:

- Who was contacted
- Whether the contact was an engineer or supplier
- Why they were contacted
- Which template was used
- What was sent
- Who initiated the action
- Whether the send succeeded, failed, or was suppressed

## 4. Recommended Architecture

The system should reuse the same conceptual layers as the current comms section.

### 4.1 Ingestion Layer

Responsible for reading the exported sheet, normalising rows, and upserting source snapshots.

### 4.2 Workflow Layer

Responsible for portal-owned further work state, phase selection, due dates, manual holds, assignment, and next-action logic.

### 4.3 Comms Layer

Responsible for template selection, email rendering, queueing, sending, retries, and logging.

### 4.4 Directory Layer

Responsible for supplier and engineer contact records.

### 4.5 Audit Layer

Responsible for immutable logging of import batches, workflow updates, template edits, queue events, and send outcomes.

## 5. Data Model

The database should separate source data from portal-owned workflow data.

### 5.1 Further Work Snapshots

Stores the imported source sheet rows.

Suggested fields:

- id
- sourceRowKey
- jobNumber
- equipId
- makeModel
- customerSiteName
- equipmentNotes
- jobEquipmentNotes
- dateLogged
- jobType
- parentJobType
- engineerName
- sourceFileName
- sourceBatchId
- sourceRowHash
- rawPayload JSON
- lastSyncedAt

Key rules:

- `sourceRowKey` must be stable and unique.
- If the export has no stable row id, use a composite key such as `Job Number + Equip ID` and include a row fingerprint to detect changes.
- Store the raw payload for traceability.

### 5.2 Further Work State

Stores the portal-owned operating state for each row.

Suggested fields:

- id
- sourceRowKey
- phase
- commsStatus
- assignedOperator
- assignedTeam
- priorityOverride
- nextActionDueAt
- lastActionAt
- lastActionBy
- lockedAt
- lockedBy
- holdReason
- internalTags JSON
- supplierContactId
- engineerContactId
- partNumberStatus
- pricingStatus
- currentRequirementSummary
- createdAt
- updatedAt

Recommended `phase` values:

- part_numbers_missing
- pricing_required
- pricing_received
- ready_to_progress
- awaiting_engineer
- awaiting_supplier
- on_hold
- closed

Recommended `commsStatus` values:

- active
- paused
- suppressed
- manual_hold
- completed

### 5.3 Contacts

Stores reusable contact records.

Suggested fields:

- id
- contactType
- displayName
- organisationName
- email
- phone
- active
- notes
- tags JSON
- preferredReplyTo
- lastContactedAt
- createdBy
- updatedBy
- createdAt
- updatedAt

`contactType` should support:

- supplier
- engineer
- internal

### 5.4 Contact Links

If a single job can involve multiple contacts, use a join table instead of embedding one contact only.

Suggested fields:

- id
- sourceRowKey
- contactId
- role
- isPrimary
- createdAt

`role` should support:

- engineer
- supplier
- escalation
- finance

### 5.5 Comms Templates

Stores operator-editable email templates.

Suggested fields:

- id
- displayName
- routeKey
- subject
- body
- tone
- enabled
- sortOrder
- defaultCooldownDays
- updatedBy
- updatedAt
- createdAt

### 5.6 Template Versions

Every edit must write the previous version to an immutable version table.

Suggested fields:

- id
- templateId
- snapshot JSON
- changedBy
- changedAt

### 5.7 Queue

Stores pending and processed email jobs.

Suggested fields:

- id
- sourceRowKey
- state
- dueAt
- lockedAt
- lockedBy
- leaseExpiresAt
- batchId
- triggerType
- triggeredBy
- attempts
- lastError
- recipientContactId
- recipientEmailSnapshot
- recipientRole
- templateId
- createdAt
- updatedAt

Recommended queue states:

- due
- processing
- sent
- failed
- suppressed
- manual_hold

### 5.8 Comms Audit Log

Append-only event log for all outbound send attempts and notable routing decisions.

Suggested fields:

- id
- sourceRowKey
- queueItemId
- triggerType
- phaseSnapshot
- templateId
- renderedSubject
- renderedBody
- recipientContactId
- recipientEmail
- recipientRole
- recipientName
- outcome
- errorMessage
- operatorId
- queuedAt
- sentAt
- completedAt
- providerMessageId
- metadata JSON
- createdAt

Recommended `outcome` values:

- sent
- failed
- suppressed
- skipped

### 5.9 Workflow Audit Events

In addition to the comms log, store workflow events for state changes.

Suggested event types:

- import.started
- import.completed
- row.created
- row.updated
- phase.changed
- contact.linked
- contact.created
- hold.applied
- hold.released
- template.updated
- queue.enqueued
- queue.retry_requested
- comms.sent
- comms.failed
- comms.suppressed

## 6. Ingestion and Sync

### 6.1 Source of Truth

The system should read a single exported sheet dynamically.

The export can be handled in one of three ways:

- Manual file upload
- Watched folder drop
- Scheduled fetch from a known export location

The first version should support at least one deterministic ingest path, with manual upload being the simplest fallback.

### 6.2 Import Pipeline

Import should:

1. Parse the exported CSV.
2. Normalise column names using alias mappings.
3. Build a stable row key.
4. Upsert the snapshot record.
5. Detect changed rows by row hash.
6. Create or update the portal-owned workflow state if the row is new.
7. Emit import audit events.

### 6.3 Column Normalisation

The importer should support flexible aliases for columns, because exports often change header naming.

For the provided sample, at minimum support aliases for:

- job number
- equip id
- make/model
- customer site name
- equipment notes
- job equipment notes
- date logged
- job type
- parent/default job type
- engineer name

### 6.4 Row Identity

Recommended identity strategy:

- Primary key: `Job Number + Equip ID`
- Secondary fingerprint: hash of the meaningful source columns

If the source export can contain repeated job/equipment combinations, add a source row ordinal or upstream row id to the key.

### 6.5 Change Detection

When the snapshot changes:

- Update the imported row record.
- Preserve the previous snapshot history if required.
- Do not overwrite portal-owned state unless the business rule says to.

This prevents the source export from clobbering operator decisions.

## 7. Further Work Workflow

### 7.1 Eligibility

The list should only include rows that meet the further work criteria.

That logic should be explicit and configurable, for example:

- job type matches further work categories
- notes indicate missing parts or pricing needed
- row is not completed or closed
- row is not manually suppressed

### 7.2 Phase Triage

Each row should allow the operator to set the current phase.

The phase should drive the next recommended action.

Examples:

- part_numbers_missing: identify part numbers or send diagram to engineer
- pricing_required: contact supplier for pricing
- pricing_received: review returned quote and decide next step
- ready_to_progress: work can move to the next operational step

### 7.3 Manual Overrides

Operators must be able to override the automatic flow by applying:

- hold
- suppression
- custom due date
- assigned operator
- assigned supplier
- assigned engineer

Every override must update the workflow audit log.

### 7.4 Next Action Logic

The system should calculate a next action due date based on:

- phase
- template cooldown
- manual override
- send outcome

This is analogous to the current comms cooldown timer, but tuned for further work operations.

## 8. Part Number Identification Flow

This is the first major phase described in the notes.

### 8.1 Goal

Where engineers provide only a description, the admin team must be able to:

- send the diagram to the engineer for clarification, or
- identify the part numbers internally and record them in the portal.

### 8.2 Required Behaviour

The row should support a part identification sub-state such as:

- unknown
- awaiting_engineer_clarification
- diagram_sent
- part_numbers_identified

### 8.3 Data Captured

The portal should store:

- requested parts summary
- internal part numbers found
- source of the identification
- whether the diagram was sent
- which engineer was contacted
- when the request was sent
- the response date and result

### 8.4 Audit Requirement

When the engineer is contacted, the log must record:

- engineer contact identity
- contact time
- template used
- row id
- operator or automation trigger

If the admin team identifies the part number internally, that decision should also be logged as an internal workflow event.

## 9. Supplier Pricing Flow

This is the second major phase described in the notes.

### 9.1 Goal

If parts are not on the core system, the admin team must be able to contact the relevant supplier and request pricing.

### 9.2 Supplier Directory

The contact book should function as a supplier directory.

When the user enters a supplier email and label, the system should:

- create a supplier contact if it does not already exist
- reuse it on later rows
- autofill the email address when the supplier is selected again

### 9.3 Pricing Sub-State

The pricing workflow should have a dedicated sub-state such as:

- not_requested
- requested
- quoted
- declined
- no_response
- accepted

### 9.4 Required Behaviour

The portal should support:

- selecting a supplier from the contact book
- creating a new supplier inline
- generating a pricing request email
- storing the outgoing request in the audit log
- tracking whether pricing is outstanding or returned

### 9.5 Pricing Reply Handling

Returned pricing can be captured either by:

- manual entry by the operator, or
- future inbound email/webhook integration

The first version should at least support manual receipt logging.

## 10. Comms System

The comms system should be the strongest part of the design and should closely mirror the current architecture.

### 10.1 Outbound Email Provider

Use Resend for all outbound email delivery.

Required configuration:

- `RESEND_API_KEY`
- `RESEND_FROM` or `EMAIL_FROM`
- optional `RESEND_REPLY_TO`

### 10.2 Email Types

The portal should support at least these outbound comms categories:

- engineer clarification request
- diagram request
- supplier pricing request
- supplier follow-up
- internal reminder

### 10.3 Template Routing

Templates should be selected from the row phase plus recipient role.

Example routing:

- part_numbers_missing + engineer = diagram / clarification request
- pricing_required + supplier = pricing request
- no_response + supplier = follow-up
- pricing_received + internal = review reminder

### 10.4 Manual Triggered Auto Comms

The user should be able to manually trigger an action that still follows the automation pipeline:

- create queue item
- render template
- resolve recipient
- send immediately if allowed
- record outcome in audit log

This is important because the operator still needs the automation guarantees even when they trigger the action themselves.

### 10.5 Comms Status

Separate the send permission from the workflow phase.

Recommended statuses:

- active
- paused
- suppressed
- manual_hold
- completed

### 10.6 Suppression Rules

Comms should be suppressed when:

- the row is closed
- the operator manually pauses it
- a hold is applied
- no valid recipient exists
- a contact is inactive

The suppression reason must be stored.

## 11. Comms Log Requirements

The comms log is the core audit trail for the system.

It must answer these questions:

- Who was contacted?
- Was it the engineer or the supplier?
- When was the contact made?
- Which template was used?
- Was the message sent, failed, or suppressed?
- Who triggered it?
- What exact content was rendered?

### 11.1 Required Fields

Each log entry should record:

- row id
- recipient role
- recipient contact
- recipient email snapshot
- trigger type
- template id
- rendered subject
- rendered body
- outcome
- error message if any
- operator id if manual
- queued at
- sent at
- completed at
- provider message id if available

### 11.2 Log Behaviour

The log should be append-only.

Do not mutate sent log entries unless the provider supplies a later delivery status record. If that happens, append a new status event rather than overwriting the original send event.

### 11.3 Filtering

The UI should support filters by:

- row/job
- recipient role
- outcome
- trigger type
- operator
- date range

### 11.4 Display Content

For each event, the log should show:

- summary row
- rendered subject
- expandable rendered body
- error message if failed
- link back to the work item

## 12. Queue and Worker Model

The system should use a queued worker for all sends, even if the operator chooses run-now behaviour.

### 12.1 Queue States

- due
- processing
- sent
- failed
- suppressed
- manual_hold

### 12.2 Worker Responsibilities

The worker should:

1. Claim a queue item using a lease.
2. Load the row snapshot and workflow state.
3. Resolve the recipient contact.
4. Select and render the template.
5. Send via Resend.
6. Write the comms audit entry.
7. Advance the next due date when successful.
8. Enqueue the next scheduled action if appropriate.

### 12.3 Retry Behaviour

Failed queue items should be retryable from the UI.

Retry should:

- clear the lease fields
- return the item to due state
- preserve the error history in the audit log

### 12.4 Idempotency

The worker should avoid duplicate sends by:

- locking queue items before processing
- recording provider message ids
- checking for existing pending manual items for the same row and trigger

## 13. Contact Book Behaviour

The contact book must reduce friction for repeat supplier and engineer communications.

### 13.1 Create on First Use

If the operator enters a supplier email and name, the system should create a contact record automatically if one does not exist.

### 13.2 Reuse on Future Rows

On later rows, selecting the supplier should autofill the stored email address.

### 13.3 Contact Metadata

Store enough metadata to make the book operationally useful:

- display name
- company name
- email
- role
- active state
- notes
- last contacted date

### 13.4 Deduplication

Contacts should be deduplicated primarily by normalised email address, with a secondary check on organisation and role.

## 14. User Interface Specification

The UI should be an overlay on top of the imported sheet, not a replacement for the source sheet.

### 14.1 Main Board

Main list view should provide:

- searchable rows
- filters by phase, comms status, supplier, engineer, and priority
- quick status chips
- last comms indicator
- next action due indicator
- row-level action buttons

### 14.2 Row Detail Panel

The row detail view should show:

- source snapshot
- workflow state
- phase controls
- contact controls
- comms history
- internal notes
- queue state
- audit trail

### 14.3 Contact Directory

Dedicated directory for suppliers and engineers with:

- search
- edit
- deactivate
- link to rows
- last contacted information

### 14.4 Comms History View

Show all comms events for the row, with the rendered subject/body available inline or in an expandable drawer.

### 14.5 Template Admin

Allow authorised operators to edit templates, review versions, and toggle enabled state.

### 14.6 Import Monitor

Show:

- last import time
- import batch id
- rows processed
- rows changed
- errors
- source file name

## 15. Permissions and Access Control

The simplest and safest model is operator-only portal access.

Recommended roles:

- admin
- operator
- viewer

Suggested permissions:

- admin: full control over templates, settings, contacts, and queue replay
- operator: manage phases, contacts, and sends
- viewer: read-only access to rows and logs

If you keep the email-OTP pattern from the current comms section, use it for portal login only. External engineers and suppliers should remain recipients, not portal users.

## 16. Reliability and Safety

### 16.1 Reliability

The system should be able to recover from partial failures without double-sending.

Use:

- queue leases
- idempotent send records
- import batch ids
- retryable failed jobs

### 16.2 Safety

Prevent accidental sends by requiring:

- a valid recipient
- a selected template or routing rule
- a comms status that allows sending
- an explicit operator action for manual sends

### 16.3 Auditability

Every meaningful action must be logged.

If a user changes phase, contact, template, or hold status, that change should be auditable even if no email is sent.

## 17. Non-Functional Requirements

- The system must be fast enough for a continuously changing operational list.
- The comms log must remain queryable by row and date even at high volume.
- The import process must tolerate changing CSV headers.
- The UI must remain usable for operators who process rows repeatedly all day.
- The system must preserve historical traceability of what was sent and when.

## 18. Suggested API Surface

The new project should expose APIs roughly aligned with the existing comms architecture.

Suggested endpoints:

- `GET /api/further-work/rows`
- `GET /api/further-work/rows/:rowId`
- `PATCH /api/further-work/rows/:rowId/state`
- `POST /api/further-work/rows/:rowId/trigger-comms`
- `POST /api/further-work/rows/:rowId/hold`
- `POST /api/further-work/rows/:rowId/resume`
- `POST /api/further-work/rows/:rowId/note`
- `GET /api/further-work/contacts`
- `POST /api/further-work/contacts`
- `PATCH /api/further-work/contacts/:contactId`
- `GET /api/further-work/comms`
- `GET /api/further-work/comms/:rowId`
- `GET /api/further-work/templates`
- `PATCH /api/further-work/templates/:templateId`
- `POST /api/further-work/import/run`
- `GET /api/further-work/import/status`

## 19. Suggested Environment Variables

At minimum, expect:

- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_REPLY_TO`
- `SESSION_SECRET`
- `DATABASE_URL`
- `FURTHER_WORK_IMPORT_INTERVAL_MS`
- `FURTHER_WORK_WORKER_BATCH_SIZE`
- `FURTHER_WORK_DEFAULT_COOLDOWN_DAYS`
- `FURTHER_WORK_DEMO_MODE`
- `FURTHER_WORK_DEMO_RECIPIENT`

## 20. Open Decisions

Before implementation, confirm these points:

1. Is the export always CSV, or can it be XLSX as well?
2. Is `Job Number + Equip ID` guaranteed unique, or do we need a stronger row key?
3. Should supplier replies be captured manually only in v1, or should inbound email webhooks be included?
4. Do you want engineer and supplier contacts in one directory, or separate tabs that share the same underlying contact table?
5. Should the first version support only outbound comms, or also internal notifications when rows move phase?

## 21. Implementation Order

Recommended build sequence for the new project:

1. Build the import parser and snapshot table.
2. Add portal-owned state and phase controls.
3. Add contact book entities and lookup flows.
4. Add template tables, versioning, and rendering.
5. Add queue and worker processing with Resend.
6. Add append-only comms log and workflow audit events.
7. Build the main board, row detail page, and contact directory UI.
8. Add import monitor, queue monitoring, and retry tooling.

This sequence delivers a usable system early while preserving the same durable architecture used in the current comms section.