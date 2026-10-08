(function () {
  "use strict";
  var remote = document.documentElement.hasAttribute("data-remote-admin");
  var routes = { "/api/notices": "notices", "/api/attendance": "attendanceMessages",
    "/api/attendance/message": "attendanceMessages", "/api/tickers": "tickers",
    "/api/overlays": "overlays", "/api/rotation": "rotation",
    "/api/celebration-children": "celebrationUpcoming", "/api/celebration-children/upcoming": "celebrationUpcoming",
    "/api/celebration-children/current": "celebrationCurrent", "/api/celebration-post": "celebrationUpcoming",
    "/api/classdojo/events/admin": "classdojo", "/api/class-order": "classOrder",
    "/api/admin/settings": "settings", "/api/media-library": "mediaLibrary" };
  function resourceFor(path) {
    if (routes[path]) { return routes[path]; }
    if (/^\/api\/media-library\/[a-zA-Z0-9_-]+(?:\/replace)?$/.test(path)) { return "mediaLibrary"; }
    if (/^\/api\/classdojo\/events\/(refresh-classes|refresh-events|groups\/merge|groups\/[a-zA-Z0-9_-]+\/(rename|accept|unlink))$/.test(path)) { return "classdojo"; }
    var match = /^\/api\/page-settings\/([a-z_]+)$/.exec(path);
    return match ? "page:" + match[1] : null;
  }
  var token = "", repository = "", branch = "main", documentState = null;
  var contentVersions = {}, ownCommands = {}, connected = false, polling = false;
  var saveChain = Promise.resolve(), resolveReady;
  var ready = remote ? new Promise(function (resolve) { resolveReady = resolve; }) : Promise.resolve();
  var panel, connectionStatus, syncStatus;
  var assetPreviews = {};
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function encode(value) { return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n"), function (b) { return String.fromCharCode(b); }).join("")); }
  function decode(value) { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, "")), function (c) { return c.charCodeAt(0); }))); }
  function message(text, error) {
    if (syncStatus) { syncStatus.textContent = text; syncStatus.classList.toggle("remote-sync-error", !!error); }
  }
  async function github(path, options) {
    options = options || {};
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch("https://api.github.com" + path, {
        method: options.method || "GET", cache: "no-store", signal: controller.signal,
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
          "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      if (!response.ok) {
        var error = new Error(response.status === 401 ? "GitHub sign-in expired. Reconnect with a valid token." :
          response.status === 403 ? "GitHub access denied or rate limited. Check token permissions and try again later." :
          response.status === 404 ? "Repository or content is unavailable. Check the repository and token access." :
          response.status === 409 || response.status === 422 ? "Another save reached GitHub first. Try saving again." : "GitHub request failed. Try again shortly.");
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error.name === "AbortError") { throw new Error("GitHub took too long to respond. Check your connection and retry."); }
      throw error;
    } finally { window.clearTimeout(timer); }
  }
  function filePath() { return "/repos/" + repository + "/contents/state.json"; }
  async function readDocument() {
    var file = await github(filePath() + "?ref=" + encodeURIComponent(branch));
    if (file.encoding !== "base64" || file.size > 750000) { throw new Error("Unsupported or oversized content file."); }
    var data = decode(file.content);
    if (data.schemaVersion !== 1 || !data.snapshot || !data.snapshot.resources || !Array.isArray(data.commands) || !Array.isArray(data.receipts)) {
      throw new Error("The Pi has not published its content yet. Finish the Pi setup, then reconnect.");
    }
    return { data: data, sha: file.sha };
  }
  function updateStatus(data) {
    var receipts = data.receipts || [];
    var dojoStatus = document.getElementById("remoteDojoStatus");
    if (dojoStatus) {
      dojoStatus.textContent = data.snapshot.bootstrap.classDojoNeedsCode
        ? "ClassDojo needs a login code. Open Pi Connect to complete its sign-in, then request an event refresh."
        : "Events are the Pi's last published copy. After a request applies, use Reload content to see the result.";
    }
    var history = document.getElementById("remoteRecentSaves");
    if (history) {
      history.replaceChildren();
      receipts.slice(-8).reverse().forEach(function (receipt) {
        var row = document.createElement("li");
        var result = receipt.result && receipt.result.scheduled_at;
        row.textContent = (receipt.resource || "Save") + ": " +
          (receipt.status === "applied" ? (result ? "ClassDojo scheduled for " + new Date(result).toLocaleString() : "Applied on Pi") : receipt.error || receipt.status) +
          " · " + new Date(receipt.at).toLocaleString();
        if (receipt.status !== "applied") { row.className = "remote-sync-error"; }
        history.appendChild(row);
      });
    }
    var pending = Object.keys(ownCommands).filter(function (id) {
      return !receipts.some(function (r) { return r.id === id; });
    });
    var failed = receipts.filter(function (r) { return ownCommands[r.id] && r.status !== "applied"; });
    receipts.forEach(function (r) {
      if (ownCommands[r.id] && r.status === "applied" && r.version) { contentVersions[r.resource] = r.version; }
    });
    if (failed.length) {
      message("Pi could not apply a save: " + (failed[failed.length - 1].error || "Reload and check the content."), true);
    } else if (pending.length) {
      message("Saved to GitHub — waiting for Pi (" + pending.length + " save" + (pending.length === 1 ? "" : "s") + ").");
    } else {
      var seen = data.pi && data.pi.seenAt;
      var stale = !seen || Date.now() - Date.parse(seen) > 10 * 60 * 1000;
      var posted = receipts.filter(function (r) { return ownCommands[r.id] && r.status === "applied" && r.result && r.result.scheduled_at; });
      message(stale ? "Pi has not checked in recently. Saves will wait safely in GitHub." :
        posted.length ? "ClassDojo post scheduled for " + new Date(posted[posted.length - 1].result.scheduled_at).toLocaleString() :
        Object.keys(ownCommands).length ? "Applied on Pi. Last check-in: " + new Date(seen).toLocaleTimeString() :
          "Connected. Pi last checked in: " + new Date(seen).toLocaleTimeString(), stale);
    }
    var serverPending = (data.commands || []).length;
    if (!pending.length && serverPending) { message("GitHub has " + serverPending + " save(s) waiting for the Pi."); }
  }
  async function poll() {
    if (!connected || polling) { return; }
    polling = true;
    try {
      var latest = await readDocument();
      documentState = latest.data;
      updateStatus(documentState);
    } catch (error) { message(error.message + " Pending saves remain in GitHub.", true); }
    finally { polling = false; }
  }
  function projected(key) {
    var item = documentState.snapshot.resources[key];
    var payload = item ? copy(item.payload) : {};
    (documentState.commands || []).forEach(function (command) {
      if (resourceFor(command.path) === key && command.path !== "/api/celebration-post" && key !== "classdojo" && key !== "settings" && key !== "mediaLibrary") {
        payload = command.method === "DELETE" ? {} : copy(command.body);
      }
    });
    return payload;
  }
  function bootstrap() {
    var value = copy(documentState.snapshot.bootstrap);
    value.rotation = projected("rotation");
    var library = documentState.snapshot.resources.mediaLibrary;
    value.media = (library ? library.payload.items : value.media || []).map(function (item) {
      return Object.assign({ focalPoint: { x: 50, y: 50 }, tags: [] }, item, { url: assetPreviews[item.remoteAsset] || "media-placeholder.svg" });
    });
    value.builtInPages.forEach(function (page) {
      var override = projected("page:" + page.key);
      page.title = override.title || page.defaultTitle;
      page.customTitle = override.title || null;
      page.themeKey = override.themeKey || "";
      page.themeElements = override.themeElements || [];
    });
    value.contentVersions = copy(contentVersions);
    return value;
  }
  function binary64(bytes) { return btoa(Array.from(new Uint8Array(bytes), function (b) { return String.fromCharCode(b); }).join("")); }
  function bytes64(value) { return Uint8Array.from(atob(value), function (c) { return c.charCodeAt(0); }); }
  async function encryptSettings(changes) {
    var encryption = documentState.snapshot.resources.settings.payload.encryption;
    if (!crypto.subtle || !encryption) { throw new Error("Secure settings are unavailable. Update the Pi and reload this page."); }
    var publicKey = await crypto.subtle.importKey("spki", bytes64(encryption.spki), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["wrapKey"]);
    var aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: new TextEncoder().encode(encryption.keyId) }, aes, new TextEncoder().encode(JSON.stringify(changes)));
    var wrapped = await crypto.subtle.wrapKey("raw", aes, publicKey, "RSA-OAEP");
    return { encrypted: { keyId: encryption.keyId, wrappedKey: binary64(wrapped), iv: binary64(iv), ciphertext: binary64(ciphertext) } };
  }
  async function loadMediaPreviews() {
    var library = documentState.snapshot.resources.mediaLibrary;
    if (!library) { return; }
    await Promise.all(library.payload.items.filter(function (item) { return item.remoteAsset && !assetPreviews[item.remoteAsset]; }).map(async function (item) {
      try {
        if (!/^uploads\/[a-f0-9-]{36}\.json$/.test(item.remoteAsset)) { return; }
        var file = await github("/repos/" + repository + "/contents/" + item.remoteAsset + "?ref=" + encodeURIComponent(branch));
        if (file.encoding !== "base64" || file.size > 1010000) { return; }
        var asset = decode(file.content);
        if (/^image\/(jpeg|png|webp)$/.test(asset.mimeType) && typeof asset.content === "string" && asset.content.length <= 1000000) {
          assetPreviews[item.remoteAsset] = "data:" + asset.mimeType + ";base64," + asset.content;
        }
      } catch (_) { /* A missing preview must not prevent loading the saved admin forms. */ }
    }));
  }
  async function prepareImage(file) {
    if (!file.type.startsWith("image/") || file.size > 30 * 1024 * 1024) { throw new Error("Choose images under 30 MB. Remote video uploads are not supported."); }
    var url = URL.createObjectURL(file);
    try {
      var image = new Image();
      await new Promise(function (resolve, reject) { image.onload = resolve; image.onerror = function () { reject(new Error("This image format cannot be opened. Choose JPEG or PNG.")); }; image.src = url; });
      var canvas = document.createElement("canvas");
      var scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      var ctx = canvas.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      var content;
      for (var quality = 0.94; quality >= 0.49; quality -= 0.1) {
        content = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        // Leave room for base64 and the JSON wrapper below GitHub's 1 MB file limit.
        if (atob(content).length <= 720000) { break; }
      }
      if (!content || atob(content).length > 720000) { throw new Error("Image is too detailed to upload. Crop it or choose a smaller image."); }
      return { content: content, mimeType: "image/jpeg" };
    } finally { URL.revokeObjectURL(url); }
  }
  async function uploadImages(path, options) {
    var files = options.body.getAll("media");
    if (!files.length || files.length > 8) { throw new Error("Choose one to eight images at a time."); }
    var replacement = /\/([^/]+)\/replace$/.exec(path);
    if (replacement && files.length !== 1) { throw new Error("Choose one replacement image."); }
    var latest = await readDocument();
    if (latest.data.commands.some(function (c) { return resourceFor(c.path) === "mediaLibrary"; })) { throw new Error("A media save is waiting for the Pi. Wait for it to apply before uploading again."); }
    if (!latest.data.snapshot.resources.mediaLibrary || contentVersions.mediaLibrary !== latest.data.snapshot.resources.mediaLibrary.version) { throw new Error("The media library changed. Reload content before uploading."); }
    var entries = [];
    for (var file of files) {
      message("Preparing and uploading " + file.name + "…");
      var asset = await prepareImage(file), assetPath = "uploads/" + crypto.randomUUID() + ".json";
      var digest = await crypto.subtle.digest("SHA-256", bytes64(asset.content));
      var hash = Array.from(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      await github("/repos/" + repository + "/contents/" + assetPath, { method: "PUT", body: { message: "Upload dashboard image", branch: branch, content: encode(asset) } });
      assetPreviews[assetPath] = "data:image/jpeg;base64," + asset.content;
      entries.push({ path: assetPath, sha256: hash, title: file.name.replace(/\.[^.]+$/, "").slice(0, 300) });
    }
    var result = await enqueue("/api/media-library/remote-import", { method: "POST", body: JSON.stringify({ items: entries, replacementId: replacement ? replacement[1] : undefined }) });
    result.items = [];
    result.message = replacement ? "Replacement saved to GitHub. It will keep the menu's existing rotation and schedule. Wait for Applied on Pi, then Reload content." : "Images saved to GitHub. Wait for Applied on Pi, then Reload content to add them to the rotation.";
    if (replacement) { result.item = Object.assign({}, bootstrap().media.find(function (m) { return m.id === replacement[1]; }), { url: assetPreviews[entries[0].path] }); }
    message(result.message);
    return result;
  }
  async function enqueue(path, options) {
    var key = resourceFor(path);
    var allowed = key && path !== "/api/attendance" && path !== "/api/classdojo/events/admin" &&
      ((options.method === "POST") || ((key.indexOf("page:") === 0 || key.indexOf("celebration") === 0) && options.method === "DELETE"));
    if (!allowed) { throw new Error("This action is available through Raspberry Pi Connect at school."); }
    var body = options.body ? JSON.parse(options.body) : {};
    var submittedBody = copy(body);
    if (key === "settings") { body = await encryptSettings(body.changes); }
    if (key === "notices") { body = { message: body.message || "", notes: body.notes || [] }; }
    if (body.children) {
      body.children = body.children.map(function (child) {
        return { id: child.id, name: child.name, class_name: child.class_name || "", value_key: child.value_key || "", value_label: child.value_label || "" };
      });
    }
    for (var attempt = 0; attempt < 3; attempt += 1) {
      var latest = await readDocument(), data = latest.data;
      if (data.commands.length >= 50) { throw new Error("Too many saves are waiting for the Pi. Wait for it to reconnect."); }
      if (data.commands.some(function (c) { return resourceFor(c.path) === key; })) {
        throw new Error("A save for this section is already waiting for the Pi. Wait for it to apply, then save again.");
      }
      if (!data.snapshot.resources[key] || contentVersions[key] !== data.snapshot.resources[key].version) {
        throw new Error("This section changed on another device. Reload content before saving; keep a copy of your edits first.");
      }
      var command = { id: "save-" + crypto.randomUUID(), path: path, method: options.method,
        body: body, baseVersion: contentVersions[key], createdAt: new Date().toISOString() };
      data.commands.push(command);
      try {
        await github(filePath(), { method: "PUT", body: { message: "Update dashboard " + key,
          branch: branch, sha: latest.sha, content: encode(data) } });
        ownCommands[command.id] = key;
        documentState = data;
        updateStatus(data);
        return saveResult(key, path, submittedBody);
      } catch (error) {
        if ((error.status === 409 || error.status === 422) && attempt < 2) { continue; }
        // The request may have succeeded before a network failure: do not blindly retry it.
        if (!error.status) {
          try {
            var check = await readDocument();
            if (check.data.commands.some(function (c) { return c.id === command.id; }) || check.data.receipts.some(function (r) { return r.id === command.id; })) {
              ownCommands[command.id] = key; documentState = check.data; updateStatus(documentState);
              return saveResult(key, path, submittedBody);
            }
          } catch (_) { /* Show uncertainty and require checking before saving again. */ }
          throw new Error("Save confirmation was interrupted. Check sync status or reload before saving again.");
        }
        throw error;
      }
    }
  }
  function saveResult(key, path, body) {
    if (key === "rotation") { return projected(key); }
    var result = { success: true, queued: true, message: "Request saved to GitHub. Waiting for Pi." };
    if (key === "mediaLibrary") {
      var items = bootstrap().media;
      if (path === "/api/media-library/bulk-tags") {
        result.updated = items.filter(function (item) { return body.mediaIds.includes(item.id); }).map(function (item) { return Object.assign({}, item, { tags: Array.from(new Set(item.tags.concat(body.tags))) }); });
      } else if (!/\/(remote-import|remote-delete)$/.test(path)) {
        return Object.assign({}, items.find(function (item) { return path.endsWith("/" + item.id); }) || {}, body, result);
      }
    } else if (key !== "settings") { result.settings = body; }
    return result;
  }
  function api(path, options) {
    if (!connected) { return Promise.reject(new Error("Connect to GitHub first.")); }
    options = options || {};
    if (options.method && options.method !== "GET") {
      var operation = saveChain.then(function () { return /\/api\/media-library\/(upload|[^/]+\/replace)$/.test(path) ? uploadImages(path, options) : enqueue(path, options); });
      saveChain = operation.catch(function () {});
      return operation;
    }
    if (path === "/api/admin/bootstrap") { return loadMediaPreviews().then(bootstrap); }
    if (path === "/api/health") {
      return poll().then(function () {
        var health = copy(documentState.snapshot.health || {});
        var seen = documentState.pi && documentState.pi.seenAt;
        health.summary = (health.summary || "Waiting for the Pi to publish dashboard health.") + (seen ? " Pi report: " + new Date(seen).toLocaleString() + "." : "");
        if (!seen || Date.now() - Date.parse(seen) > 10 * 60 * 1000) { health.status = "warning"; health.summary = "Pi has not checked in recently. These health readings may be out of date. " + health.summary; }
        return health;
      });
    }
    if (path === "/api/celebration-children") {
      return Promise.resolve({ current: Object.keys(projected("celebrationCurrent")).length ? projected("celebrationCurrent") : null,
        upcoming: Object.keys(projected("celebrationUpcoming")).length ? projected("celebrationUpcoming") : null });
    }
    if (path === "/api/class-order") {
      return Promise.resolve(documentState.snapshot.resources.classOrder ? projected("classOrder") : { order: documentState.snapshot.bootstrap.classOrder || [], meta: documentState.snapshot.bootstrap.classMeta || {} });
    }
    if (path === "/api/classdojo/auth-status") {
      return Promise.resolve({ needs_code: !!documentState.snapshot.bootstrap.classDojoNeedsCode,
        message: "ClassDojo login codes and passwords are managed through Pi Connect." });
    }
    var key = resourceFor(path);
    if (key) {
      var result = projected(key);
      return Promise.resolve(path === "/api/attendance" ? { attendance_messages: result.messages || [] } : result);
    }
    // Deliberately empty: personal data, authentication and live diagnostics never enter GitHub.
    var empty = { "/api/celebration-children": { current: null, upcoming: null }, "/api/pupil-names": { pupils: [] },
      "/api/class-order": { order: [], meta: {} }, "/api/class-attendance": { classes: [] },
      "/api/classdojo/events/admin": { groups: [] }, "/api/classdojo/auth-status": {},
      "/api/tv-power/history": { entries: [] }, "/api/health": {} };
    return Promise.resolve(copy(empty[path] || {}));
  }
  function initialiseRemote() {
    document.querySelector(".admin-header h1").textContent = "Dashboard Admin · Remote";
    document.querySelector(".admin-header p").textContent = "Update the school screen from anywhere. Changes travel securely through GitHub.";
    document.querySelector(".admin-header__links").innerHTML = '<a class="btn btn-ghost btn-sm" href="https://connect.raspberrypi.com/" target="_blank" rel="noopener noreferrer">Pi Connect</a>';
    panel = document.createElement("section"); panel.className = "admin-card remote-connection";
    panel.innerHTML = '<div class="admin-card__body stack"><h2>Connect to GitHub</h2>' +
      '<p>Use a fine-grained token with Contents read/write access to the private content repository only. Your token stays in memory until you disconnect or close this page.</p>' +
      '<p class="remote-token-help"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a GitHub token</a> · Select only the content repository and give Contents read/write permission.</p>' +
      '<form id="remoteConnectForm" class="stack"><label for="remoteRepository">Content repository</label><input id="remoteRepository" placeholder="owner/repository" required autocapitalize="none" spellcheck="false">' +
      '<label for="remoteToken">GitHub token</label><input id="remoteToken" type="password" required autocomplete="off" autocapitalize="none" spellcheck="false">' +
      '<button class="btn btn-primary" type="submit">Connect</button><p id="remoteConnectStatus" role="status" aria-live="polite"></p></form>' +
      '<div id="remoteConnected" class="stack" hidden><p id="remoteSyncStatus" role="status" aria-live="polite"></p><div class="btn-row">' +
      '<button id="remoteCheck" class="btn btn-secondary" type="button">Check sync</button><button id="remoteReload" class="btn btn-ghost" type="button">Reload content</button>' +
      '<button id="remoteDisconnect" class="btn btn-ghost" type="button">Disconnect</button></div>' +
      '<details><summary>Recent saves</summary><ul id="remoteRecentSaves"></ul></details></div></div>';
    document.querySelector(".admin-shell").before(panel);
    connectionStatus = document.getElementById("remoteConnectStatus"); syncStatus = document.getElementById("remoteSyncStatus");
    document.querySelector(".admin-shell").hidden = true;
    var preset = window.REMOTE_ADMIN_CONFIG || {};
    document.getElementById("remoteRepository").value = preset.repository || "";
    branch = preset.branch || "main";
    document.getElementById("remoteConnectForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      var button = event.target.querySelector("button"); button.disabled = true;
      repository = document.getElementById("remoteRepository").value.trim();
      token = document.getElementById("remoteToken").value.trim();
      connectionStatus.textContent = "Connecting…";
      try {
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) { throw new Error("Enter a repository as owner/name."); }
        var info = await github("/repos/" + repository);
        if (!info.private) { throw new Error("Use a private content repository. Public repositories are not supported."); }
        var latest = await readDocument(); documentState = latest.data;
        contentVersions = {};
        Object.keys(documentState.snapshot.resources).forEach(function (key) { contentVersions[key] = documentState.snapshot.resources[key].version; });
        connected = true;
        panel.classList.add("is-connected");
        document.getElementById("remoteToken").value = "";
        event.target.hidden = true; document.getElementById("remoteConnected").hidden = false;
        document.querySelector(".admin-shell").hidden = false;
        updateStatus(documentState); resolveReady();
      } catch (error) { token = ""; connectionStatus.textContent = error.message; }
      finally { button.disabled = false; }
    });
    document.getElementById("remoteCheck").addEventListener("click", poll);
    document.getElementById("remoteReload").addEventListener("click", async function () {
      if (!window.confirm("Reload saved content? Any unsaved edits on this page will be lost.")) { return; }
      try {
        await saveChain;
        var latest = await readDocument(); documentState = latest.data;
        Object.keys(documentState.snapshot.resources).forEach(function (key) { contentVersions[key] = documentState.snapshot.resources[key].version; });
        ownCommands = {}; updateStatus(documentState);
        window.dispatchEvent(new Event("dashboard:reload-content"));
      } catch (error) { message(error.message, true); }
    });
    document.getElementById("remoteDisconnect").addEventListener("click", function () { token = ""; connected = false; window.location.reload(); });
    window.setInterval(poll, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { poll(); } });
    // Retain tabs and familiar layout, while making Pi-only controls unambiguous.
    ["customPageList", "tvPowerOnNow", "classDojoCodeSection", "tvPowerRules"].forEach(function (id) {
      var section = document.getElementById(id).closest("section.admin-card");
      section.classList.add("remote-pi-only");
      section.querySelectorAll("button,input,select,textarea").forEach(function (control) { control.disabled = true; });
      var note = document.createElement("p"); note.className = "remote-section-note"; note.textContent = "Manage this section through Pi Connect. Its data stays on the Pi.";
      section.prepend(note);
    });
    var mediaInput = document.getElementById("mediaUploadInput"); mediaInput.accept = "image/*";
    var mediaNote = document.createElement("p"); mediaNote.className = "remote-section-note";
    mediaNote.textContent = "Upload images from your phone, including lunch menus. Select the current menu and choose Replace image to keep its existing rotation and schedule. Uploads are resized to 2048 pixels and stored in the private content repository. Existing local images show placeholders. Wait for Applied on Pi, then Reload content before the next media edit.";
    document.getElementById("mediaUploadDropzone").closest("section.admin-card").prepend(mediaNote);
    document.getElementById("previewCustomPage").disabled = true;
    document.getElementById("previewDojoImage").disabled = true;
    document.getElementById("previewDojoImage").title = "Image previews and photos stay on the Pi";
    var celebrationNote = document.createElement("p"); celebrationNote.className = "remote-section-note";
    celebrationNote.textContent = "Edit names, awards and dates here. Existing photos are preserved on the Pi. Save the assembly and wait for it to apply before scheduling its ClassDojo post.";
    document.getElementById("tabContentAssembly").prepend(celebrationNote);
    var dojoNote = document.createElement("p"); dojoNote.id = "remoteDojoStatus"; dojoNote.className = "remote-section-note";
    document.getElementById("tabContentClassDojo").prepend(dojoNote);
  }
  window.DashboardRemote = { enabled: remote, ready: ready, api: api, resourceFor: resourceFor, prepareImage: prepareImage };
  if (remote) { initialiseRemote(); }
})();
