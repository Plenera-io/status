# Plenera status

Public status for the Plenera web app and API. GitHub Pages serves the site independently of the Plenera app, database, support portal, and deployment runners.

## Publish incident updates and maintenance

Edit `notices.json` on a branch, open a pull request, and merge after the Status
page check passes. The production workflow runs on every merge, or can be run
manually from Actions. Verify that the text and dates appear on the public
page. Use only customer-facing information in this public repository.

Each incident has `kind: "incident"`, a `title`, a UTC `startsAt`, and an
`updates` array. Each update contains a UTC `at` and a public `message`. Append
updates in time order. When service returns, append a resolution message and
set `endsAt` to the recovery time. Resolved notices remain in public history.
Use the UTC format `2026-11-23T11:00:00Z` for all dates.

For a planned maintenance window use `kind: "maintenance"` with both start
and end times and an update describing the customer impact. The window appears
under scheduled maintenance until its end, when it moves to history. Append an
update if the schedule or impact changes.

For a publishing drill use `kind: "drill"` with a title and message that
explicitly say no service interruption is expected. Verify the first update
after publication. Publish a resolution, then verify the entry moved to
history. The drill does not override the automated service checks.

## Availability checks

The `plenera-status-monitor.timer` systemd timer runs on `grok-host`, a host
separate from Plenera production. Every five minutes it makes one request each
to the production sign-in page and the API readiness endpoint. The web app
check requires successful HTML. The API check requires successful JSON with
`status: "ok"`. Redirects and eight-second probe timeouts fail the affected
check. The journal records each successful publication's UTC observation time
and commit SHA.

The monitor publishes only the latest observation time and two booleans to
the generated `status-readings` branch. Browsers fetch the [public reading](https://raw.githubusercontent.com/Plenera-io/status/status-readings/status.json)
on load and once a minute while visible. GitHub's raw-file cache can delay new
readings by a few minutes. A reading at least 30 minutes old shows “Check
overdue.” A missing or invalid feed shows “Monitor unavailable.” Both show
current availability as unknown. The HTML and operator notices are published
separately by GitHub Pages. Maintenance moves between scheduled, in progress,
and history based on the visitor's current time. Sentry handles application
alerting separately.

Check the monitor with `systemctl list-timers plenera-status-monitor.timer`
and `journalctl -u plenera-status-monitor.service -n 20`. The root-owned
`/opt/plenera-status/monitor/` holds `probe.mjs` and `publish.sh`. The service runs with a
dynamic system user and load the status repository's write deploy key from
`/etc/plenera-status/deploy-key`. The SSH client uses the verified GitHub host
key in `/etc/plenera-status/github-known-hosts`. To deploy monitor changes,
install those two files at that path, install the service and timer
unit in `/etc/systemd/system/`, run `systemctl daemon-reload`, and enable the
timer with `systemctl enable --now plenera-status-monitor.timer`. Restart the
timer after schedule changes. To stop probe publication, disable and stop the
timer. The last published reading expires normally.

Run `node --test` and `node build.mjs` with Node 22 or later. Serve `dist/`
to preview the static output. The build works without the monitor or the
Plenera app. A notice validation error fails the build and leaves the last
successful page available.
