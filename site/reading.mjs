export const components = [
  { id: "app", name: "Web app" },
  { id: "api", name: "API" },
];

const freshnessWindow = 30 * 60_000;

export function parseReading(value, now = Date.now()) {
  const checkedAt = typeof value?.checkedAt === "string" ? Date.parse(value.checkedAt) : NaN;
  if (!Number.isFinite(checkedAt) || checkedAt > now + 60_000 ||
      !components.every(({ id }) => typeof value.components?.[id] === "boolean")) {
    throw new Error("Invalid availability reading");
  }
  return { checkedAt, components: value.components };
}

export function readingIsFresh(reading, now = Date.now()) {
  return now - reading.checkedAt < freshnessWindow;
}
