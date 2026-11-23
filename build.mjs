import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const components = [
  { name: "Web app", url: "https://app.plenera.io/login", contentType: "text/html" },
  {
    name: "API",
    url: "https://app.plenera.io/api/v1/health?readiness=true",
    contentType: "application/json",
  },
];

const utc = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
});
const stamp = (value) => utc.format(new Date(value)) + " UTC";
const escape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const isTimestamp = (value) =>
  typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace("Z", ".000Z");
const hasText = (value) => typeof value === "string" && value.trim().length > 0;

export function validateNotices(notices) {
  if (!Array.isArray(notices)) throw new Error("notices.json must contain an array");
  for (const notice of notices) {
    const { kind, title, startsAt, endsAt, updates } = notice;
    if (!["incident", "maintenance", "drill"].includes(kind) || !hasText(title) ||
        !isTimestamp(startsAt) || (endsAt !== undefined && (!isTimestamp(endsAt) || endsAt < startsAt)) ||
        (kind === "maintenance" && !endsAt) ||
        !Array.isArray(updates) || !updates.length) {
      throw new Error("Each notice needs a kind, title, UTC start, and updates. Maintenance needs an end.");
    }
    let previous;
    for (const update of updates) {
      if (!hasText(update.message) || !isTimestamp(update.at) || (previous && update.at <= previous)) {
        throw new Error(`Invalid or out-of-order update in ${title}`);
      }
      previous = update.at;
    }
    if (kind !== "maintenance" && endsAt && (previous < endsAt || startsAt > updates[0].at)) {
      throw new Error(`Incident or drill ${title} must record its start and a resolution update`);
    }
  }
  return notices;
}

export async function checkComponents(fetcher = fetch) {
  return Promise.all(components.map(async ({ name, url, contentType }) => {
    try {
      const response = await fetcher(url, {
        redirect: "error", signal: AbortSignal.timeout(8000),
      });
      const expectedType = response.headers.get("content-type")?.startsWith(contentType);
      const healthy = response.ok && expectedType &&
        (name !== "API" || (await response.json()).status === "ok");
      return { name, available: Boolean(healthy) };
    } catch {
      return { name, available: false };
    }
  }));
}

function noticeCard(notice, now) {
  const { title, kind, startsAt, endsAt, updates } = notice;
  const maintenance = kind === "maintenance";
  const closed = endsAt && Date.parse(endsAt) <= now;
  let state = closed ? "Resolved" : "Ongoing";
  if (maintenance)
    state = closed ? "Window ended" : Date.parse(startsAt) <= now ? "In progress" : "Scheduled";
  if (kind === "drill") state = closed ? "Drill complete" : "Drill in progress";
  const window = maintenance ? `<p class="meta">${stamp(startsAt)} to ${stamp(endsAt)}</p>` : "";
  const timeline = [...updates].reverse().map(({ at, message }) =>
    `<li><time datetime="${at}">${stamp(at)}</time><p>${escape(message)}</p></li>`,
  ).join("");
  return `<article class="notice"><div class="notice-heading"><h3>${escape(title)}</h3><span class="pill">${state}</span></div>${window}<ol>${timeline}</ol></article>`;
}

export function renderPage(checks, notices, checkedAt = new Date()) {
  const now = checkedAt.getTime();
  const active = notices.filter(({ kind, endsAt }) => kind !== "maintenance" &&
    (!endsAt || Date.parse(endsAt) > now)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const scheduled = notices.filter(({ kind, endsAt }) =>
    kind === "maintenance" && Date.parse(endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = notices.filter(({ endsAt }) => endsAt && Date.parse(endsAt) <= now)
    .sort((a, b) => b.endsAt.localeCompare(a.endsAt));
  const summary = checks.every(({ available }) => available)
    ? "All systems operational" : "A service check failed";
  const rows = checks.map(({ name, available }) =>
    `<li><strong>${name}</strong><span class="pill ${available ? "pass" : "fail"}" data-service-state>${available ? "Operational" : "Check failed"}</span></li>`,
  ).join("");
  const section = (title, notices, empty) =>
    `<section><h2>${title}</h2>${notices.length ? notices.map((notice) => noticeCard(notice, now)).join("") : `<p class="empty">${empty}</p>`}</section>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Plenera web app and API availability, incident history, and scheduled maintenance.">
  <title>Plenera Status</title>
  <link rel="stylesheet" href="./style.css">
  <script src="./freshness.js" defer></script>
</head>
<body>
  <header><a class="wordmark" href="https://plenera.io">Plenera</a></header>
  <main>
    <h1>System status</h1>
    <section class="availability" aria-labelledby="availability">
      <h2 id="availability">${summary}</h2>
      <p class="meta">Last checked <time id="checked-at" datetime="${checkedAt.toISOString()}">${stamp(checkedAt)}</time></p>
      <ul class="services">${rows}</ul>
    </section>
    ${section("Active incidents", active, "No active incidents reported.")}
    ${section("Scheduled maintenance", scheduled, "No maintenance scheduled.")}
    ${section("Incident and maintenance history", past, "No incidents or maintenance published yet.")}
  </main>
  <footer><a href="https://support.plenera.io">Help center</a></footer>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const notices = validateNotices(JSON.parse(await readFile("notices.json", "utf8")));
  const checks = await checkComponents();
  await mkdir("dist", { recursive: true });
  await cp("site/", "dist/", { recursive: true });
  await writeFile("dist/index.html", renderPage(checks, notices));
}
