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

  document.querySelectorAll("[data-section]").forEach(function (panel) {
    var fields = panel.querySelectorAll("[data-field]");
    fields.forEach(function (input) {
      input.value = content[input.getAttribute("data-field")] || "";
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
      try {
        C.saveFields(patch);
        Object.assign(content, patch);
        flash(savedEl, errorEl, null);
      } catch (e) {
        flash(savedEl, errorEl, e);
      }
    });
  });
})();
