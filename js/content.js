/*
 * Site content: defaults + a tiny content store shared by every public page and admin.html.
 *
 * Storage backend: browser localStorage (key "gplus.site.v2"). Edits made in
 * admin.html are visible on the site in the same browser only. To publish
 * edits for every visitor, replace loadContent()/saveFields() with calls to a
 * real backend (e.g. a JSON API or Supabase table) — nothing else needs to change.
 *
 * List fields (arrays of strings) such as aboutParagraphs are edited paragraph by
 * paragraph in admin.html and rendered with data-bind-list / data-bind="key.N".
 */
(function () {
  var STORAGE_KEY = "gplus.site.v2";

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

    productsTitle: "할로우 로터리 · 정밀 유성감속기",
    productsDescription: "설치 환경과 동력전달 방식에 맞춰 선택할 수 있는 전체 라인업입니다.",
    contactTitle: "제품 선정 및 기술 문의",
    contactSubtitle: "아래 연락처로 문의해 주시면 담당자가 안내해 드립니다.",
    phone: "070-7776-5655",
    email: "gplus@gpluskorea.kr",
  };

  function readRaw() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
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

  /** Returns the full content object, stored values merged over defaults. */
  function loadContent() {
    var merged = Object.assign({}, DEFAULTS, migrate(readRaw()) || {});
    merged.aboutParagraphs = (merged.aboutParagraphs || []).slice();
    return merged;
  }

  /** Saves a partial update ({ key: value, ... }). Throws on failure. */
  function saveFields(patch) {
    var next = Object.assign({}, migrate(readRaw()) || {}, patch);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      throw new Error("저장에 실패했습니다.");
    }
  }

  window.GPlusContent = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULTS: DEFAULTS,
    loadContent: loadContent,
    saveFields: saveFields,
  };
})();
