(function () {
  var state = {
    builtInPages: [],
    defaults: {
      pageDurationSeconds: 10,
      imageDurationSeconds: 8,
      transitionSeconds: 1.8,
    },
    rotationItems: [],
    media: [],
    customPages: [],
    pageThemes: [],
    themeElementOptions: [],
    selectedRotationId: "",
    selectedMediaId: "",
    selectedMediaIds: [],
    mediaPage: 1,
    mediaPageSize: 24,
    selectedPageId: "",
    notices: { message: "", notes: [] },
    tickers: [],
    selectedTickerId: "",
    overlays: [],
    selectedOverlayId: "",
    celebrationChildren: [],
    celebrationAssemblyDate: "",
    _committedAssemblyDate: "",
    celebrationCurrent: null,
    celebrationUpcoming: null,
    _editingCurrent: false,
    classList: [],
    classYearGroupMap: {},
    classPhaseMap: {},
    classOrder: [],
    classOrderMeta: {},
    arborClasses: [],
    dojoClasses: [],
    classYearGroupOptions: [],
    attendanceMessages: [],
    pupilNames: [],
    tvPowerSchedule: { enabled: false, rules: [], timezone: "Europe/London" },
    tvPowerHistory: [],
    schoolValues: [],
    classDojoEvents: { updated: "", summary: {}, groups: [], classes: { updated: "", count: 0, classes: [] } },
    classDojoAuth: { needs_code: false, message: "", error_code: "", fallback_message: "", updated: "" },
    selectedClassDojoGroupIds: [],
    dashboardHealth: null,
  };
  var mediaAutosaveTimer = null;
  var pupilAutocomplete = { input: null, options: [], selectedIndex: 0 };
  var _expandedTvRuleIds = {};
  var ADMIN_TAB_STORAGE_KEY = "dashboard.admin.activeTab";
  var ROTATION_SELECTION_STORAGE_KEY = "dashboard.admin.selectedRotationId";
  var OVERLAY_TYPE_DEFAULT_TITLES = {
    emergency: "Important Notice",
    info: "Information",
    success: "Success",
    reminder: "Reminder",
  };
  var OVERLAY_TYPE_ICONS = {
    emergency: "🚨",
    info: "ℹ️",
    success: "✅",
    reminder: "🔔",
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function confirmDelete(message, onConfirm) {
    if (window.confirm(message)) {
      onConfirm();
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  var contentVersions = {};
  function api(url, options) {
    var requestOptions = options || {};
    if (window.DashboardRemote && window.DashboardRemote.enabled) {
      return window.DashboardRemote.api(url, requestOptions);
    }
    if (!requestOptions.method) {
      requestOptions.method = "GET";
    }
    if (!Object.prototype.hasOwnProperty.call(requestOptions, "cache")) {
      requestOptions.cache = "no-store";
    }
    if (!requestOptions.headers && !(requestOptions.body instanceof FormData)) {
      requestOptions.headers = { "Content-Type": "application/json" };
    }
    var resource = window.DashboardRemote ? window.DashboardRemote.resourceFor(url) : null;
    if (resource && contentVersions[resource] && requestOptions.method !== "GET") {
      requestOptions.headers = Object.assign({}, requestOptions.headers || {}, { "X-Admin-Version": contentVersions[resource] });
    }
    return fetch(url, requestOptions).then(function (response) {
      var revision = response.headers.get("X-Admin-Version");
      if (resource && revision && response.ok) { contentVersions[resource] = revision; }
      return response.text().then(function (text) {
        var data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (_) {
            data = {};
          }
        }
        if (!response.ok) {
          var error = new Error(data.error || data.message || "Request failed");
          error.payload = data;
          throw error;
        }
        if (data.contentVersions) { contentVersions = Object.assign(contentVersions, data.contentVersions); }
        return data;
      });
    });
  }

  function flash(message, type) {
    var el = byId("adminStatus");
    el.textContent = window.DashboardRemote && window.DashboardRemote.enabled && type !== "error"
      ? message.replace(/saved\.|updated\.|created\./gi, "saved to GitHub. Waiting for Pi.") : message;
    el.className = "status-banner is-visible status-banner--" + (type || "success");
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(function () {
      el.className = "status-banner";
      el.textContent = "";
    }, 3500);
  }

  function builtInByKey(key) {
    for (var i = 0; i < state.builtInPages.length; i += 1) {
      if (state.builtInPages[i].key === key) {
        return state.builtInPages[i];
      }
    }
    return null;
  }

  function mediaById(mediaId) {
    for (var i = 0; i < state.media.length; i += 1) {
      if (state.media[i].id === mediaId) {
        return state.media[i];
      }
    }
    return null;
  }

  function isVideoMedia(media) {
    return !!(media && ((media.kind || "") === "video" || String(media.mimeType || "").indexOf("video/") === 0));
  }

  function mediaKindLabel(media) {
    return isVideoMedia(media) ? "Video" : "Photo";
  }

  function mediaKindBadgeHtml(media) {
    var kind = isVideoMedia(media) ? "video" : "photo";
    return '<span class="media-kind-badge media-kind-badge--' + kind + '">' + mediaKindLabel(media) + "</span>";
  }

  function mediaKindBadgeNode(media) {
    var badge = document.createElement("span");
    badge.className = "media-kind-badge media-kind-badge--" + (isVideoMedia(media) ? "video" : "photo");
    badge.textContent = mediaKindLabel(media);
    return badge;
  }

  function rotationTypeLabel(type) {
    if (type === "built_in_page" || type === "custom_page") {
      return "Template";
    }
    if (type === "image") {
      return "Media";
    }
    if (type === "picture_page") {
      return "Media grid";
    }
    return String(type || "Item").replace("_", " ");
  }

  function pageById(pageId) {
    for (var i = 0; i < state.customPages.length; i += 1) {
      if (state.customPages[i].id === pageId) {
        return state.customPages[i];
      }
    }
    return null;
  }

  function sortRotation() {
    state.rotationItems.sort(function (a, b) {
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  }

  function rememberRotationSelection(itemId) {
    try {
      if (itemId) {
        window.sessionStorage.setItem(ROTATION_SELECTION_STORAGE_KEY, itemId);
      } else {
        window.sessionStorage.removeItem(ROTATION_SELECTION_STORAGE_KEY);
      }
    } catch (_) {}
  }

  function recalledRotationSelection() {
    try {
      return window.sessionStorage.getItem(ROTATION_SELECTION_STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function rotationItemExists(itemId) {
    return state.rotationItems.some(function (item) {
      return item.id === itemId;
    });
  }

  function syncRotationSortOrder() {
    state.rotationItems.forEach(function (item, index) {
      item.sortOrder = (index + 1) * 10;
    });
  }

  function previewUrlForItem(item) {
    function appendThemeParams(url, page) {
      var theme = page ? resolveThemeFromSelection(page.themeKey, page.themeElements) : null;
      if (!theme) {
        return url;
      }
      var joiner = url.indexOf("?") === -1 ? "?" : "&";
      return url + joiner + "themeKey=" + encodeURIComponent(theme.key) +
        "&themeLabel=" + encodeURIComponent(theme.label || theme.key) +
        "&themeBrand=" + encodeURIComponent(theme.brand) +
        "&themeElements=" + encodeURIComponent(theme.elements.join(","));
    }
    if (item.type === "built_in_page") {
      var builtIn = builtInByKey((item.config || {}).pageKey);
      var baseUrl = builtIn ? builtIn.url : "/pages/notices.html";
      // Append custom countdown params if set
      if (builtIn && builtIn.key === "countdown" && (item.config || {}).countdownDate) {
        var params = "?date=" + encodeURIComponent(item.config.countdownDate);
        if (item.config.countdownLabel) {
          params += "&label=" + encodeURIComponent(item.config.countdownLabel);
        }
        return appendThemeParams(baseUrl + params, builtIn);
      }
      return appendThemeParams(baseUrl, builtIn);
    }
    if (item.type === "custom_page") {
      return "/pages/custom-page.html?page=" + encodeURIComponent((item.config || {}).pageId || "");
    }
    if (item.type === "image") {
      return "/pages/image-item.html?item=" + encodeURIComponent(item.id);
    }
    if (item.type === "picture_page") {
      return "/pages/picture-page.html?item=" + encodeURIComponent(item.id);
    }
    return "/player";
  }

  function formatScheduleDetail(schedule) {
    if (!schedule) {
      return "Always on";
    }
    var dayAbbr = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
    var days = (schedule.daysOfWeek || []).map(function (d) { return dayAbbr[d] || d; });
    var dayStr = "";
    if (days.length > 0 && days.length < 7) {
      var weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      var weekend = ["Sat", "Sun"];
      var hasAllWeekdays = weekdays.every(function (d) { return days.indexOf(d) !== -1; });
      var noWeekend = weekend.every(function (d) { return days.indexOf(d) === -1; });
      dayStr = (hasAllWeekdays && noWeekend && days.length === 5) ? "Mon-Fri" : days.join(", ");
    } else if (days.length === 7) {
      dayStr = "Every day";
    }
    var range = (schedule.timeRanges || [])[0] || {};
    var timeStr = (range.start && range.end) ? (range.start + "-" + range.end) : "";
    var dateStr = "";
    if (schedule.startDate && schedule.endDate) {
      dateStr = schedule.startDate + " to " + schedule.endDate;
    } else if (schedule.startDate) {
      dateStr = "from " + schedule.startDate;
    } else if (schedule.endDate) {
      dateStr = "until " + schedule.endDate;
    }
    return [dayStr, timeStr, dateStr].filter(Boolean).join(" ") || "Scheduled";
  }

  function scheduleSummary(item) {
    var schedule = (item && item.schedule) || {};
    var start = schedule.startDate || "";
    var end = schedule.endDate || "";
    if (!start && !end) {
      return "Always visible";
    }
    if (start && end) {
      return "Visible " + start + " to " + end;
    }
    if (start) {
      return "Visible from " + start;
    }
    return "Visible until " + end;
  }

  function itemSubtitle(item) {
    var config = item.config || {};
    if (item.type === "built_in_page") {
      var builtIn = builtInByKey(config.pageKey);
      return (builtIn ? builtIn.title : config.pageKey) + " • " + scheduleSummary(item);
    }
    if (item.type === "custom_page") {
      var page = pageById(config.pageId);
      return (page ? page.title : "Template not set") + " • " + scheduleSummary(item);
    }
    if (item.type === "image") {
      var media = mediaById(config.mediaId);
      return (media ? media.title : "Media not set") + " • " + scheduleSummary(item);
    }
    if (item.type === "picture_page") {
      return (config.mediaIds || []).length + " media items in pool • " + scheduleSummary(item);
    }
    return scheduleSummary(item);
  }

  function defaultRotationItem(type) {
    var nowId = uid("item");
    var builtIn = state.builtInPages[0] || { key: "notices", title: "Notices and Welcome", defaultDurationSeconds: state.defaults.pageDurationSeconds };
    var firstPage = state.customPages[0];
    var firstMedia = state.media[0];
    var mediaIds = state.media.slice(0, 4).map(function (item) { return item.id; });
    var item = {
      id: nowId,
      type: type,
      title: "",
      enabled: true,
      durationSeconds: type === "image" || type === "picture_page" ? state.defaults.imageDurationSeconds : state.defaults.pageDurationSeconds,
      transitionSeconds: state.defaults.transitionSeconds,
      schedule: { startDate: "", endDate: "", daysOfWeek: [], timeRanges: [] },
      config: {},
    };

    if (type === "built_in_page") {
      item.title = builtIn.title;
      item.config = { pageKey: builtIn.key, validityMode: builtIn.validityMode || "always" };
    } else if (type === "custom_page") {
      item.title = firstPage ? firstPage.title : "Template";
      item.config = { pageId: firstPage ? firstPage.id : "" };
    } else if (type === "image") {
      item.title = firstMedia ? firstMedia.title : "Media item";
      item.config = { mediaId: firstMedia ? firstMedia.id : "" };
    } else if (type === "picture_page") {
      item.title = "Media grid";
      item.config = { mediaIds: mediaIds, displayCount: Math.max(1, Math.min(4, mediaIds.length || 4)) };
    }

    return item;
  }

  function loadBootstrap() {
    function resilient(p) { return p.catch(function () { return {}; }); }
    return Promise.all([
      api("/api/admin/bootstrap"),
      api("/api/notices"),
      api("/api/tickers"),
      api("/api/overlays"),
      api("/api/celebration-children"),
      resilient(api("/api/attendance")),
      resilient(api("/api/class-order")),
      resilient(api("/api/class-attendance")),
      resilient(api("/api/classdojo/events/admin")),
      resilient(api("/api/classdojo/auth-status")),
      resilient(api("/api/health")),
      resilient(api("/api/pupil-names")),
    ]).then(function (payload) {
      var bootstrap = payload[0];
      state.builtInPages = (bootstrap.builtInPages || []).map(function (p) {
        return Object.assign({}, p, {
          _defaultTitle: p.defaultTitle || p.title,
          _customTitle: p.customTitle || null,
        });
      });
      state.pageThemes = bootstrap.pageThemes || [];
      state.themeElementOptions = bootstrap.themeElementOptions || [];
      state.defaults = bootstrap.defaults || state.defaults;
      state.rotationItems = (bootstrap.rotation && bootstrap.rotation.items) ? bootstrap.rotation.items : [];
      state.media = bootstrap.media || [];
      state.customPages = bootstrap.customPages || [];
      state.tvPowerSchedule = bootstrap.tvPowerSchedule || state.tvPowerSchedule;
      state.tvPowerHistory = (bootstrap.tvPowerHistory && bootstrap.tvPowerHistory.entries) ? bootstrap.tvPowerHistory.entries : [];
      state.notices = payload[1] || state.notices;
      state.tickers = ((payload[2] && payload[2].tickers) ? payload[2].tickers : []).map(normaliseTicker);
      state.overlays = ((payload[3] && payload[3].overlays) ? payload[3].overlays : []).map(normaliseOverlay);
      state.schoolValues = bootstrap.schoolValues || [];
      state.classDojoEvents = payload[8] || state.classDojoEvents;
      state.classDojoAuth = payload[9] || state.classDojoAuth;
      state.dashboardHealth = payload[10] || state.dashboardHealth;
      state.pupilNames = (payload[11] && payload[11].pupils) ? payload[11].pupils : [];
      var celebPayload = payload[4] || {};
      var _celebCur = celebPayload.current || null;
      var _celebUpc = celebPayload.upcoming || null;
      state.currentAssembly = (_celebCur && (_celebCur.assembly_date || (_celebCur.children || []).length))
        ? { assembly_date: _celebCur.assembly_date || "", children: (_celebCur.children || []).map(_hydrateChild), _editingDate: false }
        : null;
      state.upcomingAssembly = (_celebUpc && _celebUpc.assembly_date)
        ? { assembly_date: _celebUpc.assembly_date, children: (_celebUpc.children || []).map(_hydrateChild), classdojo_post_id: _celebUpc.classdojo_post_id || null, _editingDate: false }
        : null;
      state.attendanceMessages = payload[5] && payload[5].attendance_messages ? payload[5].attendance_messages : [];
      state.classOrder = (payload[6] && payload[6].order) || [];
      state.classOrderMeta = (payload[6] && payload[6].meta) ? payload[6].meta : {};
      state.arborClasses = (payload[6] && payload[6].arborClasses) ? payload[6].arborClasses : [];
      state.dojoClasses = (payload[6] && payload[6].dojoClasses) ? payload[6].dojoClasses : [];
      // Build classList and classYearGroupMap from class-attendance live feed
      var classAttData = payload[7] || {};
      state.classList = (classAttData.classes || []).map(function (c) { return c.name || ""; }).filter(Boolean);
      state.classYearGroupMap = {};
      state.classPhaseMap = {};
      (classAttData.classes || []).forEach(function (c) {
        if (c.name && c.year_group) { state.classYearGroupMap[c.name] = c.year_group; }
        if (c.name && c.phase) { state.classPhaseMap[c.name] = c.phase; }
      });
      Object.keys(state.classOrderMeta || {}).forEach(function (name) {
        var meta = state.classOrderMeta[name] || {};
        if (!name) { return; }
        if (meta.year_group && !state.classYearGroupMap[name]) { state.classYearGroupMap[name] = meta.year_group; }
        if (meta.phase && !state.classPhaseMap[name]) { state.classPhaseMap[name] = meta.phase; }
        if (meta.display_label) {
          if (meta.year_group && !state.classYearGroupMap[meta.display_label]) { state.classYearGroupMap[meta.display_label] = meta.year_group; }
          if (meta.phase && !state.classPhaseMap[meta.display_label]) { state.classPhaseMap[meta.display_label] = meta.phase; }
        }
      });
      if (payload[8] && Array.isArray(payload[8].groups)) {
        state.classDojoEvents = payload[8];
      }
      state.tvPowerSchedule.rules = (state.tvPowerSchedule.rules || []).map(function (rule) {
        return {
          id: rule.id || uid("tv-rule"),
          label: rule.label || "Schedule",
          enabled: rule.enabled !== false,
          onTime: rule.onTime || "",
          offTime: rule.offTime || "",
          days: rule.days || [],
        };
      });

      sortRotation();
      if (!state.selectedRotationId && state.rotationItems.length) {
        var storedRotationId = recalledRotationSelection();
        state.selectedRotationId = rotationItemExists(storedRotationId) ? storedRotationId : state.rotationItems[0].id;
      }
      if (!state.selectedMediaId && state.media.length) {
        state.selectedMediaId = state.media[0].id;
      }
      if (!state.selectedPageId && state.customPages.length) {
        state.selectedPageId = state.customPages[0].id;
      }
      renderAll();
    });
  }

  function persistRotation() {
    syncRotationSortOrder();
    sortRotation();
    return api("/api/rotation", {
      method: "POST",
      body: JSON.stringify({ items: state.rotationItems }),
    }).then(function (payload) {
      state.rotationItems = payload.items || [];
      sortRotation();
      renderRotation();
      flash("Rotation updated.", "success");
      setSaveStatus("saveStatusRotation");
      return payload;
    });
  }

  function renderRotation() {
    sortRotation();
    renderRotationList();
    renderRotationEditor();
  }

  function renderRotationList() {
    var list = byId("rotationList");
    list.innerHTML = "";

    state.rotationItems.forEach(function (item) {
      var row = document.createElement("article");
      row.className = "sortable-item";
      row.draggable = true;
      row.dataset.id = item.id;

      var handle = document.createElement("div");
      handle.className = "drag-handle";
      handle.textContent = "⋮⋮";
      row.appendChild(handle);

      var main = document.createElement("div");
      main.className = "item-main";
      var itemType = String(item.type || "item");
      var itemTypeClass = itemType.replace(/[^a-z0-9_-]/gi, "-");
      main.innerHTML =
        '<div class="item-title-row">' +
        '<span class="item-title">' + escapeText(item.title || "Untitled item") + '</span>' +
        '<span class="badge badge--' + escapeAttribute(itemTypeClass) + '">' + escapeText(rotationTypeLabel(itemType)) + '</span>' +
        '<span class="badge ' + (item.enabled ? "badge--active" : "badge--inactive") + '">' + (item.enabled ? "Enabled" : "Disabled") + '</span>' +
        "</div>" +
        '<div class="item-subtitle">' + escapeText(itemSubtitle(item)) + " • " + escapeText(item.durationSeconds) + "s • fade " + escapeText(item.transitionSeconds) + "s</div>";
      row.appendChild(main);

      var actions = document.createElement("div");
      actions.className = "item-actions";

      var editBtn = document.createElement("button");
      editBtn.className = "btn btn-sm btn-secondary";
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        state.selectedRotationId = item.id;
        rememberRotationSelection(item.id);
        renderRotationEditor();
      });
      actions.appendChild(editBtn);

      var previewBtn = document.createElement("a");
      previewBtn.className = "btn btn-sm btn-ghost";
      previewBtn.href = previewUrlForItem(item);
      previewBtn.target = "_blank";
      previewBtn.rel = "noreferrer";
      previewBtn.textContent = "Preview";
      actions.appendChild(previewBtn);

      var duplicateBtn = document.createElement("button");
      duplicateBtn.className = "btn btn-sm btn-ghost";
      duplicateBtn.type = "button";
      duplicateBtn.textContent = "Duplicate";
      duplicateBtn.addEventListener("click", function () {
        var copy = clone(item);
        copy.id = uid("item");
        copy.title = (item.title || "Item") + " Copy";
        state.rotationItems.push(copy);
        state.selectedRotationId = copy.id;
        persistRotation();
      });
      actions.appendChild(duplicateBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-danger";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", function () {
        confirmDelete("Are you sure you want to delete \"" + (item.title || "this item") + "\"?", function () {
          state.rotationItems = state.rotationItems.filter(function (entry) { return entry.id !== item.id; });
          if (state.selectedRotationId === item.id) {
            state.selectedRotationId = state.rotationItems.length ? state.rotationItems[0].id : "";
          }
          persistRotation();
        });
      });
      actions.appendChild(deleteBtn);

      row.appendChild(actions);

      row.addEventListener("dragstart", function (event) {
        row.classList.add("is-dragging");
        event.dataTransfer.setData("text/plain", item.id);
      });
      row.addEventListener("dragend", function () {
        row.classList.remove("is-dragging");
      });
      row.addEventListener("dragover", function (event) {
        event.preventDefault();
      });
      row.addEventListener("drop", function (event) {
        event.preventDefault();
        var draggedId = event.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === item.id) {
          return;
        }
        var draggedIndex = -1;
        var targetIndex = -1;
        state.rotationItems.forEach(function (entry, index) {
          if (entry.id === draggedId) {
            draggedIndex = index;
          }
          if (entry.id === item.id) {
            targetIndex = index;
          }
        });
        if (draggedIndex === -1 || targetIndex === -1) {
          return;
        }
        var draggedItem = state.rotationItems.splice(draggedIndex, 1)[0];
        state.rotationItems.splice(targetIndex, 0, draggedItem);
        syncRotationSortOrder();
        persistRotation();
      });

      list.appendChild(row);
    });
  }

  function renderRotationSelectors() {
    var builtInSelect = byId("rotationBuiltInPage");
    var customPageSelect = byId("rotationCustomPage");
    var imageSelect = byId("rotationImageMedia");

    builtInSelect.innerHTML = state.builtInPages.map(function (page) {
      return '<option value="' + escapeAttribute(page.key) + '">' + escapeText(page.title) + '</option>';
    }).join("");

    customPageSelect.innerHTML = state.customPages.length
      ? state.customPages.map(function (page) {
          return '<option value="' + escapeAttribute(page.id) + '">' + escapeText(page.title) + '</option>';
        }).join("")
      : '<option value="">Create an editable template first</option>';

    imageSelect.innerHTML = state.media.length
      ? state.media.map(function (media) {
          return '<option value="' + escapeAttribute(media.id) + '">' + escapeText(media.title) + '</option>';
        }).join("")
      : '<option value="">Upload media first</option>';
  }

  function selectedPicturePoolIds() {
    var selected = [];
    byId("rotationPictureMediaList").querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
      if (checkbox.checked) {
        selected.push(checkbox.value);
      }
    });
    return selected;
  }

  function pictureTagList() {
    var tags = {};
    state.media.forEach(function (media) {
      (media.tags || []).forEach(function (tag) {
        var cleaned = (tag || "").trim();
        if (cleaned) {
          tags[cleaned] = true;
        }
      });
    });
    return Object.keys(tags).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function parseTagInput(raw) {
    var dedupe = {};
    var parsed = [];
    String(raw || "")
      .split(",")
      .map(function (tag) { return tag.trim(); })
      .forEach(function (tag) {
        var key = tag.toLowerCase();
        if (tag && !dedupe[key]) {
          dedupe[key] = true;
          parsed.push(tag);
        }
      });
    return parsed;
  }

  function normaliseTicker(ticker) {
    var schedule = (ticker && ticker.schedule) || null;
    var enabled = false;
    if (ticker && ticker.enabled != null) {
      enabled = !!ticker.enabled;
    } else if (schedule) {
      enabled = true;
    } else {
      enabled = !!(ticker && ticker.active);
    }
    return {
      id: (ticker && ticker.id) || uid("ticker"),
      enabled: enabled,
      active: !!(ticker && ticker.active),
      message: (ticker && ticker.message) || "",
      schedule: schedule,
      updated: (ticker && ticker.updated) || "",
    };
  }

  function normaliseOverlay(overlay) {
    var type = (overlay && overlay.overlay_type) || "emergency";
    return {
      id: (overlay && overlay.id) || uid("overlay"),
      enabled: !!(overlay && (overlay.enabled != null ? overlay.enabled : overlay.active)),
      active: !!(overlay && overlay.active),
      overlay_title: (overlay && overlay.overlay_title) || defaultOverlayTitle(type),
      message: (overlay && overlay.message) || "",
      overlay_type: type,
      overlay_icon: (overlay && overlay.overlay_icon) || defaultOverlayIcon(type),
      overlay_logo_url: (overlay && overlay.overlay_logo_url) || "",
      overlay_schedule: (overlay && overlay.overlay_schedule) || null,
      updated: (overlay && overlay.updated) || "",
    };
  }

  function reloadTickers() {
    return api("/api/tickers").then(function (payload) {
      state.tickers = ((payload && payload.tickers) ? payload.tickers : []).map(normaliseTicker);
      if (state.selectedTickerId && !state.tickers.some(function (ticker) { return ticker.id === state.selectedTickerId; })) {
        state.selectedTickerId = "";
      }
      renderTickers();
      return payload;
    });
  }

  function reloadOverlays() {
    return api("/api/overlays").then(function (payload) {
      state.overlays = ((payload && payload.overlays) ? payload.overlays : []).map(normaliseOverlay);
      if (state.selectedOverlayId && !state.overlays.some(function (overlay) { return overlay.id === state.selectedOverlayId; })) {
        state.selectedOverlayId = "";
      }
      renderOverlays();
      return payload;
    });
  }

  function selectedMediaTagList() {
    return parseTagInput(byId("mediaTags").value);
  }

  function selectedBulkTagList() {
    return parseTagInput(byId("mediaBulkTags").value);
  }

  function renderMediaTagPicker() {
    var wrap = byId("mediaTagPicker");
    if (!wrap) {
      return;
    }
    var media = mediaById(state.selectedMediaId);
    wrap.innerHTML = "";
    if (!media) {
      var empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "Select a media item to manage tags.";
      wrap.appendChild(empty);
      return;
    }

    var current = {};
    selectedMediaTagList().forEach(function (tag) {
      current[tag.toLowerCase()] = true;
    });

    var tags = pictureTagList();
    if (!tags.length) {
      var none = document.createElement("span");
      none.className = "muted";
      none.textContent = "No other existing tags yet.";
      wrap.appendChild(none);
      return;
    }

    tags.forEach(function (tag) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "media-tag-chip" + (current[tag.toLowerCase()] ? " is-active" : "");
      chip.setAttribute("data-media-tag-chip", tag);
      chip.textContent = tag;
      wrap.appendChild(chip);
    });
  }

  function toggleMediaTag(tag) {
    var target = String(tag || "").trim();
    if (!target) {
      return;
    }
    var tags = selectedMediaTagList();
    var key = target.toLowerCase();
    var exists = false;
    tags.forEach(function (entry) {
      if (entry.toLowerCase() === key) {
        exists = true;
      }
    });
    if (exists) {
      tags = tags.filter(function (entry) { return entry.toLowerCase() !== key; });
    } else {
      tags.push(target);
    }
    byId("mediaTags").value = tags.join(", ");
    renderMediaTagPicker();
    queueMediaAutosave();
  }

  function renderMediaBulkTagPicker() {
    var wrap = byId("mediaBulkTagPicker");
    if (!wrap) {
      return;
    }
    var current = {};
    selectedBulkTagList().forEach(function (tag) {
      current[tag.toLowerCase()] = true;
    });
    var tags = pictureTagList();
    wrap.innerHTML = "";
    if (!tags.length) {
      var none = document.createElement("span");
      none.className = "muted";
      none.textContent = "No existing tags yet.";
      wrap.appendChild(none);
      return;
    }
    tags.forEach(function (tag) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "media-tag-chip" + (current[tag.toLowerCase()] ? " is-active" : "");
      chip.setAttribute("data-media-bulk-tag-chip", tag);
      chip.textContent = tag;
      wrap.appendChild(chip);
    });
  }

  function toggleMediaBulkTag(tag) {
    var target = String(tag || "").trim();
    if (!target) {
      return;
    }
    var tags = selectedBulkTagList();
    var key = target.toLowerCase();
    var exists = false;
    tags.forEach(function (entry) {
      if (entry.toLowerCase() === key) {
        exists = true;
      }
    });
    if (exists) {
      tags = tags.filter(function (entry) { return entry.toLowerCase() !== key; });
    } else {
      tags.push(target);
    }
    byId("mediaBulkTags").value = tags.join(", ");
    renderMediaBulkTagPicker();
  }

  function updatePicturePoolTagFilter() {
    var select = byId("rotationPictureTagFilter");
    var current = select.value;
    var tags = pictureTagList();
    select.innerHTML = '<option value="">All tags</option>' + tags.map(function (tag) {
      return '<option value="' + tag + '">' + tag + "</option>";
    }).join("");
    if (current && tags.indexOf(current) !== -1) {
      select.value = current;
    }
  }

  function applyPicturePoolTagFilter() {
    var tag = byId("rotationPictureTagFilter").value;
    byId("rotationPictureMediaList").querySelectorAll(".picture-media-card").forEach(function (card) {
      var tags = ((card.getAttribute("data-tags") || "").split(",")).filter(Boolean);
      var show = !tag || tags.indexOf(tag) !== -1;
      card.classList.toggle("is-hidden", !show);
    });
    updatePicturePoolSummary();
  }

  function updatePicturePoolSummary() {
    var selectedCount = selectedPicturePoolIds().length;
    var totalCount = state.media.length;
    var visibleCount = byId("rotationPictureMediaList").querySelectorAll(".picture-media-card:not(.is-hidden)").length;
    byId("rotationPictureSummary").textContent = selectedCount + " selected of " + totalCount + " images (" + visibleCount + " shown)";
  }

  function setPicturePoolSelection(mode) {
    var activeTag = byId("rotationPictureTagFilter").value;
    byId("rotationPictureMediaList").querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
      var card = checkbox.closest(".picture-media-card");
      var cardTags = ((card.getAttribute("data-tags") || "").split(",")).filter(Boolean);
      if (mode === "all") {
        checkbox.checked = true;
      } else if (mode === "none") {
        checkbox.checked = false;
      } else if (mode === "tag") {
        if (activeTag && cardTags.indexOf(activeTag) !== -1) {
          checkbox.checked = true;
        }
      }
      card.classList.toggle("is-selected", !!checkbox.checked);
    });
    updatePicturePoolSummary();
  }

  function renderPictureMediaChecklist(selectedIds) {
    var selected = {};
    (selectedIds || []).forEach(function (id) {
      selected[id] = true;
    });
    var wrap = byId("rotationPictureMediaList");
    wrap.innerHTML = "";
    if (!state.media.length) {
      wrap.innerHTML = '<p class="muted">Upload media first to build a media grid pool.</p>';
      updatePicturePoolTagFilter();
      updatePicturePoolSummary();
      return;
    }

    state.media.forEach(function (media) {
      var tags = (media.tags || []).map(function (tag) {
        return (tag || "").trim();
      }).filter(Boolean);
      var card = document.createElement("article");
      card.className = "picture-media-card" + (selected[media.id] ? " is-selected" : "");
      card.setAttribute("data-media-id", media.id);
      card.setAttribute("data-tags", tags.join(","));

      var thumb = document.createElement("div");
      thumb.className = "picture-media-card__thumb";
      if (isVideoMedia(media)) {
        var vid = document.createElement("video");
        vid.src = media.url;
        vid.muted = true;
        vid.setAttribute("preload", "metadata");
        thumb.appendChild(vid);
      } else {
        var img = document.createElement("img");
        img.src = media.url;
        img.alt = media.title || "Media image";
        thumb.appendChild(img);
      }
      thumb.appendChild(mediaKindBadgeNode(media));

      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = media.id;
      checkbox.className = "picture-media-card__check";
      checkbox.checked = !!selected[media.id];
      thumb.appendChild(checkbox);

      var body = document.createElement("div");
      body.className = "picture-media-card__body";
      var title = document.createElement("div");
      title.className = "picture-media-card__title";
      title.textContent = media.title || "Untitled media";
      body.appendChild(title);

      var tagsWrap = document.createElement("div");
      tagsWrap.className = "picture-media-card__tags";
      if (tags.length) {
        tags.forEach(function (tag) {
          var chip = document.createElement("span");
          chip.className = "picture-media-card__tag";
          chip.textContent = tag;
          tagsWrap.appendChild(chip);
        });
      } else {
        var noTag = document.createElement("span");
        noTag.className = "muted";
        noTag.textContent = "No tags";
        tagsWrap.appendChild(noTag);
      }
      body.appendChild(tagsWrap);

      card.appendChild(thumb);
      card.appendChild(body);
      wrap.appendChild(card);
    });

    updatePicturePoolTagFilter();
    applyPicturePoolTagFilter();
    updatePicturePoolSummary();
  }

  function syncRotationTypeFields() {
    var type = byId("rotationItemType").value;
    byId("rotationBuiltInFields").classList.toggle("hidden", type !== "built_in_page");
    byId("rotationCustomPageFields").classList.toggle("hidden", type !== "custom_page");
    byId("rotationImageFields").classList.toggle("hidden", type !== "image");
    byId("rotationPictureFields").classList.toggle("hidden", type !== "picture_page");
    // Show countdown-specific fields when the countdown template is selected.
    var isCountdown = type === "built_in_page" && byId("rotationBuiltInPage").value === "countdown";
    byId("rotationCountdownFields").classList.toggle("hidden", !isCountdown);
    if (isCountdown) {
      var isCustom = byId("rotationCountdownModeCustom").checked;
      byId("rotationCountdownDateFields").classList.toggle("hidden", !isCustom);
    }
    renderRotationBuiltInThemeControls();
  }

  function renderRotationBuiltInThemeControls() {
    var wrap = byId("rotationBuiltInThemeControls");
    if (!wrap) { return; }
    var type = byId("rotationItemType").value;
    if (type !== "built_in_page") {
      wrap.innerHTML = "";
      return;
    }
    var page = builtInByKey(byId("rotationBuiltInPage").value);
    if (!page) {
      wrap.innerHTML = '<p class="form-hint">Select a template to theme it.</p>';
      return;
    }
    wrap.innerHTML =
      '<div class="form-panel stack">' +
        '<h3>Page theme</h3>' +
        '<p class="form-hint">This theme is saved for ' + escapeText(page.title || page.key) + ' wherever this template appears.</p>' +
        themeControlsHtml("rotation", page) +
      '</div>';
  }

  function saveBuiltInThemeFromRotation(pageKey) {
    var page = builtInByKey(pageKey);
    if (!page) {
      return Promise.resolve();
    }
    var themeSelection = collectThemeSelection("rotation");
    return api("/api/page-settings/" + encodeURIComponent(pageKey), {
      method: "POST",
      body: JSON.stringify({
        title: page._customTitle || "",
        themeKey: themeSelection.themeKey,
        themeElements: themeSelection.themeElements,
      }),
    }).then(function () {
      page.themeKey = themeSelection.themeKey || "";
      page.themeElements = themeSelection.themeElements.length ? themeSelection.themeElements : defaultThemeElements();
    });
  }

  function renderRotationEditor() {
    renderRotationSelectors();
    var item = null;
    for (var i = 0; i < state.rotationItems.length; i += 1) {
      if (state.rotationItems[i].id === state.selectedRotationId) {
        item = state.rotationItems[i];
        break;
      }
    }
    if (!item) {
      item = defaultRotationItem("built_in_page");
      state.selectedRotationId = item.id;
    }

    byId("rotationEditorHeading").textContent = item.title || "Rotation item";
    byId("rotationItemId").value = item.id;
    byId("rotationItemTitle").value = item.title || "";
    byId("rotationItemType").value = item.type || "built_in_page";
    byId("rotationDuration").value = item.durationSeconds || state.defaults.pageDurationSeconds;
    byId("rotationTransition").value = item.transitionSeconds || state.defaults.transitionSeconds;
    byId("rotationEnabled").checked = !!item.enabled;
    syncToggleText("rotationEnabled", "rotationEnabledText", "Enabled", "Disabled");
    byId("rotationStartDate").value = (item.schedule && item.schedule.startDate) || "";
    byId("rotationEndDate").value = (item.schedule && item.schedule.endDate) || "";

    var config = item.config || {};
    byId("rotationBuiltInPage").value = config.pageKey || (state.builtInPages[0] ? state.builtInPages[0].key : "");
    byId("rotationCustomPage").value = config.pageId || "";
    byId("rotationImageMedia").value = config.mediaId || "";
    byId("rotationPictureCount").value = config.displayCount || 4;
    renderPictureMediaChecklist(config.mediaIds || []);
    // Countdown custom date fields
    var hasCustomDate = !!(config.countdownDate);
    byId("rotationCountdownModeCustom").checked = hasCustomDate;
    byId("rotationCountdownModeAuto").checked = !hasCustomDate;
    byId("rotationCountdownDate").value = config.countdownDate || "";
    byId("rotationCountdownLabel").value = config.countdownLabel || "";
    syncRotationTypeFields();
  }

  function saveRotationEditor() {
    var type = byId("rotationItemType").value;
    var itemId = byId("rotationItemId").value || uid("item");
    var item = null;
    for (var i = 0; i < state.rotationItems.length; i += 1) {
      if (state.rotationItems[i].id === itemId) {
        item = state.rotationItems[i];
        break;
      }
    }
    item = item ? clone(item) : defaultRotationItem(type);
    item.id = itemId;
    item.type = type;
    item.enabled = !!byId("rotationEnabled").checked;
    item.durationSeconds = Math.max(1, parseInt(byId("rotationDuration").value, 10) || state.defaults.pageDurationSeconds);
    item.transitionSeconds = Math.max(0.2, parseFloat(byId("rotationTransition").value) || state.defaults.transitionSeconds);
    item.schedule = {
      startDate: byId("rotationStartDate").value,
      endDate: byId("rotationEndDate").value,
      daysOfWeek: [],
      timeRanges: [],
    };

    if (type === "built_in_page") {
      var builtIn = builtInByKey(byId("rotationBuiltInPage").value) || state.builtInPages[0];
      item.title = byId("rotationItemTitle").value || (builtIn ? builtIn.title : "Template");
      var builtInConfig = {
        pageKey: builtIn ? builtIn.key : "",
        validityMode: builtIn ? builtIn.validityMode : "always",
      };
      // Persist countdown custom date settings
      if (builtIn && builtIn.key === "countdown" && byId("rotationCountdownModeCustom").checked) {
        builtInConfig.countdownDate = byId("rotationCountdownDate").value || "";
        builtInConfig.countdownLabel = byId("rotationCountdownLabel").value || "";
      }
      item.config = builtInConfig;
    } else if (type === "custom_page") {
      var page = pageById(byId("rotationCustomPage").value);
      item.title = byId("rotationItemTitle").value || (page ? page.title : "Template");
      item.config = { pageId: page ? page.id : "" };
    } else if (type === "image") {
      var media = mediaById(byId("rotationImageMedia").value);
      item.title = byId("rotationItemTitle").value || (media ? media.title : "Media item");
      item.config = { mediaId: media ? media.id : "" };
    } else if (type === "picture_page") {
      var checked = [];
      byId("rotationPictureMediaList").querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
        if (checkbox.checked) {
          checked.push(checkbox.value);
        }
      });
      item.title = byId("rotationItemTitle").value || "Media grid";
      item.config = {
        displayCount: Math.max(1, parseInt(byId("rotationPictureCount").value, 10) || 4),
        mediaIds: checked,
      };
    }

    var found = false;
    state.rotationItems = state.rotationItems.map(function (entry) {
      if (entry.id === item.id) {
        found = true;
        return item;
      }
      return entry;
    });
    if (!found) {
      state.rotationItems.push(item);
    }
    state.selectedRotationId = item.id;
    rememberRotationSelection(item.id);
    var themeSave = type === "built_in_page" && item.config.pageKey
      ? saveBuiltInThemeFromRotation(item.config.pageKey)
      : Promise.resolve();
    themeSave.then(function () {
      return persistRotation();
    }).catch(function (error) {
      flash("Failed to save theme: " + error.message, "error");
    });
  }

  function clearRotationEditor() {
    state.selectedRotationId = "";
    rememberRotationSelection("");
    renderRotationEditor();
  }

  function addRotationItem(type) {
    var item = defaultRotationItem(type);
    state.rotationItems.push(item);
    state.selectedRotationId = item.id;
    rememberRotationSelection(item.id);
    renderRotation();
  }

  function renderMedia() {
    var grid = byId("mediaGrid");
    grid.innerHTML = "";
    updateMediaTagFilterOptions();
    var validIds = {};
    state.media.forEach(function (media) { validIds[media.id] = true; });
    state.selectedMediaIds = (state.selectedMediaIds || []).filter(function (id) { return !!validIds[id]; });
    var selectedMap = {};
    (state.selectedMediaIds || []).forEach(function (id) { selectedMap[id] = true; });
    var pageItems = paginatedMediaList();
    if (!pageItems.length) {
      grid.innerHTML = '<article class="empty-state"><div class="empty-state-text">No media matches these filters.</div></article>';
    }
    pageItems.forEach(function (media) {
      var card = document.createElement("article");
      card.className = "media-card" + (media.id === state.selectedMediaId ? " is-selected" : "") + (selectedMap[media.id] ? " is-multi-selected" : "");
      card.setAttribute("data-media-id", media.id);
      var preview = isVideoMedia(media)
        ? '<video src="' + escapeAttribute(media.url) + '" muted preload="metadata"></video>'
        : '<img src="' + escapeAttribute(media.url) + '" alt="">';
      card.innerHTML =
        '<input class="media-card__multi-check" type="checkbox" data-media-multi-select="' + escapeAttribute(media.id) + '"' + (selectedMap[media.id] ? " checked" : "") + ">" +
        preview +
        '<div class="media-card__body">' +
        '<strong>' + escapeText(media.title) + '</strong>' +
        '<span class="muted">' + (isVideoMedia(media) ? "Video" : "Image") + " • " + (media.readOnly ? "Imported media" : "Managed upload") + '</span>' +
        "</div>";
      card.addEventListener("click", function (event) {
        if (event.target && event.target.hasAttribute("data-media-multi-select")) {
          return;
        }
        state.selectedMediaId = media.id;
        renderMedia();
      });
      grid.appendChild(card);
    });

    renderMediaPagination();
    syncMediaBulkSelectionState();
    renderMediaEditor();
    renderRotationSelectors();
    renderPictureMediaChecklist(selectedPicturePoolIds());
    renderMediaBulkTagPicker();
  }

  function syncMediaBulkSelectionState() {
    var selectedMap = {};
    (state.selectedMediaIds || []).forEach(function (id) { selectedMap[id] = true; });
    byId("mediaGrid").querySelectorAll(".media-card").forEach(function (card) {
      var mediaId = card.getAttribute("data-media-id");
      card.classList.toggle("is-multi-selected", !!selectedMap[mediaId]);
      var checkbox = card.querySelector('input[data-media-multi-select]');
      if (checkbox) {
        checkbox.checked = !!selectedMap[mediaId];
      }
    });
    var allToggle = byId("selectAllMedia");
    var visibleMedia = paginatedMediaList();
    var visibleIds = {};
    visibleMedia.forEach(function (entry) { visibleIds[entry.id] = true; });
    var visibleSelectedCount = state.selectedMediaIds.filter(function (id) { return !!visibleIds[id]; }).length;
    if (allToggle) {
      allToggle.checked = !!visibleMedia.length && visibleSelectedCount === visibleMedia.length;
      allToggle.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleMedia.length;
      byId("selectAllMediaText").textContent = state.selectedMediaIds.length
        ? (state.selectedMediaIds.length + " selected total")
        : "Select page";
    }
  }

  function updateFocalPreview(media) {
    var preview = byId("focalPreview");
    var image = byId("focalPreviewImage");
    var video = byId("focalPreviewVideo");
    var videoLabel = byId("focalPreviewVideoLabel");
    var marker = byId("focalMarker");
    function placeMarker(x, y) {
      var rect = preview.getBoundingClientRect();
      var iw = image.naturalWidth || 0;
      var ih = image.naturalHeight || 0;
      if (iw > 0 && ih > 0 && rect.width > 0 && rect.height > 0) {
        var scale = Math.min(rect.width / iw, rect.height / ih);
        var rw = iw * scale;
        var rh = ih * scale;
        var ox = (rect.width - rw) / 2;
        var oy = (rect.height - rh) / 2;
        marker.style.left = (ox + (rw * (x / 100))) + "px";
        marker.style.top = (oy + (rh * (y / 100))) + "px";
        return;
      }
      marker.style.left = x + "%";
      marker.style.top = y + "%";
    }
    if (!media) {
      image.removeAttribute("src");
      image.style.display = "";
      if (video) {
        video.removeAttribute("src");
        video.style.display = "none";
      }
      if (videoLabel) { videoLabel.classList.add("hidden"); }
      marker.style.left = "50%";
      marker.style.top = "50%";
      marker.style.display = "none";
      preview.style.cursor = "default";
      return;
    }
    if (isVideoMedia(media)) {
      image.removeAttribute("src");
      image.style.display = "none";
      if (video) {
        video.src = media.url;
        video.style.display = "";
      }
      if (videoLabel) { videoLabel.classList.remove("hidden"); }
      marker.style.left = "50%";
      marker.style.top = "50%";
      marker.style.display = "none";
      preview.style.cursor = "default";
      preview.onclick = null;
      return;
    }
    image.style.display = "";
    if (video) {
      video.removeAttribute("src");
      video.style.display = "none";
    }
    if (videoLabel) { videoLabel.classList.add("hidden"); }
    marker.style.display = "";
    image.src = media.url;
    placeMarker(media.focalPoint.x, media.focalPoint.y);
    marker.style.display = "";
    preview.style.cursor = "crosshair";
    image.onload = function () {
      placeMarker(parseInt(byId("mediaFocalX").value, 10) || 50, parseInt(byId("mediaFocalY").value, 10) || 50);
    };
    window.requestAnimationFrame(function () {
      placeMarker(parseInt(byId("mediaFocalX").value, 10) || 50, parseInt(byId("mediaFocalY").value, 10) || 50);
    });

    preview.onclick = function (event) {
      var rect = preview.getBoundingClientRect();
      var localX = event.clientX - rect.left;
      var localY = event.clientY - rect.top;
      var x = 50;
      var y = 50;
      var iw = image.naturalWidth || 0;
      var ih = image.naturalHeight || 0;
      if (iw > 0 && ih > 0) {
        var scale = Math.min(rect.width / iw, rect.height / ih);
        var rw = iw * scale;
        var rh = ih * scale;
        var ox = (rect.width - rw) / 2;
        var oy = (rect.height - rh) / 2;
        var clampedX = Math.max(ox, Math.min(ox + rw, localX));
        var clampedY = Math.max(oy, Math.min(oy + rh, localY));
        x = Math.round(((clampedX - ox) / rw) * 100);
        y = Math.round(((clampedY - oy) / rh) * 100);
      } else {
        x = Math.max(0, Math.min(100, Math.round((localX / rect.width) * 100)));
        y = Math.max(0, Math.min(100, Math.round((localY / rect.height) * 100)));
      }
      byId("mediaFocalX").value = x;
      byId("mediaFocalY").value = y;
      placeMarker(x, y);
      marker.style.display = "";
      queueMediaAutosave();
    };
  }

  function mediaKindMatches(media, selectedKind) {
    if (!selectedKind) {
      return true;
    }
    return selectedKind === "video" ? isVideoMedia(media) : !isVideoMedia(media);
  }

  function mediaTagMatches(media, selectedTag) {
    if (!selectedTag) {
      return true;
    }
    var tags = media.tags || [];
    for (var i = 0; i < tags.length; i += 1) {
      if (String(tags[i] || "").toLowerCase() === selectedTag.toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  function filteredMediaList() {
    var kindFilter = (byId("mediaKindFilter") && byId("mediaKindFilter").value) || "";
    var tagFilter = (byId("mediaTagFilter") && byId("mediaTagFilter").value) || "";
    return state.media.filter(function (media) {
      return mediaKindMatches(media, kindFilter) && mediaTagMatches(media, tagFilter);
    });
  }

  function mediaPageCount() {
    return Math.max(1, Math.ceil(filteredMediaList().length / state.mediaPageSize));
  }

  function clampMediaPage() {
    var pageCount = mediaPageCount();
    state.mediaPage = Math.max(1, Math.min(pageCount, parseInt(state.mediaPage, 10) || 1));
    return pageCount;
  }

  function paginatedMediaList() {
    var all = filteredMediaList();
    var pageCount = clampMediaPage();
    var page = Math.max(1, Math.min(pageCount, state.mediaPage));
    var start = (page - 1) * state.mediaPageSize;
    return all.slice(start, start + state.mediaPageSize);
  }

  function renderMediaPagination() {
    var wrap = byId("mediaPagination");
    if (!wrap) {
      return;
    }
    var total = filteredMediaList().length;
    var pageCount = clampMediaPage();
    var start = total ? ((state.mediaPage - 1) * state.mediaPageSize) + 1 : 0;
    var end = Math.min(total, state.mediaPage * state.mediaPageSize);
    wrap.innerHTML =
      '<button class="btn btn-ghost btn-sm" type="button" data-media-page="prev"' + (state.mediaPage <= 1 ? " disabled" : "") + '>Previous</button>' +
      '<span class="media-pagination__summary">' + escapeText(start + "-" + end + " of " + total + " media items") + '</span>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-media-page="next"' + (state.mediaPage >= pageCount ? " disabled" : "") + '>Next</button>';
  }

  function resetMediaPage() {
    state.mediaPage = 1;
  }

  function updateMediaTagFilterOptions() {
    var select = byId("mediaTagFilter");
    if (!select) {
      return;
    }
    var current = select.value;
    var tags = pictureTagList();
    select.innerHTML = '<option value="">All tags</option>' + tags.map(function (tag) {
      return '<option value="' + escapeAttribute(tag) + '">' + escapeText(tag) + "</option>";
    }).join("");
    if (current && tags.indexOf(current) !== -1) {
      select.value = current;
    }
  }

  function renderMediaEditor() {
    var media = mediaById(state.selectedMediaId);
    byId("mediaEditorHeading").textContent = media ? media.title : "Media item";
    byId("mediaTitle").value = media ? media.title : "";
    byId("mediaTags").value = media ? (media.tags || []).join(", ") : "";
    byId("mediaFocalX").value = media ? (media.focalPoint.x || 50) : 50;
    byId("mediaFocalY").value = media ? (media.focalPoint.y || 50) : 50;
    var disableFocal = !media || isVideoMedia(media);
    byId("mediaFocalX").disabled = disableFocal;
    byId("mediaFocalY").disabled = disableFocal;
    byId("deleteMediaItem").disabled = !media || !!media.readOnly;
    updateFocalPreview(media);
    renderMediaTagPicker();
  }

  function queueMediaAutosave() {
    if (!state.selectedMediaId) {
      return;
    }
    window.clearTimeout(mediaAutosaveTimer);
    mediaAutosaveTimer = window.setTimeout(function () {
      saveSelectedMedia(true);
    }, 350);
  }

  function saveSelectedMedia(silent) {
    var media = mediaById(state.selectedMediaId);
    if (!media) {
      if (!silent) {
        flash("Select a media item first.", "error");
      }
      return;
    }
    api("/api/media-library/" + encodeURIComponent(media.id), {
      method: "POST",
      body: JSON.stringify({
        title: byId("mediaTitle").value,
        tags: parseTagInput(byId("mediaTags").value),
        focalPoint: {
          x: parseInt(byId("mediaFocalX").value, 10) || 50,
          y: parseInt(byId("mediaFocalY").value, 10) || 50,
        },
      }),
    }).then(function (updated) {
      state.media = state.media.map(function (entry) {
        return entry.id === updated.id ? updated : entry;
      });
      setSaveStatus("saveStatusMedia");
      renderMedia();
      renderBuilderPreview();
      if (!silent) {
        flash("Media updated.", "success");
      }
    }).catch(function (error) {
      if (!silent) {
        flash(error.message, "error");
      }
    });
  }

  function deleteSelectedMedia() {
    // If multiple items are selected, delete all of them; otherwise delete the single selected item
    var idsToDelete = state.selectedMediaIds.filter(function (id) {
      var m = mediaById(id);
      return m && !m.readOnly;
    });
    if (!idsToDelete.length) {
      var single = mediaById(state.selectedMediaId);
      if (single && !single.readOnly) {
        idsToDelete = [single.id];
      }
    }
    if (!idsToDelete.length) { return; }
    var msg = idsToDelete.length === 1
      ? "Are you sure you want to delete \"" + ((mediaById(idsToDelete[0]) || {}).title || "this item") + "\"?"
      : "Are you sure you want to delete " + idsToDelete.length + " selected media items?";
    confirmDelete(msg, function () {
      var promises = idsToDelete.map(function (id) {
        return api("/api/media-library/" + encodeURIComponent(id), { method: "DELETE" });
      });
      Promise.all(promises).then(function () {
        var deletedSet = {};
        idsToDelete.forEach(function (id) { deletedSet[id] = true; });
        state.media = state.media.filter(function (entry) { return !deletedSet[entry.id]; });
        state.selectedMediaIds = state.selectedMediaIds.filter(function (id) { return !deletedSet[id]; });
        if (deletedSet[state.selectedMediaId]) {
          state.selectedMediaId = state.media.length ? state.media[0].id : "";
        }
        renderMedia();
        renderRotation();
        renderPageBuilder();
        flash(idsToDelete.length === 1 ? "Media deleted." : idsToDelete.length + " items deleted.", "success");
      }).catch(function (error) {
        flash(error.message, "error");
      });
    });
  }

  function applyBulkTagsToSelectedMedia() {
    if (!state.selectedMediaIds.length) {
      flash("Select one or more media items first.", "error");
      return;
    }
    var tags = selectedBulkTagList();
    if (!tags.length) {
      flash("Enter or choose at least one tag to add.", "error");
      return;
    }
    api("/api/media-library/bulk-tags", {
      method: "POST",
      body: JSON.stringify({
        mediaIds: state.selectedMediaIds.slice(),
        tags: tags,
      }),
    }).then(function (payload) {
      var updated = payload.updated || [];
      var byIdMap = {};
      updated.forEach(function (entry) {
        byIdMap[entry.id] = entry;
      });
      state.media = state.media.map(function (entry) {
        return byIdMap[entry.id] || entry;
      });
      setSaveStatus("saveStatusMedia");
      renderMedia();
      renderPageBuilder();
      flash("Tags added to selected media.", "success");
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function uploadMedia(files) {
    if (!files.length) {
      return;
    }
    var form = new FormData();
    Array.prototype.forEach.call(files, function (file) {
      form.append("media", file);
    });
    api("/api/media-library/upload", {
      method: "POST",
      body: form,
    }).then(function (payload) {
      state.media = state.media.concat(payload.items || []);
      if (!state.selectedMediaId && state.media.length) {
        state.selectedMediaId = state.media[0].id;
      }
      renderMedia();
      renderRotation();
      renderPageBuilder();
      flash("Media uploaded.", "success");
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function hasFilePayload(event) {
    var transfer = event && event.dataTransfer;
    if (!transfer) {
      return false;
    }
    if (!transfer.types) {
      return true;
    }
    for (var i = 0; i < transfer.types.length; i += 1) {
      if (transfer.types[i] === "Files") {
        return true;
      }
    }
    return false;
  }

  function bindUploadDropzone(dropzone, onFiles, options) {
    if (!dropzone || typeof onFiles !== "function") {
      return;
    }
    if (dropzone.dataset.uploadDropzoneBound === "1") {
      return;
    }
    dropzone.dataset.uploadDropzoneBound = "1";

    var uploadInput = options && options.input ? options.input : null;
    var ignoreClickSelector = options && options.ignoreClickSelector ? options.ignoreClickSelector : "";
    var dragDepth = 0;

    function setDragState(active) {
      dropzone.classList.toggle("is-drag-over", !!active);
    }

    dropzone.addEventListener("dragenter", function (event) {
      if (!hasFilePayload(event)) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      setDragState(true);
    });

    dropzone.addEventListener("dragover", function (event) {
      if (!hasFilePayload(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setDragState(true);
    });

    dropzone.addEventListener("dragleave", function (event) {
      if (!hasFilePayload(event)) {
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) {
        setDragState(false);
      }
    });

    dropzone.addEventListener("drop", function (event) {
      if (!hasFilePayload(event)) {
        return;
      }
      event.preventDefault();
      dragDepth = 0;
      setDragState(false);
      var files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [];
      if (files.length) {
        onFiles(files);
      }
    });

    if (uploadInput) {
      dropzone.addEventListener("click", function (event) {
        if (ignoreClickSelector && event.target.closest(ignoreClickSelector)) {
          return;
        }
        uploadInput.click();
      });
      dropzone.addEventListener("keydown", function (event) {
        if (ignoreClickSelector && event.target.closest(ignoreClickSelector)) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        uploadInput.click();
      });
    }
  }

  function blankPage() {
    return {
      id: uid("page"),
      title: "New Page",
      rows: [],
      themeKey: "",
      themeElements: ["banner_border", "panel_headings", "image_borders"],
    };
  }

  function selectedPage() {
    return pageById(state.selectedPageId);
  }

  function columnCount(layout) {
    if (layout === "2" || layout === "2/3-1/3" || layout === "1/3-2/3") return 2;
    if (layout === "3") return 3;
    if (layout === "4") return 4;
    return 1;
  }

  function blankCard(type) {
    var cardType = type || "text";
    return {
      id: uid("card"),
      type: cardType,
      title: "",
      content: "",
      mediaId: "",
      secondaryContent: "",
      statValue: "",
      statLabel: "",
      frameEnabled: cardType === "staff_profile",
      frameShape: cardType === "staff_profile" ? "wobble-circle" : "circle",
    };
  }

  var DEFAULT_THEME_ELEMENT_OPTIONS = [
    { key: "banner_border", label: "Banner border" },
    { key: "panel_headings", label: "Panel headings" },
    { key: "image_borders", label: "Image borders" },
  ];

  function themeElementOptions() {
    return state.themeElementOptions && state.themeElementOptions.length ? state.themeElementOptions : DEFAULT_THEME_ELEMENT_OPTIONS;
  }

  function themeByKey(key) {
    for (var i = 0; i < state.pageThemes.length; i += 1) {
      if ((state.pageThemes[i].key || "") === key) {
        return state.pageThemes[i];
      }
    }
    return null;
  }

  function themeBrandForKey(key) {
    var theme = themeByKey(key);
    return theme && theme.brand ? theme.brand : "";
  }

  function themeSwatchHtml(prefix, selectedKey) {
    var brand = themeBrandForKey(selectedKey);
    var swatchClass = "theme-colour-preview__swatch" + (brand ? "" : " is-default");
    var style = brand ? ' style="--theme-preview-colour:' + escapeAttribute(brand) + '"' : "";
    var label = brand ? "Colour" : "Default";
    return '<span class="theme-colour-preview" data-theme-preview="' + escapeAttribute(prefix) + '">' +
      '<span class="' + swatchClass + '" data-theme-swatch="' + escapeAttribute(prefix) + '"' + style + '></span>' +
      '<span data-theme-preview-label="' + escapeAttribute(prefix) + '">' + label + "</span>" +
      "</span>";
  }

  function updateThemeSwatch(prefix) {
    var select = document.querySelector('select[data-' + prefix + '-theme-key="1"]');
    var swatch = document.querySelector('[data-theme-swatch="' + prefix + '"]');
    var label = document.querySelector('[data-theme-preview-label="' + prefix + '"]');
    if (!select || !swatch) {
      return;
    }
    var brand = themeBrandForKey(select.value);
    if (brand) {
      swatch.style.setProperty("--theme-preview-colour", brand);
      swatch.classList.remove("is-default");
      if (label) { label.textContent = "Colour"; }
    } else {
      swatch.style.removeProperty("--theme-preview-colour");
      swatch.classList.add("is-default");
      if (label) { label.textContent = "Default"; }
    }
  }

  function normalisedThemeElements(selected) {
    var values = Array.isArray(selected) ? selected : [];
    var set = {};
    values.forEach(function (value) {
      if (value) {
        set[String(value)] = true;
      }
    });
    return themeElementOptions().map(function (option) {
      return option.key;
    }).filter(function (key) {
      return !!set[key];
    });
  }

  function defaultThemeElements() {
    return themeElementOptions().map(function (option) {
      return option.key;
    });
  }

  function themeSelectHtml(prefix, selectedKey) {
    var opts = ['<option value="">Default</option>'];
    (state.pageThemes || []).forEach(function (theme) {
      opts.push('<option value="' + escapeAttribute(theme.key) + '"' + (theme.key === selectedKey ? " selected" : "") + '>' + escapeText(theme.label || theme.key) + "</option>");
    });
    return '<div class="theme-select-row"><div><label>Theme</label><select data-theme-key-select="1" data-theme-prefix="' + escapeAttribute(prefix) + '" data-' + prefix + '-theme-key="1">' + opts.join("") + "</select></div>" + themeSwatchHtml(prefix, selectedKey) + "</div>";
  }

  function themeCheckboxesHtml(prefix, selectedElements) {
    var selected = {};
    (selectedElements && selectedElements.length ? selectedElements : defaultThemeElements()).forEach(function (key) {
      selected[key] = true;
    });
    return '<div class="theme-element-grid">' + themeElementOptions().map(function (option) {
      return '<label class="theme-element-option"><input type="checkbox" data-' + prefix + '-theme-element="' + option.key + '"' + (selected[option.key] ? " checked" : "") + '> ' + escapeText(option.label) + '</label>';
    }).join("") + "</div>";
  }

  function themeControlsHtml(prefix, page) {
    var themeKey = (page && page.themeKey) || "";
    var themeElements = normalisedThemeElements(page && page.themeElements);
    return '<div class="theme-controls">' +
      themeSelectHtml(prefix, themeKey) +
      '<div><label>Theme elements</label>' +
      themeCheckboxesHtml(prefix, themeElements) +
      '<p class="form-hint">Select which parts of the page should use the theme colour.</p>' +
      "</div></div>";
  }

  function collectThemeSelection(prefix) {
    var themeKeyEl = document.querySelector('select[data-' + prefix + '-theme-key="1"]');
    var themeKey = themeKeyEl ? themeKeyEl.value : "";
    var themeElements = [];
    themeElementOptions().forEach(function (option) {
      var checkbox = document.querySelector('input[data-' + prefix + '-theme-element="' + option.key + '"]');
      if (checkbox && checkbox.checked) {
        themeElements.push(option.key);
      }
    });
    return {
      themeKey: themeKey,
      themeElements: themeElements,
    };
  }

  function resolveThemeFromSelection(themeKey, themeElements) {
    var key = String(themeKey || "").trim();
    if (!key || key === "default") {
      return null;
    }
    var theme = themeByKey(key);
    if (!theme || !theme.brand) {
      return null;
    }
    var elements = normalisedThemeElements(themeElements);
    if (!elements.length) {
      return null;
    }
    return {
      key: key,
      label: theme.label || key,
      brand: theme.brand,
      elements: elements,
    };
  }

  function syncPageColumns(page) {
    (page.rows || []).forEach(function (row) {
      var needed = columnCount(row.layout || "1");
      row.columns = row.columns || [];
      while (row.columns.length < needed) {
        row.columns.push({ id: uid("col"), cards: [] });
      }
      while (row.columns.length > needed) {
        row.columns.pop();
      }
    });
  }

  function escapeAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function escapeText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setSaveStatus(elementId, customText) {
    var el = byId(elementId);
    if (!el) {
      return;
    }
    if (window.DashboardRemote && window.DashboardRemote.enabled && !customText) {
      el.textContent = "Saved to GitHub — check Pi confirmation above.";
      el.classList.add("is-saved");
      return;
    }
    if (customText) {
      el.textContent = customText;
      el.classList.add("is-saved");
      return;
    }
    var now = new Date();
    el.textContent = "Saved at " + now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + ".";
    el.classList.add("is-saved");
  }

  function syncToggleText(inputId, textId, onLabel, offLabel) {
    var input = byId(inputId);
    var text = byId(textId);
    if (!input || !text) {
      return;
    }
    text.textContent = input.checked ? onLabel : offLabel;
  }

  function defaultOverlayIcon(type) {
    return OVERLAY_TYPE_ICONS[type] || OVERLAY_TYPE_ICONS.emergency;
  }

  function defaultOverlayTitle(type) {
    return OVERLAY_TYPE_DEFAULT_TITLES[type] || OVERLAY_TYPE_DEFAULT_TITLES.emergency;
  }

  function setOverlayTypeButtons(activeType, syncIconField) {
    var type = activeType || "emergency";
    byId("overlayTypeInput").value = type;
    document.querySelectorAll("#overlayTypeButtons .type-chip").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-overlay-type") === type);
    });
    if (syncIconField) {
      byId("overlayIconInput").value = defaultOverlayIcon(type);
      var titleInput = byId("overlayTitleInput");
      if (titleInput) {
        var previousType = titleInput.getAttribute("data-overlay-title-type") || "";
        var previousDefault = defaultOverlayTitle(previousType);
        var currentValue = String(titleInput.value || "").trim();
        if (!currentValue || currentValue === previousDefault) {
          titleInput.value = defaultOverlayTitle(type);
        }
        titleInput.setAttribute("data-overlay-title-type", type);
      }
    }
  }

  function normaliseEmoji(value, fallback) {
    var text = String(value || "").trim();
    if (!text || text.indexOf("ðŸ") !== -1 || text.indexOf("â") !== -1) {
      return fallback;
    }
    return text;
  }

  function scheduleType(schedule) {
    if (!schedule) {
      return "none";
    }
    if ((schedule.startDate || schedule.endDate || (schedule.daysOfWeek || []).length || (schedule.timeRanges || []).length)) {
      return "window";
    }
    return "none";
  }

  function defaultScheduleByType(type) {
    if (type === "window") {
      return { startDate: "", endDate: "", daysOfWeek: [], timeRanges: [] };
    }
    return null;
  }

  function renderScheduleEditor(prefix, id, schedule) {
    var type = scheduleType(schedule);
    var activeSchedule = schedule || defaultScheduleByType(type);
    var days = (activeSchedule && activeSchedule.daysOfWeek) || [];
    var range = ((activeSchedule && activeSchedule.timeRanges) || [])[0] || { start: "", end: "" };
    var windowClasses = "schedule-block" + (type === "window" ? "" : " hidden");
    var dayOptions = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(function (day) {
      return '<label><input type="checkbox" value="' + day + '"' + (days.indexOf(day) !== -1 ? " checked" : "") + "> " + day.toUpperCase() + "</label>";
    }).join("");

    return (
      '<div class="schedule-editor">' +
      '<div class="schedule-editor__mode">' +
      '<label>Schedule mode</label>' +
      '<select data-' + prefix + '-schedule-type="' + id + '">' +
      '<option value="none">Always on</option>' +
      '<option value="window"' + (type === "window" ? " selected" : "") + '>Date/time window</option>' +
      "</select>" +
      "</div>" +
      '<div class="' + windowClasses + '" data-' + prefix + '-schedule-window="' + id + '">' +
      '<div class="schedule-block__row">' +
      '<div><label>Start date</label><input type="date" data-' + prefix + '-schedule-start-date="' + id + '" value="' + escapeAttribute((activeSchedule && activeSchedule.startDate) || "") + '"></div>' +
      '<div><label>End date</label><input type="date" data-' + prefix + '-schedule-end-date="' + id + '" value="' + escapeAttribute((activeSchedule && activeSchedule.endDate) || "") + '"></div>' +
      "</div>" +
      "<label>Days</label>" +
      '<div class="day-grid" data-' + prefix + '-schedule-days="' + id + '">' + dayOptions + "</div>" +
      '<div class="schedule-block__row">' +
      '<div><label>Start time</label><input type="time" data-' + prefix + '-schedule-start-time="' + id + '" value="' + escapeAttribute(range.start || "") + '"></div>' +
      '<div><label>End time</label><input type="time" data-' + prefix + '-schedule-end-time="' + id + '" value="' + escapeAttribute(range.end || "") + '"></div>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function collectSchedule(prefix, id) {
    var typeEl = document.querySelector('select[data-' + prefix + '-schedule-type="' + id + '"]');
    if (!typeEl || typeEl.value === "none") {
      return null;
    }
    var days = [];
    document.querySelectorAll('[data-' + prefix + '-schedule-days="' + id + '"] input[type="checkbox"]').forEach(function (checkbox) {
      if (checkbox.checked) {
        days.push(checkbox.value);
      }
    });
    var startTime = document.querySelector('input[data-' + prefix + '-schedule-start-time="' + id + '"]').value || "";
    var endTime = document.querySelector('input[data-' + prefix + '-schedule-end-time="' + id + '"]').value || "";
    var ranges = [];
    if (startTime && endTime) {
      ranges.push({ start: startTime, end: endTime });
    }
    return {
      startDate: document.querySelector('input[data-' + prefix + '-schedule-start-date="' + id + '"]').value || "",
      endDate: document.querySelector('input[data-' + prefix + '-schedule-end-date="' + id + '"]').value || "",
      daysOfWeek: days,
      timeRanges: ranges,
    };
  }

  function toggleScheduleBlocks(prefix, id, type) {
    var windowWrap = document.querySelector('[data-' + prefix + '-schedule-window="' + id + '"]');
    if (!windowWrap) {
      return;
    }
    windowWrap.classList.toggle("hidden", type !== "window");
  }

  function renderCustomPageList() {
    var wrap = byId("customPageList");
    wrap.innerHTML = "";
    state.customPages.forEach(function (page) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "btn " + (page.id === state.selectedPageId ? "btn-primary" : "btn-ghost");
      button.textContent = page.title;
      button.addEventListener("click", function () {
        state.selectedPageId = page.id;
        renderPageBuilder();
      });
      wrap.appendChild(button);
    });
  }

  function renderCardFields(container, card) {
    var html = "";
    var isImageCard = card.type === "image" || card.type === "text_image" || card.type === "staff_profile";
    if (isImageCard) {
      var selectedMedia = card.mediaId ? mediaById(card.mediaId) : null;
      var selectedPreview = "";
      if (selectedMedia) {
        selectedPreview = isVideoMedia(selectedMedia)
          ? '<video src="' + selectedMedia.url + '" muted preload="metadata"></video>'
          : '<img src="' + selectedMedia.url + '" alt="' + escapeAttribute(selectedMedia.title || "Selected media") + '">';
        selectedPreview += mediaKindBadgeHtml(selectedMedia);
      }
      html += '<div><label>' + (card.type === "staff_profile" ? "Photo" : "Media") + '</label>';
      html += '<div class="card-media-select-bar">';
      html += '<span class="card-media-current">' + (selectedPreview || "") + '<span>' + escapeText(selectedMedia ? selectedMedia.title : "No media selected") + "</span></span>";
      html += '<button type="button" class="btn btn-ghost btn-sm" data-open-card-media="' + card.id + '">Choose media</button>';
      html += '<button type="button" class="btn btn-secondary btn-sm" data-close-card-media="' + card.id + '">Close</button>';
      html += "</div>";
      html += '<div class="card-media-picker hidden" data-card-media-picker="' + card.id + '">';
      html += '<label class="card-media-option card-media-option--none">';
      html += '<input type="radio" name="card-media-' + card.id + '" data-card-media-choice="' + card.id + '" value=""' + (!card.mediaId ? " checked" : "") + ">";
      html += '<span class="card-media-option__none">No media</span>';
      html += "</label>";
      state.media.forEach(function (media) {
        var tags = (media.tags || []).join(", ");
        var thumb = isVideoMedia(media)
          ? '<span class="card-media-option__thumb"><video src="' + media.url + '" muted preload="metadata"></video>' + mediaKindBadgeHtml(media) + '</span>'
          : '<span class="card-media-option__thumb"><img src="' + media.url + '" alt="' + escapeAttribute(media.title || "Media image") + '">' + mediaKindBadgeHtml(media) + '</span>';
        html += '<label class="card-media-option' + (card.mediaId === media.id ? " is-selected" : "") + '">';
        html += '<input type="radio" name="card-media-' + card.id + '" data-card-media-choice="' + card.id + '" value="' + media.id + '"' + (card.mediaId === media.id ? " checked" : "") + ">";
        html += thumb;
        html += '<span class="card-media-option__title">' + escapeText(media.title || "Untitled media") + "</span>";
        if (tags) {
          html += '<span class="card-media-option__meta">' + escapeText(tags) + "</span>";
        }
        html += "</label>";
      });
      html += "</div></div>";
      html += '<div class="btn-row"><label class="btn btn-secondary btn-sm" for="card-upload-' + card.id + '">Upload media</label><input id="card-upload-' + card.id + '" data-card-upload="' + card.id + '" type="file" accept="image/*,video/*" hidden></div>';
    }
    if (card.type === "text" || card.type === "text_image") {
      html += '<div><label>Main content</label><textarea data-card-content="' + card.id + '">' + escapeText(card.content) + "</textarea></div>";
      html += '<div><label>Secondary content</label><textarea data-card-secondary="' + card.id + '">' + escapeText(card.secondaryContent) + "</textarea></div>";
    }
    if (card.type === "staff_profile") {
      html += '<div><label>Role lines</label><textarea data-card-content="' + card.id + '" placeholder="Deputy Head\\nPastoral Lead">' + escapeText(card.content) + "</textarea></div>";
    }
    if (card.type === "stat") {
      html += '<div class="field-grid">' +
        '<div><label>Value</label><input type="text" data-card-stat-value="' + card.id + '" value="' + escapeAttribute(card.statValue) + '"></div>' +
        '<div><label>Label</label><input type="text" data-card-stat-label="' + card.id + '" value="' + escapeAttribute(card.statLabel) + '"></div>' +
        "</div>";
    }
    if (isImageCard) {
      html += '<div class="field-grid">' +
        '<div><label>Frame</label><label class="switch-toggle"><input type="checkbox" data-card-frame-enabled="' + card.id + '"' + (card.frameEnabled ? " checked" : "") + '><span class="switch-toggle__slider"></span><span class="switch-toggle__text">' + (card.frameEnabled ? "Framed" : "No frame") + '</span></label></div>' +
        '<div><label>Frame shape</label><select data-card-frame-shape="' + card.id + '">' +
        '<option value="circle"' + ((card.frameShape || "") === "circle" ? " selected" : "") + '>Circle</option>' +
        '<option value="wobble-circle"' + ((card.frameShape || "") === "wobble-circle" ? " selected" : "") + '>Wobbly circle</option>' +
        '<option value="rounded"' + ((card.frameShape || "") === "rounded" ? " selected" : "") + '>Rounded square</option>' +
        '<option value="square"' + ((card.frameShape || "") === "square" ? " selected" : "") + '>Square</option>' +
        "</select></div>" +
        "</div>";
    }
    container.innerHTML = html;
    var mediaOptions = container.querySelectorAll('input[data-card-media-choice="' + card.id + '"]');
    if (mediaOptions.length) {
      mediaOptions.forEach(function (option) {
        var label = option.closest(".card-media-option");
        if (label) {
          label.classList.toggle("is-selected", option.checked);
        }
      });
    }
  }

  function renderBuilderRows(page) {
    var wrap = byId("builderRows");
    wrap.innerHTML = "";
    (page.rows || []).forEach(function (row, colIndexBase) {
      var rowCard = document.createElement("article");
      rowCard.className = "builder-row";

      var top = document.createElement("div");
      top.className = "field-grid";
      top.innerHTML =
        '<div><label>Row layout</label><select data-row-layout="' + row.id + '">' +
        '<option value="1">1 column</option>' +
        '<option value="2">2 columns</option>' +
        '<option value="3">3 columns</option>' +
        '<option value="4">4 columns</option>' +
        '<option value="2/3-1/3">2/3 + 1/3</option>' +
        '<option value="1/3-2/3">1/3 + 2/3</option>' +
        "</select></div>" +
        '<div class="btn-row" style="align-self:end;"><button class="btn btn-danger btn-sm" type="button" data-remove-row="' + row.id + '">Remove row</button></div>';
      rowCard.appendChild(top);
      top.querySelector("select").value = row.layout || "1";

      var columns = document.createElement("div");
      columns.className = "builder-columns";
      columns.style.gridTemplateColumns = (function () {
        if (row.layout === "2/3-1/3") return "minmax(0, 2fr) minmax(0, 1fr)";
        if (row.layout === "1/3-2/3") return "minmax(0, 1fr) minmax(0, 2fr)";
        if (row.layout === "2") return "repeat(2, minmax(0, 1fr))";
        if (row.layout === "3") return "repeat(3, minmax(0, 1fr))";
        if (row.layout === "4") return "repeat(4, minmax(0, 1fr))";
        return "minmax(0, 1fr)";
      })();

      (row.columns || []).forEach(function (column, columnIndex) {
        var col = document.createElement("section");
        col.className = "builder-column";
        var heading = document.createElement("div");
        heading.className = "btn-row";
        heading.innerHTML = '<strong>Column ' + (columnIndex + 1) + '</strong>';
        var addCardBtn = document.createElement("button");
        addCardBtn.className = "btn btn-secondary btn-sm";
        addCardBtn.type = "button";
        addCardBtn.textContent = "Add card";
        addCardBtn.addEventListener("click", function () {
          column.cards.push(blankCard("text"));
          renderPageBuilder();
        });
        heading.appendChild(addCardBtn);
        col.appendChild(heading);

        (column.cards || []).forEach(function (card) {
          var cardEl = document.createElement("article");
          cardEl.className = "builder-card";
          var titleLabel = card.type === "staff_profile" ? "Name" : "Card title";
          var titlePlaceholder = card.type === "staff_profile" ? "Staff member name" : "Card title";
          cardEl.innerHTML =
            '<div class="field-grid">' +
            '<div><label>Card type</label><select data-card-type="' + card.id + '">' +
            '<option value="text">Text</option>' +
            '<option value="image">Image</option>' +
            '<option value="text_image">Text + image</option>' +
            '<option value="staff_profile">Staff profile</option>' +
            '<option value="stat">Stat</option>' +
            '</select></div>' +
            '<div><label>' + titleLabel + '</label><input type="text" data-card-title="' + card.id + '" placeholder="' + escapeAttribute(titlePlaceholder) + '" value="' + escapeAttribute(card.title) + '"></div>' +
            '</div>' +
            '<div class="stack" data-card-fields="' + card.id + '"></div>' +
            '<div class="btn-row"><button class="btn btn-danger btn-sm" type="button" data-remove-card="' + card.id + '">Remove card</button></div>';
          col.appendChild(cardEl);

          var typeSelect = cardEl.querySelector('select[data-card-type="' + card.id + '"]');
          typeSelect.value = card.type || "text";
          var fields = cardEl.querySelector('[data-card-fields="' + card.id + '"]');
          renderCardFields(fields, card);
        });

        columns.appendChild(col);
      });

      rowCard.appendChild(columns);
      wrap.appendChild(rowCard);
    });
  }

  function renderPageBuilder() {
    renderCustomPageList();
    var page = selectedPage();
    if (!page && state.customPages.length) {
      state.selectedPageId = state.customPages[0].id;
      page = selectedPage();
    }
    if (!page) {
      var blank = blankPage();
      state.customPages = [blank];
      state.selectedPageId = blank.id;
      page = blank;
    }
    syncPageColumns(page);
    page.themeKey = page.themeKey || "";
    page.themeElements = normalisedThemeElements(page.themeElements);
    byId("customPageTitleInput").value = page.title || "";
    var themeWrap = byId("customPageThemeControls");
    if (themeWrap) {
      themeWrap.innerHTML = themeControlsHtml("page", page);
    }
    renderBuilderRows(page);
    renderBuilderPreview();
  }

  function renderBuilderPreview() {
    var page = selectedPage();
    if (!page) {
      return;
    }
    var mediaMap = {};
    state.media.forEach(function (media) {
      mediaMap[media.id] = media;
    });
    var previewEl = byId("builderPreview");
    var theme = window.dashboardDisplay.resolvePageTheme ? window.dashboardDisplay.resolvePageTheme(page, state.pageThemes) : null;
    window.dashboardDisplay.applyThemeToRoot(previewEl, theme);
    window.dashboardDisplay.renderStructuredPage(previewEl, page, mediaMap);
  }

  function updateSelectedPageFromBuilder() {
    var page = selectedPage();
    if (!page) {
      return;
    }
    page.title = byId("customPageTitleInput").value || "Untitled page";
    var themeSelection = collectThemeSelection("page");
    page.themeKey = themeSelection.themeKey;
    page.themeElements = themeSelection.themeElements.length ? themeSelection.themeElements : defaultThemeElements();

    (page.rows || []).forEach(function (row) {
      var layoutSelect = document.querySelector('select[data-row-layout="' + row.id + '"]');
      if (layoutSelect) {
        row.layout = layoutSelect.value;
      }
    });
    syncPageColumns(page);

    (page.rows || []).forEach(function (row) {
      (row.columns || []).forEach(function (column) {
        (column.cards || []).forEach(function (card) {
          var titleInput = document.querySelector('input[data-card-title="' + card.id + '"]');
          var typeSelect = document.querySelector('select[data-card-type="' + card.id + '"]');
          if (titleInput) card.title = titleInput.value;
          if (typeSelect) card.type = typeSelect.value;
          var contentInput = document.querySelector('textarea[data-card-content="' + card.id + '"]');
          var secondaryInput = document.querySelector('textarea[data-card-secondary="' + card.id + '"]');
          var selectedMedia = document.querySelector('input[data-card-media-choice="' + card.id + '"]:checked');
          var statValue = document.querySelector('input[data-card-stat-value="' + card.id + '"]');
          var statLabel = document.querySelector('input[data-card-stat-label="' + card.id + '"]');
          var frameEnabled = document.querySelector('input[data-card-frame-enabled="' + card.id + '"]');
          var frameShape = document.querySelector('select[data-card-frame-shape="' + card.id + '"]');
          card.content = contentInput ? contentInput.value : "";
          card.secondaryContent = secondaryInput ? secondaryInput.value : "";
          card.mediaId = selectedMedia ? selectedMedia.value : "";
          card.statValue = statValue ? statValue.value : "";
          card.statLabel = statLabel ? statLabel.value : "";
          if (frameEnabled) {
            card.frameEnabled = !!frameEnabled.checked;
          }
          if (frameShape) {
            card.frameShape = frameShape.value;
          }
          if (card.type === "staff_profile" && card.frameEnabled === undefined) {
            card.frameEnabled = true;
          }
          if (!card.frameShape) {
            card.frameShape = card.type === "staff_profile" ? "wobble-circle" : "circle";
          }
        });
      });
    });
  }

  function saveCustomPage() {
    updateSelectedPageFromBuilder();
    var page = selectedPage();
    api("/api/custom-pages", {
      method: "POST",
      body: JSON.stringify(page),
    }).then(function (saved) {
      var found = false;
      state.customPages = state.customPages.map(function (entry) {
        if (entry.id === saved.id) {
          found = true;
          return saved;
        }
        return entry;
      });
      if (!found) {
        state.customPages.push(saved);
      }
      state.selectedPageId = saved.id;
      renderPageBuilder();
      renderRotation();
      flash("Template saved.", "success");
      setSaveStatus("saveStatusCustomPage");
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function addBuilderRow() {
    var page = selectedPage();
    page.rows.push({
      id: uid("row"),
      layout: "2",
      columns: [{ id: uid("col"), cards: [] }, { id: uid("col"), cards: [] }],
    });
    renderPageBuilder();
  }

  function addCustomPage() {
    var page = blankPage();
    state.customPages.push(page);
    state.selectedPageId = page.id;
    renderPageBuilder();
    renderRotationSelectors();
  }

  function duplicateCustomPage() {
    if (!state.selectedPageId) {
      return;
    }
    api("/api/custom-pages/" + encodeURIComponent(state.selectedPageId) + "/duplicate", {
      method: "POST",
    }).then(function (page) {
      state.customPages.push(page);
      state.selectedPageId = page.id;
      renderPageBuilder();
      renderRotation();
      flash("Template duplicated.", "success");
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function deleteCustomPage() {
    if (!state.selectedPageId) {
      return;
    }
    var page = pageById(state.selectedPageId);
    var pageLabel = page ? '"' + (page.title || "this page") + '"' : "this page";
    confirmDelete("Are you sure you want to delete " + pageLabel + "?", function () {
      api("/api/custom-pages/" + encodeURIComponent(state.selectedPageId), {
        method: "DELETE",
      }).then(function () {
        state.customPages = state.customPages.filter(function (p) { return p.id !== state.selectedPageId; });
        state.selectedPageId = state.customPages.length ? state.customPages[0].id : "";
        renderPageBuilder();
        renderRotation();
        flash("Template deleted.", "success");
      }).catch(function (error) {
        flash(error.message, "error");
      });
    });
  }

  function renderTickers() {
    var wrap = byId("tickerList");
    wrap.innerHTML = "";
    if (!state.tickers.length) {
      wrap.innerHTML = '<article class="repeater-card muted">No ticker messages created yet.</article>';
      renderTickerEditor();
      return;
    }
    state.tickers.forEach(function (ticker) {
      var scheduleText = formatScheduleDetail(ticker.schedule);
      var updated = ticker.updated ? " • Updated " + new Date(ticker.updated).toLocaleString("en-GB") : "";
      var card = document.createElement("article");
      card.className = "multi-card" + (ticker.id === state.selectedTickerId ? " is-active" : "");

      var body = document.createElement("div");
      body.className = "multi-card__body";
      var title = document.createElement("div");
      title.className = "multi-card__title";
      title.textContent = ticker.message || "Untitled ticker";
      var meta = document.createElement("div");
      meta.className = "multi-card__meta";
      meta.textContent = scheduleText + updated;
      body.appendChild(title);
      body.appendChild(meta);

      var badge = document.createElement("div");
      badge.className = "multi-card__badge " + (ticker.active ? "active" : "inactive");
      badge.textContent = ticker.active ? "active" : "inactive";

      var actions = document.createElement("div");
      actions.className = "multi-card__actions";
      var editButton = document.createElement("button");
      editButton.className = "btn btn-sm btn-secondary";
      editButton.type = "button";
      editButton.setAttribute("data-edit-ticker", ticker.id);
      editButton.textContent = "Edit";
      var deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-sm btn-danger";
      deleteButton.type = "button";
      deleteButton.setAttribute("data-remove-ticker", ticker.id);
      deleteButton.textContent = "Delete";
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);

      card.appendChild(body);
      card.appendChild(badge);
      card.appendChild(actions);
      wrap.appendChild(card);
    });
    renderTickerEditor();
  }

  function renderTickerEditor() {
    var selected = null;
    for (var i = 0; i < state.tickers.length; i += 1) {
      if (state.tickers[i].id === state.selectedTickerId) {
        selected = state.tickers[i];
        break;
      }
    }
    if (!selected) {
      selected = { id: "", active: false, message: "", schedule: null };
    }
    byId("tickerEditId").value = selected.id || "";
    byId("tickerMessageInput").value = selected.message || "";
    byId("tickerActiveInput").checked = !!selected.enabled;
    syncToggleText("tickerActiveInput", "tickerActiveText", "Enabled", "Disabled");
    byId("tickerScheduleWrap").innerHTML = renderScheduleEditor("ticker", selected.id || "ticker-draft", selected.schedule || null);
    byId("saveTickers").textContent = selected.id ? "Update Ticker" : "Save Ticker";
  }

  function upsertTickerFromEditor() {
    var tickerId = byId("tickerEditId").value || uid("ticker");
    // Collect schedule using the ID that was used to render the schedule form
    // (new tickers use "ticker-draft"; existing tickers use their real ID)
    var scheduleFormId = byId("tickerEditId").value || "ticker-draft";
    var ticker = {
      id: tickerId,
      message: byId("tickerMessageInput").value,
      enabled: !!byId("tickerActiveInput").checked,
      active: !!byId("tickerActiveInput").checked,
      schedule: collectSchedule("ticker", scheduleFormId),
      updated: new Date().toISOString(),
    };
    var found = false;
    state.tickers = state.tickers.map(function (entry) {
      if (entry.id === ticker.id) {
        found = true;
        return ticker;
      }
      return entry;
    });
    if (!found) {
      state.tickers.push(ticker);
    }
    state.selectedTickerId = ticker.id;
    return found ? "updated" : "created";
  }

  function renderOverlays() {
    var wrap = byId("overlayList");
    wrap.innerHTML = "";
    if (!state.overlays.length) {
      wrap.innerHTML = '<article class="repeater-card muted">No overlays created yet.</article>';
      renderOverlayEditor();
      return;
    }
    state.overlays.forEach(function (overlay) {
      var scheduleText = formatScheduleDetail(overlay.overlay_schedule);
      var updated = overlay.updated ? " • Updated " + new Date(overlay.updated).toLocaleString("en-GB") : "";
      var card = document.createElement("article");
      card.className = "multi-card" + (overlay.id === state.selectedOverlayId ? " is-active" : "");

      var body = document.createElement("div");
      body.className = "multi-card__body";
      var title = document.createElement("div");
      title.className = "multi-card__title";
      title.textContent = overlay.overlay_title || "Untitled overlay";
      var meta = document.createElement("div");
      meta.className = "multi-card__meta";
      meta.textContent = (overlay.overlay_type || "emergency") + " • " + scheduleText + updated;
      body.appendChild(title);
      if (overlay.message) {
        var messagePreview = document.createElement("div");
        messagePreview.className = "multi-card__meta";
        messagePreview.textContent = overlay.message;
        body.appendChild(messagePreview);
      }
      body.appendChild(meta);

      var typeBadge = document.createElement("div");
      typeBadge.className = "multi-card__badge " + (overlay.overlay_type || "emergency");
      typeBadge.textContent = overlay.overlay_type || "emergency";

      var activeBadge = document.createElement("div");
      activeBadge.className = "multi-card__badge " + (overlay.active ? "active" : "inactive");
      activeBadge.textContent = overlay.active ? "active" : "inactive";

      var actions = document.createElement("div");
      actions.className = "multi-card__actions";
      var editButton = document.createElement("button");
      editButton.className = "btn btn-sm btn-secondary";
      editButton.type = "button";
      editButton.setAttribute("data-edit-overlay", overlay.id);
      editButton.textContent = "Edit";
      var deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-sm btn-danger";
      deleteButton.type = "button";
      deleteButton.setAttribute("data-remove-overlay", overlay.id);
      deleteButton.textContent = "Delete";
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);

      card.appendChild(body);
      card.appendChild(typeBadge);
      card.appendChild(activeBadge);
      card.appendChild(actions);
      wrap.appendChild(card);
    });
    renderOverlayEditor();
  }

  function renderOverlayEditor() {
    var selected = null;
    for (var i = 0; i < state.overlays.length; i += 1) {
      if (state.overlays[i].id === state.selectedOverlayId) {
        selected = state.overlays[i];
        break;
      }
    }
    if (!selected) {
      selected = { id: "", active: false, overlay_title: defaultOverlayTitle("emergency"), message: "", overlay_type: "emergency", overlay_icon: defaultOverlayIcon("emergency"), overlay_logo_url: "", overlay_schedule: null };
    }
    byId("overlayEditId").value = selected.id || "";
    byId("overlayTitleInput").value = selected.overlay_title || defaultOverlayTitle(selected.overlay_type || "emergency");
    byId("overlayTitleInput").setAttribute("data-overlay-title-type", selected.overlay_type || "emergency");
    byId("overlayMessageInput").value = selected.message || "";
    setOverlayTypeButtons(selected.overlay_type || "emergency", false);
    byId("overlayIconInput").value = normaliseEmoji(selected.overlay_icon, defaultOverlayIcon(selected.overlay_type || "emergency"));
    byId("overlayActiveInput").checked = !!selected.enabled;
    syncToggleText("overlayActiveInput", "overlayActiveText", "Enabled", "Disabled");
    byId("overlayScheduleWrap").innerHTML = renderScheduleEditor("overlay", selected.id || "overlay-draft", selected.overlay_schedule || null);
    byId("saveOverlays").textContent = selected.id ? "Update Overlay" : "Save Overlay";
  }

  function upsertOverlayFromEditor() {
    var overlayId = byId("overlayEditId").value || uid("overlay");
    // Collect schedule using the ID that was used to render the schedule form
    var scheduleFormId = byId("overlayEditId").value || "overlay-draft";
    var overlay = {
      id: overlayId,
      enabled: !!byId("overlayActiveInput").checked,
      active: !!byId("overlayActiveInput").checked,
      overlay_title: byId("overlayTitleInput").value.trim() || defaultOverlayTitle(byId("overlayTypeInput").value),
      message: byId("overlayMessageInput").value,
      overlay_type: byId("overlayTypeInput").value,
      overlay_icon: normaliseEmoji(byId("overlayIconInput").value, defaultOverlayIcon(byId("overlayTypeInput").value)),
      overlay_logo_url: "",
      overlay_schedule: collectSchedule("overlay", scheduleFormId),
      updated: new Date().toISOString(),
    };
    var found = false;
    state.overlays = state.overlays.map(function (entry) {
      if (entry.id === overlay.id) {
        found = true;
        return overlay;
      }
      return entry;
    });
    if (!found) {
      state.overlays.push(overlay);
    }
    state.selectedOverlayId = overlay.id;
    return found ? "updated" : "created";
  }

  function renderCelebrationValuesBar() {
    var bar = byId("celebrationValuesBar");
    if (!bar) { return; }
    if (!state.schoolValues.length) {
      bar.classList.add("hidden");
      return;
    }
    bar.classList.remove("hidden");
    bar.innerHTML = "";
    var label = document.createElement("span");
    label.className = "celebration-values-bar__label";
    label.textContent = "School values:";
    bar.appendChild(label);
    state.schoolValues.forEach(function (v) {
      var chip = document.createElement("span");
      chip.className = "value-badge";
      chip.innerHTML = '<img src="/values/' + escapeAttribute(v.key) + '.png" alt="" onerror="this.style.display=\'none\'"><span>' + escapeText(v.label) + '</span>';
      bar.appendChild(chip);
    });
  }

  function buildValueSelectorHtml(childId, activeKey) {
    if (!state.schoolValues.length) { return ""; }
    var chips = state.schoolValues.map(function (v) {
      var active = v.key === activeKey ? ' is-active' : '';
      return '<button class="value-chip' + active + '" type="button" data-assign-value="' + escapeAttribute(childId + ':' + v.key) + '">' +
        '<img src="/values/' + escapeAttribute(v.key) + '.png" alt="" onerror="this.style.display=\'none\'">' +
        '<span>' + escapeText(v.label) + '</span></button>';
    }).join("");
    return '<div class="child-value-selector hidden" data-child-value-selector="' + escapeAttribute(childId) + '">' +
      chips +
      '<button class="btn btn-ghost btn-sm" type="button" data-close-value-selector="' + escapeAttribute(childId) + '">Cancel</button>' +
      '</div>';
  }

  function _classOrderIndex(className) {
    var resolvedName = _resolveLinkedClassName(className);
    var order = state.classOrder || [];
    var idx = order.indexOf(resolvedName || "");
    return idx === -1 ? order.length : idx;
  }

  function _resolveLinkedClassName(className) {
    var name = String(className || "").trim();
    if (!name) { return ""; }
    var seen = {};
    while (name && !seen[name]) {
      seen[name] = true;
      var meta = (state.classOrderMeta && state.classOrderMeta[name]) ? state.classOrderMeta[name] : {};
      var linked = String(meta.linked_to || "").trim();
      if (!linked || linked === name) {
        break;
      }
      name = linked;
    }
    return name;
  }

  function _sortChildrenByClassOrder(children) {
    return children.slice().sort(function (a, b) {
      var ai = _classOrderIndex(a.class_name);
      var bi = _classOrderIndex(b.class_name);
      if (ai !== bi) { return ai - bi; }
      return (a.name || "").localeCompare(b.name || "", "en", { sensitivity: "base" });
    });
  }

  function _hydrateChild(c) {
    var resolvedValueKey = _normaliseValueKey(c.value_key || c.value_icon || "");
    return {
      id: c.id || uid("child"),
      name: c.name || "",
      class_name: c.class_name || "",
      photo_url: c.photo_url || "",
      use_photo: c.use_photo === true,
      photo_focal_x: c.photo_focal_x != null ? c.photo_focal_x : 50,
      photo_focal_y: c.photo_focal_y != null ? c.photo_focal_y : 50,
      value_key: resolvedValueKey,
      value_label: c.value_label || "",
      _selected: false,
    };
  }

  function _findChildSlot(childId) {
    var slots = ["current", "upcoming"];
    for (var s = 0; s < slots.length; s++) {
      var asm = slots[s] === "current" ? state.currentAssembly : state.upcomingAssembly;
      if (!asm) { continue; }
      for (var i = 0; i < asm.children.length; i++) {
        if (asm.children[i].id === childId) { return { slot: slots[s], idx: i }; }
      }
    }
    return null;
  }

  function _formatAssemblyDateLabel(isoDate) {
    if (!isoDate) { return ""; }
    try {
      return new Date(isoDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch (_) { return isoDate; }
  }

  function renderAssemblySection() {
    renderCelebrationValuesBar();
    renderCelebrationDatalist();
    renderCurrentAssemblyCard();
    renderUpcomingAssemblyCard();
    _syncDojoDefaultMessage();
  }

  function renderCurrentAssemblyCard() {
    var el = byId("celebrationCurrentSection");
    if (!el) { return; }
    var asm = state.currentAssembly;
    if (!asm) {
      el.innerHTML = '<p class="assembly-empty-note">No assembly currently on display.</p>';
      return;
    }
    el.innerHTML = _assemblyCardHtml("current", asm);
    _bindAssemblyCard("current");
  }

  function renderUpcomingAssemblyCard() {
    var el = byId("celebrationUpcomingSection");
    if (!el) { return; }
    var asm = state.upcomingAssembly;
    if (!asm) {
      el.innerHTML =
        '<div class="assembly-new-section">' +
        '<h4 class="assembly-card__label">Set up upcoming assembly</h4>' +
        '<div class="field-grid field-grid--two" style="margin-top:var(--spacing-sm)">' +
        '<div><label for="celebrationNewDate">Assembly date</label>' +
        '<input id="celebrationNewDate" type="date"></div></div>' +
        '<div class="btn-row">' +
        '<button id="createUpcomingAssembly" class="btn btn-secondary" type="button">Create upcoming assembly</button>' +
        '</div></div>';
      byId("createUpcomingAssembly").addEventListener("click", createUpcomingAssembly);
      return;
    }
    el.innerHTML = _assemblyCardHtml("upcoming", asm);
    _bindAssemblyCard("upcoming");
  }

  function _assemblyCardHtml(slot, asm) {
    var label = slot === "current" ? "Now showing" : "Upcoming assembly";
    var dateLabel = _formatAssemblyDateLabel(asm.assembly_date);
    var dojoNote = (slot === "upcoming" && asm.classdojo_post_id)
      ? ' <span class="assembly-dojo-badge">&#10003; ClassDojo scheduled</span>' : "";
    var dateHtml = asm._editingDate
      ? '<input class="assembly-date-input" id="' + slot + '-date-input" type="date" value="' + escapeAttribute(asm.assembly_date) + '">' +
        ' <button class="btn btn-primary btn-sm" id="' + slot + '-save-date" type="button">Save date</button>' +
        ' <button class="btn btn-ghost btn-sm" id="' + slot + '-cancel-date" type="button">Cancel</button>'
      : '<strong class="assembly-card__date-text">' + escapeText(dateLabel || asm.assembly_date) + '</strong>' + dojoNote +
        ' <button class="btn btn-ghost btn-sm" id="' + slot + '-edit-date" type="button">Edit date</button>';
    var children = _sortChildrenByClassOrder(asm.children);
    var allSelected = children.length > 0 && children.every(function (c) { return c._selected; });
    var actionBtn = slot === "upcoming"
      ? '<button class="btn btn-ghost btn-sm" id="' + slot + '-cancel" type="button">Cancel upcoming</button>'
      : '<button class="btn btn-ghost btn-sm" id="' + slot + '-clear" type="button">Clear from display</button>';
    return (
      '<div class="assembly-card">' +
      '<div class="assembly-card__header">' +
      '<span class="assembly-card__label">' + escapeText(label) + '</span>' +
      '<div class="assembly-card__date-row">' + dateHtml + '</div>' +
      '</div>' +
      '<div class="select-bar">' +
      '<label><input id="' + slot + '-select-all" type="checkbox"' + (allSelected ? " checked" : "") + '> Select all</label>' +
      '<button class="btn btn-danger btn-sm" id="' + slot + '-delete-selected" type="button">Delete selected</button>' +
      ' ' + actionBtn +
      '</div>' +
      '<div class="repeater-list celebration-children-grid" id="' + slot + '-children-list">' + children.map(_childRowHtml).join("") + '</div>' +
      '<details class="assembly-add-section" id="' + slot + '-add-details">' +
      '<summary>+ Add children</summary>' +
      '<div class="stack" style="margin-top:var(--spacing-sm)">' +
      '<div class="batch-name-value-grid" id="' + slot + '-batch-grid"></div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost btn-sm" id="' + slot + '-more-rows" type="button">+ More rows</button>' +
      '<button class="btn btn-secondary" id="' + slot + '-add-bulk" type="button">Add children to list</button>' +
      '</div></div></details>' +
      '<div class="btn-row" style="margin-top:var(--spacing-sm)">' +
      '<button class="btn btn-success" id="' + slot + '-save" type="button">Save</button>' +
      '<span class="save-note" id="' + slot + '-save-status"></span>' +
      '</div>' +
      '</div>'
    );
  }

  function _childRowHtml(child) {
    var uploadInputId = "child-upload-" + child.id;
    var dropzoneAttrs =
      'data-child-dropzone="' + escapeAttribute(child.id) +
      '" data-child-upload-target="' + escapeAttribute(uploadInputId) +
      '" tabindex="0" role="button" aria-label="Upload photo for ' + escapeAttribute(child.name || "child") + '"';
    var photoHtml;
    var hasPhoto = !!child.photo_url;
    var prefersValueIcon = hasPhoto && child.use_photo === false && !!child.value_key;
    if (hasPhoto && !prefersValueIcon) {
      photoHtml = '<div class="child-photo-area child-photo-area--photo child-upload-dropzone" ' + dropzoneAttrs + '>' +
        '<img src="' + escapeAttribute(child.photo_url) + '" alt="" style="object-fit:cover;object-position:' + (child.photo_focal_x != null ? child.photo_focal_x : 50) + '% ' + (child.photo_focal_y != null ? child.photo_focal_y : 50) + '%">' +
        '<span class="child-upload-dropzone__hint">Drop photo to replace</span>' +
        '<button class="child-focal-btn" type="button" data-set-focal="' + escapeAttribute(child.id) + '">&#9685; Focal point</button>' +
        '</div>';
    } else if (child.value_key) {
      photoHtml = '<div class="child-photo-area child-upload-dropzone" ' + dropzoneAttrs + '>' +
        '<img class="child-photo--value" src="/values/' + escapeAttribute(child.value_key) + '.png" alt="' + escapeAttribute(child.value_key) + '" onerror="this.style.display=\'none\'">' +
        '<span class="child-photo--value-label">' + escapeText(child.value_label || _valueLabelFor(child.value_key)) + '</span>' +
        '<span class="child-upload-dropzone__hint">Drop photo or click frame</span>' +
        '</div>';
    } else {
      photoHtml = '<div class="child-photo-area child-upload-dropzone" ' + dropzoneAttrs + '><div class="child-photo__placeholder">&#128100;</div><span class="child-upload-dropzone__hint">Drop photo or click frame</span></div>';
    }
    var photoActionBtns = hasPhoto
      ? '<label class="btn btn-ghost btn-sm" for="' + escapeAttribute(uploadInputId) + '">Change photo</label>' +
        (child.value_key
          ? '<button class="btn btn-ghost btn-sm" type="button" data-toggle-photo-mode="' + escapeAttribute(child.id) + '">' + (prefersValueIcon ? "Use photo" : "Use value icon") + '</button>'
          : "") +
        '<button class="btn btn-ghost btn-sm" type="button" data-clear-photo="' + escapeAttribute(child.id) + '">Use value icon</button>'
      : '<label class="btn btn-secondary btn-sm" for="' + escapeAttribute(uploadInputId) + '">Upload photo</label>';
    return (
      '<article class="child-row">' +
      '<div class="child-row__top">' +
      '<input class="child-row__select" type="checkbox" data-child-select="' + escapeAttribute(child.id) + '"' + (child._selected ? " checked" : "") + ' style="margin-top:0.35rem">' +
      photoHtml +
      '<div class="stack gap-xs">' +
      '<div class="field-grid field-grid--two">' +
      '<div><label>Name</label><input type="text" autocomplete="off" data-child-name="' + escapeAttribute(child.id) + '" value="' + escapeAttribute(child.name) + '"></div>' +
      '<div><label>Class</label><input type="text" list="celebrationClassDatalist" data-child-class="' + escapeAttribute(child.id) + '" value="' + escapeAttribute(child.class_name || "") + '" placeholder="e.g. Willow"></div>' +
      '</div>' +
      '<div><label>Value</label><input type="text" list="celebrationValuesDatalist" data-child-value="' + escapeAttribute(child.id) + '" value="' + escapeAttribute(child.value_label || _valueLabelFor(child.value_key)) + '" placeholder="Value"></div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-open-value-selector="' + escapeAttribute(child.id) + '">Change value</button>' +
      photoActionBtns +
      '<input id="' + escapeAttribute(uploadInputId) + '" data-child-upload="' + escapeAttribute(child.id) + '" type="file" accept=".jpg,.jpeg,.png,.gif,.webp" hidden>' +
      '</div>' +
      buildValueSelectorHtml(child.id, child.value_key) +
      '</div>' +
      '</div>' +
      '<div class="btn-row"><button class="btn btn-danger btn-sm" type="button" data-remove-child="' + escapeAttribute(child.id) + '">Remove</button></div>' +
      '</article>'
    );
  }

  function bindChildPhotoDropzones(scopeEl) {
    if (!scopeEl) {
      return;
    }
    scopeEl.querySelectorAll("[data-child-dropzone]").forEach(function (dropzone) {
      var childId = dropzone.getAttribute("data-child-dropzone");
      var uploadInputId = dropzone.getAttribute("data-child-upload-target");
      if (!childId || !uploadInputId) {
        return;
      }
      var input = byId(uploadInputId);
      if (!input) {
        return;
      }
      bindUploadDropzone(dropzone, function (files) {
        uploadCelebrationPhoto(childId, files || []);
      }, {
        input: input,
        ignoreClickSelector: "button, [data-set-focal]"
      });
    });
  }

  function _rerenderSlotChildren(slot) {
    var asm = slot === "current" ? state.currentAssembly : state.upcomingAssembly;
    var listEl = byId(slot + "-children-list");
    var selectAll = byId(slot + "-select-all");
    if (!asm || !listEl) { return; }
    listEl.innerHTML = _sortChildrenByClassOrder(asm.children).map(_childRowHtml).join("");
    bindChildPhotoDropzones(listEl);
    if (selectAll) {
      selectAll.checked = asm.children.length > 0 && asm.children.every(function (c) { return c._selected; });
    }
    _syncDojoDefaultMessage();
  }

  function _bindAssemblyCard(slot) {
    var asm = slot === "current" ? state.currentAssembly : state.upcomingAssembly;
    if (!asm) { return; }
    buildBatchGrid(slot, 12, []);
    bindChildPhotoDropzones(byId(slot + "-children-list"));

    var editDateBtn = byId(slot + "-edit-date");
    if (editDateBtn) {
      editDateBtn.addEventListener("click", function () {
        asm._editingDate = true;
        if (slot === "current") { renderCurrentAssemblyCard(); } else { renderUpcomingAssemblyCard(); }
      });
    }
    var saveDateBtn = byId(slot + "-save-date");
    if (saveDateBtn) {
      saveDateBtn.addEventListener("click", function () {
        var inp = byId(slot + "-date-input");
        if (inp && inp.value) {
          asm.assembly_date = inp.value;
          asm._editingDate = false;
          saveAssembly(slot);
        }
      });
    }
    var cancelDateBtn = byId(slot + "-cancel-date");
    if (cancelDateBtn) {
      cancelDateBtn.addEventListener("click", function () {
        asm._editingDate = false;
        if (slot === "current") { renderCurrentAssemblyCard(); } else { renderUpcomingAssemblyCard(); }
      });
    }

    var selectAll = byId(slot + "-select-all");
    if (selectAll) {
      selectAll.addEventListener("change", function () {
        asm.children.forEach(function (c) { c._selected = selectAll.checked; });
        _rerenderSlotChildren(slot);
      });
    }

    var deleteBtn = byId(slot + "-delete-selected");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        var count = asm.children.filter(function (c) { return c._selected; }).length;
        if (!count) { return; }
        var msg = "Delete " + count + " selected " + (count === 1 ? "child" : "children") + "?";
        confirmDelete(msg, function () {
          asm.children = asm.children.filter(function (c) { return !c._selected; });
          _rerenderSlotChildren(slot);
          autoSaveAssembly(slot);
        });
      });
    }

    var cancelBtn = byId(slot + "-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        confirmDelete("Cancel the upcoming assembly? This cannot be undone.", function () {
          api("/api/celebration-children/upcoming", { method: "DELETE" }).then(function () {
            state.upcomingAssembly = null;
            renderUpcomingAssemblyCard();
            flash("Upcoming assembly cancelled.", "success");
          }).catch(function (e) { flash(e.message, "error"); });
        });
      });
    }
    var clearBtn = byId(slot + "-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        confirmDelete("Clear the current assembly from the display screen?", function () {
          api("/api/celebration-children/current", { method: "DELETE" }).then(function () {
            state.currentAssembly = null;
            renderCurrentAssemblyCard();
            flash("Current assembly cleared.", "success");
          }).catch(function (e) { flash(e.message, "error"); });
        });
      });
    }

    var moreRowsBtn = byId(slot + "-more-rows");
    if (moreRowsBtn) {
      moreRowsBtn.addEventListener("click", function () {
        var existing = readBatchRows(slot);
        buildBatchGrid(slot, existing.length + 4, existing);
      });
    }
    var addBulkBtn = byId(slot + "-add-bulk");
    if (addBulkBtn) { addBulkBtn.addEventListener("click", function () { addChildrenToSlot(slot); }); }
    var saveBtn = byId(slot + "-save");
    if (saveBtn) { saveBtn.addEventListener("click", function () { saveAssembly(slot); }); }
  }

  function renderCelebrationDatalist() {
    var dl = byId("celebrationValuesDatalist");
    if (!dl) { return; }
    dl.innerHTML = state.schoolValues.map(function (v) {
      return '<option value="' + escapeAttribute(v.label) + '"></option>';
    }).join("");
    // Also populate the class datalist
    var cdl = byId("celebrationClassDatalist");
    if (cdl) {
      var classNames = _effectiveClassOrder();
      cdl.innerHTML = classNames.map(function (name) {
        return '<option value="' + escapeAttribute(name) + '"></option>';
      }).join("");
    }
  }

  // Returns the final class order used everywhere else in the dashboard.
  function _effectiveClassOrder() {
    var stored = (state.classOrder || []).slice();
    var arbor = (state.arborClasses || []).map(function (item) { return item && item.name ? item.name : ""; }).filter(Boolean);
    var result = [];
    var seen = {};

    function addClass(name) {
      var resolved = _resolveLinkedClassName(name);
      var key = resolved || name;
      if (!key || seen[key]) { return; }
      var meta = (state.classOrderMeta && state.classOrderMeta[key]) ? state.classOrderMeta[key] : {};
      if (meta.source === "dojo" && String(meta.linked_to || "").trim()) {
        return;
      }
      seen[key] = true;
      result.push(key);
    }

    stored.forEach(addClass);
    arbor.forEach(addClass);

    if (!result.length) {
      return arbor.slice();
    }
    return result;
  }

  function _cleanClassName(name) {
    return String(name || "").replace(/^\d{2,4}\/\d{2,4}\s+/, "").trim();
  }

  function _phaseForYearGroup(yearGroup) {
    var groups = Array.isArray(yearGroup)
      ? yearGroup
      : String(yearGroup || "").replace(" / ", ",").replace("/", ",").split(",");
    var cleaned = groups.map(function (item) { return String(item || "").trim(); }).filter(Boolean);
    if (cleaned.length && cleaned.every(function (item) { return item === "Nursery" || item === "Reception"; })) {
      return "EYFS";
    }
    if (cleaned.length && cleaned.every(function (item) { return item === "Year 1" || item === "Year 2"; })) {
      return "KS1";
    }
    return "";
  }

  function _arborClassEntry(name) {
    for (var i = 0; i < (state.arborClasses || []).length; i += 1) {
      if ((state.arborClasses[i].name || "") === name) {
        return state.arborClasses[i];
      }
    }
    return null;
  }

  function _dojoClassEntry(name) {
    for (var i = 0; i < (state.dojoClasses || []).length; i += 1) {
      if ((state.dojoClasses[i].name || "") === name) {
        return state.dojoClasses[i];
      }
    }
    return null;
  }

  function _yearGroupOptions() {
    var values = {};
    ["Nursery", "Reception", "Year 1", "Year 2"].forEach(function (item) { values[item] = true; });
    (state.arborClasses || []).forEach(function (entry) {
      (entry.year_groups || []).forEach(function (yearGroup) {
        if (yearGroup) { values[yearGroup] = true; }
      });
    });
    (state.dojoClasses || []).forEach(function (entry) {
      (entry.year_groups || []).forEach(function (yearGroup) {
        if (yearGroup) { values[yearGroup] = true; }
      });
    });
    return Object.keys(values);
  }

  function _selectedYearGroups(meta) {
    var groups = [];
    var raw = meta && meta.year_groups ? meta.year_groups : meta && meta.year_group ? String(meta.year_group).split(" / ") : [];
    raw.forEach(function (item) {
      var value = String(item || "").trim();
      if (value && groups.indexOf(value) === -1) {
        groups.push(value);
      }
    });
    return groups;
  }

  function _yearGroupCheckboxes(name, selectedGroups, prefix) {
    var attrPrefix = prefix || "class";
    var selected = {};
    (selectedGroups || []).forEach(function (value) {
      selected[value] = true;
    });
    return '<div class="class-order-item__checkbox-grid">' + _yearGroupOptions().map(function (value) {
      return '<label class="class-order-item__checkbox">' +
        '<input type="checkbox" data-' + attrPrefix + '-year-group="' + escapeAttribute(name + ":" + value) + '"' + (selected[value] ? ' checked' : '') + '> ' +
        escapeText(value) +
        '</label>';
    }).join("") + '</div>';
  }

  function _yearGroupsFromRow(row, prefix) {
    var groups = [];
    row.querySelectorAll('[data-' + prefix + '-year-group]').forEach(function (checkbox) {
      if (checkbox.checked) {
        var raw = String(checkbox.getAttribute("data-" + prefix + "-year-group") || "");
        var parts = raw.split(":");
        var value = parts.slice(1).join(":");
        if (value && groups.indexOf(value) === -1) {
          groups.push(value);
        }
      }
    });
    return groups;
  }

  function _classOrderMetaFor(name) {
    var stored = (state.classOrderMeta && state.classOrderMeta[name]) ? state.classOrderMeta[name] : {};
    var arbor = _arborClassEntry(name) || {};
    var dojo = _dojoClassEntry(name) || {};
    var source = stored.source || arbor.source || dojo.source || (arbor.name ? "arbor" : "dojo");
    var yearGroups = _selectedYearGroups(stored);
    if (!yearGroups.length) {
      yearGroups = _selectedYearGroups(arbor);
    }
    if (!yearGroups.length) {
      yearGroups = _selectedYearGroups(dojo);
    }
    var phase = stored.phase || arbor.phase || dojo.phase || _phaseForYearGroup(yearGroups);
    var displayLabel = stored.display_label || arbor.display_label || dojo.display_label || _cleanClassName(name) || name || "";
    return {
      source: source,
      display_label: displayLabel,
      year_groups: yearGroups,
      year_group: yearGroups.join(" / "),
      phase: phase,
      linked_to: source === "dojo" ? (stored.linked_to || "") : "",
      in_order: (state.classOrder || []).indexOf(name) !== -1,
    };
  }

  function _classOrderMetaPayload() {
    var payload = clone(state.classOrderMeta || {});
    var list = byId("classOrderList");
    if (!list) {
      return payload;
    }
    list.querySelectorAll(".class-order-item").forEach(function (row) {
      var name = row.dataset.classOrderName || "";
      if (!name) { return; }
      var displayInput = row.querySelector('[data-class-display-input]');
      var displayLabel = displayInput ? (displayInput.value || "").trim() : "";
      var yearGroups = _yearGroupsFromRow(row, "class");
      var phaseSelect = row.querySelector('[data-class-phase-select]');
      var phase = phaseSelect ? (phaseSelect.value || "").trim() : "";
      payload[name] = {
        display_label: displayLabel || _cleanClassName(name) || name,
        year_groups: yearGroups,
        year_group: yearGroups.join(" / "),
        phase: phase || _phaseForYearGroup(yearGroups),
        linked_to: "",
        source: (state.classOrderMeta && state.classOrderMeta[name] && state.classOrderMeta[name].source) || (_arborClassEntry(name) ? "arbor" : "dojo"),
        in_order: true,
      };
    });
    var dojoList = byId("classDojoMatchList");
    if (dojoList) {
      dojoList.querySelectorAll(".class-dojo-row").forEach(function (row) {
        var name = row.dataset.dojoClassName || "";
        if (!name) { return; }
        var displayInput = row.querySelector('[data-dojo-display-input]');
        var linkedSelect = row.querySelector('[data-dojo-linked-select]');
        var yearGroups = _yearGroupsFromRow(row, "dojo");
        var phaseSelect = row.querySelector('[data-dojo-phase-select]');
        var phase = phaseSelect ? (phaseSelect.value || "").trim() : "";
        payload[name] = {
          display_label: displayInput ? (displayInput.value || "").trim() : _cleanClassName(name) || name,
          year_groups: yearGroups,
          year_group: yearGroups.join(" / "),
          phase: phase || _phaseForYearGroup(yearGroups),
          linked_to: linkedSelect ? (linkedSelect.value || "").trim() : "",
          source: "dojo",
          in_order: (state.classOrder || []).indexOf(name) !== -1,
        };
      });
    }
    return payload;
  }

  function _classOrderSelectOptions(selectedValue, values) {
    return values.map(function (value) {
      var label = value || "—";
      return '<option value="' + escapeAttribute(value) + '"' + (value === selectedValue ? ' selected' : '') + '>' + escapeText(label) + "</option>";
    }).join("");
  }

  function _classOrderPhaseOptions(selectedValue) {
    return _classOrderSelectOptions(selectedValue, ["", "EYFS", "KS1"]);
  }

  var _classOrderDragSrc = null;

  function _classOrderSourceLabel(name, meta) {
    if (meta && meta.source === "dojo") {
      return String(meta.linked_to || "").trim() ? "ClassDojo matched" : "ClassDojo extra";
    }
    if (meta && meta.source === "arbor") {
      return "Arbor master";
    }
    if (_arborClassEntry(name)) {
      return "Arbor master";
    }
    if (_dojoClassEntry(name)) {
      return "ClassDojo extra";
    }
    return "Class";
  }

  function _refreshClassOrderViews() {
    renderClassOrder();
    renderClassDojoRoster();
    renderCelebrationDatalist();
    renderAssemblySection();
  }

  function _setDojoClassMatch(name, linkedTo) {
    if (!name) { return; }
    var meta = _classOrderMetaFor(name);
    meta.source = "dojo";
    meta.linked_to = String(linkedTo || "").trim();
    state.classOrderMeta[name] = meta;
    if (meta.linked_to) {
      state.classOrder = (state.classOrder || []).filter(function (item) { return item !== name; });
    }
    _refreshClassOrderViews();
  }

  function _toggleDojoClassExtra(name) {
    if (!name) { return; }
    var order = (state.classOrder || []).slice();
    var idx = order.indexOf(name);
    var meta = _classOrderMetaFor(name);
    meta.source = "dojo";
    meta.linked_to = "";
    if (idx === -1) {
      order.push(name);
    } else {
      order.splice(idx, 1);
    }
    state.classOrder = order;
    state.classOrderMeta[name] = meta;
    _refreshClassOrderViews();
  }

  function renderClassOrder() {
    var list = byId("classOrderList");
    if (!list) { return; }
    var classes = _effectiveClassOrder();

    if (!classes.length) {
      list.innerHTML = '<p class="section-copy" style="color:#94a3b8;">No classes found. Classes are pulled from the live Arbor class attendance feed.</p>';
      return;
    }

    list.innerHTML = "";
    classes.forEach(function (name, index) {
      var meta = _classOrderMetaFor(name);
      var item = document.createElement("div");
      item.className = "class-order-item";
      item.draggable = true;
      item.dataset.classIndex = String(index);
      item.dataset.classOrderName = name;
      var sourceLabel = _classOrderSourceLabel(name, meta);
      var sourceClass = meta.source === "dojo" ? "is-dojo" : "is-arbor";
      item.innerHTML =
        '<span class="class-order-item__handle" aria-hidden="true">&#9776;</span>' +
        '<div class="class-order-item__content">' +
          '<div class="class-order-item__header">' +
            '<div class="class-order-item__title-block">' +
              '<span class="class-order-item__name">' + escapeText(name) + '</span>' +
              '<span class="class-order-item__source ' + sourceClass + '">' + escapeText(sourceLabel) + '</span>' +
            '</div>' +
            '<div class="class-order-item__move-actions btn-row">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-class-move="' + escapeAttribute(name) + '" data-class-move-dir="-1"' + (index === 0 ? ' disabled' : '') + '>Up</button>' +
              '<button class="btn btn-ghost btn-sm" type="button" data-class-move="' + escapeAttribute(name) + '" data-class-move-dir="1"' + (index === classes.length - 1 ? ' disabled' : '') + '>Down</button>' +
            '</div>' +
            '<label class="class-order-item__label-wrap">' +
              '<span class="class-order-item__field-label">Display label</span>' +
              '<input class="class-order-item__label" type="text" data-class-display-input value="' + escapeAttribute(meta.display_label || "") + '">' +
            '</label>' +
          '</div>' +
          '<div class="class-order-item__meta-grid class-order-item__meta-grid--stacked">' +
            '<div class="class-order-item__field-wrap class-order-item__field-wrap--wide">' +
              '<span class="class-order-item__field-label">Year groups</span>' +
              _yearGroupCheckboxes(name, meta.year_groups || [], "class") +
            '</div>' +
            '<label class="class-order-item__field-wrap">' +
              '<span class="class-order-item__field-label">Phase</span>' +
              '<select class="class-order-item__select" data-class-phase-select>' + _classOrderPhaseOptions(meta.phase || "") + '</select>' +
            '</label>' +
          '</div>' +
          '<div class="class-order-item__preview">Shows as ' + escapeText(meta.display_label || name) + (meta.year_group ? " • " + escapeText(meta.year_group) : "") + (meta.phase ? " • " + escapeText(meta.phase) : "") + '</div>' +
        '</div>';
      list.appendChild(item);
    });
  }

  function _updateClassOrderPreview(row) {
    if (!row) { return; }
    var displayInput = row.querySelector('[data-class-display-input]');
    var phaseSelect = row.querySelector('[data-class-phase-select]');
    var preview = row.querySelector(".class-order-item__preview");
    if (!preview) { return; }
    var parts = [];
    var displayLabel = displayInput ? (displayInput.value || "").trim() : "";
    var yearGroups = _yearGroupsFromRow(row, "class");
    var phase = phaseSelect ? (phaseSelect.value || "").trim() : "";
    parts.push("Shows as " + (displayLabel || "(blank)"));
    parts.push(yearGroups.length ? yearGroups.join(" / ") : "No year group");
    if (phase) { parts.push(phase); }
    preview.textContent = parts.join(" • ");
  }

  function renderClassDojoRoster() {
    var wrap = byId("classDojoMatchList");
    if (!wrap) { return; }
    var arborNames = (state.arborClasses || []).map(function (item) { return item && item.name ? item.name : ""; }).filter(Boolean);
    var orderNames = _effectiveClassOrder();
    if (!state.dojoClasses.length) {
      wrap.innerHTML = '<article class="repeater-card muted">No ClassDojo classes loaded yet.</article>';
      return;
    }
    wrap.innerHTML = "";
    state.dojoClasses.forEach(function (row) {
      var storedMeta = (state.classOrderMeta && state.classOrderMeta[row.name]) ? state.classOrderMeta[row.name] : {};
      var linkedTo = String(storedMeta.linked_to || row.linked_to || row.matched_to || "").trim();
      var isInOrder = orderNames.indexOf(row.name) !== -1;
      var isExtra = isInOrder && !linkedTo;
      var selectedGroups = storedMeta.year_groups || row.year_groups || [];
      var rowStateClass = linkedTo ? " is-linked" : isExtra ? " is-extra" : "";
      var statusText = linkedTo
        ? "Currently matched to " + linkedTo + "."
        : isExtra
          ? "Shown as a ClassDojo extra."
          : "Choose an Arbor match or add as an extra.";
      var extraButtonText = isExtra ? "Remove extra" : linkedTo ? "Use as extra" : "Add as extra";
      var card = document.createElement("article");
      card.className = "class-dojo-row" + rowStateClass;
      card.dataset.dojoClassName = row.name;
      card.innerHTML =
        '<div class="class-dojo-row__header">' +
          '<div>' +
            '<div class="class-dojo-row__name">' + escapeText(row.display_label || row.name) + '</div>' +
            '<div class="class-dojo-row__meta">' + escapeText(row.name) + '</div>' +
          '</div>' +
          '<div class="btn-row">' +
            '<button class="btn btn-secondary btn-sm" type="button" data-dojo-add-extra="' + escapeAttribute(row.name) + '">' + escapeText(extraButtonText) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="class-dojo-row__status"><span class="class-dojo-row__status-note">' + escapeText(statusText) + '</span></div>' +
        '<div class="class-dojo-row__match">' +
          '<label>' +
            '<span class="class-order-item__field-label">Match to Arbor class</span>' +
            '<select class="class-order-item__select" data-dojo-linked-select>' + _classOrderSelectOptions(linkedTo, [""].concat(arborNames)) + '</select>' +
          '</label>' +
          '<div class="class-dojo-row__suggestions">' +
            (row.suggested_matches && row.suggested_matches.length ? row.suggested_matches.map(function (suggestion) {
              return '<button class="btn btn-ghost btn-sm" type="button" data-dojo-suggestion="' + escapeAttribute(row.name + "|" + suggestion) + '">' + escapeText(suggestion) + '</button>';
            }).join("") : '<span class="muted">No obvious match found.</span>') +
          '</div>' +
        '</div>' +
        '<div class="class-order-item__meta-grid class-order-item__meta-grid--stacked">' +
          '<div class="class-order-item__field-wrap class-order-item__field-wrap--wide">' +
            '<span class="class-order-item__field-label">Year groups</span>' +
            _yearGroupCheckboxes(row.name, selectedGroups, "dojo") +
          '</div>' +
          '<label class="class-order-item__field-wrap">' +
            '<span class="class-order-item__field-label">Phase</span>' +
            '<select class="class-order-item__select" data-dojo-phase-select>' + _classOrderPhaseOptions(row.phase || "") + '</select>' +
          '</label>' +
        '</div>';
      wrap.appendChild(card);
    });
  }

  function initClassOrderDnd() {
    var list = byId("classOrderList");
    if (!list) { return; }

    list.addEventListener("dragstart", function (event) {
      if (event.target.matches("input, select, textarea, option, button")) {
        return;
      }
      var item = event.target.closest(".class-order-item");
      if (!item) { return; }
      _classOrderDragSrc = parseInt(item.dataset.classIndex, 10);
      item.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(_classOrderDragSrc));
    });

    list.addEventListener("dragend", function (event) {
      var item = event.target.closest(".class-order-item");
      if (item) { item.classList.remove("is-dragging"); }
      list.querySelectorAll(".class-order-item").forEach(function (el) {
        el.classList.remove("drag-over");
      });
      _classOrderDragSrc = null;
    });

    list.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      var item = event.target.closest(".class-order-item");
      list.querySelectorAll(".class-order-item").forEach(function (el) {
        el.classList.remove("drag-over");
      });
      if (item) { item.classList.add("drag-over"); }
    });

    list.addEventListener("dragleave", function (event) {
      var related = event.relatedTarget;
      if (related && list.contains(related)) { return; }
      list.querySelectorAll(".class-order-item").forEach(function (el) {
        el.classList.remove("drag-over");
      });
    });

    list.addEventListener("drop", function (event) {
      event.preventDefault();
      if (event.target.matches("input, select, textarea, option, button")) {
        return;
      }
      var targetItem = event.target.closest(".class-order-item");
      if (!targetItem) { return; }
      var destIndex = parseInt(targetItem.dataset.classIndex, 10);
      if (_classOrderDragSrc === null || _classOrderDragSrc === destIndex) { return; }
      var current = _effectiveClassOrder();
      var moved = current.splice(_classOrderDragSrc, 1)[0];
      current.splice(destIndex, 0, moved);
      state.classOrder = current;
      if (state.currentAssembly) { state.currentAssembly.children = _sortChildrenByClassOrder(state.currentAssembly.children); }
      if (state.upcomingAssembly) { state.upcomingAssembly.children = _sortChildrenByClassOrder(state.upcomingAssembly.children); }
      renderClassOrder();
      renderCelebrationDatalist();
      renderAssemblySection();
    });

    list.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-class-move]");
      if (!btn) { return; }
      var name = btn.getAttribute("data-class-move") || "";
      var dir = parseInt(btn.getAttribute("data-class-move-dir") || "0", 10);
      if (!name || !dir) { return; }
      var current = _effectiveClassOrder();
      var index = current.indexOf(name);
      var nextIndex = index + dir;
      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) { return; }
      var moved = current.splice(index, 1)[0];
      current.splice(nextIndex, 0, moved);
      state.classOrder = current;
      if (state.currentAssembly) { state.currentAssembly.children = _sortChildrenByClassOrder(state.currentAssembly.children); }
      if (state.upcomingAssembly) { state.upcomingAssembly.children = _sortChildrenByClassOrder(state.upcomingAssembly.children); }
      renderClassOrder();
      renderCelebrationDatalist();
      renderAssemblySection();
    });

    list.addEventListener("change", function (event) {
      var row = event.target.closest(".class-order-item");
      if (!row) { return; }
      _updateClassOrderPreview(row);
    });

    list.addEventListener("input", function (event) {
      var row = event.target.closest(".class-order-item");
      if (!row) { return; }
      _updateClassOrderPreview(row);
    });
  }

  function saveClassOrder() {
    var order = [];
    var classes = [];
    var meta = _classOrderMetaPayload();
    var orderSet = {};
    var orderRows = byId("classOrderList");
    if (orderRows) {
      orderRows.querySelectorAll(".class-order-item").forEach(function (row) {
        var name = row.dataset.classOrderName || "";
        if (!name) { return; }
        order.push(name);
        orderSet[name] = true;
        classes.push({
          name: name,
          in_order: true,
          display_label: (meta[name] && meta[name].display_label) || name,
          year_groups: (meta[name] && meta[name].year_groups) || [],
          phase: (meta[name] && meta[name].phase) || "",
          linked_to: "",
          source: (meta[name] && meta[name].source) || "arbor",
        });
      });
    }
    var dojoRows = byId("classDojoMatchList");
    if (dojoRows) {
      dojoRows.querySelectorAll(".class-dojo-row").forEach(function (row) {
        var name = row.dataset.dojoClassName || "";
        if (!name) { return; }
        if (orderSet[name]) {
          return;
        }
        var linkedTo = (meta[name] && meta[name].linked_to) || "";
        classes.push({
          name: name,
          in_order: false,
          display_label: (meta[name] && meta[name].display_label) || name,
          year_groups: (meta[name] && meta[name].year_groups) || [],
          phase: (meta[name] && meta[name].phase) || "",
          linked_to: linkedTo,
          source: "dojo",
        });
      });
    }
    api("/api/class-order", {
      method: "POST",
      body: JSON.stringify({ order: order, meta: meta, classes: classes }),
    }).then(function (payload) {
      state.classOrder = payload.order || order;
      state.classOrderMeta = payload.meta || meta;
      state.arborClasses = payload.arborClasses || state.arborClasses;
      state.dojoClasses = payload.dojoClasses || state.dojoClasses;
      Object.keys(state.classOrderMeta || {}).forEach(function (name) {
        var item = state.classOrderMeta[name] || {};
        var yearGroupText = item.year_group || (item.year_groups || []).join(" / ");
        if (name && yearGroupText) { state.classYearGroupMap[name] = yearGroupText; }
        if (name && item.phase) { state.classPhaseMap[name] = item.phase; }
        if (item.display_label) {
          if (yearGroupText) { state.classYearGroupMap[item.display_label] = yearGroupText; }
          if (item.phase) { state.classPhaseMap[item.display_label] = item.phase; }
        }
      });
      flash("Class order saved.", "success");
      setSaveStatus("saveStatusClassOrder");
      renderCelebrationDatalist();
      renderClassOrder();
      renderClassDojoRoster();
    }).catch(function (error) {
      flash("Failed to save class order: " + error.message, "error");
    });
  }

  function _groupedChildrenHtml(children) {
    // Group by class_name (sorted by class order), then alphabetical by name within each group
    var sorted = _sortChildrenByClassOrder(children.filter(function (ch) { return ch && ch.name; }));
    if (!sorted.length) { return '<p style="margin:0;color:#94a3b8;font-size:0.85rem;">No children.</p>'; }
    var groups = [];
    var groupMap = {};
    sorted.forEach(function (ch) {
      var cls = ch.class_name || "(no class)";
      if (!groupMap[cls]) {
        groupMap[cls] = [];
        groups.push(cls);
      }
      groupMap[cls].push(ch);
    });
    return groups.map(function (cls) {
      var items = groupMap[cls].map(function (ch) {
        var valueStr = ch.value_label || _valueLabelFor(ch.value_key) || "";
        return '<li>' + escapeText(ch.name) + (valueStr ? ' <span class="assembly-child-value">— ' + escapeText(valueStr) + '</span>' : '') + '</li>';
      }).join("");
      return '<div class="assembly-group">' +
        '<span class="assembly-group__label">' + escapeText(cls) + '</span>' +
        '<ul class="assembly-group__list">' + items + '</ul>' +
        '</div>';
    }).join("");
  }

  function _valueLabelFor(key) {
    var normalisedKey = _normaliseValueKey(key);
    for (var i = 0; i < state.schoolValues.length; i++) {
      if (_normaliseValueKey(state.schoolValues[i].key) === normalisedKey) { return state.schoolValues[i].label; }
    }
    return normalisedKey;
  }

  function _normaliseValueKey(rawKey) {
    var text = String(rawKey || "").trim();
    if (!text) { return ""; }
    text = text.split(/[\\/]/).pop();
    return text.replace(/\.png$/i, "");
  }

  function buildBatchGrid(slot, count, rows) {
    var grid = byId(slot + "-batch-grid");
    if (!grid) { return; }
    grid.innerHTML = "";
    var total = Math.max(1, count);
    for (var i = 0; i < total; i++) {
      var existing = (rows && rows[i]) || { name: "", value: "", class_name: "" };
      var pair = document.createElement("div");
      pair.className = "batch-name-value-pair";
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "celebration-batch-input celebration-batch-input--name";
      nameInput.placeholder = "Child name";
      nameInput.autocomplete = "off";
      nameInput.value = existing.name || "";
      var classInput = document.createElement("input");
      classInput.type = "text";
      classInput.className = "celebration-batch-input celebration-batch-input--class";
      classInput.placeholder = "Class";
      classInput.setAttribute("list", "celebrationClassDatalist");
      classInput.dataset.batchClass = "1";
      classInput.value = existing.class_name || "";
      var valueInput = document.createElement("input");
      valueInput.type = "text";
      valueInput.className = "celebration-batch-input celebration-batch-input--value";
      valueInput.placeholder = "Value";
      valueInput.setAttribute("list", "celebrationValuesDatalist");
      valueInput.dataset.batchValue = "1";
      valueInput.value = existing.value || "";
      pair.appendChild(nameInput);
      pair.appendChild(classInput);
      pair.appendChild(valueInput);
      grid.appendChild(pair);
    }
  }

  function readBatchRows(slot) {
    var grid = byId(slot + "-batch-grid");
    if (!grid) { return []; }
    return Array.prototype.map.call(
      grid.querySelectorAll(".batch-name-value-pair"),
      function (pair) {
        var n = pair.querySelector(".celebration-batch-input--name");
        var cl = pair.querySelector(".celebration-batch-input--class");
        var v = pair.querySelector(".celebration-batch-input--value");
        return { name: n ? n.value : "", class_name: cl ? cl.value : "", value: v ? v.value : "" };
      }
    );
  }

  function addChildrenToSlot(slot) {
    var asm = slot === "current" ? state.currentAssembly : state.upcomingAssembly;
    if (!asm) { return; }
    var rows = readBatchRows(slot).filter(function (r) { return (r.name || "").trim(); });
    if (!rows.length) { flash("Enter at least one child name.", "error"); return; }
    rows.forEach(function (row) {
      var resolved = _resolveValue(row.value);
      asm.children.push({ id: uid("child"), name: row.name.trim(), class_name: row.class_name || "", photo_url: "", photo_focal_x: 50, photo_focal_y: 50, value_key: resolved.key, value_label: resolved.label, _selected: false });
    });
    buildBatchGrid(slot, 12, []);
    _rerenderSlotChildren(slot);
    autoSaveAssembly(slot);
  }

  function _matchValueByPrefix(text) {
    var query = (text || "").trim().toLowerCase();
    if (!query) { return null; }
    // Prefer label prefix match, fall back to key prefix match
    for (var i = 0; i < state.schoolValues.length; i += 1) {
      var v = state.schoolValues[i];
      if ((v.label || "").toLowerCase().indexOf(query) === 0) { return v; }
    }
    for (var j = 0; j < state.schoolValues.length; j += 1) {
      var v2 = state.schoolValues[j];
      if (_normaliseValueKey(v2.key).toLowerCase().indexOf(query) === 0) { return v2; }
    }
    return null;
  }

  function _resolveValue(text) {
    // Returns { key, label } from any user input — empty if unrecognised
    var query = (text || "").trim();
    if (!query) { return { key: "", label: "" }; }
    var match = _matchValueByPrefix(query);
    if (match) { return { key: _normaliseValueKey(match.key), label: match.label }; }
    // Exact match against label or key (case-insensitive)
    var lower = query.toLowerCase();
    var normalisedLower = _normaliseValueKey(query).toLowerCase();
    for (var i = 0; i < state.schoolValues.length; i += 1) {
      var v = state.schoolValues[i];
      if ((v.label || "").toLowerCase() === lower || _normaliseValueKey(v.key).toLowerCase() === lower || _normaliseValueKey(v.key).toLowerCase() === normalisedLower) {
        return { key: _normaliseValueKey(v.key), label: v.label };
      }
    }
    // Free text — accept as label only
    return { key: "", label: query };
  }

  function _autocompleteValueInput(inputEl) {
    // Auto-complete the school value as the user types (e.g. "a" → "Aspiration")
    var typed = inputEl.value || "";
    if (!typed) { return; }
    // If text is already a complete value label, leave it alone.
    var lower = typed.toLowerCase();
    for (var i = 0; i < state.schoolValues.length; i += 1) {
      if ((state.schoolValues[i].label || "").toLowerCase() === lower) { return; }
    }
    var match = _matchValueByPrefix(typed);
    if (!match || !match.label) { return; }
    if (match.label.toLowerCase() === lower) { return; }
    var start = typed.length;
    inputEl.value = match.label;
    try { inputEl.setSelectionRange(start, match.label.length); } catch (_) { /* ignore */ }
  }

  function _matchClassByPrefix(text) {
    var query = (text || "").trim().toLowerCase();
    if (!query) { return ""; }
    var classNames = _effectiveClassOrder();
    for (var i = 0; i < classNames.length; i += 1) {
      if ((classNames[i] || "").toLowerCase().indexOf(query) === 0) {
        return classNames[i];
      }
    }
    return "";
  }

  function _autocompleteClassInput(inputEl) {
    var typed = inputEl.value || "";
    if (!typed) { return; }
    var lower = typed.toLowerCase();
    var match = _matchClassByPrefix(typed);
    if (!match || match.toLowerCase() === lower) { return; }
    var start = typed.length;
    inputEl.value = match;
    try { inputEl.setSelectionRange(start, match.length); } catch (_) { /* ignore */ }
  }

  function _typedAutocompletePrefix(inputEl) {
    var value = inputEl.value || "";
    var start = inputEl.selectionStart;
    var end = inputEl.selectionEnd;
    if (typeof start === "number" && typeof end === "number" && end > start) {
      return value.slice(0, start);
    }
    return value;
  }

  function _normaliseSearchText(text) {
    return String(text || "").trim().toLowerCase();
  }

  function _pupilSuggestions(query) {
    var q = _normaliseSearchText(query);
    if (!q || !state.pupilNames.length) { return []; }
    var matches = [];
    state.pupilNames.forEach(function (pupil) {
      var first = _normaliseSearchText(pupil.first_name);
      var last = _normaliseSearchText(pupil.last_name);
      var full = _normaliseSearchText((pupil.first_name || "") + " " + (pupil.last_name || ""));
      var cls = _normaliseSearchText(pupil.class_name);
      var score = 0;
      if (first.indexOf(q) === 0) { score = 4; }
      else if (last.indexOf(q) === 0) { score = 3; }
      else if (full.indexOf(q) === 0) { score = 2; }
      else if (first.indexOf(q) !== -1 || last.indexOf(q) !== -1 || cls.indexOf(q) !== -1) { score = 1; }
      if (score) {
        matches.push({ score: score, pupil: pupil });
      }
    });
    matches.sort(function (a, b) {
      if (a.score !== b.score) { return b.score - a.score; }
      return String(a.pupil.first_name || "").localeCompare(String(b.pupil.first_name || ""), "en", { sensitivity: "base" }) ||
        String(a.pupil.last_name || "").localeCompare(String(b.pupil.last_name || ""), "en", { sensitivity: "base" }) ||
        String(a.pupil.class_name || "").localeCompare(String(b.pupil.class_name || ""), "en", { sensitivity: "base" });
    });
    return matches.slice(0, 8).map(function (entry) { return entry.pupil; });
  }

  function _pupilClassInputForName(inputEl) {
    var childId = inputEl.getAttribute("data-child-name") || "";
    if (childId) {
      return document.querySelector('[data-child-class="' + childId + '"]');
    }
    var pair = inputEl.closest(".batch-name-value-pair");
    return pair ? pair.querySelector(".celebration-batch-input--class") : null;
  }

  function _pupilPopover() {
    var popover = byId("pupilAutocompletePopover");
    if (!popover) {
      popover = document.createElement("div");
      popover.id = "pupilAutocompletePopover";
      popover.className = "autocomplete-popover hidden";
      document.body.appendChild(popover);
    }
    return popover;
  }

  function _hidePupilSuggestions() {
    var popover = byId("pupilAutocompletePopover");
    if (popover) { popover.classList.add("hidden"); }
    pupilAutocomplete.input = null;
    pupilAutocomplete.options = [];
  }

  function _positionPupilPopover(inputEl, popover) {
    var rect = inputEl.getBoundingClientRect();
    popover.style.left = rect.left + "px";
    popover.style.top = (rect.bottom + 4) + "px";
    popover.style.width = Math.max(rect.width, 260) + "px";
  }

  function _renderPupilSuggestions(inputEl, options, query) {
    var popover = _pupilPopover();
    pupilAutocomplete.input = inputEl;
    pupilAutocomplete.options = options;
    pupilAutocomplete.selectedIndex = 0;
    _positionPupilPopover(inputEl, popover);

    if (!options.length) {
      popover.innerHTML = '<div class="autocomplete-popover__note">Name not found in Arbor. You can still save it.</div>';
      popover.classList.remove("hidden");
      return;
    }

    popover.innerHTML = options.map(function (pupil, index) {
      var meta = [pupil.last_name || "", pupil.class_name || ""].filter(Boolean).join(" - ");
      return '<button class="autocomplete-option' + (index === 0 ? " is-active" : "") + '" type="button" data-pupil-option="' + index + '">' +
        '<span class="autocomplete-option__main">' + escapeText(pupil.first_name || "") + '</span>' +
        '<span class="autocomplete-option__meta">' + escapeText(meta) + '</span>' +
        '</button>';
    }).join("");
    popover.classList.remove("hidden");
  }

  function _applyPupilSuggestion(inputEl, pupil) {
    if (!inputEl || !pupil) { return; }
    inputEl.value = pupil.first_name || "";
    try { inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length); } catch (_) { /* ignore */ }
    var classInput = _pupilClassInputForName(inputEl);
    if (classInput && pupil.class_name) {
      classInput.value = pupil.class_name;
    }
    _hidePupilSuggestions();
  }

  function _handlePupilNameInput(inputEl) {
    if (!state.pupilNames.length) { return; }
    var query = _typedAutocompletePrefix(inputEl);
    if (!query.trim()) {
      _hidePupilSuggestions();
      return;
    }
    var options = _pupilSuggestions(query);
    var firstPrefix = options.filter(function (pupil) {
      return _normaliseSearchText(pupil.first_name).indexOf(_normaliseSearchText(query)) === 0;
    })[0];

    // Only inline-complete first-name prefixes. Surname matches stay in the
    // disambiguation list so typing "Sm" can suggest Alice Smith without
    // replacing the user's typed surname fragment too early.
    if (firstPrefix && inputEl.selectionStart === inputEl.selectionEnd && _normaliseSearchText(inputEl.value) === _normaliseSearchText(query)) {
      var start = inputEl.value.length;
      inputEl.value = firstPrefix.first_name || inputEl.value;
      try { inputEl.setSelectionRange(start, inputEl.value.length); } catch (_) { /* ignore */ }
    }
    _renderPupilSuggestions(inputEl, options, query);
  }


  function _autoTvLabel(ruleId) {
    var onInput = document.querySelector('input[data-tv-on="' + ruleId + '"]');
    var offInput = document.querySelector('input[data-tv-off="' + ruleId + '"]');
    var labelInput = document.querySelector('input[data-tv-label="' + ruleId + '"]');
    var daysWrap = document.querySelector('[data-tv-days="' + ruleId + '"]');
    if (!onInput || !offInput || !labelInput || !daysWrap) { return; }
    if (labelInput.dataset.userEdited) { return; }
    var checked = [];
    daysWrap.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (cb.checked) { checked.push(cb.value); }
    });
    var dayAbbr = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
    var dayParts = checked.map(function (d) { return dayAbbr[d] || d; });
    var dayStr = "";
    if (dayParts.length === 5 && ["Mon","Tue","Wed","Thu","Fri"].every(function (d) { return dayParts.indexOf(d) !== -1; })) {
      dayStr = "Mon–Fri";
    } else if (dayParts.length > 0) {
      dayStr = dayParts.join(", ");
    }
    var on = onInput.value || "";
    var off = offInput.value || "";
    var parts = [];
    if (dayStr) { parts.push(dayStr); }
    if (on) { parts.push("on from " + on); }
    if (off) { parts.push("until " + off); }
    labelInput.value = parts.join(" ") || "New rule";
  }

  function _tvRuleSummary(rule) {
    var ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    var DAY_SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
    var days = (rule.days || []).slice().sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
    var daysText;
    if (days.join(",") === "mon,tue,wed,thu,fri") { daysText = "Mon–Fri"; }
    else if (days.join(",") === "mon,tue,wed,thu,fri,sat,sun") { daysText = "Every day"; }
    else if (days.join(",") === "sat,sun") { daysText = "Sat–Sun"; }
    else { daysText = days.map(function (d) { return DAY_SHORT[d] || d; }).join(", ") || "No days selected"; }
    var timeText = (rule.onTime && rule.offTime) ? rule.onTime + " – " + rule.offTime
      : rule.onTime ? "on " + rule.onTime
      : rule.offTime ? "off " + rule.offTime : "";
    var parts = [daysText];
    if (timeText) { parts.push(timeText); }
    return parts.join("  ·  ");
  }

  function renderTvSchedule() {
    var wrap = byId("tvPowerRules");
    wrap.innerHTML = "";
    byId("tvPowerEnabled").checked = !!state.tvPowerSchedule.enabled;
    syncToggleText("tvPowerEnabled", "tvPowerEnabledText", "Enabled", "Disabled");
    (state.tvPowerSchedule.rules || []).forEach(function (rule) {
      var isExpanded = !!_expandedTvRuleIds[rule.id];
      var card = document.createElement("article");
      card.className = "repeater-card tv-rule-card";

      var summaryRow = document.createElement("div");
      summaryRow.className = "tv-rule-summary";

      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn btn-ghost btn-icon tv-rule-toggle";
      toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      toggleBtn.setAttribute("title", isExpanded ? "Collapse" : "Expand");
      toggleBtn.textContent = isExpanded ? "▼" : "▶";

      var label = document.createElement("span");
      label.className = "tv-rule-summary__label";
      label.textContent = rule.label || _tvRuleSummary(rule);

      var meta = document.createElement("span");
      meta.className = "tv-rule-summary__meta";
      meta.textContent = rule.label ? _tvRuleSummary(rule) : "";

      var badge = document.createElement("span");
      badge.className = "badge " + (rule.enabled ? "badge--active" : "badge--inactive");
      badge.textContent = rule.enabled ? "On" : "Off";

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-ghost btn-sm";
      removeBtn.setAttribute("data-remove-tv-rule", rule.id);
      removeBtn.textContent = "Remove";

      summaryRow.appendChild(toggleBtn);
      summaryRow.appendChild(label);
      summaryRow.appendChild(meta);
      summaryRow.appendChild(badge);
      summaryRow.appendChild(removeBtn);
      card.appendChild(summaryRow);

      var details = document.createElement("div");
      details.className = "tv-rule-details stack";
      if (!isExpanded) { details.setAttribute("hidden", ""); }
      details.innerHTML =
        '<div class="field-grid">' +
        '<div><label>Label <span class="form-hint">(auto-fills from days/times — type to override)</span></label><input type="text" data-tv-label="' + rule.id + '" value="' + escapeAttribute(rule.label) + '"></div>' +
        '<div><label>Enabled</label><label class="switch-toggle"><input type="checkbox" data-tv-enabled="' + rule.id + '"' + (rule.enabled ? " checked" : "") + '><span class="switch-toggle__slider"></span><span class="switch-toggle__text">' + (rule.enabled ? "Enabled" : "Disabled") + '</span></label></div>' +
        '</div>' +
        '<div class="field-grid">' +
        '<div><label>On time</label><input type="time" data-tv-on="' + rule.id + '" value="' + escapeAttribute(rule.onTime) + '"></div>' +
        '<div><label>Off time</label><input type="time" data-tv-off="' + rule.id + '" value="' + escapeAttribute(rule.offTime) + '"></div>' +
        '</div>' +
        '<div><label>Days</label><div class="day-grid" data-tv-days="' + rule.id + '"></div></div>';
      card.appendChild(details);

      toggleBtn.addEventListener("click", function () {
        var expanded = toggleBtn.getAttribute("aria-expanded") === "true";
        var nowExpanded = !expanded;
        toggleBtn.setAttribute("aria-expanded", nowExpanded ? "true" : "false");
        toggleBtn.setAttribute("title", nowExpanded ? "Collapse" : "Expand");
        toggleBtn.textContent = nowExpanded ? "▼" : "▶";
        if (nowExpanded) {
          details.removeAttribute("hidden");
          _expandedTvRuleIds[rule.id] = true;
        } else {
          details.setAttribute("hidden", "");
          delete _expandedTvRuleIds[rule.id];
        }
      });

      wrap.appendChild(card);

      var labelInput = details.querySelector('input[data-tv-label="' + rule.id + '"]');
      if (labelInput) {
        labelInput.addEventListener("input", function () {
          labelInput.dataset.userEdited = "1";
          label.textContent = labelInput.value || _tvRuleSummary(rule);
        });
      }
      var daysWrap = details.querySelector('[data-tv-days="' + rule.id + '"]');
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].forEach(function (day) {
        var dayLabel = document.createElement("label");
        dayLabel.innerHTML = '<input type="checkbox" value="' + day + '"' + ((rule.days || []).indexOf(day) !== -1 ? " checked" : "") + '> ' + day.toUpperCase();
        daysWrap.appendChild(dayLabel);
        dayLabel.querySelector("input").addEventListener("change", function () {
          _autoTvLabel(rule.id);
        });
      });
      var onInput = details.querySelector('input[data-tv-on="' + rule.id + '"]');
      var offInput = details.querySelector('input[data-tv-off="' + rule.id + '"]');
      if (onInput) { onInput.addEventListener("change", function () { _autoTvLabel(rule.id); }); }
      if (offInput) { offInput.addEventListener("change", function () { _autoTvLabel(rule.id); }); }
    });
  }

  function reloadTvPowerHistory() {
    return api("/api/tv-power/history").then(function (payload) {
      state.tvPowerHistory = (payload && payload.entries) || [];
      renderTvPowerHistory();
      return payload;
    });
  }

  function renderTvPowerHistory() {
    var wrap = byId("tvPowerHistory");
    if (!wrap) { return; }
    wrap.innerHTML = "";
    if (!state.tvPowerHistory.length) {
      wrap.innerHTML = '<article class="repeater-card muted">No TV power actions recorded yet.</article>';
      return;
    }
    state.tvPowerHistory.slice().reverse().slice(0, 20).forEach(function (entry) {
      var card = document.createElement("article");
      card.className = "repeater-card";
      var label = entry.label ? (" (" + escapeText(entry.label) + ")") : "";
      var action = escapeText((entry.action || "").toUpperCase());
      var when = entry.at ? new Date(entry.at).toLocaleString("en-GB") : "";
      var statusClass = entry.status === "error" ? "badge--inactive" : "badge--active";
      var errorText = entry.error ? ('<div class="muted" style="margin-top:0.35rem;">' + escapeText(entry.error) + "</div>") : "";
      card.innerHTML =
        '<div class="item-title-row"><span class="item-title">' + action + label + '</span><span class="badge ' + statusClass + '">' + escapeText(entry.status || "") + "</span></div>" +
        '<div class="item-subtitle">' + escapeText(entry.type || "") + (when ? (" • " + when) : "") + "</div>" +
        errorText;
      wrap.appendChild(card);
    });
  }

  function renderPageSettings() {
    var wrap = byId("pageSettingsList");
    if (!wrap) { return; }
    wrap.innerHTML = "";
    if (!state.builtInPages.length) { return; }
    state.builtInPages.forEach(function (page) {
      var row = document.createElement("article");
      row.className = "page-settings-row";
      row.dataset.pageKey = page.key;
      row.dataset.themePrefix = "builtin-" + page.key;
      var defaultTitle = (page._defaultTitle || page.title);
      var isCustom = !!(page._customTitle);
      row.innerHTML =
        '<div class="page-settings-row__info">' +
        '<div class="page-settings-row__name">' + escapeText(page.title) + (isCustom ? ' <span class="page-settings-badge">renamed</span>' : '') + '</div>' +
        '<div class="page-settings-row__url muted">' + escapeText(page.url) + '</div>' +
        '</div>' +
        '<div class="page-settings-row__edit">' +
        '<input class="page-settings-title-input" type="text" placeholder="' + escapeAttribute(defaultTitle) + '" value="' + escapeAttribute(isCustom ? page.title : '') + '" aria-label="Rename ' + escapeAttribute(defaultTitle) + '">' +
        '</div>' +
        '<div class="page-settings-row__actions">' +
        '<button class="btn btn-sm btn-success" type="button" data-save-page-settings="' + escapeAttribute(page.key) + '">Save</button>' +
        (isCustom ? '<button class="btn btn-sm btn-ghost" type="button" data-reset-page-settings="' + escapeAttribute(page.key) + '">Reset</button>' : '') +
        '</div>';
      wrap.appendChild(row);
    });
  }

  function savePageSettings(key) {
    var row = document.querySelector('[data-page-key="' + key + '"]');
    if (!row) { return; }
    var input = row.querySelector('.page-settings-title-input');
    var title = input ? input.value.trim() : "";
    var statusEl = byId("saveStatusPageSettings");
    api("/api/page-settings/" + encodeURIComponent(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title,
      })
    }).then(function (data) {
      if (data.error) {
        if (statusEl) { statusEl.textContent = "Error: " + data.error; }
        return;
      }
      // Update local state
      for (var i = 0; i < state.builtInPages.length; i++) {
        if (state.builtInPages[i].key === key) {
          state.builtInPages[i]._customTitle = title || null;
          state.builtInPages[i].title = title || state.builtInPages[i]._defaultTitle || state.builtInPages[i].title;
          break;
        }
      }
      renderPageSettings();
      renderRotation(); // refresh template select
      if (statusEl) { statusEl.textContent = "Saved."; setTimeout(function () { if (statusEl) { statusEl.textContent = ""; } }, 3000); }
    }).catch(function (err) {
      if (statusEl) { statusEl.textContent = "Save failed."; }
    });
  }

  function resetPageSettings(key) {
    var statusEl = byId("saveStatusPageSettings");
    api("/api/page-settings/" + encodeURIComponent(key), { method: "DELETE" })
      .then(function () {
        for (var i = 0; i < state.builtInPages.length; i++) {
          if (state.builtInPages[i].key === key) {
            state.builtInPages[i]._customTitle = null;
            state.builtInPages[i].title = state.builtInPages[i]._defaultTitle || state.builtInPages[i].title;
            state.builtInPages[i].themeKey = "";
            state.builtInPages[i].themeElements = defaultThemeElements();
            break;
          }
        }
        renderPageSettings();
        renderRotation();
        if (statusEl) { statusEl.textContent = "Reset to default."; setTimeout(function () { if (statusEl) { statusEl.textContent = ""; } }, 3000); }
      }).catch(function () {
        if (statusEl) { statusEl.textContent = "Reset failed."; }
      });
  }

  function renderNoticesItems() {
    var wrap = byId("noticesItemsList");
    wrap.innerHTML = "";
    (state.notices.notes || []).forEach(function (note, index) {
      var row = document.createElement("article");
      row.className = "repeater-card";
      row.innerHTML =
        '<div class="btn-row" style="justify-content:space-between;">' +
        '<span style="flex:1;">' + escapeText(note) + "</span>" +
        '<button class="btn btn-sm btn-danger" type="button" data-remove-notice-index="' + index + '">Remove</button>' +
        "</div>";
      wrap.appendChild(row);
    });
  }

  function renderAttendanceItems() {
    var wrap = byId("attendanceMessagesList");
    wrap.innerHTML = "";
    (state.attendanceMessages || []).forEach(function (message, index) {
      var row = document.createElement("article");
      row.className = "repeater-card";
      row.innerHTML =
        '<div class="btn-row" style="justify-content:space-between;">' +
        '<span style="flex:1;">' + escapeText(message) + "</span>" +
        '<button class="btn btn-sm btn-danger" type="button" data-remove-attendance-index="' + index + '">Remove</button>' +
        "</div>";
      wrap.appendChild(row);
    });
  }

  function renderContentFields() {
    byId("welcomeMessage").value = state.notices.message || "";
    renderNoticesItems();
    renderAttendanceItems();
    renderTickers();
    renderOverlays();
    renderAssemblySection();
    renderClassOrder();
    renderClassDojoRoster();
    renderTvSchedule();
    renderTvPowerHistory();
  }

  function healthStatusText(status) {
    if (status === "ok") { return "Ready"; }
    if (status === "stale") { return "Stale"; }
    if (status === "missing") { return "Missing"; }
    if (status === "error") { return "Needs attention"; }
    if (status === "warning") { return "Check"; }
    return "Unknown";
  }

  function renderDashboardHealth() {
    var summaryEl = byId("dashboardHealthSummary");
    var listEl = byId("dashboardHealthList");
    if (!summaryEl || !listEl) {
      return;
    }
    var health = state.dashboardHealth || {};
    var status = health.status || "warning";
    var player = health.player || {};
    var configured = health.configured || {};
    var missingConfig = Array.isArray(health.missingConfig) ? health.missingConfig : [];
    var configBits = [
      configured.arborAttendance ? "Arbor attendance configured" : "Arbor attendance missing",
      configured.spotify ? "Spotify configured" : "Spotify missing",
      configured.classdojo ? "ClassDojo configured" : "ClassDojo missing",
    ];

    summaryEl.className = "health-overview health-overview--" + status;
    summaryEl.innerHTML =
      '<div class="health-overview__main">' +
        '<span class="health-pill health-pill--' + escapeAttribute(status) + '">' + escapeText(healthStatusText(status)) + '</span>' +
        '<div>' +
          '<strong>' + escapeText(health.summary || "Checking dashboard status...") + '</strong>' +
          '<span>' + escapeText((player.message || "Player status not loaded.") + " " + configBits.join(" · ")) + '</span>' +
        '</div>' +
      '</div>' +
      (missingConfig.length ? '<div class="health-overview__config">Missing .env values: ' + escapeText(missingConfig.join(", ")) + '</div>' : "");

    var details = Array.isArray(health.sourceDetails) ? health.sourceDetails : [];
    if (!details.length) {
      listEl.innerHTML = '<article class="health-card health-card--warning"><strong>No health data yet</strong><span>Press Refresh Status to check the dashboard.</span></article>';
      return;
    }
    var cards = details.map(function (item) {
      var itemStatus = item.status || "warning";
      return '<article class="health-card health-card--' + escapeAttribute(itemStatus) + '">' +
        '<div class="health-card__top">' +
          '<strong>' + escapeText(item.label || item.key || "Source") + '</strong>' +
          '<span class="health-pill health-pill--' + escapeAttribute(itemStatus) + '">' + escapeText(healthStatusText(itemStatus)) + '</span>' +
        '</div>' +
        '<span>' + escapeText(item.message || "") + '</span>' +
        '<small>' + escapeText(item.updated ? ((item.ageLabel || "Updated") + " · " + item.updated) : "Never updated") + '</small>' +
      '</article>';
    });
    cards.push(
      '<article class="health-card health-card--' + escapeAttribute(player.status || "warning") + '">' +
        '<div class="health-card__top">' +
          '<strong>Player playlist</strong>' +
          '<span class="health-pill health-pill--' + escapeAttribute(player.status || "warning") + '">' + escapeText(healthStatusText(player.status || "warning")) + '</span>' +
        '</div>' +
        '<span>' + escapeText(player.message || "Player status not loaded.") + '</span>' +
        '<small>' + escapeText((player.items || 0) + " active item" + ((player.items || 0) === 1 ? "" : "s")) + '</small>' +
      '</article>'
    );
    listEl.innerHTML = cards.join("");
  }

  function loadDashboardHealth() {
    return api("/api/health").then(function (payload) {
      state.dashboardHealth = payload || {};
      renderDashboardHealth();
      return payload;
    }).catch(function (error) {
      state.dashboardHealth = {
        status: "error",
        summary: "Could not load dashboard health.",
        player: { status: "error", message: error.message || "Request failed", items: 0 },
        sourceDetails: [],
        configured: {},
        missingConfig: [],
      };
      renderDashboardHealth();
      flash("Health check failed: " + error.message, "error");
      return null;
    });
  }

  function renderAll() {
    renderRotation();
    renderMedia();
    renderPageBuilder();
    renderContentFields();
    renderPageSettings();
    renderClassDojoAuthCard();
    renderClassDojoEventsAdmin();
    renderDashboardHealth();
  }

  function saveNotices() {
    var message = byId("welcomeMessage").value;
    var notes = (state.notices.notes || []).slice();
    var overlaySummary = state.overlays.filter(function (overlay) { return overlay.active; })[0] || {};
    api("/api/notices", {
      method: "POST",
      body: JSON.stringify({
        message: message,
        notes: notes,
        overlays: state.overlays,
        emergency_active: !!overlaySummary.active,
        emergency_message: overlaySummary.message || "",
        overlay_title: overlaySummary.overlay_title || defaultOverlayTitle(overlaySummary.overlay_type || "emergency"),
        overlay_type: overlaySummary.overlay_type || "emergency",
        overlay_icon: overlaySummary.overlay_icon || "🚨",
        overlay_logo_url: "",
      }),
    }).then(function () {
      state.notices.message = message;
      state.notices.notes = notes;
      flash("Notices saved.", "success");
      setSaveStatus("saveStatusNotices");
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function saveAttendanceMessages() {
    var messages = (state.attendanceMessages || []).slice();
    api("/api/attendance/message", {
      method: "POST",
      body: JSON.stringify({ messages: messages }),
    }).then(function () {
      state.attendanceMessages = messages;
      flash("Attendance messages saved.", "success");
      setSaveStatus("saveStatusAttendanceMessages");
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function collectTickers() {
    upsertTickerFromEditor();
  }

  function saveTickers() {
    var action = upsertTickerFromEditor();
    api("/api/tickers", {
      method: "POST",
      body: JSON.stringify({ tickers: state.tickers }),
    }).then(function () {
      flash(action === "updated" ? "Ticker updated." : "Ticker created.", "success");
      setSaveStatus("saveStatusTickers");
      if (action !== "updated") {
        state.selectedTickerId = "";
        hideTickerFormPanel();
      }
      return reloadTickers();
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function saveOverlays() {
    var action = upsertOverlayFromEditor();
    api("/api/overlays", {
      method: "POST",
      body: JSON.stringify({ overlays: state.overlays }),
    }).then(function () {
      flash(action === "updated" ? "Overlay updated." : "Overlay created.", "success");
      setSaveStatus("saveStatusOverlays");
      saveNotices();
      if (action !== "updated") {
        state.selectedOverlayId = "";
        hideOverlayFormPanel();
      }
      return reloadOverlays();
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function collectSlotChildren(slot) {
    var asm = slot === "current" ? state.currentAssembly : state.upcomingAssembly;
    if (!asm) { return; }
    asm.children = asm.children.map(function (child) {
      var nameInput = document.querySelector('[data-child-name="' + child.id + '"]');
      var classInput = document.querySelector('[data-child-class="' + child.id + '"]');
      var valueInput = document.querySelector('[data-child-value="' + child.id + '"]');
      var resolved = valueInput ? _resolveValue(valueInput.value) : { key: child.value_key, label: child.value_label };
      return {
        id: child.id,
        name: nameInput ? nameInput.value : child.name,
        class_name: classInput ? classInput.value.trim() : (child.class_name || ""),
        photo_url: child.photo_url || "",
        use_photo: child.use_photo === true,
        photo_focal_x: child.photo_focal_x != null ? child.photo_focal_x : 50,
        photo_focal_y: child.photo_focal_y != null ? child.photo_focal_y : 50,
        value_key: resolved.key,
        value_label: resolved.label,
        _selected: !!child._selected,
      };
    }).filter(function (c) { return c.name.trim(); });
  }

  function _syncDojoDefaultMessage() {
    var msgEl = byId("celebrationDojoMessage");
    if (!msgEl || msgEl.dataset.userEdited) { return; }
    var asm = state.upcomingAssembly || state.currentAssembly;
    var date = asm ? asm.assembly_date : "";
    var dateFormatted = date ? new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "today";
    var children = asm ? asm.children : [];

    function _formatNameList(names) {
      if (!names.length) { return ""; }
      if (names.length === 1) { return names[0]; }
      return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
    }

    var grouped = {};
    children.forEach(function (child) {
      var name = (child && child.name ? child.name : "").trim();
      if (!name) { return; }
      var className = (child.class_name || "").trim();
      var yearGroup = (className && state.classYearGroupMap[className]) ? state.classYearGroupMap[className] : "";
      if (!yearGroup) { yearGroup = "Unassigned"; }
      if (!grouped[yearGroup]) { grouped[yearGroup] = []; }
      grouped[yearGroup].push(name);
    });

    function _minClassOrderForYearGroup(yg) {
      var minIdx = Infinity;
      Object.keys(state.classYearGroupMap).forEach(function (cls) {
        if (state.classYearGroupMap[cls] === yg) {
          var idx = state.classOrder.indexOf(cls);
          if (idx !== -1 && idx < minIdx) { minIdx = idx; }
        }
      });
      return minIdx === Infinity ? 9999 : minIdx;
    }
    var yearGroups = Object.keys(grouped).sort(function (a, b) {
      return _minClassOrderForYearGroup(a) - _minClassOrderForYearGroup(b);
    });

    var yearLines = yearGroups.map(function (yearGroup) {
      var names = grouped[yearGroup].slice().sort(function (a, b) {
        return a.localeCompare(b, "en", { sensitivity: "base" });
      });
      return yearGroup + ": " + _formatNameList(names);
    });

    var message = "Congratulations to the following children who received a certificate in our Celebration Assembly on " + dateFormatted + ":";
    if (yearLines.length) {
      message += "\n\n" + yearLines.join("\n");
    } else {
      message += "\n\nour amazing children";
    }
    message += "\nWe are incredibly proud of you!";
    msgEl.value = message;
  }

  function _serialiseSlot(slot) {
    var asm = slot === "current" ? state.currentAssembly : state.upcomingAssembly;
    if (!asm) { return []; }
    return asm.children.map(function (child) {
      return {
        id: child.id,
        name: child.name,
        class_name: child.class_name || "",
        photo_url: child.photo_url || "",
        use_photo: child.use_photo === true,
        photo_focal_x: child.photo_focal_x != null ? child.photo_focal_x : 50,
        photo_focal_y: child.photo_focal_y != null ? child.photo_focal_y : 50,
        value_key: child.value_key || "",
        value_label: child.value_label || "",
      };
    });
  }

  function saveAssembly(slot, opts) {
    opts = opts || {};
    collectSlotChildren(slot);
    var asm = slot === "current" ? state.currentAssembly : state.upcomingAssembly;
    if (!asm || !asm.assembly_date) {
      if (!opts.silent) { flash("Please set an assembly date before saving.", "error"); }
      return Promise.resolve();
    }
    var endpoint = slot === "current" ? "/api/celebration-children/current" : "/api/celebration-children";
    return api(endpoint, {
      method: "POST",
      body: JSON.stringify({ children: _serialiseSlot(slot), assembly_date: asm.assembly_date }),
    }).then(function (resp) {
      asm._editingDate = false;
      if (slot === "upcoming" && resp && resp.upcoming) {
        asm.classdojo_post_id = resp.upcoming.classdojo_post_id || asm.classdojo_post_id;
      }
      if (!opts.silent) {
        var msg = slot === "current"
          ? (window.DashboardRemote && window.DashboardRemote.enabled ? "Current assembly saved to GitHub. Waiting for Pi." : "Current assembly updated. Changes are immediately live.")
          : "Upcoming assembly saved. Will go live at 3:30 pm on " + asm.assembly_date + ".";
        flash(msg, "success");
        var statusEl = byId(slot + "-save-status");
        if (statusEl) { statusEl.textContent = "Saved."; }
        if (slot === "current") { renderCurrentAssemblyCard(); } else { renderUpcomingAssemblyCard(); }
      }
    }).catch(function (e) {
      if (!opts.silent) { flash(e.message, "error"); }
    });
  }

  function autoSaveAssembly(slot) {
    if (window.DashboardRemote && window.DashboardRemote.enabled) {
      var status = byId(slot + "-save-status");
      if (status) { status.textContent = "Unsaved changes — tap Save when ready."; }
      return;
    }
    var asm = slot === "current" ? state.currentAssembly : state.upcomingAssembly;
    if (asm && asm.assembly_date) { saveAssembly(slot, { silent: true }); }
  }

  function createUpcomingAssembly() {
    var dateEl = byId("celebrationNewDate");
    var date = dateEl ? dateEl.value : "";
    if (!date) { flash("Please choose an assembly date.", "error"); return; }
    state.upcomingAssembly = { assembly_date: date, children: [], _editingDate: false };
    renderUpcomingAssemblyCard();
    saveAssembly("upcoming", { silent: true });
  }

  function previewDojoImage() {
    if (window.DashboardRemote && window.DashboardRemote.enabled) {
      flash("Image previews use local photos. Open Pi Connect to preview the image.", "error");
      return;
    }
    var title = (byId("celebrationDojoTitle") || {}).value || "Celebration Assembly";
    var asm = state.upcomingAssembly;
    var previewSource = (asm && asm.children && asm.children.length) ? "upcoming" : "current";
    function _showPreview() {
      var url = "/api/celebration-post/preview?title=" + encodeURIComponent(title) + "&source=" + encodeURIComponent(previewSource) + "&t=" + Date.now();
      var img = byId("celebrationDojoPreviewImg");
      var wrap = byId("celebrationDojoPreview");
      if (!img || !wrap) { return; }
      fetch(url, { cache: "no-store" }).then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error(text || ("Preview request failed (" + response.status + ")"));
          });
        }
        return response.blob();
      }).then(function (blob) {
        var objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
        wrap.classList.remove("hidden");
      }).catch(function (error) {
        flash("Image preview failed: " + error.message, "error");
      });
    }
    if (previewSource === "upcoming" && asm && asm.children.length && asm.assembly_date) {
      saveAssembly("upcoming", { silent: true }).then(_showPreview).catch(_showPreview);
    } else {
      _showPreview();
    }
  }

  function updateDojoResponsePanel(payload) {
    var wrap = byId("dojoResponseWrap");
    var output = byId("dojoResponseOutput");
    if (!wrap || !output) {
      return;
    }
    if (!payload) {
      output.textContent = "";
      wrap.classList.add("hidden");
      wrap.open = false;
      return;
    }
    output.textContent = JSON.stringify(payload, null, 2);
    wrap.classList.remove("hidden");
    wrap.open = true;
  }

  function classDojoAuthData() {
    return state.classDojoAuth || { needs_code: false, message: "", error_code: "", fallback_message: "", updated: "" };
  }

  function renderClassDojoAuthCard() {
    var auth = classDojoAuthData();
    var codeSection = byId("classDojoCodeSection");
    var codeStatus = byId("classDojoCodeStatus");
    var needsCode = !!auth.needs_code;
    if (codeSection) {
      codeSection.classList.toggle("hidden", !needsCode);
    }
    if (codeStatus) {
      codeStatus.textContent = needsCode
        ? (auth.message || "ClassDojo has requested a 6-digit code for this login.")
        : "No code is needed right now. Press Reset ClassDojo Login if ClassDojo asks for one.";
    }
    if (!needsCode && dojoCodeInput()) {
      dojoCodeInput().value = "";
    }
    syncDojoCodeInput();
  }

  function postToDojo() {
    var asm = state.upcomingAssembly;
    if (!asm || !asm.children.length) {
      flash("Save an upcoming assembly first, then schedule the ClassDojo post.", "error");
      return;
    }
    var message = (byId("celebrationDojoMessage") || {}).value || "";
    var title = (byId("celebrationDojoTitle") || {}).value || "Celebration Assembly";
    setSaveStatus("saveStatusCelebrationDojo", "Sending to ClassDojo\u2026");
    updateDojoResponsePanel({ status: "sending" });
    api("/api/celebration-post", {
      method: "POST",
      body: JSON.stringify({ message: message, title: title }),
    }).then(function (result) {
      if (result.queued) {
        flash("ClassDojo post request saved to GitHub. Waiting for Pi.", "success");
        setSaveStatus("saveStatusCelebrationDojo", "Waiting for Pi — check sync status above.");
        return;
      }
      var when = result && result.scheduled_at ? new Date(result.scheduled_at).toLocaleString("en-GB") : "3:30 pm on " + asm.assembly_date;
      updateDojoResponsePanel(result);
      flash("Post scheduled on ClassDojo for " + when + ".", "success");
      setSaveStatus("saveStatusCelebrationDojo", "Scheduled \u2713 " + when);
      if (state.upcomingAssembly) {
        state.upcomingAssembly.classdojo_post_id = (result && result.post_id) || "scheduled";
        renderUpcomingAssemblyCard();
      }
    }).catch(function (error) {
      updateDojoResponsePanel((error && error.payload) ? error.payload : {
        success: false,
        error: error.message || "Request failed",
      });
      flash("ClassDojo post failed: " + error.message, "error");
      setSaveStatus("saveStatusCelebrationDojo");
    });
  }

  function classDojoEventsData() {
    return state.classDojoEvents || { updated: "", summary: {}, groups: [], suggestions: [], classes: { updated: "", count: 0, classes: [] } };
  }

  function selectedClassDojoGroupIds() {
    return state.selectedClassDojoGroupIds || [];
  }

  function setSelectedClassDojoGroupIds(ids) {
    var unique = {};
    (ids || []).forEach(function (id) {
      if (id) {
        unique[id] = true;
      }
    });
    state.selectedClassDojoGroupIds = Object.keys(unique);
  }

  function formatDojoTimestamp(value) {
    if (!value) {
      return "Not loaded yet";
    }
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString("en-GB");
  }

  function dojoSummaryRow(label, value) {
    return '<div class="dojo-event-summary__row">' +
      '<div class="dojo-event-summary__label">' + escapeText(label) + '</div>' +
      '<div class="dojo-event-summary__value">' + escapeText(value || "—") + '</div>' +
      "</div>";
  }

  function dojoDiffChip(change) {
    return '<span class="dojo-event-diff__chip"><strong>' + escapeText(change.field || "") + "</strong>: " +
      escapeText(change.before || "—") + " -> " +
      escapeText(change.after || "—") + "</span>";
  }

  function renderDojoSourceCard(source) {
    var parts = [];
    if (source.display_label) {
      parts.push(source.display_label);
    } else if (source.scope_label) {
      parts.push(source.scope_label);
    } else if (source.class_name) {
      parts.push(source.class_name);
    }
    if (source.year_group) {
      parts.push(source.year_group);
    }
    if (source.phase) {
      parts.push(source.phase);
    }
    if (source.date || source.time) {
      parts.push([source.date, source.time].filter(Boolean).join(" • "));
    }
    if (source.last_updated || source.last_seen) {
      parts.push("Updated " + formatDojoTimestamp(source.last_updated || source.last_seen));
    }
    var meta = parts.length ? parts.join(" • ") : "No details";
    return (
      '<article class="dojo-event-source' + (source.missing ? " is-missing" : "") + '">' +
      '<div class="dojo-event-source__title">' + escapeText(source.title || "Untitled event") + "</div>" +
      '<div class="dojo-event-source__meta">' + escapeText(meta) + "</div>" +
      '<div class="dojo-event-source__meta">ID ' + escapeText(source.source_id || "") + "</div>" +
      "</article>"
    );
  }

  function renderDojoGroupCard(group) {
    var selected = selectedClassDojoGroupIds().indexOf(group.id) !== -1;
    var titleInputId = "dojoGroupTitle-" + group.id;
    var scopeInputId = "dojoGroupScope-" + group.id;
    var selectInputId = "dojoGroupSelect-" + group.id;
    var badges = [];
    if (group.source_count > 1) {
      badges.push('<span class="dojo-event-badge linked">' + escapeText(group.source_count + " linked") + "</span>");
    }
    if (group.missing_source_count) {
      var missingN = group.missing_source_count;
      var missingLabel = missingN === 1 ? "1 source unavailable" : missingN + " sources unavailable";
      var missingTip = "A ClassDojo event that was previously linked here has been deleted or is no longer in the feed. The group continues to show using the remaining sources.";
      badges.push('<span class="dojo-event-badge missing" title="' + escapeAttribute(missingTip) + '">' + escapeText(missingLabel) + "</span>");
    }
    if (group.has_pending_changes) {
      badges.push('<span class="dojo-event-badge pending">' + escapeText(group.pending_changes.length + " pending") + "</span>");
    } else {
      badges.push('<span class="dojo-event-badge reviewed">Reviewed</span>');
    }
    if (group.reviewed_at) {
      badges.push('<span class="dojo-event-badge">' + escapeText("Checked " + formatDojoTimestamp(group.reviewed_at)) + "</span>");
    }
    var currentSource = group.canonical_source || {};
    var canonicalLabel = currentSource.display_label
      ? currentSource.display_label + (currentSource.source_id ? " (" + currentSource.source_id + ")" : "")
      : currentSource.class_name
        ? currentSource.class_name + (currentSource.source_id ? " (" + currentSource.source_id + ")" : "")
        : (currentSource.scope_label || currentSource.source_id || "—");
    var pendingHtml = group.pending_changes && group.pending_changes.length
      ? '<div class="dojo-event-diff">' + group.pending_changes.map(dojoDiffChip).join("") + '<span class="dojo-event-diff__chip">ClassDojo changes are already live; mark reviewed when you have checked them.</span></div>'
      : '<div class="dojo-event-diff"><span class="dojo-event-diff__chip">No pending source changes</span></div>';
    var reviewButton = group.has_pending_changes
      ? '<button class="btn btn-sm btn-primary" type="button" data-dojo-group-accept="' + escapeAttribute(group.id) + '">Mark reviewed</button>'
      : "";
    var unlinkButton = group.source_count > 1
      ? '<button class="btn btn-sm btn-ghost" type="button" data-dojo-group-unlink="' + escapeAttribute(group.id) + '">Unlink</button>'
      : "";
    var sourcesHtml = (group.sources || []).map(renderDojoSourceCard).join("");

    // Scope checkboxes built from class roster in class order
    var rosterNames = _effectiveClassOrder();
    var overrideText = group.scope_label_override || "";
    var rawScopeRef = overrideText || group.scope_label || "";
    // Build a map of which roster names are currently checked, stripping " only" suffix from ClassDojo values
    var checkedMap = {};
    rawScopeRef.split(",").forEach(function (part) {
      var key = part.trim().replace(/\s+only$/i, "");
      if (key) { checkedMap[key] = true; }
    });
    var scopeCheckboxes = rosterNames.map(function (name) {
      var checked = !!checkedMap[name];
      return '<label class="dojo-scope-checkbox">' +
        '<input type="checkbox" data-dojo-scope-cb="' + escapeAttribute(group.id) + '" value="' + escapeAttribute(name) + '"' + (checked ? " checked" : "") + '> ' +
        escapeText(name) + "</label>";
    }).join("");
    // Any text in the override that doesn't correspond to a roster name goes into the custom field
    var customText = overrideText;
    rosterNames.forEach(function (name) {
      customText = customText.replace(name, "");
    });
    // Strip orphaned "only" words left by ClassDojo-style scope labels (e.g. "Cedar only" → "only")
    customText = customText.replace(/\bonly\b/gi, "").replace(/^[,\s]+|[,\s]+$/g, "").replace(/,\s*,/g, ", ").trim();

    var titleResetBtn = group.title_override
      ? '<button class="btn btn-ghost btn-sm" type="button" data-dojo-group-reset-title="' + escapeAttribute(group.id) + '">Reset</button>'
      : "";
    var scopeResetBtn = group.scope_label_override
      ? '<button class="btn btn-ghost btn-sm" type="button" data-dojo-group-reset-scope="' + escapeAttribute(group.id) + '">Reset</button>'
      : "";

    return (
      '<article class="multi-card dojo-event-card' + (selected ? " is-selected" : "") + '" data-dojo-group-card="' + escapeAttribute(group.id) + '">' +
      '<div class="dojo-event-card__select">' +
        '<input id="' + escapeAttribute(selectInputId) + '" type="checkbox" data-dojo-group-select="' + escapeAttribute(group.id) + '"' + (selected ? " checked" : "") + '>' +
      "</div>" +
      '<div class="dojo-event-card__body stack">' +
        '<div class="dojo-event-card__title-row">' +
          '<div class="dojo-event-card__title-field">' +
            '<label class="dojo-event-field-label" for="' + escapeAttribute(titleInputId) + '">Display name on dashboard</label>' +
            '<div class="dojo-event-field-input-row">' +
              '<input id="' + escapeAttribute(titleInputId) + '" class="dojo-event-title-input" type="text" data-dojo-group-title="' + escapeAttribute(group.id) + '" placeholder="' + escapeAttribute(group.display_title || "Untitled event") + '" value="' + escapeAttribute(group.title_override || "") + '">' +
              titleResetBtn +
            "</div>" +
          "</div>" +
          '<div class="dojo-event-badges">' + badges.join("") + "</div>" +
        "</div>" +
        '<div class="dojo-event-card__scope-field">' +
          '<div class="dojo-event-field-label-row"><span class="dojo-event-field-label">Audience — who is this event for?</span>' + scopeResetBtn + "</div>" +
          (scopeCheckboxes ? '<div class="dojo-scope-checkboxes">' + scopeCheckboxes + "</div>" : "") +
          '<input id="' + escapeAttribute(scopeInputId) + '" class="dojo-event-scope-input" type="text" data-dojo-group-scope="' + escapeAttribute(group.id) + '" placeholder="Additional text (optional)" value="' + escapeAttribute(customText) + '">' +
        "</div>" +
        '<div class="dojo-event-summary">' +
          '<div class="dojo-event-summary__cell"><span class="dojo-event-summary__label">Date</span><span class="dojo-event-summary__value">' + escapeText(group.date || "—") + "</span></div>" +
          '<div class="dojo-event-summary__cell"><span class="dojo-event-summary__label">Time</span><span class="dojo-event-summary__value">' + escapeText(group.time || "—") + "</span></div>" +
          '<div class="dojo-event-summary__cell dojo-event-summary__cell--wide"><span class="dojo-event-summary__label">Description</span><span class="dojo-event-summary__value">' + escapeText(group.description || "—") + "</span></div>" +
          '<div class="dojo-event-summary__cell dojo-event-summary__cell--wide"><span class="dojo-event-summary__label">Primary source</span><span class="dojo-event-summary__value">' + escapeText(canonicalLabel) + "</span></div>" +
        "</div>" +
        '<div class="btn-row">' +
          '<button class="btn btn-sm btn-success" type="button" data-dojo-group-save="' + escapeAttribute(group.id) + '">Save</button>' +
          reviewButton +
          unlinkButton +
        "</div>" +
        pendingHtml +
        '<details class="dojo-response">' +
          '<summary>Source details (' + escapeText(group.current_source_count + " current / " + group.source_count + " total") + ")</summary>" +
          '<div class="dojo-event-source-list">' + sourcesHtml + "</div>" +
        "</details>" +
      "</div>" +
      "</article>"
    );
  }

  function renderDojoSuggestionCard(suggestion) {
    var groupIds = Array.isArray(suggestion.group_ids) ? suggestion.group_ids : [];
    var titles = Array.isArray(suggestion.titles) ? suggestion.titles.filter(Boolean) : [];
    var classNames = Array.isArray(suggestion.class_names) ? suggestion.class_names.filter(Boolean) : [];
    var scopeLabel = suggestion.scope_label || "Likely duplicate";
    var labelBits = [];
    if (suggestion.confidence) {
      labelBits.push('<span class="dojo-event-badge reviewed">' + escapeText(suggestion.confidence) + "</span>");
    }
    if (suggestion.score !== undefined && suggestion.score !== null) {
      labelBits.push('<span class="dojo-event-badge linked">' + escapeText(Math.round((suggestion.score || 0) * 100) + "% match") + "</span>");
    }
    if (suggestion.group_count) {
      labelBits.push('<span class="dojo-event-badge">' + escapeText(suggestion.group_count + " events") + "</span>");
    }
    var titleLine = titles.length ? titles.join(" • ") : (suggestion.title || "Potential duplicate events");
    var detailLines = [];
    if (suggestion.date || suggestion.time) {
      detailLines.push([suggestion.date, suggestion.time].filter(Boolean).join(" • "));
    }
    if (classNames.length) {
      detailLines.push("Classes: " + classNames.join(", "));
    }
    if (suggestion.reason) {
      detailLines.push(suggestion.reason);
    }
    return (
      '<article class="multi-card dojo-event-card dojo-event-suggestion">' +
        '<div class="dojo-event-card__body stack">' +
          '<div class="dojo-event-card__title-row">' +
            '<div class="dojo-event-title-input dojo-event-title-input--readonly">' + escapeText(titleLine) + "</div>" +
            '<div class="dojo-event-badges">' + labelBits.join("") + "</div>" +
          "</div>" +
          '<div class="dojo-event-summary">' +
            dojoSummaryRow("Suggestion", scopeLabel) +
            dojoSummaryRow("Details", detailLines.join(" · ") || "Likely duplicate event") +
          "</div>" +
          '<div class="btn-row">' +
            '<button class="btn btn-sm btn-success" type="button" data-dojo-suggestion-link="' + escapeAttribute(groupIds.join("|")) + '">Link suggestion</button>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function renderClassDojoEventsAdmin() {
    var wrap = byId("dojoEventGroupList");
    var suggestionsWrap = byId("dojoEventSuggestionList");
    var data = classDojoEventsData();
    var classes = data.classes || { updated: "", count: 0, classes: [] };
    var summary = data.summary || {};
    var groups = Array.isArray(data.groups) ? data.groups.slice() : [];
    var suggestions = Array.isArray(data.suggestions) ? data.suggestions.slice() : [];
    var validIds = {};
    groups.forEach(function (group) {
      validIds[group.id] = true;
    });
    var activeSelection = selectedClassDojoGroupIds().filter(function (id) {
      return !!validIds[id];
    });
    if (activeSelection.length !== selectedClassDojoGroupIds().length) {
      state.selectedClassDojoGroupIds = activeSelection;
    }
    groups.sort(function (a, b) {
      var left = (a.date_sort || "") + "|" + (a.display_title || "");
      var right = (b.date_sort || "") + "|" + (b.display_title || "");
      return left.localeCompare(right);
    });

    var classesSummary = byId("dojoClassesSummary");
    var eventsSummary = byId("dojoEventsSummary");
    var mergeSummary = byId("dojoMergeSummary");
    if (classesSummary) {
      classesSummary.textContent = classes.count
        ? classes.count + " classes cached, updated " + formatDojoTimestamp(classes.updated)
        : "No class list cached yet.";
    }
    if (eventsSummary) {
      var sourceCount = summary.source_count || 0;
      var groupCount = summary.group_count || groups.length;
      var pendingCount = summary.pending_group_count || 0;
      var updatedAt = formatDojoTimestamp(data.updated);
      eventsSummary.textContent = sourceCount
        ? sourceCount + " source events in " + groupCount + " groups (" + pendingCount + " pending updates), updated " + updatedAt
        : "No events cached yet.";
    }
    if (mergeSummary) {
      var selectedCount = selectedClassDojoGroupIds().length;
      var suggestionCount = summary.suggestion_count || suggestions.length;
      mergeSummary.textContent = selectedCount
        ? selectedCount + " selected for linking"
        : suggestionCount
          ? suggestionCount + " likely duplicate suggestion" + (suggestionCount === 1 ? "" : "s") + " ready"
          : "No event groups selected yet.";
    }
    var suggestionSummary = byId("dojoSuggestionSummary");
    if (suggestionSummary) {
      var suggestionCountText = summary.suggestion_count || suggestions.length;
      suggestionSummary.textContent = suggestionCountText
        ? suggestionCountText + " likely duplicate suggestion" + (suggestionCountText === 1 ? "" : "s") + " detected."
        : "No likely duplicates detected.";
    }
    if (!wrap) {
      return;
    }
    if (suggestionsWrap) {
      if (!suggestions.length) {
        suggestionsWrap.innerHTML =
          '<article class="empty-state">' +
          '<div class="empty-state-icon">✨</div>' +
          '<div class="empty-state-text">No duplicate suggestions right now</div>' +
          "</article>";
      } else {
        suggestionsWrap.innerHTML = suggestions.map(renderDojoSuggestionCard).join("");
      }
    }
    if (!groups.length) {
      wrap.innerHTML =
        '<article class="empty-state">' +
        '<div class="empty-state-icon">📅</div>' +
        '<div class="empty-state-text">No ClassDojo events cached yet</div>' +
        "</article>";
      return;
    }
    wrap.innerHTML = groups.map(renderDojoGroupCard).join("");
  }

  function refreshDojoClasses() {
    api("/api/classdojo/events/refresh-classes", {
      method: "POST",
    }).then(function (result) {
      if (result && result.admin) {
        state.classDojoEvents = result.admin;
      }
      renderClassDojoEventsAdmin();
      flash(result.message || "Class list refreshed.", "success");
    }).catch(function (error) {
      flash("Class list refresh failed: " + error.message, "error");
    });
  }

  function refreshDojoEvents() {
    api("/api/classdojo/events/refresh-events", {
      method: "POST",
    }).then(function (result) {
      if (result && result.admin) {
        state.classDojoEvents = result.admin;
      }
      renderClassDojoEventsAdmin();
      flash(result.message || "Events refreshed.", "success");
    }).catch(function (error) {
      flash("Events refresh failed: " + error.message, "error");
    });
  }

  function mergeSelectedDojoGroups() {
    var selected = selectedClassDojoGroupIds();
    if (selected.length < 2) {
      flash("Select at least two event cards to link them together.", "error");
      return;
    }
    api("/api/classdojo/events/groups/merge", {
      method: "POST",
      body: JSON.stringify({ group_ids: selected }),
    }).then(function (result) {
      if (result && result.admin) {
        state.classDojoEvents = result.admin;
      }
      setSelectedClassDojoGroupIds([]);
      renderClassDojoEventsAdmin();
      flash(result.message || "Selected events linked.", "success");
    }).catch(function (error) {
      flash("Event linking failed: " + error.message, "error");
    });
  }

  function linkDojoSuggestion(groupIdsValue) {
    var groupIds = String(groupIdsValue || "").split("|").map(function (part) {
      return part.trim();
    }).filter(Boolean);
    if (groupIds.length < 2) {
      flash("This suggestion does not contain enough events to link.", "error");
      return;
    }
    api("/api/classdojo/events/groups/merge", {
      method: "POST",
      body: JSON.stringify({ group_ids: groupIds }),
    }).then(function (result) {
      if (result && result.admin) {
        state.classDojoEvents = result.admin;
      }
      setSelectedClassDojoGroupIds([]);
      renderClassDojoEventsAdmin();
      flash(result.message || "Suggested duplicate events linked.", "success");
    }).catch(function (error) {
      flash("Could not link suggestion: " + error.message, "error");
    });
  }

  function saveDojoGroupTitle(groupId) {
    var input = byId("dojoGroupTitle-" + groupId);
    var title = input ? (input.value || "").trim() : "";
    var checked = [];
    document.querySelectorAll('[data-dojo-scope-cb="' + groupId + '"]:checked').forEach(function (cb) {
      checked.push(cb.value);
    });
    var scopeInput = byId("dojoGroupScope-" + groupId);
    var customText = scopeInput ? (scopeInput.value || "").trim() : "";
    if (customText) { checked.push(customText); }
    var scopeLabel = checked.join(", ");
    api("/api/classdojo/events/groups/" + encodeURIComponent(groupId) + "/rename", {
      method: "POST",
      body: JSON.stringify({ title_override: title, scope_label_override: scopeLabel }),
    }).then(function (result) {
      if (result && result.admin) {
        state.classDojoEvents = result.admin;
      }
      renderClassDojoEventsAdmin();
      flash("Display name and audience saved.", "success");
    }).catch(function (error) {
      flash("Could not save: " + error.message, "error");
    });
  }

  function acceptDojoGroupChanges(groupId) {
    api("/api/classdojo/events/groups/" + encodeURIComponent(groupId) + "/accept", {
      method: "POST",
    }).then(function (result) {
      if (result && result.admin) {
        state.classDojoEvents = result.admin;
      }
      renderClassDojoEventsAdmin();
      flash(result.message || "Changes marked reviewed.", "success");
    }).catch(function (error) {
      flash("Could not mark reviewed: " + error.message, "error");
    });
  }

  function unlinkDojoGroup(groupId) {
    if (!window.confirm("This will split the linked event group back into separate dashboard items. Continue?")) {
      return;
    }
    api("/api/classdojo/events/groups/" + encodeURIComponent(groupId) + "/unlink", {
      method: "POST",
    }).then(function (result) {
      if (result && result.admin) {
        state.classDojoEvents = result.admin;
      }
      setSelectedClassDojoGroupIds([]);
      renderClassDojoEventsAdmin();
      flash(result.message || "Group unlinked.", "success");
    }).catch(function (error) {
      flash("Could not unlink group: " + error.message, "error");
    });
  }

  function dojoCodeInput() {
    return byId("classDojoOtpCode");
  }

  function getDojoCode() {
    var input = dojoCodeInput();
    if (!input) {
      return "";
    }
    return (input.value || "").replace(/\D/g, "").slice(0, 6);
  }

  function syncDojoCodeInput() {
    var input = dojoCodeInput();
    var verifyButton = byId("verifyDojoCode");
    if (!input) {
      return;
    }
    var digits = (input.value || "").replace(/\D/g, "").slice(0, 6);
    if (input.value !== digits) {
      input.value = digits;
    }
    if (verifyButton) {
      verifyButton.disabled = digits.length !== 6;
    }
  }

  function resetDojoAuth() {
    if (!window.confirm("This will clear the cached ClassDojo login and roster, then try again with the current .env values. Continue?")) {
      return;
    }
    setSaveStatus("saveStatusClassDojoAuth", "Resetting ClassDojo login\u2026");
    updateDojoResponsePanel({ status: "resetting" });
    api("/api/classdojo/reset-auth", {
      method: "POST",
    }).then(function (result) {
      state.classDojoAuth = Object.assign({}, classDojoAuthData(), result || {}, {
        needs_code: !!(result && result.needs_code),
      });
      renderClassDojoAuthCard();
      updateDojoResponsePanel(result);
      if (result && result.needs_code) {
        flash(result.message || "ClassDojo sent a one-time code.", "info");
        setSaveStatus("saveStatusClassDojoAuth", "Code sent \u2713 Enter the 6-digit code.");
        if (dojoCodeInput()) {
          dojoCodeInput().value = "";
          dojoCodeInput().focus();
        }
        syncDojoCodeInput();
        return;
      }
      flash(result.warning || result.message || "ClassDojo login refreshed.", result.warning ? "info" : "success");
      setSaveStatus("saveStatusClassDojoAuth", result.warning ? "Login refreshed with warnings" : "Login refreshed \u2713");
      if (dojoCodeInput()) {
        dojoCodeInput().value = "";
      }
      syncDojoCodeInput();
    }).catch(function (error) {
      updateDojoResponsePanel((error && error.payload) ? error.payload : {
        success: false,
        error: error.message || "Request failed",
      });
      flash("ClassDojo login reset failed: " + error.message, "error");
      setSaveStatus("saveStatusClassDojoAuth");
    });
  }

  function verifyDojoCode() {
    var code = getDojoCode();
    if (code.length !== 6) {
      flash("Enter the 6-digit ClassDojo code first.", "error");
      return;
    }
    setSaveStatus("saveStatusClassDojoAuth", "Verifying ClassDojo code\u2026");
    updateDojoResponsePanel({ status: "verifying", code_length: code.length });
    api("/api/classdojo/complete-auth", {
      method: "POST",
      body: JSON.stringify({ code: code }),
    }).then(function (result) {
      state.classDojoAuth = Object.assign({}, classDojoAuthData(), result || {}, {
        needs_code: false,
      });
      renderClassDojoAuthCard();
      updateDojoResponsePanel(result);
      flash(result.warning || result.message || "ClassDojo login completed.", result.warning ? "info" : "success");
      setSaveStatus("saveStatusClassDojoAuth", result.warning ? "Code verified, refresh had warnings" : "Code verified \u2713");
      if (dojoCodeInput()) {
        dojoCodeInput().value = "";
      }
      syncDojoCodeInput();
    }).catch(function (error) {
      updateDojoResponsePanel((error && error.payload) ? error.payload : {
        success: false,
        error: error.message || "Request failed",
      });
      flash("ClassDojo code verification failed: " + error.message, "error");
      setSaveStatus("saveStatusClassDojoAuth");
    });
  }

  function uploadCelebrationPhoto(childId, files) {
    if (!files.length) { return; }
    var found = _findChildSlot(childId);
    if (!found) { return; }
    var form = new FormData();
    form.append("photo", files[0]);
    api("/api/celebration-photo", {
      method: "POST",
      body: form,
    }).then(function (payload) {
      var asm = found.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
      if (asm && asm.children[found.idx]) {
        asm.children[found.idx].photo_url = payload.url;
        asm.children[found.idx].use_photo = true;
        asm.children[found.idx].photo_focal_x = 50;
        asm.children[found.idx].photo_focal_y = 50;
      }
      _rerenderSlotChildren(found.slot);
      flash("Celebration photo uploaded.", "success");
      autoSaveAssembly(found.slot);
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  var _childFocalState = { childId: null, x: 50, y: 50 };

  function openChildFocalModal(childId) {
    var child = null;
    var _focalSlotInfo = _findChildSlot(childId);
    if (_focalSlotInfo) {
      var _focalAsm = _focalSlotInfo.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
      child = _focalAsm ? _focalAsm.children[_focalSlotInfo.idx] : null;
    }
    if (!child || !child.photo_url) { return; }
    _childFocalState.childId = childId;
    _childFocalState.x = child.photo_focal_x != null ? child.photo_focal_x : 50;
    _childFocalState.y = child.photo_focal_y != null ? child.photo_focal_y : 50;

    var modal = byId("childFocalModal");
    var img = byId("childFocalImage");
    var marker = byId("childFocalMarker");
    var preview = byId("childFocalPreview");

    img.src = child.photo_url;
    modal.classList.remove("hidden");

    function placeMarker(x, y) {
      var rect = preview.getBoundingClientRect();
      var iw = img.naturalWidth || 0;
      var ih = img.naturalHeight || 0;
      if (iw > 0 && ih > 0 && rect.width > 0 && rect.height > 0) {
        var scale = Math.min(rect.width / iw, rect.height / ih);
        var rw = iw * scale;
        var rh = ih * scale;
        var ox = (rect.width - rw) / 2;
        var oy = (rect.height - rh) / 2;
        marker.style.left = (ox + rw * (x / 100)) + "px";
        marker.style.top = (oy + rh * (y / 100)) + "px";
      } else {
        marker.style.left = x + "%";
        marker.style.top = y + "%";
      }
    }

    img.onload = function () { placeMarker(_childFocalState.x, _childFocalState.y); };
    if (img.complete) { placeMarker(_childFocalState.x, _childFocalState.y); }

    preview.onclick = function (ev) {
      var rect = preview.getBoundingClientRect();
      var localX = ev.clientX - rect.left;
      var localY = ev.clientY - rect.top;
      var iw = img.naturalWidth || 0;
      var ih = img.naturalHeight || 0;
      var x = 50, y = 50;
      if (iw > 0 && ih > 0) {
        var scale = Math.min(rect.width / iw, rect.height / ih);
        var rw = iw * scale;
        var rh = ih * scale;
        var ox = (rect.width - rw) / 2;
        var oy = (rect.height - rh) / 2;
        x = Math.round(((Math.max(ox, Math.min(ox + rw, localX)) - ox) / rw) * 100);
        y = Math.round(((Math.max(oy, Math.min(oy + rh, localY)) - oy) / rh) * 100);
      } else {
        x = Math.max(0, Math.min(100, Math.round((localX / rect.width) * 100)));
        y = Math.max(0, Math.min(100, Math.round((localY / rect.height) * 100)));
      }
      _childFocalState.x = x;
      _childFocalState.y = y;
      placeMarker(x, y);
    };
  }

  function closeChildFocalModal() {
    byId("childFocalModal").classList.add("hidden");
    byId("childFocalPreview").onclick = null;
  }

  function collectTvSchedule() {
    state.tvPowerSchedule.enabled = !!byId("tvPowerEnabled").checked;
    state.tvPowerSchedule.rules = state.tvPowerSchedule.rules.map(function (rule) {
      var days = [];
      document.querySelectorAll('[data-tv-days="' + rule.id + '"] input[type="checkbox"]').forEach(function (checkbox) {
        if (checkbox.checked) {
          days.push(checkbox.value);
        }
      });
      return {
        id: rule.id,
        label: document.querySelector('input[data-tv-label="' + rule.id + '"]').value,
        enabled: !!document.querySelector('input[data-tv-enabled="' + rule.id + '"]').checked,
        onTime: document.querySelector('input[data-tv-on="' + rule.id + '"]').value,
        offTime: document.querySelector('input[data-tv-off="' + rule.id + '"]').value,
        days: days,
      };
    });
  }

  function saveTvSchedule() {
    collectTvSchedule();
    api("/api/tv-power-schedule", {
      method: "POST",
      body: JSON.stringify(state.tvPowerSchedule),
    }).then(function (schedule) {
      state.tvPowerSchedule = schedule;
      renderTvSchedule();
      flash("TV power schedule saved.", "success");
      setSaveStatus("saveStatusTvPower");
    }).catch(function (error) {
      flash(error.message, "error");
    });
  }

  function runTvPowerAction(action) {
    api("/api/tv-power/action", {
      method: "POST",
      body: JSON.stringify({ action: action }),
    }).then(function () {
      flash(action === "on" ? "TV power-on command sent." : "TV standby command sent.", "success");
      setSaveStatus("saveStatusTvPower");
      return reloadTvPowerHistory();
    }).catch(function (error) {
      flash(error.message, "error");
      return reloadTvPowerHistory();
    });
  }

  function showOverlayFormPanel() {
    var panel = byId("overlayFormPanel");
    if (panel) { panel.removeAttribute("hidden"); }
  }

  function hideOverlayFormPanel() {
    var panel = byId("overlayFormPanel");
    if (panel) { panel.setAttribute("hidden", ""); }
  }

  function showTickerFormPanel() {
    var panel = byId("tickerFormPanel");
    if (panel) { panel.removeAttribute("hidden"); }
  }

  function hideTickerFormPanel() {
    var panel = byId("tickerFormPanel");
    if (panel) { panel.setAttribute("hidden", ""); }
  }

  function bindEvents() {
    function setAdminTab(activeTabId) {
      var tabIds = ["adminTabContent", "adminTabAssembly", "adminTabClassDojo", "adminTabEngine", "adminTabAdmin"];
      var paneIds = {
        adminTabContent: "tabContentContent",
        adminTabAssembly: "tabContentAssembly",
        adminTabClassDojo: "tabContentClassDojo",
        adminTabEngine: "tabContentEngine",
        adminTabAdmin: "tabContentAdmin",
      };
      tabIds.forEach(function (tabId) {
        var tab = byId(tabId);
        if (!tab) {
          return;
        }
        var active = tabId === activeTabId;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      Object.keys(paneIds).forEach(function (tabId) {
        var pane = byId(paneIds[tabId]);
        if (!pane) {
          return;
        }
        pane.classList.toggle("is-active", tabId === activeTabId);
      });
      try {
        window.localStorage.setItem(ADMIN_TAB_STORAGE_KEY, activeTabId);
      } catch (_) {}
    }

    byId("adminTabContent").addEventListener("click", function () {
      setAdminTab("adminTabContent");
    });
    byId("adminTabAssembly").addEventListener("click", function () {
      setAdminTab("adminTabAssembly");
    });
    byId("adminTabClassDojo").addEventListener("click", function () {
      setAdminTab("adminTabClassDojo");
    });
    byId("adminTabEngine").addEventListener("click", function () {
      setAdminTab("adminTabEngine");
    });
    byId("adminTabAdmin").addEventListener("click", function () {
      setAdminTab("adminTabAdmin");
    });

    var savedTab = "adminTabContent";
    try {
      savedTab = window.localStorage.getItem(ADMIN_TAB_STORAGE_KEY) || savedTab;
    } catch (_) {}
    if (!byId(savedTab)) {
      savedTab = "adminTabContent";
    }
    setAdminTab(savedTab);

    byId("rotationItemType").addEventListener("change", syncRotationTypeFields);
    byId("rotationBuiltInPage").addEventListener("change", syncRotationTypeFields);
    byId("rotationCountdownModeAuto").addEventListener("change", function () {
      byId("rotationCountdownDateFields").classList.add("hidden");
    });
    byId("rotationCountdownModeCustom").addEventListener("change", function () {
      byId("rotationCountdownDateFields").classList.remove("hidden");
    });
    byId("saveRotationItem").addEventListener("click", saveRotationEditor);
    byId("clearRotationEditor").addEventListener("click", clearRotationEditor);
    byId("toggleAddRotationPicker").addEventListener("click", function () {
      var picker = byId("addRotationPicker");
      picker.classList.toggle("hidden");
    });
    byId("addRotationPicker").addEventListener("click", function (event) {
      var btn = event.target.closest("[data-add-rotation-type]");
      if (!btn) { return; }
      var type = btn.getAttribute("data-add-rotation-type");
      if (type === "custom_page" && !state.customPages.length) {
        byId("addRotationPicker").classList.add("hidden");
        flash("No editable templates yet. Create one in the Templates section below, then come back to add it.", "info");
        var customSection = document.querySelector("#tabContentEngine .admin-card:last-of-type");
        if (customSection) { customSection.scrollIntoView({ behavior: "smooth", block: "start" }); }
        return;
      }
      addRotationItem(type);
      byId("addRotationPicker").classList.add("hidden");
    });
    byId("rotationPictureTagFilter").addEventListener("change", applyPicturePoolTagFilter);
    byId("rotationPictureSelectAll").addEventListener("click", function () { setPicturePoolSelection("all"); });
    byId("rotationPictureSelectTag").addEventListener("click", function () { setPicturePoolSelection("tag"); });
    byId("rotationPictureSelectNone").addEventListener("click", function () { setPicturePoolSelection("none"); });

    byId("rotationPictureMediaList").addEventListener("click", function (event) {
      var card = event.target.closest(".picture-media-card");
      if (!card) {
        return;
      }
      var checkbox = card.querySelector('input[type="checkbox"]');
      if (!checkbox) {
        return;
      }
      if (event.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      card.classList.toggle("is-selected", !!checkbox.checked);
      updatePicturePoolSummary();
    });

    byId("rotationPictureMediaList").addEventListener("change", function (event) {
      if (!event.target.matches('input[type="checkbox"]')) {
        return;
      }
      var card = event.target.closest(".picture-media-card");
      if (card) {
        card.classList.toggle("is-selected", !!event.target.checked);
      }
      updatePicturePoolSummary();
    });

    var mediaUploadInput = byId("mediaUploadInput");
    var mediaUploadDropzone = byId("mediaUploadDropzone");
    if (mediaUploadInput) {
      mediaUploadInput.addEventListener("change", function (event) {
        uploadMedia(event.target.files);
        event.target.value = "";
      });
    }
    if (mediaUploadDropzone && mediaUploadInput) {
      bindUploadDropzone(mediaUploadDropzone, function (files) {
        uploadMedia(files);
      }, { input: mediaUploadInput });
    }
    byId("selectAllMedia").addEventListener("change", function (event) {
      var visible = paginatedMediaList();
      var visibleIds = visible.map(function (media) { return media.id; });
      if (event.target.checked) {
        var merged = {};
        state.selectedMediaIds.forEach(function (id) { merged[id] = true; });
        visibleIds.forEach(function (id) { merged[id] = true; });
        state.selectedMediaIds = Object.keys(merged);
      } else {
        state.selectedMediaIds = state.selectedMediaIds.filter(function (id) {
          return visibleIds.indexOf(id) === -1;
        });
      }
      syncMediaBulkSelectionState();
    });
    byId("applyMediaBulkTags").addEventListener("click", applyBulkTagsToSelectedMedia);
    byId("saveMediaItem").addEventListener("click", saveSelectedMedia);
    byId("deleteMediaItem").addEventListener("click", deleteSelectedMedia);

    byId("addCustomPage").addEventListener("click", addCustomPage);
    byId("saveCustomPage").addEventListener("click", saveCustomPage);
    byId("duplicateCustomPage").addEventListener("click", duplicateCustomPage);
    byId("deleteCustomPage").addEventListener("click", deleteCustomPage);
    byId("addBuilderRow").addEventListener("click", addBuilderRow);
    byId("previewCustomPage").addEventListener("click", function () {
      if (state.selectedPageId) {
        window.open("/pages/custom-page.html?page=" + encodeURIComponent(state.selectedPageId), "_blank", "noopener,noreferrer");
      }
    });

    byId("addNoticeItem").addEventListener("click", function () {
      var input = byId("noticeItemInput");
      var value = (input.value || "").trim();
      if (!value) {
        return;
      }
      state.notices.notes = state.notices.notes || [];
      state.notices.notes.push(value);
      input.value = "";
      renderNoticesItems();
    });
    byId("noticeItemInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        byId("addNoticeItem").click();
      }
    });

    byId("addAttendanceMessage").addEventListener("click", function () {
      var input = byId("attendanceMessageInput");
      var value = (input.value || "").trim();
      if (!value) {
        return;
      }
      state.attendanceMessages.push(value);
      input.value = "";
      renderAttendanceItems();
    });
    byId("attendanceMessageInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        byId("addAttendanceMessage").click();
      }
    });

    byId("saveNotices").addEventListener("click", saveNotices);
    byId("saveAttendanceMessages").addEventListener("click", saveAttendanceMessages);
    byId("refreshDashboardHealth").addEventListener("click", function () {
      loadDashboardHealth().then(function (payload) {
        if (payload) {
          flash("Dashboard health refreshed.", "success");
        }
      });
    });
    byId("addTicker").addEventListener("click", function () {
      state.selectedTickerId = "";
      renderTickerEditor();
      showTickerFormPanel();
      byId("tickerMessageInput").focus();
    });
    byId("cancelTickerEdit").addEventListener("click", function () {
      state.selectedTickerId = "";
      hideTickerFormPanel();
      renderTickers();
    });
    byId("saveTickers").addEventListener("click", saveTickers);
    byId("addOverlay").addEventListener("click", function () {
      state.selectedOverlayId = "";
      renderOverlayEditor();
      showOverlayFormPanel();
      byId("overlayMessageInput").focus();
    });
    byId("cancelOverlayEdit").addEventListener("click", function () {
      state.selectedOverlayId = "";
      hideOverlayFormPanel();
      renderOverlays();
    });
    byId("toggleOverlayEmojiGallery").addEventListener("click", function () {
      var gallery = byId("overlayEmojiGallery");
      if (!gallery) { return; }
      if (gallery.hasAttribute("hidden")) {
        gallery.removeAttribute("hidden");
      } else {
        gallery.setAttribute("hidden", "");
      }
    });
    byId("saveOverlays").addEventListener("click", saveOverlays);
    byId("childFocalConfirm").addEventListener("click", function () {
      var childId = _childFocalState.childId;
      if (childId) {
        var found = _findChildSlot(childId);
        if (found) {
          var asm = found.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
          if (asm && asm.children[found.idx]) {
            asm.children[found.idx].photo_focal_x = _childFocalState.x;
            asm.children[found.idx].photo_focal_y = _childFocalState.y;
          }
          _rerenderSlotChildren(found.slot);
          autoSaveAssembly(found.slot);
        }
      }
      closeChildFocalModal();
    });
    byId("childFocalCancel").addEventListener("click", closeChildFocalModal);
    byId("childFocalModal").addEventListener("click", function (ev) {
      if (ev.target === this) { closeChildFocalModal(); }
    });
    byId("previewDojoImage").addEventListener("click", previewDojoImage);
    byId("postToDojo").addEventListener("click", postToDojo);
    byId("resetDojoAuth").addEventListener("click", resetDojoAuth);
    byId("verifyDojoCode").addEventListener("click", verifyDojoCode);
    byId("refreshDojoClasses").addEventListener("click", refreshDojoClasses);
    byId("refreshDojoEvents").addEventListener("click", refreshDojoEvents);
    byId("mergeDojoGroups").addEventListener("click", mergeSelectedDojoGroups);
    byId("clearDojoGroupSelection").addEventListener("click", function () {
      setSelectedClassDojoGroupIds([]);
      renderClassDojoEventsAdmin();
    });
    byId("dojoEventSuggestionList").addEventListener("click", function (event) {
      var btn = event.target.closest("[data-dojo-suggestion-link]");
      if (btn) {
        linkDojoSuggestion(btn.getAttribute("data-dojo-suggestion-link"));
      }
    });
    byId("dojoEventGroupList").addEventListener("change", function (event) {
      var target = event.target;
      if (!target) {
        return;
      }
      if (target.matches && target.matches("[data-dojo-group-select]")) {
        var groupId = target.getAttribute("data-dojo-group-select");
        var ids = selectedClassDojoGroupIds().slice();
        if (target.checked && ids.indexOf(groupId) === -1) {
          ids.push(groupId);
        }
        if (!target.checked) {
          ids = ids.filter(function (id) { return id !== groupId; });
        }
        setSelectedClassDojoGroupIds(ids);
        renderClassDojoEventsAdmin();
      }
    });
    byId("dojoEventGroupList").addEventListener("click", function (event) {
      var saveBtn = event.target.closest("[data-dojo-group-save]");
      if (saveBtn) {
        saveDojoGroupTitle(saveBtn.getAttribute("data-dojo-group-save"));
        return;
      }
      var resetTitleBtn = event.target.closest("[data-dojo-group-reset-title]");
      if (resetTitleBtn) {
        var resetTitleGid = resetTitleBtn.getAttribute("data-dojo-group-reset-title");
        api("/api/classdojo/events/groups/" + encodeURIComponent(resetTitleGid) + "/rename", {
          method: "POST",
          body: JSON.stringify({ title_override: "", scope_label_override: null }),
        }).then(function (result) {
          if (result && result.admin) { state.classDojoEvents = result.admin; }
          renderClassDojoEventsAdmin();
          flash("Display name reset to default.", "success");
        }).catch(function (err) { flash("Could not reset: " + err.message, "error"); });
        return;
      }
      var resetScopeBtn = event.target.closest("[data-dojo-group-reset-scope]");
      if (resetScopeBtn) {
        var resetScopeGid = resetScopeBtn.getAttribute("data-dojo-group-reset-scope");
        api("/api/classdojo/events/groups/" + encodeURIComponent(resetScopeGid) + "/rename", {
          method: "POST",
          body: JSON.stringify({ scope_label_override: "" }),
        }).then(function (result) {
          if (result && result.admin) { state.classDojoEvents = result.admin; }
          renderClassDojoEventsAdmin();
          flash("Audience reset to default.", "success");
        }).catch(function (err) { flash("Could not reset: " + err.message, "error"); });
        return;
      }
      var acceptBtn = event.target.closest("[data-dojo-group-accept]");
      if (acceptBtn) {
        acceptDojoGroupChanges(acceptBtn.getAttribute("data-dojo-group-accept"));
        return;
      }
      var unlinkBtn = event.target.closest("[data-dojo-group-unlink]");
      if (unlinkBtn) {
        unlinkDojoGroup(unlinkBtn.getAttribute("data-dojo-group-unlink"));
        return;
      }
      var card = event.target.closest("[data-dojo-group-card]");
      if (card) {
        var tagName = (event.target.tagName || "").toUpperCase();
        if (["INPUT", "BUTTON", "SUMMARY", "TEXTAREA", "SELECT", "LABEL", "A"].indexOf(tagName) === -1) {
        var checkbox = card.querySelector("[data-dojo-group-select]");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
        }
      }
    });
    var dojoCode = byId("classDojoOtpCode");
    if (dojoCode) {
      dojoCode.addEventListener("input", syncDojoCodeInput);
      dojoCode.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          verifyDojoCode();
        }
      });
      syncDojoCodeInput();
    }
    byId("celebrationDojoMessage").addEventListener("input", function () {
      this.dataset.userEdited = "1";
    });

    byId("addTvRule").addEventListener("click", function () {
      var newId = uid("tv-rule");
      state.tvPowerSchedule.rules.push({
        id: newId,
        label: "",
        enabled: true,
        onTime: "",
        offTime: "",
        days: ["mon", "tue", "wed", "thu", "fri"],
      });
      _expandedTvRuleIds[newId] = true;
      renderTvSchedule();
    });
    byId("tvPowerOnNow").addEventListener("click", function () {
      runTvPowerAction("on");
    });
    byId("tvPowerOffNow").addEventListener("click", function () {
      runTvPowerAction("off");
    });
    byId("saveClassOrder").addEventListener("click", saveClassOrder);
    initClassOrderDnd();
    var classDojoMatchList = byId("classDojoMatchList");
    if (classDojoMatchList) {
      classDojoMatchList.addEventListener("change", function (event) {
        var target = event.target;
        if (!target || !(target.matches && target.matches("[data-dojo-linked-select]"))) {
          return;
        }
        var row = target.closest(".class-dojo-row");
        if (!row) { return; }
        _setDojoClassMatch(row.dataset.dojoClassName || "", target.value || "");
      });
      classDojoMatchList.addEventListener("click", function (event) {
        var suggestionBtn = event.target.closest("[data-dojo-suggestion]");
        if (suggestionBtn) {
          var row = suggestionBtn.closest(".class-dojo-row");
          if (!row) { return; }
          var select = row.querySelector("[data-dojo-linked-select]");
          var payload = suggestionBtn.getAttribute("data-dojo-suggestion") || "";
          var parts = payload.split("|");
          var matchName = parts.slice(1).join("|");
          if (select) {
            select.value = matchName;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
        var extraBtn = event.target.closest("[data-dojo-add-extra]");
        if (extraBtn) {
          _toggleDojoClassExtra(extraBtn.getAttribute("data-dojo-add-extra") || "");
        }
      });
    }
    byId("saveTvSchedule").addEventListener("click", saveTvSchedule);
    byId("tickerActiveInput").addEventListener("change", function () {
      syncToggleText("tickerActiveInput", "tickerActiveText", "Enabled", "Disabled");
      // Only autosave when editing an existing ticker (not before it has been named/created)
      if (byId("tickerEditId").value) {
        saveTickers();
      }
    });
    byId("overlayActiveInput").addEventListener("change", function () {
      syncToggleText("overlayActiveInput", "overlayActiveText", "Enabled", "Disabled");
      // Only autosave when editing an existing overlay
      if (byId("overlayEditId").value) {
        saveOverlays();
      }
    });
    byId("rotationEnabled").addEventListener("change", function () {
      syncToggleText("rotationEnabled", "rotationEnabledText", "Enabled", "Disabled");
      // Only autosave when editing an existing rotation item
      if (byId("rotationItemId").value) {
        saveRotationEditor();
      }
    });
    byId("tvPowerEnabled").addEventListener("change", function () {
      syncToggleText("tvPowerEnabled", "tvPowerEnabledText", "Enabled", "Disabled");
      saveTvSchedule();
    });
    byId("mediaTags").addEventListener("input", renderMediaTagPicker);
    byId("mediaTags").addEventListener("change", queueMediaAutosave);
    byId("mediaFocalX").addEventListener("change", queueMediaAutosave);
    byId("mediaFocalY").addEventListener("change", queueMediaAutosave);
    byId("mediaBulkTags").addEventListener("input", renderMediaBulkTagPicker);
    byId("mediaKindFilter").addEventListener("change", function () {
      resetMediaPage();
      renderMedia();
    });
    byId("mediaTagFilter").addEventListener("change", function () {
      resetMediaPage();
      renderMedia();
    });
    byId("mediaPagination").addEventListener("click", function (event) {
      var action = event.target.getAttribute("data-media-page");
      if (!action) { return; }
      if (action === "prev") {
        state.mediaPage -= 1;
      } else if (action === "next") {
        state.mediaPage += 1;
      }
      clampMediaPage();
      renderMedia();
    });

    document.body.addEventListener("click", function (event) {
      var removeRow = event.target.getAttribute("data-remove-row");
      var removeCard = event.target.getAttribute("data-remove-card");
      var removeTicker = event.target.getAttribute("data-remove-ticker");
      var removeOverlay = event.target.getAttribute("data-remove-overlay");
      var editTicker = event.target.getAttribute("data-edit-ticker");
      var editOverlay = event.target.getAttribute("data-edit-overlay");
      var toggleAssemblyChildren = event.target.getAttribute("data-toggle-assembly-children");
      if (toggleAssemblyChildren) {
        var detailId = toggleAssemblyChildren === "current" ? "currentAssemblyDetail" : "upcomingAssemblyDetail";
        var detailEl = byId(detailId);
        if (detailEl) {
          var isOpen = !detailEl.classList.contains("hidden");
          detailEl.classList.toggle("hidden", isOpen);
          event.target.textContent = isOpen ? "Show children ▾" : "Hide children ▴";
        }
      }
      var removeChild = event.target.getAttribute("data-remove-child");
      var removeTvRule = event.target.getAttribute("data-remove-tv-rule");
      var removeNoticeIndex = event.target.getAttribute("data-remove-notice-index");
      var removeAttendanceIndex = event.target.getAttribute("data-remove-attendance-index");
      var copyValue = event.target.getAttribute("data-copy-value");
      var overlayType = event.target.getAttribute("data-overlay-type");
      var overlayEmoji = event.target.getAttribute("data-overlay-emoji");
      var openCardMedia = event.target.getAttribute("data-open-card-media");
      var closeCardMedia = event.target.getAttribute("data-close-card-media");

      if (overlayType) {
        setOverlayTypeButtons(overlayType, true);
      }
      if (overlayEmoji) {
        byId("overlayIconInput").value = overlayEmoji;
      }
      var mediaTag = event.target.getAttribute("data-media-tag-chip");
      if (mediaTag) {
        toggleMediaTag(mediaTag);
      }
      var mediaBulkTag = event.target.getAttribute("data-media-bulk-tag-chip");
      if (mediaBulkTag) {
        toggleMediaBulkTag(mediaBulkTag);
      }
      if (openCardMedia) {
        document.querySelectorAll("[data-card-media-picker]").forEach(function (picker) {
          picker.classList.add("hidden");
        });
        var pickerToOpen = document.querySelector('[data-card-media-picker="' + openCardMedia + '"]');
        if (pickerToOpen) {
          pickerToOpen.classList.remove("hidden");
        }
      }
      if (closeCardMedia) {
        var pickerToClose = document.querySelector('[data-card-media-picker="' + closeCardMedia + '"]');
        if (pickerToClose) {
          pickerToClose.classList.add("hidden");
        }
      }

      if (removeRow) {
        var page = selectedPage();
        page.rows = page.rows.filter(function (row) { return row.id !== removeRow; });
        renderPageBuilder();
      }
      if (removeCard) {
        var currentPage = selectedPage();
        (currentPage.rows || []).forEach(function (row) {
          (row.columns || []).forEach(function (column) {
            column.cards = (column.cards || []).filter(function (card) { return card.id !== removeCard; });
          });
        });
        renderPageBuilder();
      }
      if (removeTicker) {
        var tickerToDelete = state.tickers.filter(function (t) { return t.id === removeTicker; })[0];
        var tickerLabel = tickerToDelete ? '"' + (tickerToDelete.message || "this ticker") + '"' : "this ticker";
        confirmDelete("Are you sure you want to delete " + tickerLabel + "?", function () {
          state.tickers = state.tickers.filter(function (ticker) { return ticker.id !== removeTicker; });
          if (state.selectedTickerId === removeTicker) {
            state.selectedTickerId = state.tickers.length ? state.tickers[0].id : "";
          }
          renderTickers();
          if (!state.selectedTickerId) { hideTickerFormPanel(); }
          api("/api/tickers", {
            method: "POST",
            body: JSON.stringify({ tickers: state.tickers }),
          }).then(function () {
            flash("Ticker deleted.", "success");
            setSaveStatus("saveStatusTickers");
            return reloadTickers();
          }).catch(function (error) {
            flash(error.message, "error");
          });
        });
      }
      if (editTicker) {
        state.selectedTickerId = editTicker;
        renderTickers();
        showTickerFormPanel();
      }
      if (removeOverlay) {
        var overlayToDelete = state.overlays.filter(function (o) { return o.id === removeOverlay; })[0];
        var overlayLabel = overlayToDelete ? '"' + (overlayToDelete.overlay_title || "this overlay") + '"' : "this overlay";
        confirmDelete("Are you sure you want to delete " + overlayLabel + "?", function () {
          state.overlays = state.overlays.filter(function (overlay) { return overlay.id !== removeOverlay; });
          if (state.selectedOverlayId === removeOverlay) {
            state.selectedOverlayId = state.overlays.length ? state.overlays[0].id : "";
          }
          renderOverlays();
          if (!state.selectedOverlayId) { hideOverlayFormPanel(); }
          api("/api/overlays", {
            method: "POST",
            body: JSON.stringify({ overlays: state.overlays }),
          }).then(function () {
            flash("Overlay deleted.", "success");
            setSaveStatus("saveStatusOverlays");
            saveNotices();
            return reloadOverlays();
          }).catch(function (error) {
            flash(error.message, "error");
          });
        });
      }
      if (editOverlay) {
        state.selectedOverlayId = editOverlay;
        renderOverlays();
        showOverlayFormPanel();
      }
      if (removeChild) {
        var _removeSlotInfo = _findChildSlot(removeChild);
        var _removeAsm = _removeSlotInfo ? (_removeSlotInfo.slot === "current" ? state.currentAssembly : state.upcomingAssembly) : null;
        var childToRemove = _removeAsm ? _removeAsm.children[_removeSlotInfo.idx] : null;
        var childLabel = childToRemove ? '"' + (childToRemove.name || "this child") + '"' : "this child";
        confirmDelete("Are you sure you want to remove " + childLabel + "?", function () {
          if (!_removeSlotInfo || !_removeAsm) { return; }
          _removeAsm.children = _removeAsm.children.filter(function (child) { return child.id !== removeChild; });
          _rerenderSlotChildren(_removeSlotInfo.slot);
          autoSaveAssembly(_removeSlotInfo.slot);
        });
      }

      var openValueSelector = event.target.getAttribute("data-open-value-selector");
      var closeValueSelector = event.target.getAttribute("data-close-value-selector");
      var assignValue = event.target.closest("[data-assign-value]") && event.target.closest("[data-assign-value]").getAttribute("data-assign-value");
      var clearValue = event.target.getAttribute("data-clear-value");

      if (openValueSelector) {
        var selector = document.querySelector('[data-child-value-selector="' + openValueSelector + '"]');
        if (selector) { selector.classList.remove("hidden"); }
      }
      if (closeValueSelector) {
        var selectorToClose = document.querySelector('[data-child-value-selector="' + closeValueSelector + '"]');
        if (selectorToClose) { selectorToClose.classList.add("hidden"); }
      }
      if (assignValue) {
        var parts = assignValue.split(":");
        var assignChildId = parts[0];
        var assignKey = parts.slice(1).join(":");
        var _assignSlotInfo = _findChildSlot(assignChildId);
        if (_assignSlotInfo) {
          var _assignAsm = _assignSlotInfo.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
          _assignAsm.children[_assignSlotInfo.idx].value_key = assignKey;
          _assignAsm.children[_assignSlotInfo.idx].value_label = _valueLabelFor(assignKey);
          _rerenderSlotChildren(_assignSlotInfo.slot);
        }
      }
      if (clearValue) {
        var _clearValSlotInfo = _findChildSlot(clearValue);
        if (_clearValSlotInfo) {
          var _clearValAsm = _clearValSlotInfo.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
          _clearValAsm.children[_clearValSlotInfo.idx].value_key = "";
          _clearValAsm.children[_clearValSlotInfo.idx].value_label = "";
          _rerenderSlotChildren(_clearValSlotInfo.slot);
        }
      }
      var togglePhotoMode = event.target.getAttribute("data-toggle-photo-mode");
      if (togglePhotoMode) {
        var _togglePhotoSlotInfo = _findChildSlot(togglePhotoMode);
        if (_togglePhotoSlotInfo) {
          var _togglePhotoAsm = _togglePhotoSlotInfo.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
          var _togglePhotoChild = _togglePhotoAsm.children[_togglePhotoSlotInfo.idx];
          _togglePhotoChild.use_photo = _togglePhotoChild.use_photo === false ? true : false;
          _rerenderSlotChildren(_togglePhotoSlotInfo.slot);
          autoSaveAssembly(_togglePhotoSlotInfo.slot);
        }
      }
      var clearPhoto = event.target.getAttribute("data-clear-photo");
      if (clearPhoto) {
        var _clearPhotoSlotInfo = _findChildSlot(clearPhoto);
        if (_clearPhotoSlotInfo) {
          var _clearPhotoAsm = _clearPhotoSlotInfo.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
          _clearPhotoAsm.children[_clearPhotoSlotInfo.idx].photo_url = "";
          _clearPhotoAsm.children[_clearPhotoSlotInfo.idx].use_photo = true;
          _rerenderSlotChildren(_clearPhotoSlotInfo.slot);
        }
      }
      var setFocal = event.target.getAttribute("data-set-focal");
      if (setFocal) {
        openChildFocalModal(setFocal);
      }
      if (removeNoticeIndex !== null) {
        var noticeIndexNumber = parseInt(removeNoticeIndex, 10);
        var noticeText = (state.notices.notes || [])[noticeIndexNumber];
        var noticeLabel = noticeText ? '"' + noticeText.slice(0, 60) + (noticeText.length > 60 ? "…" : "") + '"' : "this notice";
        confirmDelete("Are you sure you want to remove " + noticeLabel + "?", function () {
          state.notices.notes = (state.notices.notes || []).filter(function (_, index) { return index !== noticeIndexNumber; });
          renderNoticesItems();
        });
      }
      if (removeAttendanceIndex !== null) {
        var attendanceIndexNumber = parseInt(removeAttendanceIndex, 10);
        var attendanceText = (state.attendanceMessages || [])[attendanceIndexNumber];
        var attendanceLabel = attendanceText ? '"' + attendanceText.slice(0, 60) + (attendanceText.length > 60 ? "…" : "") + '"' : "this message";
        confirmDelete("Are you sure you want to remove " + attendanceLabel + "?", function () {
          state.attendanceMessages = (state.attendanceMessages || []).filter(function (_, index) { return index !== attendanceIndexNumber; });
          renderAttendanceItems();
        });
      }
      if (removeTvRule) {
        var ruleToRemove = state.tvPowerSchedule.rules.filter(function (r) { return r.id === removeTvRule; })[0];
        var ruleLabel = ruleToRemove ? '"' + (ruleToRemove.label || "this rule") + '"' : "this rule";
        confirmDelete("Are you sure you want to remove " + ruleLabel + "?", function () {
          state.tvPowerSchedule.rules = state.tvPowerSchedule.rules.filter(function (rule) { return rule.id !== removeTvRule; });
          renderTvSchedule();
        });
      }
      if (copyValue) {
        navigator.clipboard.writeText(copyValue).then(function () {
          var btn = event.target;
          var original = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = original; }, 1500);
        }).catch(function () {
          flash("Copy failed — select the text manually.", "error");
        });
      }
      var savePageKey = event.target.getAttribute("data-save-page-settings");
      if (savePageKey) { savePageSettings(savePageKey); }
      var resetPageKey = event.target.getAttribute("data-reset-page-settings");
      if (resetPageKey) { resetPageSettings(resetPageKey); }
    });

    document.body.addEventListener("change", function (event) {
      var target = event.target;

      if (target.hasAttribute("data-theme-key-select")) {
        updateThemeSwatch(target.getAttribute("data-theme-prefix") || "");
      }

      if (target.hasAttribute("data-row-layout")) {
        var page = selectedPage();
        (page.rows || []).forEach(function (row) {
          if (row.id === target.getAttribute("data-row-layout")) {
            row.layout = target.value;
          }
        });
        syncPageColumns(page);
        renderPageBuilder();
      }

      if (target.hasAttribute("data-card-type")) {
        var cardId = target.getAttribute("data-card-type");
        var pageRef = selectedPage();
        (pageRef.rows || []).forEach(function (row) {
          (row.columns || []).forEach(function (column) {
            (column.cards || []).forEach(function (card) {
              if (card.id === cardId) {
                card.type = target.value;
              }
            });
          });
        });
        renderPageBuilder();
      }

      if (target.hasAttribute("data-card-media-choice")) {
        var mediaCardId = target.getAttribute("data-card-media-choice");
        document.querySelectorAll('input[data-card-media-choice="' + mediaCardId + '"]').forEach(function (option) {
          var optionLabel = option.closest(".card-media-option");
          if (optionLabel) {
            optionLabel.classList.toggle("is-selected", option.checked);
          }
        });
        updateSelectedPageFromBuilder();
        if (target.checked) {
          renderPageBuilder();
        } else {
          renderBuilderPreview();
        }
      }

      if (target.hasAttribute("data-media-multi-select")) {
        var mediaId = target.getAttribute("data-media-multi-select");
        var exists = state.selectedMediaIds.indexOf(mediaId) !== -1;
        if (target.checked && !exists) {
          state.selectedMediaIds.push(mediaId);
        }
        if (!target.checked && exists) {
          state.selectedMediaIds = state.selectedMediaIds.filter(function (id) { return id !== mediaId; });
        }
        syncMediaBulkSelectionState();
      }

      if (target.hasAttribute("data-ticker-schedule-type")) {
        toggleScheduleBlocks("ticker", target.getAttribute("data-ticker-schedule-type"), target.value);
      }

      if (target.hasAttribute("data-overlay-schedule-type")) {
        toggleScheduleBlocks("overlay", target.getAttribute("data-overlay-schedule-type"), target.value);
      }

      if (target.hasAttribute("data-tv-enabled")) {
        var toggleText = target.closest(".switch-toggle").querySelector(".switch-toggle__text");
        if (toggleText) {
          toggleText.textContent = target.checked ? "Enabled" : "Disabled";
        }
      }

      if (target.hasAttribute("data-child-select")) {
        var childId = target.getAttribute("data-child-select");
        var _selectSlotInfo = _findChildSlot(childId);
        if (_selectSlotInfo) {
          var _selectAsm = _selectSlotInfo.slot === "current" ? state.currentAssembly : state.upcomingAssembly;
          _selectAsm.children[_selectSlotInfo.idx]._selected = !!target.checked;
          var _selectAllEl = byId(_selectSlotInfo.slot + "-select-all");
          if (_selectAllEl) {
            _selectAllEl.checked = _selectAsm.children.length > 0 &&
              _selectAsm.children.every(function (child) { return !!child._selected; });
          }
        }
      }

      if (target.hasAttribute("data-child-upload")) {
        uploadCelebrationPhoto(target.getAttribute("data-child-upload"), target.files || []);
        target.value = "";
      }

      if (target.hasAttribute("data-card-upload")) {
        var cardId = target.getAttribute("data-card-upload");
        var files = target.files || [];
        if (!files.length) {
          return;
        }
        var form = new FormData();
        Array.prototype.forEach.call(files, function (file) {
          form.append("media", file);
        });
        api("/api/media-library/upload", {
          method: "POST",
          body: form,
        }).then(function (payload) {
          var uploaded = payload.items || [];
          if (!uploaded.length) {
            return;
          }
          state.media = state.media.concat(uploaded);
          var uploadedMedia = uploaded[0];
          var page = selectedPage();
          (page.rows || []).forEach(function (row) {
            (row.columns || []).forEach(function (column) {
              (column.cards || []).forEach(function (card) {
                if (card.id === cardId) {
                  card.mediaId = uploadedMedia.id;
                }
              });
            });
          });
          renderMedia();
          renderPageBuilder();
          flash("Card image uploaded.", "success");
        }).catch(function (error) {
          flash(error.message, "error");
        }).finally(function () {
          target.value = "";
        });
      }
    });

    document.body.addEventListener("mousedown", function (event) {
      var option = event.target.closest ? event.target.closest("[data-pupil-option]") : null;
      if (!option) { return; }
      event.preventDefault();
      var index = parseInt(option.getAttribute("data-pupil-option") || "0", 10);
      _applyPupilSuggestion(pupilAutocomplete.input, pupilAutocomplete.options[index]);
    });

    document.body.addEventListener("focusin", function (event) {
      if (event.target.matches && (event.target.matches("[data-child-name]") || event.target.matches(".celebration-batch-input--name"))) {
        _handlePupilNameInput(event.target);
      }
    });

    document.body.addEventListener("keydown", function (event) {
      var target = event.target;
      if (!target || !(target.matches && (target.matches("[data-child-name]") || target.matches(".celebration-batch-input--name")))) {
        return;
      }
      if (!pupilAutocomplete.input || pupilAutocomplete.input !== target || !pupilAutocomplete.options.length) {
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        var delta = event.key === "ArrowDown" ? 1 : -1;
        pupilAutocomplete.selectedIndex = (pupilAutocomplete.selectedIndex + delta + pupilAutocomplete.options.length) % pupilAutocomplete.options.length;
        var popover = byId("pupilAutocompletePopover");
        if (popover) {
          popover.querySelectorAll(".autocomplete-option").forEach(function (btn, index) {
            btn.classList.toggle("is-active", index === pupilAutocomplete.selectedIndex);
          });
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        _applyPupilSuggestion(target, pupilAutocomplete.options[pupilAutocomplete.selectedIndex]);
      } else if (event.key === "Escape") {
        _hidePupilSuggestions();
      }
    });

    document.body.addEventListener("focusout", function (event) {
      if (event.target.matches && (event.target.matches("[data-child-name]") || event.target.matches(".celebration-batch-input--name"))) {
        window.setTimeout(_hidePupilSuggestions, 120);
      }
    });

    document.body.addEventListener("input", function (event) {
      if ((event.target.dataset && event.target.dataset.batchValue) ||
          event.target.hasAttribute("data-child-value")) {
        _autocompleteValueInput(event.target);
      }
      if ((event.target.dataset && event.target.dataset.batchClass) ||
          event.target.hasAttribute("data-child-class")) {
        _autocompleteClassInput(event.target);
      }
      if (event.target.matches && (event.target.matches("[data-child-name]") || event.target.matches(".celebration-batch-input--name"))) {
        _handlePupilNameInput(event.target);
      }
      if (event.target.id === "customPageTitleInput" ||
          event.target.hasAttribute("data-card-title") ||
          event.target.hasAttribute("data-card-content") ||
          event.target.hasAttribute("data-card-secondary") ||
          event.target.hasAttribute("data-card-stat-value") ||
          event.target.hasAttribute("data-card-stat-label")) {
        updateSelectedPageFromBuilder();
        renderBuilderPreview();
      }
    });
  }

  function initialiseSelections() {
    if (!state.selectedRotationId && state.rotationItems.length) {
      state.selectedRotationId = state.rotationItems[0].id;
    }
    if (!state.selectedMediaId && state.media.length) {
      state.selectedMediaId = state.media[0].id;
    }
    if (!state.selectedPageId && state.customPages.length) {
      state.selectedPageId = state.customPages[0].id;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    (window.DashboardRemote ? window.DashboardRemote.ready : Promise.resolve()).then(loadBootstrap)
      .then(function () {
        initialiseSelections();
        renderAll();
        window.setInterval(function () {
          reloadTvPowerHistory();
        }, 30 * 1000);
      })
      .catch(function (error) {
        flash("Admin bootstrap failed: " + error.message, "error");
      });
  });
  window.addEventListener("dashboard:reload-content", function () {
    loadBootstrap().catch(function (error) { flash(error.message, "error"); });
  });
})();
