export const stamp = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
});

export function describeNotice({ kind, startsAt, endsAt }, now) {
  const maintenance = kind === "maintenance";
  const closed = endsAt && Date.parse(endsAt) <= now;
  if (closed) {
    const state = maintenance ? "Window ended" : kind === "drill" ? "Drill complete" : "Resolved";
    return { section: "history", state, order: -Date.parse(endsAt) };
  }
  if (maintenance) {
    const start = Date.parse(startsAt);
    return { section: "maintenance", state: start <= now ? "In progress" : "Scheduled", order: start };
  }
  return { section: "active", state: kind === "drill" ? "Drill in progress" : "Ongoing", order: -Date.parse(startsAt) };
}
