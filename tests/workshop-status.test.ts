import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultWorkshopLane, shouldAutoMoveWorkshopCard, shouldHighlightWorkshopStatusDrift } from "../shared/schema.ts";

test("getDefaultWorkshopLane maps awaiting parts status text to the correct lane", () => {
  assert.equal(getDefaultWorkshopLane("Awaiting Parts"), "awaiting_parts");
  assert.equal(getDefaultWorkshopLane("Parts Ordered"), "awaiting_parts");
});

test("getDefaultWorkshopLane follows the workshop source status mapping", () => {
  assert.equal(getDefaultWorkshopLane("Attended"), "on_the_bench");
  assert.equal(getDefaultWorkshopLane("Site Attended"), "repair_completed");
  assert.equal(getDefaultWorkshopLane("Attended - Further Work Needed"), "on_the_bench");
  assert.equal(getDefaultWorkshopLane("Pending Engineer Visit"), "on_the_bench");
  assert.equal(getDefaultWorkshopLane("Further Work Req"), "on_the_bench");
  assert.equal(getDefaultWorkshopLane("Waiting Acceptance"), "on_the_bench");
  assert.equal(getDefaultWorkshopLane("Attended - In Processing"), "repair_completed");
  assert.equal(getDefaultWorkshopLane("Requires Invoicing"), "repair_completed");
  assert.equal(getDefaultWorkshopLane("Awaiting Complete"), "repair_completed");
  assert.equal(getDefaultWorkshopLane("Awaiting Details"), "repair_completed");
  assert.equal(getDefaultWorkshopLane("Processing"), "entry");
});

test("manual workshop lane changes are never overwritten by imports or forced resyncs", () => {
  assert.equal(shouldAutoMoveWorkshopCard({ hasManualMove: true, sourceStatusChanged: true, forceLaneResync: false }), false);
  assert.equal(shouldAutoMoveWorkshopCard({ hasManualMove: true, sourceStatusChanged: false, forceLaneResync: true }), false);
  assert.equal(shouldAutoMoveWorkshopCard({ hasManualMove: false, sourceStatusChanged: true, forceLaneResync: false }), true);
  assert.equal(shouldAutoMoveWorkshopCard({ hasManualMove: false, sourceStatusChanged: false, forceLaneResync: true }), true);
});

test("status drift highlight is raised only when live status differs from current board lane and is not yet notified", () => {
  assert.equal(
    shouldHighlightWorkshopStatusDrift({
      statusChangeNeedsNotification: true,
    }),
    true,
  );

  assert.equal(
    shouldHighlightWorkshopStatusDrift({
      statusChangeNeedsNotification: false,
    }),
    false,
  );

  assert.equal(
    shouldHighlightWorkshopStatusDrift({
      statusChangeNeedsNotification: false,
    }),
    false,
  );
});
