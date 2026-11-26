/* Renders editable content (from GPlusContent) into the public pages. */
(function () {
  var C = window.GPlusContent;

  /* "key" → content.key ; "key.N" → N-th item of a list field. */
  function lookup(content, path) {
    var parts = path.split(".");
    var value = content[parts[0]];
    if (parts.length > 1) value = Array.isArray(value) ? value[Number(parts[1])] : undefined;
    return value;
  }

  function render() {
    var content = C.loadContent();

    document.querySelectorAll("[data-bind]").forEach(function (node) {
      var value = lookup(content, node.getAttribute("data-bind"));
      node.textContent = value == null ? "" : value;
      if (node.hasAttribute("data-hide-empty")) node.hidden = !value;
    });

    // <div data-bind-list="key"> → one <p> per non-empty paragraph.
    document.querySelectorAll("[data-bind-list]").forEach(function (box) {
      var items = content[box.getAttribute("data-bind-list")] || [];
      box.textContent = "";
      items.forEach(function (text) {
        if (!text || !text.trim()) return;
        var p = document.createElement("p");
        p.textContent = text;
        box.appendChild(p);
      });
    });

    document.querySelectorAll("[data-mailto]").forEach(function (a) {
      a.href = "mailto:" + content.email;
    });
  }

  render();

  // Re-render when the admin page (open in another tab) saves changes.
  window.addEventListener("storage", function (e) {
    if (e.key === C.STORAGE_KEY) render();
  });
})();
