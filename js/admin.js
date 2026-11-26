/* Admin editor for the text shown on the public pages. Each panel saves its own fields. */
(function () {
  var C = window.GPlusContent;
  var R = window.GPlusRich;

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

  /* ---------- Panels ---------- */
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
