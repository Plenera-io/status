import { describeNotice, stamp } from "./notice-state.mjs";
import { components, parseReading, readingIsFresh } from "./reading.mjs";

const availability = document.querySelector("#availability");
const statusTime = document.querySelector("#checked-at");
const readingUrl = availability.closest("[data-reading-url]").dataset.readingUrl;
const rows = components.map(({ id }) => [id, document.querySelector(`[data-service-state="${id}"]`)]);
const noticeGroups = document.querySelectorAll("[data-notices]");
const noticeCards = [...document.querySelectorAll("article[data-kind]")];

let latestReading;
let refreshing = false;

function showAvailability(reading, reason) {
  const summary = reading
    ? rows.every(([id]) => reading.components[id]) ? "All systems operational" : "A service check failed"
    : "Current availability unknown";
  if (availability.textContent !== summary) availability.textContent = summary;

  for (const [id, row] of rows) {
    row.classList.toggle("pass", reading?.components[id] === true);
    row.classList.toggle("fail", reading?.components[id] === false);
    row.textContent = reading ? (reading.components[id] ? "Operational" : "Check failed") : reason;
  }
  if (latestReading) {
    statusTime.dateTime = new Date(latestReading.checkedAt).toISOString();
    statusTime.textContent = `${stamp.format(latestReading.checkedAt)} UTC`;
  }
}

function refreshNoticePlacement(now) {
  const cards = noticeCards.map((card) => ({ card, ...describeNotice(card.dataset, now) }))
    .sort((a, b) => a.order - b.order);
  for (const group of noticeGroups) {
    const entries = cards.filter(({ section }) => section === group.dataset.notices);
    entries.forEach(({ card, state }, index) => {
      const slot = group.children[index] ?? null;
      if (slot !== card) group.insertBefore(card, slot);
      card.querySelector("[data-notice-state]").textContent = state;
    });
    group.nextElementSibling.hidden = entries.length > 0;
  }
}

async function refresh() {
  if (document.hidden || refreshing) return;
  refreshNoticePlacement(Date.now());
  refreshing = true;
  try {
    const response = await fetch(readingUrl, {
      cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Availability feed unavailable");
    const reading = parseReading(await response.json());
    if (!latestReading || reading.checkedAt >= latestReading.checkedAt) latestReading = reading;
    if (readingIsFresh(latestReading)) showAvailability(latestReading);
    else showAvailability(null, "Check overdue");
  } catch {
    showAvailability(null, "Monitor unavailable");
  } finally {
    refreshing = false;
  }
}

refresh();
setInterval(refresh, 60_000);
document.addEventListener("visibilitychange", refresh);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) refresh();
});
