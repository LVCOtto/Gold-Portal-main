import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWorkshopBoardDate, getWorkshopAgeBand, getWorkshopAgeDays } from "./workshop-age";

test("age flags change at exactly 30, 60 and 90 calendar days", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  for (const [days, band] of [
    [0, "neutral"], [29, "neutral"], [30, "30"], [59, "30"],
    [60, "60"], [89, "60"], [90, "90"], [106, "90"],
  ] as const) {
    const start = new Date(now.getTime() - days * 86_400_000).toISOString();
    const age = getWorkshopAgeDays(start, now);
    assert.equal(age, days);
    assert.equal(getWorkshopAgeBand(age), band);
  }
});

test("missing, invalid and future dates are unavailable, not zero days old", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  for (const start of [null, undefined, "", "invalid", "2026-10-08T13:00:00Z"]) {
    assert.equal(getWorkshopAgeDays(start, now), null);
  }
  assert.equal(getWorkshopAgeDays(now.toISOString(), new Date("invalid")), null);
  assert.equal(getWorkshopAgeBand(null), "neutral");
  assert.equal(formatWorkshopBoardDate("invalid"), null);
  assert.equal(formatWorkshopBoardDate(null), null);
});

test("age and start date use London calendar days rather than the browser timezone", () => {
  assert.equal(getWorkshopAgeDays("2026-07-01T22:30:00Z", new Date("2026-07-01T23:00:00Z")), 1);
  assert.equal(formatWorkshopBoardDate("2026-07-01T23:00:00Z"), "02/07/2026");
});

test("calendar days remain correct across both daylight-saving changes", () => {
  assert.equal(getWorkshopAgeDays("2026-03-28T12:00:00Z", new Date("2026-03-29T11:00:00Z")), 1);
  assert.equal(getWorkshopAgeDays("2026-10-24T11:00:00Z", new Date("2026-10-25T12:00:00Z")), 1);
});

test("age advances across midnight even with the same persisted start date", () => {
  const start = "2026-06-02T12:00:00Z";
  assert.equal(getWorkshopAgeDays(start, new Date("2026-07-01T22:59:59Z")), 29);
  assert.equal(getWorkshopAgeDays(start, new Date("2026-07-01T23:00:00Z")), 30);
});
