/*
 * Series cards on products.html, read from Supabase table public.series_photo
 * (anyone may read it):
 *   series_code, photo_filename, photo_title, description, sort_order
 *
 * - One card per series_code, in sort_order. A series with several rows
 *   (e.g. GSG-M / GSG-Z / …) gets a button per model that swaps the photo and text.
 * - GP… series go into [data-series-group="planetary"], the rest into "hollow".
 * - Photos live in Storage bucket "photo": planetary/<file>.png or hollow/<file>.png.
 *   photo_filename may also be a full path ("hollow/GSH.png") or carry an extension.
 * - If the table cannot be read, the series blocks stay hidden.
 */
(function () {
  var CFG = window.GPLUS_CONFIG || {};
  var TABLE = "series_photo";
  var BUCKET = "photo";
  var FETCH_TIMEOUT_MS = 6000;
  /* Series kept in the table but not shown on the page. */
  var HIDDEN_SERIES = ["GPW"];

  function groupOf(code) {
    return /^GP/i.test(code) ? "planetary" : "hollow";
  }

  /* Path of a row's photo inside the bucket, e.g. "hollow/GSH.png" ("" if none). */
  function photoPath(row) {
    var file = String(row.photo_filename || "").trim();
    if (!file || /^https?:\/\//i.test(file)) return "";
    if (file.indexOf("/") === -1) file = groupOf(row.series_code) + "/" + file;
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file)) file += ".png";
    return file;
  }

  function photoUrl(row) {
    var file = String(row.photo_filename || "").trim();
    if (/^https?:\/\//i.test(file)) return file;
    var path = photoPath(row);
    if (!path) return "";
    return CFG.supabaseUrl + "/storage/v1/object/public/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/");
  }

  function fetchRows() {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) return Promise.reject(new Error("Supabase 설정이 없습니다."));
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS) : null;
    var url = CFG.supabaseUrl + "/rest/v1/" + TABLE +
      "?select=photo_id,series_code,photo_filename,photo_title,description,sort_order" +
      "&order=sort_order.asc.nullslast,photo_id.asc";
    return fetch(url, {
      headers: { apikey: CFG.supabaseKey, Accept: "application/json" },
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error("시리즈 정보를 불러오지 못했습니다 (" + res.status + ").");
      return res.json();
    });
  }

  /* Rows (already in sort_order) → [{ code, models: [row, …] }] in first-seen order. */
  function bySeries(rows) {
    var list = [], index = {};
    rows.forEach(function (r) {
      var code = String(r.series_code || "").trim();
      if (!code || HIDDEN_SERIES.indexOf(code.toUpperCase()) !== -1) return;
      if (!(code in index)) { index[code] = list.length; list.push({ code: code, models: [] }); }
      list[index[code]].models.push(r);
    });
    return list;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function card(series) {
    var root = el("article", "scard");
    var media = el("div", "scard__media");
    var img = el("img", "scard__img");
    img.width = 220; img.height = 220;
    img.loading = "lazy"; img.decoding = "async";
    var missing = el("span", "scard__missing", series.code);
    missing.hidden = true;
    img.addEventListener("error", function () { img.hidden = true; missing.hidden = false; });
    img.addEventListener("load", function () { img.hidden = false; missing.hidden = true; });
    media.appendChild(img);
    media.appendChild(missing);

    var body = el("div", "scard__body");
    var title = el("h4", "scard__code", series.code);
    var model = el("p", "scard__model");
    var desc = el("p", "scard__desc");
    body.appendChild(title);
    body.appendChild(model);
    body.appendChild(desc);

    var buttons = [];
    function show(i) {
      var m = series.models[i];
      var name = String(m.photo_title || m.photo_filename || series.code).trim();
      var url = photoUrl(m);
      img.alt = name + " 제품 이미지";
      missing.hidden = true;
      if (url) { img.hidden = false; img.src = url; } else { img.hidden = true; missing.hidden = false; img.removeAttribute("src"); }
      model.textContent = name !== series.code ? name : "";
      model.hidden = !model.textContent;
      desc.textContent = String(m.description || "").trim();
      desc.hidden = !desc.textContent;
      buttons.forEach(function (b, j) { b.setAttribute("aria-pressed", String(j === i)); });
    }

    if (series.models.length > 1) {
      var chips = el("div", "scard__chips");
      chips.setAttribute("role", "group");
      chips.setAttribute("aria-label", series.code + " 모델 선택");
      series.models.forEach(function (m, i) {
        var b = el("button", "scard__chip", String(m.photo_title || m.photo_filename || series.code).trim());
        b.type = "button";
        b.addEventListener("click", function () { show(i); });
        buttons.push(b);
        chips.appendChild(b);
      });
      body.appendChild(chips);
    }

    root.appendChild(media);
    root.appendChild(body);
    show(0);
    return root;
  }

  function render(rows) {
    var series = bySeries(rows || []);
    document.querySelectorAll("[data-series-group]").forEach(function (grid) {
      var group = grid.getAttribute("data-series-group");
      grid.textContent = "";
      series.forEach(function (s) {
        if (groupOf(s.code) === group) grid.appendChild(card(s));
      });
      var block = grid.closest("[data-series-block]") || grid;
      block.hidden = !grid.children.length;
    });
  }

  window.GPlusSeries = {
    TABLE: TABLE,
    BUCKET: BUCKET,
    HIDDEN_SERIES: HIDDEN_SERIES,
    groupOf: groupOf,
    photoPath: photoPath,
    photoUrl: photoUrl,
  };

  // Only pages with series grids (products.html) fetch and render.
  if (!document.querySelector("[data-series-group]")) return;
  fetchRows().then(render, function (err) {
    if (window.console) console.warn("[G+] " + err.message);
  });
})();
