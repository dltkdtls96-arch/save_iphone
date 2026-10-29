// src/overrideEngine.js
//
// "일일 근무 변경(override)" 을 row 에 적용하는 공통 로직.
// 홈 캘린더 / 전체 교번 / 행로 / 그룹(비교) 탭이 모두 이 함수 하나를 쓴다.
// (이전에는 App 과 CompareWeeklyBoard 에 서로 다른 복사본이 있어서
//  "16d"(소문자), "비", 다른 소속 템플릿 등에서 결과가 달랐음)

const EMPTY = () => ({ in: "", out: "" });

// rows(peopleRows 형식) → { dia: {번호: tpl}, label: {"대1"|"휴3"|"32~"|...: tpl} }
export function buildTemplates(rows) {
  const dia = {};
  const label = {};
  (rows || []).forEach((r) => {
    if (!r) return;
    const tpl = {
      weekday: { ...(r.weekday || EMPTY()) },
      saturday: { ...(r.saturday || EMPTY()) },
      holiday: { ...(r.holiday || EMPTY()) },
      weekdayNext: { ...(r.weekdayNext || EMPTY()) },
      saturdayNext: { ...(r.saturdayNext || EMPTY()) },
      holidayNext: { ...(r.holidayNext || EMPTY()) },
    };
    const d = r.dia;
    if (typeof d === "number" && Number.isFinite(d)) {
      if (!dia[d]) dia[d] = tpl;
    } else if (typeof d === "string" && d.trim()) {
      const key = d.replace(/\s+/g, "");
      if (!label[key]) label[key] = tpl;
    }
  });
  return { dia, label };
}

// 출퇴근이 없는 근무 (템플릿이 없으면 시간 비움)
const NO_TIME_LABELS = new Set(["휴", "비번", "교육", "휴가"]);

export function applyOverride(row, vRaw, templates) {
  if (vRaw == null || vRaw === "") return row;
  const t = templates || { dia: {}, label: {} };
  const v = String(vRaw).replace(/\s+/g, "");
  const patched = { ...(row || {}) };

  const applyTemplate = (tpl) => {
    if (!tpl) return false;
    patched.weekday = { ...tpl.weekday };
    patched.saturday = { ...tpl.saturday };
    patched.holiday = { ...tpl.holiday };
    patched.weekdayNext = { ...(tpl.weekdayNext || EMPTY()) };
    patched.saturdayNext = { ...(tpl.saturdayNext || EMPTY()) };
    patched.holidayNext = { ...(tpl.holidayNext || EMPTY()) };
    return true;
  };
  const clearTimes = () => {
    patched.weekday = EMPTY();
    patched.saturday = EMPTY();
    patched.holiday = EMPTY();
    patched.weekdayNext = EMPTY();
    patched.saturdayNext = EMPTY();
    patched.holidayNext = EMPTY();
  };

  // 1) 출퇴근 없는 라벨: 휴 / 비번(비) / 교육 / 휴가
  if (v === "비" || NO_TIME_LABELS.has(v)) {
    const key = v === "비" ? "비번" : v;
    patched.dia = key;
    if (!applyTemplate(t.label[key])) clearTimes();
    return patched;
  }

  // 2) 숫자 교번: "16", "16d", "16D"
  const m = v.match(/^(\d+)[dD]?$/);
  if (m) {
    const n = Number(m[1]);
    patched.dia = n;
    if (!applyTemplate(t.dia[n])) clearTimes();
    return patched;
  }

  // 3) 대N / 대기N / 주 / 야 / 휴N / N~ / 대N~ 등 — 데이터에 있는 라벨
  //    "대N" 은 라벨 템플릿이 없으면 같은 번호의 숫자 교번으로 폴백 (구 동작 유지)
  patched.dia = v;
  if (applyTemplate(t.label[v])) return patched;
  const dae = v.match(/^대(\d+)$/);
  if (dae && applyTemplate(t.dia[Number(dae[1])])) return patched;

  // 알 수 없는 라벨: ~ 로 끝나거나 휴로 시작하면 쉬는 날, 그 외는 시간 비움
  clearTimes();
  return patched;
}
