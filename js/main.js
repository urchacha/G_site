/* Renders editable content (from GPlusContent) into the public pages. */
(function () {
  var C = window.GPlusContent;

  function render() {
    var content = C.loadContent();

    document.querySelectorAll("[data-bind]").forEach(function (node) {
      var value = content[node.getAttribute("data-bind")];
      node.textContent = value == null ? "" : value;
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
