/* Admin editor for the text shown on the public pages. Each panel saves its own fields. */
(function () {
  var C = window.GPlusContent;

  function storageAvailable() {
    try {
      var k = "__gplus_test__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var canSave = storageAvailable();
  if (!canSave) document.getElementById("load-error").hidden = false;

  var content = C.loadContent();

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

  /* ---------- Paragraph list editor ([data-list="key"]) ---------- */
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
    this.items = (content[this.key] || []).slice();
    var self = this;
    var addBtn = root.parentNode.querySelector("[data-list-add='" + this.key + "']");
    if (addBtn) addBtn.addEventListener("click", function () {
      self.sync();
      self.items.push("");
      self.render();
      var areas = root.querySelectorAll("textarea");
      areas[areas.length - 1].focus();
    });
    this.render();
  }

  ListEditor.prototype.sync = function () {
    this.items = Array.prototype.map.call(this.root.querySelectorAll("textarea"), function (t) { return t.value; });
  };

  ListEditor.prototype.move = function (i, delta) {
    this.sync();
    var j = i + delta;
    if (j < 0 || j >= this.items.length) return;
    var tmp = this.items[i]; this.items[i] = this.items[j]; this.items[j] = tmp;
    this.render();
    this.root.querySelectorAll("textarea")[j].focus();
  };

  ListEditor.prototype.remove = function (i) {
    this.sync();
    var preview = (this.items[i] || "").trim().slice(0, 30);
    if (this.items[i].trim() && !window.confirm("문단 " + (i + 1) + "을(를) 삭제할까요?\n\n" + preview + "…")) return;
    this.items.splice(i, 1);
    this.render();
  };

  ListEditor.prototype.render = function () {
    var self = this;
    this.root.textContent = "";
    if (!this.items.length) {
      var empty = document.createElement("p");
      empty.className = "list-empty";
      empty.textContent = "문단이 없습니다. 아래 ‘문단 추가’를 눌러 주세요.";
      this.root.appendChild(empty);
    }
    this.items.forEach(function (text, i) {
      var id = "f-" + self.key + "-" + i;
      var item = document.createElement("div");
      item.className = "list-item";

      var head = document.createElement("div");
      head.className = "list-item__head";
      var label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = "문단 " + (i + 1) + (i < 2 && self.note ? " · " + self.note : "");
      var tools = document.createElement("div");
      tools.className = "list-item__tools";
      var up = makeButton("↑", "문단 " + (i + 1) + " 위로 이동", function () { self.move(i, -1); });
      var down = makeButton("↓", "문단 " + (i + 1) + " 아래로 이동", function () { self.move(i, 1); });
      up.disabled = i === 0;
      down.disabled = i === self.items.length - 1;
      var del = makeButton("삭제", "문단 " + (i + 1) + " 삭제", function () { self.remove(i); });
      del.classList.add("btn-mini--danger");
      tools.appendChild(up); tools.appendChild(down); tools.appendChild(del);
      head.appendChild(label); head.appendChild(tools);

      var ta = document.createElement("textarea");
      ta.id = id;
      ta.value = text;

      item.appendChild(head);
      item.appendChild(ta);
      self.root.appendChild(item);
    });
  };

  ListEditor.prototype.value = function () {
    this.sync();
    return this.items.filter(function (t) { return t.trim() !== ""; });
  };

  /* ---------- Panels ---------- */
  document.querySelectorAll("[data-section]").forEach(function (panel) {
    var fields = panel.querySelectorAll("[data-field]");
    fields.forEach(function (input) {
      input.value = content[input.getAttribute("data-field")] || "";
    });

    var lists = Array.prototype.map.call(panel.querySelectorAll("[data-list]"), function (el) {
      return new ListEditor(el);
    });

    var savedEl = panel.querySelector("[data-saved]");
    var errorEl = panel.querySelector("[data-error]");

    panel.querySelector("[data-save]").addEventListener("click", function () {
      if (!canSave) {
        flash(savedEl, errorEl, new Error("저장소에 연결되지 않았습니다."));
        return;
      }
      var patch = {};
      fields.forEach(function (input) { patch[input.getAttribute("data-field")] = input.value; });
      lists.forEach(function (list) { patch[list.key] = list.value(); });
      try {
        C.saveFields(patch);
        Object.assign(content, patch);
        lists.forEach(function (list) { list.items = patch[list.key].slice(); list.render(); });
        flash(savedEl, errorEl, null);
      } catch (e) {
        flash(savedEl, errorEl, e);
      }
    });
  });
})();
