/*
 * Admin panel "제품소개 — 시리즈 사진 · 소개" (admin.html #series-panel).
 *
 * Edits public.series_photo (one row per model photo) and uploads photos to the
 * Storage bucket "photo". Both are limited to accounts in public.site_admins by
 * row-level security; this file only drives the UI.
 *
 * - Photos upload as soon as they are chosen: converted in the browser to PNG
 *   (longest side ≤ 1000px) and stored at <hollow|planetary>/<photo_filename>.png,
 *   the same path js/series.js (products.html) and G_selection look up.
 * - Text changes, new rows and deletions are sent when "저장" is pressed.
 *   Deleting a row leaves its photo file in Storage.
 */
(function () {
  var A = window.GPlusAdmin;
  var S = window.GPlusSeries;
  if (!A || !S) return;

  var COLS = "photo_id,series_code,photo_filename,photo_title,description,sort_order";
  var FIELDS = ["series_code", "photo_title", "photo_filename", "description", "sort_order"];
  var MAX_SIDE = 1000;
  var MAX_FILE_MB = 20;
  var SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

  var $ = function (id) { return document.getElementById(id); };
  var panel = $("series-panel");
  var list = $("series-list");
  var saveBtn = $("series-save");
  var savedEl = $("series-saved");
  var errorEl = $("series-error");
  if (!panel) return;

  var sb = null;
  var original = {};   // photo_id → row as loaded
  var items = [];      // rows being edited ({ photo_id: null } for new ones)
  var busy = false;

  function clean(row) {
    var o = { photo_id: row.photo_id == null ? null : row.photo_id };
    FIELDS.forEach(function (k) { o[k] = row[k] == null ? "" : String(row[k]); });
    return o;
  }

  function toDb(row) {
    var n = String(row.sort_order).trim();
    return {
      series_code: row.series_code.trim(),
      photo_title: row.photo_title.trim() || null,
      photo_filename: row.photo_filename.trim(),
      description: row.description.trim() || null,
      sort_order: n === "" ? null : Number(n),
    };
  }

  function changed(row) {
    var a = toDb(row), b = toDb(clean(original[row.photo_id]));
    return FIELDS.some(function (k) { return a[k] !== b[k]; });
  }

  function showError(msg) {
    A.flash(savedEl, errorEl, new Error(msg));
  }

  /* ---------- Loading ---------- */
  function load() {
    return sb.from(S.TABLE).select(COLS)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("photo_id", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        original = {};
        items = (res.data || []).map(function (r) {
          original[r.photo_id] = r;
          return clean(r);
        });
        render();
      });
  }

  /* ---------- Rendering ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function title(row) {
    var code = row.series_code.trim() || "(코드 없음)";
    var model = row.photo_title.trim();
    return model && model !== code ? code + " · " + model : code;
  }

  function sync() {
    Array.prototype.forEach.call(list.querySelectorAll(".sitem"), function (node) {
      var row = items[Number(node.getAttribute("data-index"))];
      FIELDS.forEach(function (k) { row[k] = node.querySelector("[data-key='" + k + "']").value; });
    });
  }

  function thumb(row) {
    var box = el("div", "sitem__thumb");
    var url = S.photoUrl(row);
    var none = el("span", "sitem__none", "사진 없음");
    if (url) {
      var img = el("img");
      img.alt = title(row) + " 사진";
      img.loading = "lazy";
      img.src = url + (row._v ? "?v=" + row._v : "");
      img.addEventListener("error", function () { img.hidden = true; none.hidden = false; });
      none.hidden = true;
      box.appendChild(img);
    }
    box.appendChild(none);
    return box;
  }

  function field(row, i, key, label, type, cls) {
    var wrap = el("div", "list-item__field sitem__field sitem__field--" + (cls || key));
    var id = "s-" + i + "-" + key;
    var l = el("label", null, label);
    l.htmlFor = id;
    var input = el("input");
    input.type = type || "text";
    input.id = id;
    input.value = row[key];
    input.setAttribute("data-key", key);
    if (key === "sort_order") { input.inputMode = "numeric"; input.step = "1"; }
    wrap.appendChild(l);
    wrap.appendChild(input);
    return wrap;
  }

  function render() {
    list.textContent = "";
    if (!items.length) list.appendChild(el("p", "list-empty", "등록된 모델이 없습니다. 아래 ‘모델 추가’를 눌러 주세요."));
    items.forEach(function (row, i) {
      var item = el("div", "list-item sitem");
      item.setAttribute("data-index", i);

      var head = el("div", "list-item__head");
      var label = el("span", "list-item__label", title(row));
      var badges = el("span", "sitem__badges");
      if (row.photo_id == null) badges.appendChild(el("span", "sitem__badge sitem__badge--new", "새 모델"));
      if (S.HIDDEN_SERIES.indexOf(row.series_code.trim().toUpperCase()) !== -1) {
        badges.appendChild(el("span", "sitem__badge", "페이지에 표시 안 함"));
      }
      label.appendChild(badges);
      var tools = el("div", "list-item__tools");
      var del = el("button", "btn-mini btn-mini--danger", "삭제");
      del.type = "button";
      del.setAttribute("aria-label", title(row) + " 삭제");
      del.addEventListener("click", function () { remove(i); });
      tools.appendChild(del);
      head.appendChild(label);
      head.appendChild(tools);

      var body = el("div", "sitem__body");
      var photo = el("div", "sitem__photo");
      photo.appendChild(thumb(row));
      var pick = el("label", "btn-mini sitem__pick", "사진 올리기");
      var file = el("input");
      file.type = "file";
      file.accept = "image/png,image/jpeg,image/webp,image/gif";
      file.className = "sr-only";
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        file.value = "";
        if (f) upload(i, f);
      });
      pick.appendChild(file);
      photo.appendChild(pick);
      var note = el("p", "sitem__path", S.photoPath(row) || "파일명을 입력하세요");
      photo.appendChild(note);

      var grid = el("div", "list-item__fields sitem__fields");
      grid.appendChild(field(row, i, "series_code", "시리즈 코드"));
      grid.appendChild(field(row, i, "photo_title", "모델명"));
      grid.appendChild(field(row, i, "photo_filename", "사진 파일명"));
      grid.appendChild(field(row, i, "sort_order", "순서", "number"));
      grid.appendChild(field(row, i, "description", "소개 문구", "text", "description"));

      body.appendChild(photo);
      body.appendChild(grid);
      item.appendChild(head);
      item.appendChild(body);

      // Keep the heading and the storage path in step with what is typed.
      item.addEventListener("input", function () {
        FIELDS.forEach(function (k) { row[k] = item.querySelector("[data-key='" + k + "']").value; });
        label.firstChild.nodeValue = title(row);
        note.textContent = S.photoPath(row) || "파일명을 입력하세요";
      });
      list.appendChild(item);
    });
    filter();
  }

  function filter() {
    var q = $("series-search").value.trim().toLowerCase();
    Array.prototype.forEach.call(list.querySelectorAll(".sitem"), function (node) {
      var row = items[Number(node.getAttribute("data-index"))];
      var text = [row.series_code, row.photo_title, row.photo_filename, row.description].join(" ").toLowerCase();
      node.hidden = !!q && text.indexOf(q) === -1;
    });
  }

  /* ---------- Add / remove ---------- */
  function add() {
    sync();
    var max = items.reduce(function (m, r) { var n = Number(r.sort_order); return isFinite(n) && r.sort_order !== "" ? Math.max(m, n) : m; }, 0);
    items.push({ photo_id: null, series_code: "", photo_title: "", photo_filename: "", description: "", sort_order: String(max + 1) });
    $("series-search").value = "";
    render();
    A.markDirty(panel);
    var nodes = list.querySelectorAll(".sitem");
    nodes[nodes.length - 1].querySelector("[data-key='series_code']").focus();
  }

  function remove(i) {
    sync();
    var row = items[i];
    var saved = row.photo_id != null;
    if (saved && !window.confirm(title(row) + " 모델을 삭제할까요?\n\n‘저장’을 누르면 제품소개 페이지에서 빠집니다. 사진 파일은 저장소에 그대로 남습니다.")) return;
    items.splice(i, 1);
    render();
    A.markDirty(panel);
  }

  /* ---------- Photo upload ---------- */
  function toPng(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error("사진을 변환하지 못했습니다."));
        }, "image/png");
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("이미지 파일을 읽을 수 없습니다."));
      };
      img.src = url;
    });
  }

  function upload(i, file) {
    sync();
    var row = items[i];
    if (!row.series_code.trim()) { showError("사진을 올리기 전에 시리즈 코드를 입력해 주세요."); return; }
    if (!/^image\//.test(file.type)) { showError("이미지 파일(PNG · JPG · WEBP · GIF)만 올릴 수 있습니다."); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { showError("사진은 " + MAX_FILE_MB + "MB 이하로 올려 주세요."); return; }

    // File name: what is typed, else the model name, else the series code; stored as .png.
    var name = (row.photo_filename.trim() || row.photo_title.trim() || row.series_code.trim());
    if (/^https?:\/\//i.test(name)) { showError("사진 파일명이 인터넷 주소로 되어 있습니다. 파일명(예: GSH)으로 바꾼 뒤 올려 주세요."); return; }
    var folder = "";
    var slash = name.lastIndexOf("/");
    if (slash !== -1) { folder = name.slice(0, slash + 1); name = name.slice(slash + 1); }
    name = name.replace(/\.(png|jpe?g|webp|gif)$/i, "");
    if (!SAFE_NAME.test(name)) { showError("사진 파일명은 영문 · 숫자 · - · _ 만 쓸 수 있습니다. (예: GSG-M)"); return; }
    var nextFilename = folder + name;
    var path = S.photoPath({ series_code: row.series_code, photo_filename: nextFilename });

    var others = items.filter(function (r, j) { return j !== i && S.photoPath(r) === path; });
    if (others.length && !window.confirm(path + " 사진은 " + others.map(title).join(", ") + "에서도 쓰고 있습니다. 바꾸면 그 모델의 사진도 바뀝니다. 계속할까요?")) return;

    var node = list.querySelector(".sitem[data-index='" + i + "']");
    var pick = node.querySelector(".sitem__pick");
    pick.classList.add("is-busy");
    pick.firstChild.nodeValue = "올리는 중…";
    errorEl.hidden = true;

    toPng(file).then(function (blob) {
      return sb.storage.from(S.BUCKET).upload(path, blob, { upsert: true, contentType: "image/png", cacheControl: "60" });
    }).then(function (res) {
      if (res.error) throw res.error;
      sync();
      if (row.photo_filename !== nextFilename) { row.photo_filename = nextFilename; A.markDirty(panel); }
      row._v = Date.now();
      render();
      // A new photo for an already-saved row is live at once; a new file name still needs 저장.
      if (row.photo_id != null && !changed(row)) A.flash(savedEl, errorEl, null);
    }).catch(function (err) {
      pick.classList.remove("is-busy");
      pick.firstChild.nodeValue = "사진 올리기";
      showError("사진 올리기 실패: " + A.explain(err));
    });
  }

  /* ---------- Saving ---------- */
  function validate() {
    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      var name = "모델 " + (i + 1) + (r.series_code.trim() ? " (" + title(r) + ")" : "");
      if (!r.series_code.trim()) return name + ": 시리즈 코드를 입력해 주세요.";
      if (!r.photo_filename.trim()) r.photo_filename = r.photo_title.trim() || r.series_code.trim();
      var n = String(r.sort_order).trim();
      if (n !== "" && !/^-?\d+$/.test(n)) return name + ": 순서는 정수로 입력해 주세요.";
    }
    return "";
  }

  function check(res, expected) {
    if (res.error) throw res.error;
    if (!res.data || res.data.length !== expected) throw new Error("이 계정에는 수정 권한이 없습니다.");
  }

  function save() {
    if (busy) return;
    sync();
    var problem = validate();
    if (problem) { showError(problem); return; }

    var keep = {};
    var updates = [], inserts = [];
    items.forEach(function (r) {
      if (r.photo_id == null) inserts.push(toDb(r));
      else { keep[r.photo_id] = true; if (changed(r)) updates.push(r); }
    });
    var deletes = Object.keys(original).filter(function (id) { return !keep[id]; }).map(Number);
    if (!updates.length && !inserts.length && !deletes.length) {
      A.markClean(panel);
      A.flash(savedEl, errorEl, null);
      return;
    }

    busy = true;
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중…";
    var chain = Promise.resolve();
    updates.forEach(function (r) {
      chain = chain.then(function () {
        return sb.from(S.TABLE).update(toDb(r)).eq("photo_id", r.photo_id).select("photo_id");
      }).then(function (res) { check(res, 1); });
    });
    if (inserts.length) {
      chain = chain.then(function () {
        return sb.from(S.TABLE).insert(inserts).select("photo_id");
      }).then(function (res) { check(res, inserts.length); });
    }
    if (deletes.length) {
      chain = chain.then(function () {
        return sb.from(S.TABLE).delete().in("photo_id", deletes).select("photo_id");
      }).then(function (res) { check(res, deletes.length); });
    }

    chain.then(function () {
      var versions = {};
      items.forEach(function (r) { if (r._v) versions[S.photoPath(r)] = r._v; });
      return load().then(function () {
        items.forEach(function (r) { var v = versions[S.photoPath(r)]; if (v) r._v = v; });
        render();
        A.markClean(panel);
        A.flash(savedEl, errorEl, null);
      });
    }).catch(function (err) {
      // Some steps may have gone through; reload so the list matches the server.
      showError("저장 실패: " + A.explain(err) + " (서버의 현재 내용을 다시 불러왔습니다. 확인 후 다시 시도해 주세요.)");
      return load().catch(function () { /* keep the error above */ });
    }).then(function () {
      busy = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "저장";
    });
  }

  /* ---------- Start ---------- */
  A.onReady(function (client) {
    sb = client;
    list.appendChild(el("p", "list-empty", "불러오는 중…"));
    load().catch(function (err) {
      list.textContent = "";
      list.appendChild(el("p", "list-empty", "시리즈 정보를 불러오지 못했습니다: " + A.explain(err)));
    });
    $("series-add").addEventListener("click", add);
    saveBtn.addEventListener("click", save);
    $("series-search").addEventListener("input", filter);
    panel.addEventListener("input", function (e) {
      if (e.target.id !== "series-search" && e.target.type !== "file") A.markDirty(panel);
    });
  });
})();
