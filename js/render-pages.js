(function () {
  function getQueryParam(name) {
    var search = window.location.search.substring(1).split("&");
    for (var i = 0; i < search.length; i += 1) {
      var parts = search[i].split("=");
      if (decodeURIComponent(parts[0] || "") === name) {
        return decodeURIComponent((parts[1] || "").replace(/\+/g, " "));
      }
    }
    return "";
  }

  function updateClock() {
    if (window.displayShell) {
      window.displayShell.updateClock();
    }
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        throw new Error("Request failed");
      }
      return response.json();
    });
  }

  function updateTickerTime(isoString) {
    window.__tickerUpdatedTime = isoString || "";
    if (window.tickerBar) {
      window.tickerBar.setUpdatedTime(isoString || "");
    }
  }

  function applyOverlayLogo(overlay, data) {
    var logoUrl = data && data.overlay_logo_url ? String(data.overlay_logo_url).trim() : "";
    if (logoUrl) {
      overlay.style.setProperty("--overlay-logo-url", "url(\"" + logoUrl.replace(/\"/g, "") + "\")");
      overlay.classList.add("has-logo");
    } else {
      overlay.style.removeProperty("--overlay-logo-url");
      overlay.classList.remove("has-logo");
    }
  }

  function defaultOverlayHeading(type) {
    var map = {
      emergency: "Important Message",
      info: "Information",
      success: "Well Done",
      reminder: "Reminder",
    };
    return map[type] || "Important Message";
  }

  function setOverlay(data) {
    var overlay = document.getElementById("screenOverlay");
    if (!overlay) {
      return;
    }
    if (data && data.emergency_active) {
      var type = data.overlay_type || "emergency";
      overlay.className = "screen-overlay screen-overlay--" + type + " active";
      document.getElementById("overlayIcon").textContent = data.overlay_icon || "⚠️";
      document.getElementById("overlayHeading").textContent = data.overlay_title || defaultOverlayHeading(type);
      document.getElementById("overlayMessage").textContent = data.emergency_message || "";
      applyOverlayLogo(overlay, data);
    } else {
      overlay.className = "screen-overlay";
      document.getElementById("overlayHeading").textContent = defaultOverlayHeading("emergency");
      applyOverlayLogo(overlay, null);
    }
  }

  function pollOverlay() {
    if (window.displayShell) {
      window.displayShell.refreshOverlay();
      return;
    }
    fetchJson("/api/notices").then(setOverlay).catch(function () {});
  }

  function layoutTemplate(layout) {
    if (layout === "2") return "repeat(2, minmax(0, 1fr))";
    if (layout === "3") return "repeat(3, minmax(0, 1fr))";
    if (layout === "4") return "repeat(4, minmax(0, 1fr))";
    if (layout === "2/3-1/3") return "minmax(0, 2fr) minmax(0, 1fr)";
    if (layout === "1/3-2/3") return "minmax(0, 1fr) minmax(0, 2fr)";
    return "minmax(0, 1fr)";
  }

  function mediaForCard(mediaMap, card) {
    if (!card || !card.mediaId || !mediaMap) {
      return null;
    }
    return mediaMap[card.mediaId] || null;
  }

  function isVideoMedia(media) {
    return !!(media && ((media.kind || "") === "video" || String(media.mimeType || "").indexOf("video/") === 0));
  }

  function applyThemeToRoot(root, theme) {
    var el = root || document.documentElement;
    if (window.displayShell && window.displayShell.applyThemeToRoot) {
      window.displayShell.applyThemeToRoot(el, theme);
      return;
    }
    var key = theme && theme.key ? String(theme.key).trim() : "";
    var brand = theme && theme.brand ? String(theme.brand).trim() : "";
    var elements = Array.isArray(theme && theme.elements) ? theme.elements : [];
    if (!key || key === "default" || !brand || !elements.length) {
      el.style.removeProperty("--theme-brand");
      el.style.removeProperty("--theme-banner-border-color");
      el.style.removeProperty("--theme-panel-heading-color");
      el.style.removeProperty("--theme-image-border-color");
      delete el.dataset.themeKey;
      delete el.dataset.themeElements;
      return;
    }
    el.style.setProperty("--theme-brand", brand);
    el.dataset.themeKey = key;
    el.dataset.themeElements = elements.join(",");
    if (elements.indexOf("banner_border") !== -1) {
      el.style.setProperty("--theme-banner-border-color", brand);
    } else {
      el.style.removeProperty("--theme-banner-border-color");
    }
    if (elements.indexOf("panel_headings") !== -1) {
      el.style.setProperty("--theme-panel-heading-color", brand);
    } else {
      el.style.removeProperty("--theme-panel-heading-color");
    }
    if (elements.indexOf("image_borders") !== -1) {
      el.style.setProperty("--theme-image-border-color", brand);
    } else {
      el.style.removeProperty("--theme-image-border-color");
    }
  }

  function resolvePageTheme(page, themeCatalog) {
    if (!page) {
      return null;
    }
    var key = String(page.themeKey || "").trim();
    var elements = Array.isArray(page.themeElements) ? page.themeElements.filter(Boolean) : [];
    if (!key || key === "default" || !elements.length) {
      return null;
    }
    var catalog = {};
    (themeCatalog || []).forEach(function (entry) {
      if (entry && entry.key) {
        catalog[String(entry.key)] = entry;
      }
    });
    var theme = catalog[key];
    if (!theme || !theme.brand) {
      return null;
    }
    return {
      key: key,
      label: theme.label || key,
      brand: theme.brand,
      elements: elements,
    };
  }

  function frameShapeClass(shape) {
    var key = String(shape || "").trim();
    if (key === "wobble-circle") return "image-frame--wobble-circle";
    if (key === "rounded") return "image-frame--rounded";
    if (key === "square") return "image-frame--square";
    return "image-frame--circle";
  }

  function createFramedMediaNode(media, className, altText, card) {
    var mediaNode = createMediaNode(media, className, altText);
    var enabled = !!(card && card.frameEnabled);
    if (!enabled) {
      return mediaNode;
    }
    var wrapper = document.createElement("div");
    wrapper.className = "image-frame image-frame--bordered " + frameShapeClass(card.frameShape || (card.type === "staff_profile" ? "wobble-circle" : "circle"));
    mediaNode.classList.add("image-frame__media");
    wrapper.appendChild(mediaNode);
    return wrapper;
  }

  function createMediaNode(media, className, altText) {
    var focal = media.focalPoint || { x: 50, y: 50 };
    if (isVideoMedia(media)) {
      var video = document.createElement("video");
      video.className = className;
      video.src = media.url || "";
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.setAttribute("preload", "metadata");
      return video;
    }
    var img = document.createElement("img");
    img.className = className;
    img.src = media.url || "";
    img.alt = altText || "";
    img.style.objectPosition = focal.x + "% " + focal.y + "%";
    return img;
  }

  function renderCard(card, mediaMap) {
    var media = mediaForCard(mediaMap, card);
    var cardEl = document.createElement("article");
    cardEl.className = "card custom-card custom-card--" + (card.type || "text");

    if (card.type === "staff_profile") {
      cardEl.classList.add("custom-card--staff_profile");
      var profileMediaWrap = document.createElement("div");
      profileMediaWrap.className = "custom-card__profile-image-wrap";
      if (media && media.url) {
        profileMediaWrap.appendChild(createFramedMediaNode(media, "custom-card__image", card.title || media.title || "", card));
      } else {
        var placeholder = document.createElement("div");
        placeholder.className = "custom-card__missing";
        placeholder.textContent = "Photo not set";
        profileMediaWrap.appendChild(placeholder);
      }
      cardEl.appendChild(profileMediaWrap);

      if (card.title) {
        var name = document.createElement("div");
        name.className = "custom-card__profile-name";
        name.textContent = card.title;
        cardEl.appendChild(name);
      }

      if (card.content) {
        var role = document.createElement("div");
        role.className = "custom-card__profile-role";
        role.innerHTML = escapeHtml(card.content).replace(/\n/g, "<br>");
        cardEl.appendChild(role);
      }

      return cardEl;
    }

    if (card.title) {
      var heading = document.createElement("h3");
      heading.className = "custom-card__title";
      heading.textContent = card.title;
      cardEl.appendChild(heading);
    }

    if (card.type === "image" || card.type === "text_image") {
      if (media && media.url) {
        cardEl.appendChild(createFramedMediaNode(media, "custom-card__image", card.title || media.title || "", card));
      } else {
        var placeholder = document.createElement("div");
        placeholder.className = "custom-card__missing";
        placeholder.textContent = "Image not set";
        cardEl.appendChild(placeholder);
      }
    }

    if (card.type === "stat") {
      var statValue = document.createElement("div");
      statValue.className = "custom-card__stat-value";
      statValue.textContent = card.statValue || "--";
      cardEl.appendChild(statValue);

      var statLabel = document.createElement("div");
      statLabel.className = "custom-card__stat-label";
      statLabel.textContent = card.statLabel || "";
      cardEl.appendChild(statLabel);
      return cardEl;
    }

    if (card.content) {
      var body = document.createElement("div");
      body.className = "custom-card__body";
      body.innerHTML = escapeHtml(card.content).replace(/\n/g, "<br>");
      cardEl.appendChild(body);
    }

    if (card.secondaryContent) {
      var secondary = document.createElement("div");
      secondary.className = "custom-card__secondary";
      secondary.innerHTML = escapeHtml(card.secondaryContent).replace(/\n/g, "<br>");
      cardEl.appendChild(secondary);
    }

    return cardEl;
  }

  function renderStructuredPage(container, page, mediaMap) {
    container.innerHTML = "";
    (page.rows || []).forEach(function (row) {
      var rowEl = document.createElement("section");
      rowEl.className = "custom-row";
      rowEl.style.gridTemplateColumns = layoutTemplate(row.layout || "1");

      (row.columns || []).forEach(function (column) {
        var colEl = document.createElement("div");
        colEl.className = "custom-column";
        (column.cards || []).forEach(function (card) {
          colEl.appendChild(renderCard(card, mediaMap));
        });
        rowEl.appendChild(colEl);
      });

      container.appendChild(rowEl);
    });
  }

  function initCustomPage() {
    var pageId = getQueryParam("page");
    if (!pageId) {
      return;
    }
    var titleEl = document.getElementById("customPageTitle");
    var contentEl = document.getElementById("customPageContent");
    fetchJson("/api/custom-pages/" + encodeURIComponent(pageId) + "/render-data")
      .then(function (payload) {
        titleEl.textContent = payload.title || titleEl.textContent;
        applyThemeToRoot(document.documentElement, payload.theme || null);
        renderStructuredPage(contentEl, payload.page || {}, payload.mediaById || {});
      })
      .catch(function () {
        contentEl.innerHTML = '<article class="empty-state"><div class="empty-state-text">This page could not be loaded.</div></article>';
      });
  }

  function initRotationRenderPage(type) {
    var itemId = getQueryParam("item");
    if (!itemId) {
      return;
    }
    var request = "/api/rotation-items/" + encodeURIComponent(itemId) + "/render-data";
    fetchJson(request)
      .then(function (payload) {
        updateTickerTime(payload.updated || "");
        if (type === "image") {
          var media = payload.media || {};
          var shell = document.getElementById("imageItemShell");
          shell.innerHTML = "";
          shell.appendChild(createMediaNode(media, "media-page__image", payload.title || media.title || ""));
          document.getElementById("imageTitle").textContent = payload.title || media.title || "";
          return;
        }

        if (type === "picture_page") {
          var grid = document.getElementById("picturePageGrid");
          var count = Math.max(1, payload.displayCount || 1);
          var visibleItems = (payload.images || []).slice(0, count);
          var columns = count >= 4 ? 2 : count;
          var rows = Math.max(1, Math.ceil(Math.max(1, visibleItems.length) / columns));
          grid.style.gridTemplateColumns = "repeat(" + columns + ", minmax(0, 1fr))";
          grid.style.gridTemplateRows = "repeat(" + rows + ", minmax(0, 1fr))";
          grid.innerHTML = "";
          visibleItems.forEach(function (media) {
            var tile = document.createElement("article");
            tile.className = "picture-page__tile";
            var node = createMediaNode(media, "picture-page__image", media.title || "");
            if (!isVideoMedia(media)) {
              node.classList.add("picture-page__image--ken-burns");
              var panX = ((Math.random() * 2.6) - 1.3).toFixed(2);
              var panY = ((Math.random() * 2.6) - 1.3).toFixed(2);
              var drift = (24 + Math.floor(Math.random() * 16)) + "s";
              node.style.setProperty("--kb-pan-x", panX + "%");
              node.style.setProperty("--kb-pan-y", panY + "%");
              node.style.setProperty("--kb-duration", drift);
            }
            tile.appendChild(node);
            grid.appendChild(tile);
          });
          return;
        }
      })
      .catch(function () {
        var errorTarget = document.getElementById("imageTitle") || document.getElementById("picturePageTitle");
        if (errorTarget) {
          errorTarget.textContent = "Unable to load content";
        }
      });
  }

  function initDisplayShell() {
    updateClock();
    window.setInterval(updateClock, 1000);
    pollOverlay();
    window.setInterval(pollOverlay, 30000);
  }

  window.dashboardDisplay = {
    initDisplayShell: initDisplayShell,
    initCustomPage: initCustomPage,
    initRotationRenderPage: initRotationRenderPage,
    renderStructuredPage: renderStructuredPage,
    applyThemeToRoot: applyThemeToRoot,
    resolvePageTheme: resolvePageTheme,
    fetchJson: fetchJson,
    updateTickerTime: updateTickerTime,
  };
})();
