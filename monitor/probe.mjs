import { pathToFileURL } from "node:url";

const probes = [
  { id: "app", url: "https://app.plenera.io/login", contentType: "text/html" },
  {
    id: "api", url: "https://app.plenera.io/api/v1/health?readiness=true",
    contentType: "application/json", ready: async (response) => (await response.json()).status === "ok",
  },
];

export async function readAvailability(fetcher = fetch, checkedAt = new Date()) {
  const checks = await Promise.all(probes.map(async ({ id, url, contentType, ready }) => {
    try {
      const response = await fetcher(url, {
        redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store",
      });
      const matches = response.ok && response.headers.get("content-type")?.startsWith(contentType);
      if (matches && ready) return [id, await ready(response)];
      await response.body?.cancel();
      return [id, Boolean(matches)];
    } catch {
      return [id, false];
    }
  }));
  return { checkedAt: checkedAt.toISOString(), components: Object.fromEntries(checks) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await readAvailability()));
}
