/* Renders editable content (from GPlusContent) into the public pages. */
(function () {
  var C = window.GPlusContent;
  var R = window.GPlusRich;

  /* "key" → content.key ; "key.N" → N-th item of a list field. */
  function lookup(content, path) {
    var parts = path.split(".");
    var value = content[parts[0]];
    if (parts.length > 1) value = Array.isArray(value) ? value[Number(parts[1])] : undefined;
    return value;
  }

  function render(content) {

    document.querySelectorAll("[data-bind]").forEach(function (node) {
      var key = node.getAttribute("data-bind");
      var value = lookup(content, key);
      if (R.isRichKey(key)) node.innerHTML = R.toSafeHtml(value); // sanitised: b / span styles / br only
      else node.textContent = value == null ? "" : value;
      if (node.hasAttribute("data-hide-empty")) node.hidden = !R.plainText(value).trim();
    });

    // <div data-bind-list="key"> → one <p> per non-empty paragraph.
    document.querySelectorAll("[data-bind-list]").forEach(function (box) {
      var key = box.getAttribute("data-bind-list");
      var items = content[key] || [];
      box.textContent = "";
      items.forEach(function (text) {
        if (!R.plainText(text).trim()) return;
        var p = document.createElement("p");
        if (R.isRichKey(key)) p.innerHTML = R.toSafeHtml(text);
        else p.textContent = text;
        box.appendChild(p);
      });
    });

    // <div data-bind-news="key"> → one .news-row per item; the enclosing
    // [data-news-section] is hidden when there is nothing to show.
    document.querySelectorAll("[data-bind-news]").forEach(function (box) {
      var items = (content[box.getAttribute("data-bind-news")] || []).filter(function (n) {
        return n && n.title && n.title.trim();
      });
      box.textContent = "";
      items.forEach(function (n) {
        var link = (n.link || "").trim();
        var safe = link && !/^\s*(javascript|data|vbscript):/i.test(link);
        var row = document.createElement(safe ? "a" : "div");
        row.className = "news-row" + (safe ? " news-row--link" : "");
        if (safe) {
          row.href = link;
          if (/^https?:\/\//i.test(link)) { row.target = "_blank"; row.rel = "noopener"; }
        }
        var t = document.createElement("p");
        t.className = "news-row__title";
        t.textContent = n.title;
        var d = document.createElement("p");
        d.className = "news-row__date";
        d.textContent = n.date || "";
        row.appendChild(t);
        row.appendChild(d);
        box.appendChild(row);
      });
      var section = box.closest("[data-news-section]");
      if (section) section.hidden = items.length === 0;
    });

    document.querySelectorAll("[data-mailto]").forEach(function (a) {
      a.href = "mailto:" + content.email;
    });
  }

  // The bound elements are empty in the HTML, so nothing wrong is shown while
  // loading. Repeat visitors get their cached copy at once; everyone then gets
  // the current copy from Supabase. If Supabase is unreachable, the cached copy
  // (or the built-in defaults) stays on screen.
  var hasCache = !!C.readCache();
  if (hasCache) render(C.loadCached());

  C.fetchRemote().then(render, function (err) {
    if (window.console) console.warn("[G+] " + err.message + " 저장된/기본 문구를 표시합니다.");
    if (!hasCache) render(C.loadCached());
  });

  // Re-render when the admin page (open in another tab of this browser) saves.
  window.addEventListener("storage", function (e) {
    if (e.key === C.CACHE_KEY) render(C.loadCached());
  });
})();
