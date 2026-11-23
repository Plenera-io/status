import assert from "node:assert/strict";
import test from "node:test";
import { checkComponents, renderPage, validateNotices } from "./build.mjs";

const start = "2026-11-23T10:00:00Z";
const end = "2026-11-23T11:00:00Z";
const incident = {
  kind: "incident",
  title: "Sign-in <interruption>",
  startsAt: start,
  updates: [{ at: start, message: "Investigating & monitoring." }],
};
const resolved = {
  ...incident,
  endsAt: end,
  updates: [...incident.updates, { at: end, message: "Service restored." }],
};
const checks = [
  { name: "Web app", available: true },
  { name: "API", available: false },
];

test("records failed or unreachable readiness independently from the web app", async () => {
  const results = await checkComponents(async (url) => {
    if (url.includes("/health")) throw new Error("origin unreachable");
    return new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
  });
  assert.deepEqual(results, checks);
  const degraded = await checkComponents(async () => Response.json({ status: "degraded" }));
  assert.equal(degraded[1].available, false);
});

test("shows a scheduled window, an active incident, and its later resolution", () => {
  const maintenance = {
    ...incident, kind: "maintenance", title: "Database maintenance",
    startsAt: "2026-11-24T10:00:00Z", endsAt: "2026-11-24T11:00:00Z",
  };
  const active = renderPage(checks, validateNotices([incident, maintenance]), new Date(start));
  assert.match(active, /A service check failed/);
  assert.match(active, /Active incidents[\s\S]*Sign-in &lt;interruption&gt;[\s\S]*Ongoing/);
  assert.match(active, /Scheduled maintenance[\s\S]*Database maintenance/);
  assert.match(active, /Investigating &amp; monitoring/);
  const historical = renderPage(checks, validateNotices([resolved]), new Date(end));
  assert.match(historical, /No active incidents reported/);
  assert.match(historical, /Incident and maintenance history[\s\S]*Resolved[\s\S]*Service restored/);
});

test("rejects a resolution without an update and invalid calendar dates", () => {
  assert.throws(() => validateNotices([{ ...incident, endsAt: end }]), /resolution update/);
  assert.throws(
    () => validateNotices([{ ...incident, startsAt: "2026-02-30T10:00:00Z" }]),
    /UTC start/,
  );
});
