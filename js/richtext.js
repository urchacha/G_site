/*
 * Rich text (bold / colour / size) for the editable site copy.
 *
 * - GPlusRich.toSafeHtml(value): turns a stored value into HTML that is safe to
 *   assign to innerHTML. Only <b>, <br> and <span> with color / font-size /
 *   font-weight survive; everything else is reduced to its text. Plain-text
 *   values (older saves, defaults) work too: newlines become <br>.
 * - GPlusRich.plainText(value): the visible text, for "is this empty?" checks.
 * - GPlusRich.Editor(textarea): admin-only. Hides the textarea and puts a small
 *   toolbar + contenteditable box in its place, keeping textarea.value in sync.
 *
 * Which content keys are rich is listed in RICH_KEYS; the public renderer
 * (main.js) and the admin editor (admin.js) both read it from here.
 */
(function () {
  var RICH_KEYS = [
    "heroSubtitle", "aboutHeadline", "aboutParagraphs", "visionText", "missionText",
    "history1Text", "history2Text", "history3Text", "productsDescription",
  ];

  var COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
  var SIZE_MIN = 10, SIZE_MAX = 48;

  function validSize(size) {
    var m = /^(\d{1,2}(?:\.\d+)?)px$/.exec(String(size || "").trim());
    return m && Number(m[1]) >= SIZE_MIN && Number(m[1]) <= SIZE_MAX ? m[1] + "px" : "";
  }

  function isBold(weight) {
    return weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  }

  /* Copies src's children into dest, keeping only the allowed formatting. */
  function cleanInto(src, dest) {
    Array.prototype.forEach.call(src.childNodes, function (n) {
      if (n.nodeType === 3) { dest.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.nodeName;
      if (/^(SCRIPT|STYLE|TEMPLATE|IFRAME|OBJECT|EMBED|SVG|MATH|NOSCRIPT)$/.test(tag)) return;
      if (tag === "BR") { dest.appendChild(document.createElement("br")); return; }

      // Block elements (contenteditable may create them) become line breaks.
      if (tag === "DIV" || tag === "P") {
        if (dest.lastChild && dest.lastChild.nodeName !== "BR") dest.appendChild(document.createElement("br"));
        cleanInto(n, dest);
        return;
      }

      var target = dest;
      if (tag === "B" || tag === "STRONG") {
        target = document.createElement("b");
      } else if (tag === "SPAN" || tag === "FONT") {
        var span = document.createElement("span");
        var color = (n.getAttribute("color") || n.style.color || "").trim();
        var size = validSize(n.style.fontSize);
        var used = false;
        if (color && COLOR_RE.test(color)) { span.style.color = color; used = true; }
        if (size) { span.style.fontSize = size; used = true; }
        if (isBold(n.style.fontWeight)) { span.style.fontWeight = "700"; used = true; }
        if (used) target = span;
      }
      if (target !== dest) dest.appendChild(target);
      cleanInto(n, target);
    });
  }

  function toSafeHtml(value) {
    if (value == null || value === "") return "";
    var tpl = document.createElement("template"); // inert: nothing runs or loads
    tpl.innerHTML = String(value).replace(/\r?\n/g, "<br>");
    var out = document.createElement("div");
    cleanInto(tpl.content, out);
    while (out.lastChild && out.lastChild.nodeName === "BR") out.removeChild(out.lastChild);
    return out.innerHTML;
  }

  function plainText(value) {
    var tpl = document.createElement("template");
    tpl.innerHTML = toSafeHtml(value);
    return tpl.content.textContent || "";
  }

  function isRichKey(key) {
    return RICH_KEYS.indexOf(String(key).split(".")[0]) !== -1;
  }

  /* ---------------- Admin editor ---------------- */
  var SWATCHES = [
    { color: "#0B1220", name: "검정" },
    { color: "#0072BC", name: "파랑 (G+ 대표색)" },
    { color: "#C0392B", name: "빨강" },
    { color: "#1B7A3D", name: "초록" },
    { color: "#64748B", name: "회색" },
  ];
  var SIZES = [12, 14, 16, 18, 20, 24, 28, 32];

  var active = null; // editor that last held the selection
  document.addEventListener("selectionchange", function () {
    var sel = window.getSelection();
    if (!sel.rangeCount || !active) return;
    var range = sel.getRangeAt(0);
    if (active.area.contains(range.commonAncestorContainer)) active.range = range.cloneRange();
  });

  function Editor(textarea, label) {
    var self = this;
    this.textarea = textarea;

    var wrap = document.createElement("div");
    wrap.className = "rich";
    var bar = document.createElement("div");
    bar.className = "rich__bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", (label || "문구") + " 서식");

    var area = document.createElement("div");
    area.className = "rich__area";
    area.contentEditable = "true";
    area.setAttribute("role", "textbox");
    area.setAttribute("aria-multiline", "true");
    if (label) area.setAttribute("aria-label", label);
    area.innerHTML = toSafeHtml(textarea.value);
    this.area = area;

    // Bold
    bar.appendChild(this.button("<b>B</b>", "굵게 (Ctrl+B)", "rich__btn--bold", function () {
      self.exec("bold");
    }));

    // Colour swatches + custom colour
    var colors = document.createElement("span");
    colors.className = "rich__group";
    SWATCHES.forEach(function (s) {
      var b = self.button("", "글자색: " + s.name, "rich__swatch", function () { self.color(s.color); });
      b.style.background = s.color;
      colors.appendChild(b);
    });
    var picker = document.createElement("input");
    picker.type = "color";
    picker.className = "rich__picker";
    picker.value = "#0072BC";
    picker.title = "글자색 직접 선택";
    picker.setAttribute("aria-label", "글자색 직접 선택");
    picker.addEventListener("change", function () { self.color(picker.value); });
    colors.appendChild(picker);
    bar.appendChild(colors);

    // Size
    var size = document.createElement("select");
    size.className = "rich__size";
    size.setAttribute("aria-label", "글자 크기");
    size.title = "글자 크기";
    var first = document.createElement("option");
    first.value = ""; first.textContent = "크기";
    size.appendChild(first);
    SIZES.forEach(function (px) {
      var o = document.createElement("option");
      o.value = px + "px"; o.textContent = px + "px";
      size.appendChild(o);
    });
    var reset = document.createElement("option");
    reset.value = "reset"; reset.textContent = "기본 크기";
    size.appendChild(reset);
    size.addEventListener("change", function () {
      if (size.value) self.size(size.value);
      size.value = "";
    });
    bar.appendChild(size);

    // Clear
    bar.appendChild(this.button("서식 지우기", "선택한 부분의 서식 지우기", "rich__btn--clear", function () {
      self.exec("removeFormat");
    }));

    wrap.appendChild(bar);
    wrap.appendChild(area);
    textarea.hidden = true;
    textarea.parentNode.insertBefore(wrap, textarea);

    area.addEventListener("focus", function () { active = self; });
    area.addEventListener("input", function () { self.sync(); });
    area.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); self.sync(); }
    });
    // Paste as plain text so formatting from Word / web pages does not leak in.
    area.addEventListener("paste", function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
      self.sync();
    });
  }

  Editor.prototype.button = function (html, title, cls, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rich__btn " + (cls || "");
    b.innerHTML = html;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the text selection
    b.addEventListener("click", onClick);
    return b;
  };

  Editor.prototype.restore = function () {
    this.area.focus();
    if (this.range) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this.range);
    }
    active = this;
  };

  Editor.prototype.hasSelection = function () {
    var sel = window.getSelection();
    return sel.rangeCount && !sel.isCollapsed && this.area.contains(sel.getRangeAt(0).commonAncestorContainer);
  };

  Editor.prototype.exec = function (cmd, arg, css) {
    this.restore();
    document.execCommand("styleWithCSS", false, !!css);
    document.execCommand(cmd, false, arg);
    this.sync();
  };

  Editor.prototype.color = function (c) {
    this.restore();
    if (!this.hasSelection()) return;
    this.exec("foreColor", c, true);
  };

  /* execCommand only knows sizes 1–7, so mark the selection with size 7 and
     swap the markers for spans with the real pixel size. */
  Editor.prototype.size = function (px) {
    this.restore();
    if (!this.hasSelection()) return;
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("fontSize", false, "7");
    var marked = this.area.querySelectorAll('font[size="7"], span[style*="xxx-large"]');
    Array.prototype.forEach.call(marked, function (el) {
      var span = document.createElement("span");
      if (px !== "reset") span.style.fontSize = px;
      if (el.getAttribute("color")) span.style.color = el.getAttribute("color");
      if (el.style && el.style.color) span.style.color = el.style.color;
      while (el.firstChild) span.appendChild(el.firstChild);
      // An inner size would override the new one; drop it.
      Array.prototype.forEach.call(span.querySelectorAll("span"), function (s) { s.style.fontSize = ""; });
      el.parentNode.replaceChild(span, el);
    });
    this.sync();
  };

  Editor.prototype.sync = function () {
    this.textarea.value = toSafeHtml(this.area.innerHTML);
  };

  window.GPlusRich = {
    RICH_KEYS: RICH_KEYS,
    isRichKey: isRichKey,
    toSafeHtml: toSafeHtml,
    plainText: plainText,
    Editor: Editor,
  };
})();
