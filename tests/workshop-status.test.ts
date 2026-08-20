import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultWorkshopLane, shouldHighlightWorkshopStatusDrift } from "../shared/schema.ts";

test("getDefaultWorkshopLane maps awaiting parts status text to the correct lane", () => {
  assert.equal(getDefaultWorkshopLane("Awaiting Parts"), "awaiting_parts");
  assert.equal(getDefaultWorkshopLane("Parts Ordered"), "awaiting_parts");
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
