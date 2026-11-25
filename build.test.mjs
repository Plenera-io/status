import assert from "node:assert/strict";
import test from "node:test";
import { renderPage, validateNotices } from "./build.mjs";
import { readAvailability } from "./monitor/probe.mjs";
import { describeNotice } from "./site/notice-state.mjs";
import { parseReading, readingIsFresh } from "./site/reading.mjs";

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
const html = () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } });

test("requires successful login HTML and a separate successful readiness reply", async () => {
  const reading = await readAvailability(async (url, options) => {
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    if (url === "https://app.plenera.io/login") return html();
    assert.equal(url, "https://app.plenera.io/api/v1/health?readiness=true");
    return Response.json({ status: "ok" });
  }, new Date(start));
  assert.deepEqual(reading, { checkedAt: new Date(start).toISOString(), components: { app: true, api: true } });
});

test("records failed or unreachable readiness independently from the web app", async () => {
  const unreachable = await readAvailability(async (url) => {
    if (url.includes("/health")) throw new Error("origin unreachable");
    return html();
  });
  assert.deepEqual(unreachable.components, { app: true, api: false });
  const degraded = await readAvailability(async (url) =>
    url.includes("/health") ? Response.json({ status: "degraded" }) : html());
  assert.deepEqual(degraded.components, { app: true, api: false });
  const badLogin = await readAvailability(async (url) =>
    url.includes("/health") ? Response.json({ status: "ok" }) : new Response(null, { status: 503 }));
  assert.deepEqual(badLogin.components, { app: false, api: true });
});

test("expires a reading at 30 minutes and rejects invalid or future readings", () => {
  const reading = { checkedAt: start, components: { app: true, api: false } };
  const now = Date.parse(start);
  const parsed = parseReading(reading, now);
  assert.equal(readingIsFresh(parsed, now + 30 * 60_000 - 1), true);
  assert.equal(readingIsFresh(parsed, now + 30 * 60_000), false);
  assert.throws(() => parseReading({ ...reading, components: { app: true } }, now), /invalid/i);
  assert.throws(() => parseReading(reading, now - 60_001), /invalid/i);
});

test("shows a scheduled window, an active incident, and its later resolution", () => {
  const maintenance = {
    ...incident, kind: "maintenance", title: "Database maintenance",
    startsAt: "2026-11-24T10:00:00Z", endsAt: "2026-11-24T11:00:00Z",
  };
  const active = renderPage(validateNotices([incident, maintenance]), Date.parse(start));
  assert.match(active, /Current availability unknown/);
  assert.match(active, /Web app[\s\S]*Awaiting check[\s\S]*API[\s\S]*Awaiting check/);
  assert.match(active, /Active incidents[\s\S]*Sign-in &lt;interruption&gt;[\s\S]*Ongoing/);
  assert.match(active, /Scheduled maintenance[\s\S]*Database maintenance/);
  assert.match(active, /Investigating &amp; monitoring/);
  const historical = renderPage(validateNotices([resolved]), Date.parse(end));
  assert.match(historical, /No active incidents reported/);
  assert.match(historical, /Incident and maintenance history[\s\S]*Resolved[\s\S]*Service restored/);
  assert.equal(describeNotice(maintenance, Date.parse(maintenance.startsAt)).state, "In progress");
  assert.equal(describeNotice(maintenance, Date.parse(maintenance.endsAt)).section, "history");
});

test("rejects a resolution without an update and invalid calendar dates", () => {
  assert.throws(() => validateNotices([{ ...incident, endsAt: end }]), /resolution update/);
  assert.throws(
    () => validateNotices([{ ...incident, startsAt: "2026-02-30T10:00:00Z" }]),
    /UTC start/,
  );
});
