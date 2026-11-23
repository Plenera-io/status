const freshnessWindow = 30 * 60 * 1000;
const checkedAt = document.querySelector("#checked-at");
const availability = document.querySelector("#availability");

function refreshStatus() {
  if (Date.now() - Date.parse(checkedAt.dateTime) < freshnessWindow) return;
  availability.textContent = "Current availability unknown";
  for (const state of document.querySelectorAll("[data-service-state]")) {
    state.classList.remove("pass", "fail");
    state.textContent = "Check overdue";
  }
}

refreshStatus();
setInterval(refreshStatus, 60_000);
