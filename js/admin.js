/*
 * Admin editor for the text shown on the public pages.
 *
 * Sign in with a Supabase account → check it is listed in public.site_admins →
 * load public.site_content → edit. Each panel saves its own keys (upsert).
 * The server enforces the permission (RLS); the checks here only drive the UI.
 */
(function () {
  var C = window.GPlusContent;
  var R = window.GPlusRich;
  var CFG = window.GPLUS_CONFIG || {};
  var TABLE = CFG.table || "site_content";

  var $ = function (id) { return document.getElementById(id); };
  var content = null;
  var sb = null;

  function show(id, on) { $(id).hidden = !on; }

  function setStatus(text) {
    $("status-text").textContent = text || "";
    show("status", !!text);
  }

  /* Supabase error → message an editor can act on. */
  function explain(err) {
    var msg = (err && (err.message || err.error_description)) || String(err);
    if (/Invalid login credentials/i.test(msg)) return "이메일 또는 비밀번호가 맞지 않습니다.";
    if (/Email not confirmed/i.test(msg)) return "이메일 인증이 끝나지 않은 계정입니다.";
    if (/row-level security|permission denied|42501/i.test(msg)) return "이 계정에는 문구 수정 권한이 없습니다.";
    if (/JWT|expired|session/i.test(msg)) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return "서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.";
    return msg;
  }

  function flash(savedEl, errorEl, err) {
    clearTimeout(savedEl._t);
    if (err) {
      errorEl.textContent = err.message || String(err);
      errorEl.hidden = false;
      savedEl.hidden = true;
      return;
    }
    errorEl.hidden = true;
    savedEl.hidden = false;
    savedEl._t = setTimeout(function () { savedEl.hidden = true; }, 2500);
  }

  /* ---------- List editor ([data-list="key"]) ----------
   * Without a schema each item is a string edited in a textarea (paragraphs).
   * With a schema each item is an object with one input per schema field. */
  var SCHEMAS = {
    news: {
      itemLabel: "소식",
      fields: [
        { key: "title", label: "제목", type: "text" },
        { key: "date", label: "날짜", type: "date" },
        { key: "link", label: "링크 (선택, 예: https://…)", type: "url" },
      ],
    },
  };

  function makeButton(label, title, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn-mini";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
    return b;
  }

  function ListEditor(root) {
    this.root = root;
    this.key = root.getAttribute("data-list");
    this.note = root.getAttribute("data-list-note") || "";
    this.schema = SCHEMAS[this.key] || null;
    this.itemLabel = this.schema ? this.schema.itemLabel : "문단";
    this.items = (content[this.key] || []).slice();
    var self = this;
    var addBtn = root.parentNode.querySelector("[data-list-add='" + this.key + "']");
    if (addBtn) addBtn.addEventListener("click", function () {
      self.sync();
      self.items.push(self.blank());
      self.render();
      var items = root.querySelectorAll(".list-item");
      items[items.length - 1].querySelector("input, textarea").focus();
    });
    this.render();
  }

  ListEditor.prototype.blank = function () {
    if (!this.schema) return "";
    var o = {};
    this.schema.fields.forEach(function (f) { o[f.key] = ""; });
    return o;
  };

  ListEditor.prototype.isEmpty = function (item) {
    if (!this.schema) return !R.plainText(item).trim();
    return this.schema.fields.every(function (f) { return !String(item[f.key] || "").trim(); });
  };

  ListEditor.prototype.summary = function (item) {
    return (this.schema ? String(item[this.schema.fields[0].key] || "") : R.plainText(item)).trim().slice(0, 30);
  };

  ListEditor.prototype.sync = function () {
    var schema = this.schema;
    this.items = Array.prototype.map.call(this.root.querySelectorAll(".list-item"), function (el) {
      if (!schema) return el.querySelector("textarea").value;
      var o = {};
      schema.fields.forEach(function (f) { o[f.key] = el.querySelector("[data-key='" + f.key + "']").value; });
      return o;
    });
  };

  ListEditor.prototype.move = function (i, delta) {
    this.sync();
    var j = i + delta;
    if (j < 0 || j >= this.items.length) return;
    var tmp = this.items[i]; this.items[i] = this.items[j]; this.items[j] = tmp;
    this.render();
    this.root.querySelectorAll(".list-item")[j].querySelector("input, textarea").focus();
  };

  ListEditor.prototype.remove = function (i) {
    this.sync();
    var name = this.itemLabel + " " + (i + 1);
    if (!this.isEmpty(this.items[i]) && !window.confirm(name + "을(를) 삭제할까요?\n\n" + this.summary(this.items[i]) + "…")) return;
    this.items.splice(i, 1);
    this.render();
  };

  ListEditor.prototype.render = function () {
    var self = this;
    this.root.textContent = "";
    if (!this.items.length) {
      var empty = document.createElement("p");
      empty.className = "list-empty";
      empty.textContent = self.itemLabel + "이(가) 없습니다. 아래 ‘" + self.itemLabel + " 추가’를 눌러 주세요.";
      this.root.appendChild(empty);
    }
    this.items.forEach(function (text, i) {
      var id = "f-" + self.key + "-" + i;
      var name = self.itemLabel + " " + (i + 1);
      var item = document.createElement("div");
      item.className = "list-item";

      var head = document.createElement("div");
      head.className = "list-item__head";
      var label = document.createElement(self.schema ? "span" : "label");
      if (!self.schema) label.htmlFor = id;
      label.className = "list-item__label";
      label.textContent = name + (i < 2 && self.note ? " · " + self.note : "");
      var tools = document.createElement("div");
      tools.className = "list-item__tools";
      var up = makeButton("↑", name + " 위로 이동", function () { self.move(i, -1); });
      var down = makeButton("↓", name + " 아래로 이동", function () { self.move(i, 1); });
      up.disabled = i === 0;
      down.disabled = i === self.items.length - 1;
      var del = makeButton("삭제", name + " 삭제", function () { self.remove(i); });
      del.classList.add("btn-mini--danger");
      tools.appendChild(up); tools.appendChild(down); tools.appendChild(del);
      head.appendChild(label); head.appendChild(tools);

      item.appendChild(head);
      if (!self.schema) {
        var ta = document.createElement("textarea");
        ta.id = id;
        ta.value = text;
        item.appendChild(ta);
        if (R.isRichKey(self.key)) new R.Editor(ta, name);
      } else {
        var grid = document.createElement("div");
        grid.className = "list-item__fields";
        self.schema.fields.forEach(function (f) {
          var wrap = document.createElement("div");
          wrap.className = "list-item__field list-item__field--" + f.key;
          var l = document.createElement("label");
          l.htmlFor = id + "-" + f.key;
          l.textContent = f.label;
          var input = document.createElement("input");
          input.type = f.type;
          input.id = id + "-" + f.key;
          input.setAttribute("data-key", f.key);
          input.value = text[f.key] || "";
          wrap.appendChild(l);
          wrap.appendChild(input);
          grid.appendChild(wrap);
        });
        item.appendChild(grid);
      }
      self.root.appendChild(item);
    });
  };

  ListEditor.prototype.value = function () {
    this.sync();
    var self = this;
    return this.items.filter(function (t) { return !self.isEmpty(t); });
  };

  /* ---------- Unsaved-change tracking ---------- */
  var dirty = new Set();
  function markDirty(panel) {
    dirty.add(panel);
    var s = panel.querySelector("[data-saved]");
    if (s) s.hidden = true;
    var d = panel.querySelector("[data-dirty]");
    if (d) d.hidden = false;
  }
  function markClean(panel) {
    dirty.delete(panel);
    var d = panel.querySelector("[data-dirty]");
    if (d) d.hidden = true;
  }
  window.addEventListener("beforeunload", function (e) {
    if (!dirty.size) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ---------- Saving ---------- */
  function saveValues(patch) {
    var rows = Object.keys(patch).map(function (k) { return { key: k, value: patch[k] }; });
    return sb.from(TABLE).upsert(rows, { onConflict: "key" }).select("key").then(function (res) {
      if (res.error) throw res.error;
      if (!res.data || res.data.length !== rows.length) throw new Error("이 계정에는 문구 수정 권한이 없습니다.");
      Object.assign(content, patch);
      C.writeCache(Object.assign(C.readCache() || {}, patch)); // refresh open site tabs in this browser
    });
  }

  /* ---------- Panels ---------- */
  function initPanels() {
  document.querySelectorAll("[data-section]").forEach(function (panel) {
    var fields = panel.querySelectorAll("[data-field]");
    fields.forEach(function (input) {
      var key = input.getAttribute("data-field");
      input.value = content[key] || "";
      if (input.tagName === "TEXTAREA" && R.isRichKey(key)) {
        var label = panel.querySelector("label[for='" + input.id + "']");
        var editor = new R.Editor(input, label ? label.textContent : key);
        if (label) label.addEventListener("click", function (e) { e.preventDefault(); editor.area.focus(); });
      }
    });

    var lists = Array.prototype.map.call(panel.querySelectorAll("[data-list]"), function (el) {
      return new ListEditor(el);
    });

    var savedEl = panel.querySelector("[data-saved]");
    var errorEl = panel.querySelector("[data-error]");
    var saveBtn = panel.querySelector("[data-save]");

    // Any edit inside the panel (inputs, rich editors, list buttons) marks it unsaved.
    var dirtyNote = document.createElement("span");
    dirtyNote.className = "pill pill-warn";
    dirtyNote.setAttribute("data-dirty", "");
    dirtyNote.textContent = "저장 안 됨";
    dirtyNote.hidden = true;
    savedEl.parentNode.insertBefore(dirtyNote, savedEl);
    panel.addEventListener("input", function () { markDirty(panel); });
    panel.addEventListener("change", function () { markDirty(panel); });
    panel.addEventListener("click", function (e) {
      if (e.target.closest(".btn-mini, .btn-add")) markDirty(panel);
    });

    saveBtn.addEventListener("click", function () {
      var patch = {};
      fields.forEach(function (input) { patch[input.getAttribute("data-field")] = input.value; });
      lists.forEach(function (list) { patch[list.key] = list.value(); });
      saveBtn.disabled = true;
      saveBtn.textContent = "저장 중…";
      saveValues(patch).then(function () {
        lists.forEach(function (list) { list.items = patch[list.key].slice(); list.render(); });
        markClean(panel);
        flash(savedEl, errorEl, null);
      }, function (err) {
        flash(savedEl, errorEl, new Error(explain(err)));
      }).then(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = "저장";
      });
    });
  });
  }

  /* ---------- Import of old browser-only edits ---------- */
  var LABELS = {
    heroEyebrow: "홈 강조 문구", heroTitle: "홈 메인 타이틀", heroSubtitle: "홈 설명 문구",
    aboutHeadline: "회사소개 헤드라인", aboutParagraphs: "회사소개 문단", aboutSign: "맺음말",
    visionText: "VISION", missionText: "MISSION",
    history1Title: "연도 1", history1Text: "HISTORY 내용 1", history2Title: "연도 2", history2Text: "HISTORY 내용 2",
    history3Title: "연도 3", history3Text: "HISTORY 내용 3", news: "NEWS",
    productsTitle: "제품 타이틀", productsDescription: "제품 설명 문구",
    contactTitle: "문의 타이틀", contactSubtitle: "문의 설명", phone: "전화번호", email: "이메일",
  };

  function initLegacy() {
    var legacy = C.readLegacy();
    if (!legacy) return;
    $("legacy-keys").textContent = "항목: " + Object.keys(legacy).map(function (k) { return LABELS[k] || k; }).join(", ");
    show("legacy", true);
    $("legacy-import").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true;
      saveValues(legacy).then(function () {
        C.clearLegacy();
        window.location.reload(); // rebuild the panels from the server copy
      }, function (err) {
        btn.disabled = false;
        $("legacy-error").textContent = explain(err);
        show("legacy-error", true);
      });
    });
    $("legacy-discard").addEventListener("click", function () {
      if (!window.confirm("이 브라우저에 남은 예전 수정 문구를 지울까요? 서버 문구에는 영향이 없습니다.")) return;
      C.clearLegacy();
      show("legacy", false);
    });
  }

  /* ---------- Hooks for other admin panels (js/admin-series.js) ---------- */
  var readyFns = [];
  var readySb = null;
  window.GPlusAdmin = {
    explain: explain,
    flash: flash,
    markDirty: markDirty,
    markClean: markClean,
    /* fn(sb) runs once the signed-in account is confirmed as a site admin. */
    onReady: function (fn) { if (readySb) fn(readySb); else readyFns.push(fn); },
  };
  function fireReady() {
    readySb = sb;
    readyFns.splice(0).forEach(function (fn) {
      try { fn(sb); } catch (e) { if (window.console) console.error(e); }
    });
  }

  /* ---------- Sign-in flow ---------- */
  var started = false;

  function showLogin(message) {
    show("editor", false);
    show("who", false);
    show("logout", false);
    setStatus("");
    show("auth", true);
    if (message) { $("login-error").textContent = message; show("login-error", true); }
    $("login-email").focus();
  }

  function enter(session) {
    show("auth", false);
    $("who").textContent = session.user.email;
    show("who", true);
    show("logout", true);
    if (started) return;
    setStatus("권한 확인 중…");

    sb.from("site_admins").select("user_id").eq("user_id", session.user.id).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      if (!res.data) {
        setStatus(session.user.email + " 계정에는 문구 수정 권한이 없습니다. 권한이 있는 계정으로 다시 로그인해 주세요.");
        return null;
      }
      setStatus("문구 불러오는 중…");
      return sb.from(TABLE).select("key,value");
    }).then(function (res) {
      if (!res) return;
      if (res.error) throw res.error;
      var values = C.rowsToObject(res.data);
      C.writeCache(values);
      content = C.merge(values);
      started = true;
      initPanels();
      initLegacy();
      setStatus("");
      show("editor", true);
      fireReady();
    }).catch(function (err) {
      setStatus("불러오기 실패: " + explain(err));
    });
  }

  function boot() {
    if (!window.supabase || !CFG.supabaseUrl) {
      setStatus("관리자 페이지를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.");
      return;
    }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "gplus.admin.auth" },
    });

    $("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("login-email").value.trim();
      var password = $("login-password").value;
      show("login-error", false);
      if (!email || !password) {
        $("login-error").textContent = "이메일과 비밀번호를 입력해 주세요.";
        show("login-error", true);
        return;
      }
      var btn = $("login-btn");
      btn.disabled = true;
      btn.textContent = "로그인 중…";
      sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        btn.disabled = false;
        btn.textContent = "로그인";
        if (res.error) {
          $("login-error").textContent = explain(res.error);
          show("login-error", true);
          return;
        }
        $("login-password").value = "";
        enter(res.data.session);
      });
    });

    $("logout").addEventListener("click", function () {
      if (dirty.size && !window.confirm("저장하지 않은 수정 내용이 있습니다. 로그아웃할까요?")) return;
      dirty.clear();
      sb.auth.signOut().then(function () { window.location.reload(); });
    });

    sb.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT" && started) window.location.reload();
    });

    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (session) enter(session);
      else showLogin();
    });
  }

  boot();
})();
