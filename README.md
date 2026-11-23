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

GitHub-hosted jobs request the production sign-in page and API readiness
endpoint on a ten-minute schedule. Each publication records the observation
time in UTC. If the last check is over 30 minutes old, browsers label the
availability unknown. GitHub can delay scheduled jobs and disables inactive
public-repository schedules after 60 days without repository activity. Re-enable
the Status page workflow and run it manually if it becomes inactive. Application
alerting remains in the existing Sentry uptime monitor.

Run `node --test` and `node build.mjs` with Node 22 or later. Serve `dist/`
to preview the static output. A failed service probe renders the corresponding
failure state and still allows publication. Validation errors fail the build
and leave the last successful page available.
