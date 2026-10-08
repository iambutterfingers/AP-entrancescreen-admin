(function () {
  "use strict";
  var fields = [], revision = null;
  var remote = window.DashboardRemote && window.DashboardRemote.enabled;
  function status(text) { document.getElementById("dashboardSettingsStatus").textContent = text; }
  async function api(options) {
    if (remote) { return window.DashboardRemote.api("/api/admin/settings", options); }
    options = options || {};
    options.headers = { "Content-Type": "application/json" };
    options.cache = "no-store";
    if (options.method === "POST" && revision) { options.headers["X-Admin-Version"] = revision; }
    var response = await fetch("/api/admin/settings", options);
    var data = await response.json();
    if (!response.ok) { throw new Error(data.error || "Could not update settings"); }
    revision = response.headers.get("X-Admin-Version");
    return data;
  }
  async function load() {
    try {
      var data = await api(); fields = data.fields || [];
      var container = document.getElementById("dashboardSettingsFields"); container.replaceChildren();
      if (!fields.length) { status("Settings will be available once the Pi has installed the update and published its next report."); return; }
      var group = "", section;
      fields.forEach(function (field) {
        if (field.group !== group) {
          group = field.group; section = document.createElement("div"); section.className = "admin-subcard stack";
          var heading = document.createElement("h3"); heading.textContent = group; section.appendChild(heading); container.appendChild(section);
        }
        var label = document.createElement("label"); label.htmlFor = "setting-" + field.key; label.textContent = field.label;
        var input = document.createElement("input"); input.id = label.htmlFor; input.name = field.key;
        input.type = field.secret ? "password" : ["integer", "percentage"].includes(field.type) ? "number" : "text";
        input.autocomplete = "off"; input.spellcheck = false;
        input.value = field.secret ? "" : field.value == null ? "" : String(field.value);
        if (field.type === "integer" || field.type === "percentage") { input.min = field.type === "integer" ? "1" : "0"; input.max = field.type === "integer" ? "50" : "100"; input.step = field.type === "integer" ? "1" : "0.1"; }
        if (!field.secret && field.type === "text") { input.required = true; }
        section.appendChild(label); section.appendChild(input);
        if (field.secret) {
          input.placeholder = field.configured ? "Configured — leave blank to keep" : "Not configured — enter address";
          var clearLabel = document.createElement("label"); clearLabel.className = "field-hint";
          var clear = document.createElement("input"); clear.type = "checkbox"; clear.id = "clear-setting-" + field.key;
          clearLabel.appendChild(clear); clearLabel.appendChild(document.createTextNode(" Clear this address")); section.appendChild(clearLabel);
          clear.addEventListener("change", function () { input.disabled = clear.checked; });
        }
      });
      status("Settings loaded. " + (remote ? "Remote settings saves are encrypted for this Pi." : "Saved settings override the matching .env variables."));
    } catch (error) { status(error.message); }
  }
  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("dashboardSettingsForm").addEventListener("submit", async function (event) {
      event.preventDefault(); var changes = {}, button = document.getElementById("saveDashboardSettings");
      fields.forEach(function (field) {
        var value = document.getElementById("setting-" + field.key).value.trim();
        if (field.secret) {
          if (document.getElementById("clear-setting-" + field.key).checked) { changes[field.key] = ""; }
          else if (value) { changes[field.key] = value; }
        } else {
          var parsed = field.type === "percentage" && value === "" ? null : ["integer", "percentage"].includes(field.type) ? Number(value) : value;
          if (parsed !== field.value) { changes[field.key] = parsed; }
        }
      });
      if (!Object.keys(changes).length) { status("No settings changed."); return; }
      button.disabled = true; status("Saving settings…");
      try {
        var result = await api({ method: "POST", body: JSON.stringify({ changes: changes }) });
        if (result.queued) {
          fields.filter(function (field) { return field.secret; }).forEach(function (field) { document.getElementById("setting-" + field.key).value = ""; });
          status("Encrypted settings saved to GitHub. Wait for Applied on Pi, then Reload content to see the updated configuration.");
        } else { await load(); status("Settings saved on the Pi. Feeds will use them on their next refresh."); }
      } catch (error) { status(error.message); }
      finally { button.disabled = false; }
    });
    document.getElementById("reloadDashboardSettings").addEventListener("click", function () {
      if (remote) { document.getElementById("remoteReload").click(); } else { load(); }
    });
    (window.DashboardRemote ? window.DashboardRemote.ready : Promise.resolve()).then(load);
  });
  window.addEventListener("dashboard:reload-content", load);
})();
