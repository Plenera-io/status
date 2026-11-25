import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { describeNotice, stamp } from "./site/notice-state.mjs";
import { components } from "./site/reading.mjs";

const readingUrl = "https://raw.githubusercontent.com/Plenera-io/status/status-readings/status.json";
const formatTime = (value) => stamp.format(new Date(value)) + " UTC";
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

function noticeCard(notice, state) {
  const { title, kind, startsAt, endsAt, updates } = notice;
  const window = kind === "maintenance" ? `<p class="meta">${formatTime(startsAt)} to ${formatTime(endsAt)}</p>` : "";
  const timeline = [...updates].reverse().map(({ at, message }) =>
    `<li><time datetime="${at}">${formatTime(at)}</time><p>${escape(message)}</p></li>`,
  ).join("");
  return `<article class="notice" data-kind="${kind}" data-starts-at="${startsAt}" data-ends-at="${endsAt ?? ""}"><div class="notice-heading"><h3>${escape(title)}</h3><span class="pill" data-notice-state>${state}</span></div>${window}<ol>${timeline}</ol></article>`;
}

export function renderPage(notices, now = Date.now()) {
  const placedNotices = notices.map((notice) => ({ notice, ...describeNotice(notice, now) }))
    .sort((a, b) => a.order - b.order);
  const rows = components.map(({ id, name }) =>
    `<li><strong>${name}</strong><span class="pill" data-service-state="${id}">Awaiting check</span></li>`,
  ).join("");
  const section = (key, title, empty) => {
    const cards = placedNotices.filter(({ section }) => section === key)
      .map(({ notice, state }) => noticeCard(notice, state)).join("");
    return `<section><h2>${title}</h2><div data-notices="${key}">${cards}</div><p class="empty"${cards ? " hidden" : ""}>${empty}</p></section>`;
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Plenera web app and API availability, incident history, and scheduled maintenance.">
  <title>Plenera Status</title>
  <link rel="stylesheet" href="./style.css">
  <script type="module" src="./status.mjs"></script>
</head>
<body>
  <header><a class="wordmark" href="https://plenera.io">Plenera</a></header>
  <main>
    <h1>System status</h1>
    <section class="availability" aria-labelledby="availability" data-reading-url="${readingUrl}">
      <h2 id="availability" aria-live="polite">Current availability unknown</h2>
      <p class="meta">Last checked <time id="checked-at">—</time></p>
      <noscript><p class="meta">Live availability requires JavaScript.</p></noscript>
      <ul class="services">${rows}</ul>
    </section>
    ${section("active", "Active incidents", "No active incidents reported.")}
    ${section("maintenance", "Scheduled maintenance", "No maintenance scheduled.")}
    ${section("history", "Incident and maintenance history", "No incidents or maintenance published yet.")}
  </main>
  <footer><a href="https://support.plenera.io">Help center</a></footer>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const notices = validateNotices(JSON.parse(await readFile("notices.json", "utf8")));
  await mkdir("dist", { recursive: true });
  await cp("site/", "dist/", { recursive: true });
  await writeFile("dist/index.html", renderPage(notices));
}
