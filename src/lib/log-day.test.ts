import assert from "node:assert/strict";
import test from "node:test";
import { stockholmDateTimeInput, stockholmLocalToIso } from "./log-day";

test("Stockholm local time retains zero minutes in an edit field", () => {
  const local = "2026-09-22T12:00";
  assert.equal(stockholmDateTimeInput(stockholmLocalToIso(local)), local);
});
