/*
 * Site content: defaults + the content store shared by every public page and admin.html.
 *
 * Storage backend: Supabase table public.site_content (see js/config.js), one row
 * per key: { key: "heroTitle", value: <JSON> }. Anyone can read it; only accounts
 * in public.site_admins can write (enforced by row-level security on the server).
 *
 * - Public pages: loadCached() returns defaults + the last copy this browser
 *   fetched (so repeat visits render instantly), fetchRemote() gets the current
 *   copy from Supabase and refreshes that cache.
 * - admin.html saves through its signed-in Supabase client (see js/admin.js).
 *
 * Keys missing from the table fall back to DEFAULTS below.
 *
 * List fields (arrays of strings) such as aboutParagraphs are edited paragraph by
 * paragraph in admin.html and rendered with data-bind-list / data-bind="key.N".
 */
(function () {
  var CFG = window.GPLUS_CONFIG || {};
  /* Per-browser copy of the last fetched content (display cache only). */
  var CACHE_KEY = "gplus.site.cache.v1";
  /* Where admin.html used to save edits before Supabase; read once for import. */
  var LEGACY_KEY = "gplus.site.v2";
  var FETCH_TIMEOUT_MS = 6000;

  var DEFAULTS = {
    heroEyebrow: "Drive the World, Link the Future",
    heroTitle: "G+ 당신의 미래를 함께 합니다",
    heroSubtitle: "새로운 기술 연구와 끝없는 탐구로 혁신과 가치를 제시하는 대표적인 전문 기업입니다.",

    aboutHeadline: "고객 가치 극대화를 최우선으로 생각하고 실천하는 (주)지플러스코리아가 되겠습니다.",
    aboutParagraphs: [
      "G+ 본사는 고객에게 고품질 및 고성능 제품을 제공하기 위해 노력하고 있습니다. 타이완, 선전, 동관에 R&D 센터와 생산 기지를 운영하고 있습니다. 현재 제품 라인에는 중공 회전 테이블, 유성 감속기, 하모닉 드라이브, 캠 인덱서, DD모터, XYZ 정렬 스테이지, 모터 구동 스테이지, 가변 피치 슬라이드, 직교로봇, 파츠피더(진동 이송기) 등을 반도체, 레이저, 의료기기, 패널 등 다양한 분야에서 널리 사용되고 있습니다.",
      "(주)지플러스코리아는 창의적인 사고와 독창적인 기술로 신제품 개발에 앞장서고, 최상급의 품질과 서비스 제공을 통해 \"고객가치 극대화\"를 최우선으로 생각하고, 실천하는 G+Korea가 되겠습니다.",
      "오늘의 (주)지플러스코리아가 있기까지 성원해 주신 고객 및 협력업체 임직원께 감사드리며, 앞으로도 변함 없는 관심과 사랑을 부탁 드립니다. 지플러스코리아 전 임직원은 그러한 격려에 보답하기 위해 최선의 노력을 다할 것을 약속 드립니다.",
    ],
    aboutSign: "지플러스코리아 임직원 일동",
    visionText: "G+는 \"비옥한 토양을 가꾸고, 인재를 모으고, 손을 맞잡고 꿈을 나누자\"는 경영 철학을 바탕으로, 직원들의 행복과 사회적 책임을 중요시하며, \"고객에게 새로운 가치를 창출하는 것\"을 변함없는 신념으로 삼고 있습니다.",
    missionText: "G+는 디지털 트랜스포메이션(Digital Transformation)의 혁신적 변화에 발 맞추어, 산업 자동화 핵심 부품 공급을 위한 안정적인 플랫폼 구축에 힘쓰고 있으며, 고객에게 우수한 맞춤 서비스를 제공하는 것을 목표로 하고 있습니다.",
    history1Title: "2002 ~",
    history1Text: "G+ 본사는 제조, 연구개발(R&D), 고객 서비스를 통합 공급하는 다각화된 기업입니다. 동력 전달 분야 혁신기업으로서, 당시의 목표는 사용자에게 신뢰할 수 있고 가성비 높은 솔루션을 제공하여 사용자의 요구를 충족시키는 것입니다.",
    history2Title: "2013",
    history2Text: "G+ 브랜드는 고객에게 고품질, 고성능 제품을 제공하는 데 전념하고 있습니다. 대만, 심천, 동관에 R&D 센터와 생산 기지를 두고 있습니다.",
    history3Title: "2024",
    history3Text: "(주)지플러스코리아 G+Korea 법인 설립. \"사람 중심, 고객 우선, 정직한 서비스 기준 확립, 세심한 작업 방법 적용\"을 원칙으로 운영합니다.",
    /* NEWS rows on about.html, shown in this order. link is optional. */
    news: [
      { title: "G+ 2025 전시회 일정", date: "2025-01-21", link: "" },
    ],

    productsTitle: "할로우 로터리 · 정밀 유성감속기",
    productsDescription: "설치 환경과 동력전달 방식에 맞춰 선택할 수 있는 전체 라인업입니다.",
    contactTitle: "제품 선정 및 기술 문의",
    contactSubtitle: "아래 연락처로 문의해 주시면 담당자가 안내해 드립니다.",
    phone: "070-7776-5655",
    email: "gplus@gpluskorea.kr",
  };

  function readJson(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* cache is optional */ }
  }

  /* Earlier versions stored the intro as three fixed fields (aboutPara1..3). */
  function migrate(stored) {
    if (!stored || Array.isArray(stored.aboutParagraphs)) return stored;
    if (!("aboutPara1" in stored || "aboutPara2" in stored || "aboutPara3" in stored)) return stored;
    var legacy = [1, 2, 3].map(function (n, i) {
      var key = "aboutPara" + n;
      return key in stored ? stored[key] : DEFAULTS.aboutParagraphs[i];
    });
    var next = Object.assign({}, stored, { aboutParagraphs: legacy });
    delete next.aboutPara1; delete next.aboutPara2; delete next.aboutPara3;
    return next;
  }

  /* Keeps only known keys whose value has the same shape as the default. */
  function pickKnown(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      if (!(k in DEFAULTS)) return;
      var v = obj[k];
      if (Array.isArray(DEFAULTS[k]) ? Array.isArray(v) : typeof v === "string") out[k] = v;
    });
    return out;
  }

  /** Defaults with `values` merged over them; lists are copied. */
  function merge(values) {
    var merged = Object.assign({}, DEFAULTS, pickKnown(values));
    merged.aboutParagraphs = (merged.aboutParagraphs || []).slice();
    merged.news = (merged.news || []).map(function (n) { return Object.assign({}, n); });
    return merged;
  }

  /** Rows [{key, value}] → { key: value }. */
  function rowsToObject(rows) {
    var out = {};
    (rows || []).forEach(function (r) { out[r.key] = r.value; });
    return out;
  }

  /** Last content this browser fetched (or null if never fetched). */
  function readCache() {
    return readJson(CACHE_KEY);
  }

  function writeCache(values) {
    writeJson(CACHE_KEY, pickKnown(values));
  }

  /** Defaults + cached values, synchronously (for an instant first render). */
  function loadCached() {
    return merge(readCache());
  }

  /** Fetches the current content from Supabase. Resolves to the merged object. */
  function fetchRemote() {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) return Promise.reject(new Error("Supabase 설정이 없습니다."));
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS) : null;
    var url = CFG.supabaseUrl + "/rest/v1/" + (CFG.table || "site_content") + "?select=key,value";
    return fetch(url, {
      headers: { apikey: CFG.supabaseKey, Accept: "application/json" },
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error("문구를 불러오지 못했습니다 (" + res.status + ").");
      return res.json();
    }).then(function (rows) {
      var values = rowsToObject(rows);
      writeCache(values);
      return merge(values);
    });
  }

  /** Edits saved by the old localStorage-only admin page, if any. */
  function readLegacy() {
    var stored = migrate(readJson(LEGACY_KEY));
    var known = pickKnown(stored);
    return Object.keys(known).length ? known : null;
  }

  function clearLegacy() {
    try { window.localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
  }

  window.GPlusContent = {
    CACHE_KEY: CACHE_KEY,
    DEFAULTS: DEFAULTS,
    merge: merge,
    pickKnown: pickKnown,
    rowsToObject: rowsToObject,
    readCache: readCache,
    writeCache: writeCache,
    loadCached: loadCached,
    fetchRemote: fetchRemote,
    readLegacy: readLegacy,
    clearLegacy: clearLegacy,
  };
})();
