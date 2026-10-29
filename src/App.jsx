// /src/App.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabaseClient";

/* =========================
 *  교번 유틸
 * ========================= */

/**
 * TSV 파싱
 * 행 순서(순번)가 고정이고, 사람(이름)이 매일 다음 행으로 순환하는 구조.
 * 반환: [{seq, name, dia, weekday, saturday, holiday, phone}, ...]
 * 인덱스 0 = 순번1 행
 */
function parsePeopleTable(text) {
  if (!text || !text.trim()) return [];
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(delim).map((s) => s.trim());
  const idx = (k) =>
    header.findIndex((h) => h.replace(/\s/g, "") === k.replace(/\s/g, ""));

  const iSeq = idx("순번");
  const iName = idx("이름");
  const iDia = idx("dia");
  const iWdIn = idx("평일출근");
  const iWdOut = idx("평일퇴근");
  const iSaIn = idx("토요일출근");
  const iSaOut = idx("토요일퇴근");
  const iHoIn = idx("휴일출근");
  const iHoOut = idx("휴일퇴근");
  const iPhone =
    [idx("전화번호"), idx("전화"), idx("휴대폰")].find((i) => i >= 0) ?? -1;

  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(delim);
    const name = (cols[iName] || "").trim();
    if (!name) continue;
    const diaRaw = (cols[iDia] || "").trim();
    rows.push({
      seq: (cols[iSeq] || "").trim(),
      name,
      dia: diaRaw, // 문자열 그대로 보존 ("4", "32~", "휴1", "대6" 등)
      phone: iPhone >= 0 ? (cols[iPhone] || "").trim() : "",
      weekday: {
        in: (cols[iWdIn] || "").trim(),
        out: (cols[iWdOut] || "").trim(),
      },
      saturday: {
        in: (cols[iSaIn] || "").trim(),
        out: (cols[iSaOut] || "").trim(),
      },
      holiday: {
        in: (cols[iHoIn] || "").trim(),
        out: (cols[iHoOut] || "").trim(),
      },
    });
  }
  return rows;
}

// 날짜 차이(일수): a - b
function diffDaysShift(a, b) {
  const s = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((s(a) - s(b)) / 86400000);
}

// 음수 안전 모듈러
function modShift(n, m) {
  return ((n % m) + m) % m;
}

/**
 * 특정 날짜에 특정 이름이 속하는 행(row)을 반환
 *
 * 원리:
 *   기준일(anchorDate)에 rows 배열 순서 그대로 이름이 배치됨.
 *   N일 후에는 모든 사람이 N칸씩 아래로 내려감 (마지막→처음 순환).
 *   즉, 기준일에 i번 인덱스였던 사람은 N일 후 (i+N)%total 인덱스 행에 위치.
 *   반대로, 특정 사람의 기준일 인덱스 = baseIdx,
 *   targetDate의 인덱스 = (baseIdx + diff) % total → 그 행의 dia/출퇴근 사용.
 */
function getRowForPersonOnDate(personName, targetDateStr, rows, anchorDateStr) {
  if (!rows?.length || !personName || !anchorDateStr) return null;
  const baseIdx = rows.findIndex((r) => r.name === personName);
  if (baseIdx < 0) return null;

  const anchor = new Date(anchorDateStr + "T00:00:00");
  const [ty, tm, td] = targetDateStr.split("-").map(Number);
  const target = new Date(ty, tm - 1, td);
  const diff = diffDaysShift(target, anchor);

  const rowIdx = modShift(baseIdx + diff, rows.length);
  return rows[rowIdx];
}

/**
 * dia 문자열에서 표시용 라벨과 색상 반환
 * "4" → { label: "4D", color: blue }
 * "32~" → { label: "32D~", color: gray }  (이어받기)
 * "휴1" → { label: "휴1", color: lightgray }
 * "대6" → { label: "대6", color: orange }
 * 야간(숫자 >= nightStartDia) → purple
 */
function getDiaBadge(diaStr, nightStartDia = 25) {
  if (!diaStr) return null;
  const s = String(diaStr).trim();

  if (s.startsWith("휴")) return { label: s, color: "#9ca3af" };
  if (s.startsWith("대")) return { label: s, color: "#f59e0b" };

  // "32~" 같은 이어받기
  const isContinued = s.endsWith("~");
  const numStr = s.replace("~", "");
  const num = parseInt(numStr, 10);

  if (!isNaN(num)) {
    const isNight = num >= nightStartDia;
    const color = isContinued ? "#9ca3af" : isNight ? "#7c3aed" : "#2563eb";
    return { label: s + (isContinued ? "" : "D"), color };
  }

  return { label: s, color: "#6b7280" };
}


function useMediaQuery(query) {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () =>
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
  }, [query]);
  return match;
}

/* =========================
 *  글자 크기 조절 (화면 전체를 같은 비율로 확대·축소)
 * ========================= */
const UI_SIZES = [
  { z: 0.9, label: "작게", fs: 12 },
  { z: 1, label: "보통", fs: 14 },
  { z: 1.15, label: "크게", fs: 17 },
  { z: 1.3, label: "아주 크게", fs: 20 },
];

export function applyUiZoom(z) {
  const v = UI_SIZES.some((s) => s.z === z) ? z : 1;
  const el = document.documentElement;
  el.style.setProperty("--ui-zoom-pref", String(v));
  el.dataset.zoom = v >= 1.3 ? "xl" : v >= 1.15 ? "l" : v < 1 ? "s" : "m";
  return v;
}

function UiSizeButton() {
  const [open, setOpen] = useState(false);
  const [z, setZ] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem("ui-zoom") || "1") || 1;
      return UI_SIZES.some((x) => x.z === v) ? v : 1; // 목록에 없는 값이면 '보통'
    } catch {
      return 1;
    }
  });
  const pick = (v) => {
    setZ(applyUiZoom(v));
    try {
      localStorage.setItem("ui-zoom", String(v));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  return (
    <span className="ui-size-wrap">
      <button
        type="button"
        className="header-refresh-btn ui-size-btn"
        aria-label="글자 크기"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        가가
      </button>
      {open && (
        <>
          <div className="ui-size-backdrop" onClick={() => setOpen(false)} />
          <div className="ui-size-pop" role="group" aria-label="글자 크기 선택">
            {UI_SIZES.map((s) => (
              <button
                key={s.z}
                type="button"
                aria-pressed={z === s.z}
                onClick={() => pick(s.z)}
              >
                <span style={{ fontSize: s.fs, fontWeight: 800 }}>가</span>
                <span className="ui-size-label">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

import CalendarView from "./components/CalendarView.jsx";
import DayLedgerModal from "./components/DayLedgerModal.jsx";
import LoginView from "./LoginView.jsx";
import LogsPanel from "./components/LogsPanel.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import MyLedgerPanel from "./components/MyLedgerPanel.jsx";
import HyuPanel from "./components/HyuPanel.jsx";
const GOOGLE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/19atNwq8WOAV-EsR5KHgfYnKkIrVp28TqIFPo7Qj0-18/edit?usp=sharing";

const STORAGE_KEY_USER = "vac-ledger-current-user";

/* =========================
 *  날짜/시간 유틸 (한국 로컬 기준)
 * ========================= */

// Date → "YYYY-MM-DD"
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DD" → 요일 타입 (weekday/saturday/holiday)
function getDayTypeFromDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  if (dow === 0) return "holiday";
  if (dow === 6) return "saturday";
  return "weekday";
}

// "YYYY-MM-DD" + delta일
function addDaysToIso(isoDate, delta) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return formatDateKey(dt);
}

// 00:00으로 잘라서 순수 날짜만
function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// 휴가일(iso) - 오늘(iso) 일차 계산 (오늘 기준 며칠 뒤인지)
// 오늘보다 예전이면 음수, 오늘이면 0, 내일이면 1 ...
function getDiffInDaysFromToday(isoDate) {
  if (!isoDate) return 0;
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = stripTime(new Date());
  const diffMs = target.getTime() - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/* =========================
 *  ✅ 1000개 제한 대응: 기간조회/페이지네이션 유틸
 * ========================= */

const VAC_PAGE_SIZE = 1000;

// 시간 파싱 헬퍼
function getTime(x) {
  if (!x) return 0;
  const t = new Date(x).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// 날짜별 entries 정규화(중복 제거 + 정렬 + DB seq_no 존중)
function normalizeEntriesByDate(byDate) {
  const next = {};
  Object.entries(byDate || {}).forEach(([dateKey, list]) => {
    // id 기준 중복 제거
    const seen = new Set();
    const unique = [];
    (list || []).forEach((e) => {
      if (!e?.id) {
        unique.push(e);
        return;
      }
      if (!seen.has(e.id)) {
        seen.add(e.id);
        unique.push(e);
      }
    });

    // ✅ "DB에 저장된 seq_no"를 최대한 존중하면서 정렬만 함
    //   - 받는 순서와 상관없이 항상 같은 결과가 나오게 (정렬 기준이 꼬이지 않게)
    //   - 순번 있는 활성 휴가: seq 순서 그대로
    //   - 순번 없는 것(옛 데이터·취소된 것): 신청 시각 순
    //   - 두 묶음은 신청 시각 기준으로 합침 (각 묶음 안의 순서는 절대 안 바뀜)
    const seqOf = (e) => {
      const v = typeof e.seqNo === "number" ? e.seqNo : Number(e.seqNo ?? NaN);
      return Number.isFinite(v) && v > 0 && e.status !== "cancelled" ? v : null;
    };
    const byTimeThenId = (a, b) => {
      const ta = getTime(a.createdAt);
      const tb = getTime(b.createdAt);
      if (ta !== tb) return ta - tb;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    };
    const orderGroup = (list) => {
      const withSeq = list
        .filter((e) => seqOf(e) != null)
        .sort((a, b) => seqOf(a) - seqOf(b) || byTimeThenId(a, b));
      const noSeq = list.filter((e) => seqOf(e) == null).sort(byTimeThenId);
      const out = [];
      let i = 0;
      let j = 0;
      while (i < withSeq.length && j < noSeq.length) {
        if (byTimeThenId(noSeq[j], withSeq[i]) < 0) out.push(noSeq[j++]);
        else out.push(withSeq[i++]);
      }
      while (i < withSeq.length) out.push(withSeq[i++]);
      while (j < noSeq.length) out.push(noSeq[j++]);
      return out;
    };
    // 정원 제외 먼저, 그다음 나머지
    const ordered = [
      ...orderGroup(unique.filter((e) => !!e.excludeFromCount)),
      ...orderGroup(unique.filter((e) => !e.excludeFromCount)),
    ];
    unique.length = 0;
    unique.push(...ordered);

    next[dateKey] = unique;
  });
  return next;
}

// prev(기존) + incoming(새로 받은) 를 날짜별로 merge 후 normalize
function mergeEntriesByDate(prev, incoming) {
  const merged = { ...(prev || {}) };
  Object.entries(incoming || {}).forEach(([dateKey, list]) => {
    const prevList = merged[dateKey] || [];
    // ✅ 같은 id면 새로 받은(서버 최신) 쪽이 남도록 incoming을 앞에 둠
    merged[dateKey] = [...(list || []), ...prevList];
  });
  return normalizeEntriesByDate(merged);
}

// baseDate 기준 "캘린더에 보이는 범위" (월±버퍼) 계산
function getCalendarRangeForMonth(baseDate, bufferDays = 7) {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();

  const start = new Date(y, m, 1);
  start.setDate(start.getDate() - bufferDays);

  const end = new Date(y, m + 1, 0);
  end.setDate(end.getDate() + bufferDays);

  return { startIso: formatDateKey(start), endIso: formatDateKey(end) };
}

/* =========================
 *  기본 설정들
 * ========================= */

// 휴가 종류 기본값
const DEFAULT_LEAVE_TYPES = [
  { id: "annual", label: "연차", onlyDay: false, excludeFromCount: false },
  {
    id: "quarter",
    label: "분기지정휴무",
    onlyDay: false,
    excludeFromCount: false,
  },

  // 주간 전용
  {
    id: "yearlyFixed",
    label: "연간지정휴무",
    onlyDay: true,
    excludeFromCount: false,
  },
  {
    id: "rotaFixed",
    label: "지정교번휴무",
    onlyDay: true,
    excludeFromCount: false,
  },

  {
    id: "longService",
    label: "장기재직휴가",
    onlyDay: false,
    excludeFromCount: false,
  },
  { id: "official", label: "공가", onlyDay: false, excludeFromCount: false },
  {
    id: "training",
    label: "보수교육",
    onlyDay: false,
    excludeFromCount: false,
  },
  {
    id: "petition",
    label: "청원휴가",
    onlyDay: false,
    excludeFromCount: false,
  },
  { id: "sick", label: "병가", onlyDay: false, excludeFromCount: false },
];

// diaCount=37, nightStartDia=25 → 25D~37D 야간
const DEFAULT_NIGHT_RULE = {
  diaCount: 37,
  nightStartDia: 25,
};

// 휴가 수정/취소 제한 기본값
const DEFAULT_LOCK_RULE = {
  lockDaysBefore: 0, // 0이면 제한 없음
};

// ledger_users 비어 있을 때 fallback
const DEFAULT_USERS = [
  {
    id: "admin",
    name: "관리자",
    role: "admin",
    password: "0000",
    mustChangePassword: true,
  },
  {
    id: "u1",
    name: "홍길동",
    role: "user",
    password: "1234",
    mustChangePassword: true,
  },
  {
    id: "u2",
    name: "김철수",
    role: "user",
    password: "5678",
    mustChangePassword: true,
  },
];

/* =========================
 *  순번 재배열
 * =========================
 * - cancelled → seqNo=null, 맨 뒤
 * - active && excludeFromCount → 정원외 그룹 (seqNo=null, 앞쪽)
 * - 나머지 active → 1,2,3,... 순번
 */
function resequence(list) {
  const excluded = [];
  const active = [];
  const cancelled = [];

  list.forEach((e) => {
    if (e.status === "cancelled") {
      cancelled.push(e);
    } else if (e.excludeFromCount) {
      excluded.push({ ...e, seqNo: null });
    } else {
      active.push(e);
    }
  });

  const newActive = active.map((e, idx) => ({
    ...e,
    seqNo: idx + 1,
  }));

  const newCancelled = cancelled.map((e) => ({
    ...e,
    seqNo: null,
  }));

  return [...excluded, ...newActive, ...newCancelled];
}

/* =========================
 *  vac_entries <-> 프론트 매핑
 * ========================= */

function mapVacRowToEntry(row) {
  if (!row) return null;
  const dateKey = row.date; // 'YYYY-MM-DD'

  let diaParsed = null;
  if (row.dia != null) {
    const s = String(row.dia);
    if (/^\d+$/.test(s)) diaParsed = Number(s);
    else diaParsed = s; // "비번", "25비번" 등
  }

  // 🔧 호환성 처리: 옛날 데이터에서 seq_no = 0 을 "정원외" 의미로 사용했을 가능성
  const isSeqZero = row.seq_no === 0 || row.seq_no === "0";

  return {
    id: row.id,
    date: dateKey,
    seqNo: isSeqZero ? null : row.seq_no ?? null, // 0은 내부적으로 null 취급
    leaveType: row.leave_type,
    applicantId: row.applicant_id || row.applicant_name || "unknown",
    applicantName: row.applicant_name,
    reason: row.reason || "",
    dia: diaParsed,
    note: row.note || "",
    approverName: row.approver_name || "",
    approverAt: row.approver_at || null,

    status: row.status || "active",
    excludeFromCount: isSeqZero ? true : !!row.exclude_from_count,
    createdAt: row.created_at,
    // 작성자: 새 칸(created_by_name) → 없으면 처음 만든 기록에서 추정
    createdByName:
      row.created_by_name ||
      ((row.last_action_type || "created") === "created"
        ? row.last_action_by_name || null
        : null),
    lastActionType: row.last_action_type || "created",
    lastActionAt: row.last_action_at,
    lastActionByName: row.last_action_by_name || row.applicant_name,
  };
}

// App entry → vac_entries upsert용 row
function entryToRow(entry) {
  return {
    id: entry.id,
    date: entry.date,
    applicant_id: entry.applicantId || null,
    applicant_name: entry.applicantName,
    leave_type: entry.leaveType,
    reason: entry.reason,
    dia:
      entry.dia == null
        ? null
        : typeof entry.dia === "number"
        ? String(entry.dia)
        : String(entry.dia),
    note: entry.note,
    approver_name: entry.approverName || null,
    approver_at: entry.approverAt || null,

    status: entry.status,
    exclude_from_count: !!entry.excludeFromCount,
    seq_no: entry.seqNo ?? null,
    last_action_type: entry.lastActionType,
    last_action_at: entry.lastActionAt,
    last_action_by_name: entry.lastActionByName,
  };
}

// vac_entries upsert (한 건)
async function upsertVacEntryOnSupabase(entry) {
  const payload = entryToRow(entry);
  if (entry.createdByName) payload.created_by_name = entry.createdByName;
  // 화면에 확인자 정보가 없으면 DB의 확인자 값을 건드리지 않는다.
  // (다른 관리자가 이미 확인한 건을, 오래된 화면에서 수정 저장하며 '미확인'으로 덮어쓰는 것을 방지.
  //  확인 취소는 별도 부분 업데이트로만 한다.)
  if (!entry.approverName) {
    delete payload.approver_name;
    delete payload.approver_at;
  }

  let { data, error } = await supabase
    .from("vac_entries")
    .upsert(payload)
    .select("*")
    .single();

  // 작성자 칸(SQL)을 아직 안 만들었으면 그 칸 없이 다시 저장
  if (error && payload.created_by_name && /created_by_name/.test(error.message || "")) {
    delete payload.created_by_name;
    ({ data, error } = await supabase
      .from("vac_entries")
      .upsert(payload)
      .select("*")
      .single());
  }

  if (error) {
    throw error;
  }
  return mapVacRowToEntry(data);
}

// vac_entries 부분 업데이트 (취소 / 확인자 토글 등)
async function updateVacEntryFieldsOnSupabase(id, patch) {
  const { data, error } = await supabase
    .from("vac_entries")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return mapVacRowToEntry(data);
}

/* =========================
 *  하루 요약 (정원/사용인원 계산)
 * ========================= */
function buildDaySummaryForDate(
  dateKey,
  entriesByDate,
  slotConfig,
  slotOverridesByDate,
  publicHolidaySet,
  plusOneOverridesByDate // ✅ 추가: 날짜별 "공휴일/일요일 다음날 비번+1" 예외 설정
) {
  if (!dateKey) return null;

  const list = entriesByDate?.[dateKey] || [];
  const active = list.filter((e) => e.status === "active");
  const counted = active.filter((e) => !e.excludeFromCount);

  const dayType = getDayTypeFromDateStr(dateKey);
  const isPublicHoliday =
    publicHolidaySet && publicHolidaySet.has(dateKey) ? true : false;

  let baseSlots;
  if (isPublicHoliday && slotConfig?.publicHoliday != null) {
    baseSlots = slotConfig.publicHoliday;
  } else if (dayType === "weekday") {
    baseSlots = slotConfig.weekday;
  } else if (dayType === "saturday") {
    baseSlots = slotConfig.saturday;
  } else {
    baseSlots = slotConfig.holiday;
  }

  const overrideBase = slotOverridesByDate?.[dateKey];
  if (typeof overrideBase === "number" && overrideBase > 0) {
    baseSlots = overrideBase;
  }

  // 비번: "비번" 또는 "~비번" 으로 끝나는 dia
  const offCount = counted.filter((e) => {
    if (typeof e.dia !== "string") return false;
    const s = e.dia;
    return s === "비번" || s.includes("비번");
  }).length;

  const hasOff = offCount > 0;

  const [yy, mm, dd] = dateKey.split("-").map(Number);
  const dow = new Date(yy, mm - 1, dd).getDay();

  const prevDateKey = addDaysToIso(dateKey, -1);
  const [py, pm, pd] = prevDateKey.split("-").map(Number);
  const prevDow = new Date(py, pm - 1, pd).getDay();
  const isPrevSunday = prevDow === 0;
  const isPrevPublicHoliday =
    publicHolidaySet && publicHolidaySet.has(prevDateKey);

  const blockPlusOneDefault = isPrevSunday || isPrevPublicHoliday;

  // ✅ 관리자가 이 날짜에 대해 명시적으로 override 해뒀으면 그걸 우선 적용
  //    override === true  → 무조건 +1 허용 (기본 차단을 무시)
  //    override === false → 무조건 +1 차단
  //    override 없음      → 기존 기본 로직 그대로 사용
  const plusOneOverride = plusOneOverridesByDate?.[dateKey];
  const blockPlusOne =
    typeof plusOneOverride === "boolean"
      ? !plusOneOverride
      : blockPlusOneDefault;

  const capacity = baseSlots + (hasOff && !blockPlusOne ? 1 : 0);

  const usedCount = counted.length;

  return {
    dayType,
    isPublicHoliday,
    baseSlots,
    hasOff,
    offCount,
    usedCount,
    capacity,
    blockPlusOneDefault, // ✅ 모달에서 "이 날짜는 원래 막히는 날짜인지" 판단용
    plusOneOverride: typeof plusOneOverride === "boolean" ? plusOneOverride : null,
  };
}

/* =========================
 *  genId (uuid)
 * ========================= */
function genId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += ((Math.random() * 4) | 8).toString(16);
    } else {
      uuid += ((Math.random() * 16) | 0).toString(16);
    }
  }
  return uuid;
}

/* =========================
 *  로그 매핑 + Supabase insert
 * ========================= */
function mapLogRowToLog(row) {
  return {
    id: row.id,
    ts: row.ts,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    targetDate: row.target_date,
    leaveType: row.leave_type,
    applicantName: row.applicant_name,
  };
}

async function insertLogToSupabase(logInput) {
  const payload = {
    id: logInput.id || genId(),
    ts: logInput.ts || new Date().toISOString(),
    action: logInput.action,
    actor_id: logInput.actorId,
    actor_name: logInput.actorName,
    target_date: logInput.targetDate,
    leave_type: logInput.leaveType,
    applicant_name: logInput.applicantName,
  };

  const { data, error } = await supabase
    .from("vac_logs")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return mapLogRowToLog(data);
}

/* =========================
 *  교번 iframe (안의 화면만 비율 축소)
 *
 *  창(박스) 크기는 그대로 두고, iframe 안에 보이는 교번 앱 화면만 작게 보이게.
 *  방법: iframe 자체 크기를 (1/scale) 배 크게 잡고 transform: scale 로 다시 줄임.
 *  → 시각적으로는 컨테이너와 동일한 박스, 안의 내용은 scale 비율로 축소.
 *
 *  ⚙️ 조정 가능한 값:
 *    GYOBEON_SCALE        : 안에 보이는 교번 앱 축소 비율 (0.85 = 85%)
 *    GYOBEON_HEIGHT_OFFSET: 컨테이너가 화면 높이에서 빼는 픽셀 (값이 클수록 iframe 이 위로 올라가고 아래에 여유)
 *    GYOBEON_MARGIN_TOP   : 위쪽 여백 (- 값을 주면 더 위로 올라감)
 * ========================= */
const GYOBEON_SCALE = 0.87;
const GYOBEON_HEIGHT_OFFSET = 150; // 기존 120 → 200 으로 늘려서 하단 여유 확보
const GYOBEON_MARGIN_TOP = 0;

function GyobeonFrame() {
  const inv = 100 / GYOBEON_SCALE; // 0.85 → 약 117.6%

  return (
    <div
      className="gyobeon-frame"
      style={{
        width: "100%",
        height: `calc(100vh - ${GYOBEON_HEIGHT_OFFSET}px)`,
        marginTop: GYOBEON_MARGIN_TOP,
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
      <iframe
        src="/gyobeon/"
        title="교번 앱"
        style={{
          width: `${inv}%`,
          height: `${inv}%`,
          border: "none",
          transform: `scale(${GYOBEON_SCALE})`,
          transformOrigin: "0 0",
          display: "block",
        }}
      />
    </div>
  );
}

/* =========================
 *  메인 App
 * ========================= */

export default function App() {
  /* ========= 상태 ========= */

  const [userList, setUserList] = useState([]);
  // 서버에서 사용자 목록을 실제로 받았는지 (계정 변경 확인용)
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES);

  const [slotConfig, setSlotConfig] = useState({
    weekday: 5,
    saturday: 7,
    holiday: 8,
    publicHoliday: 8,
  });

  const [slotOverridesByDate, setSlotOverridesByDate] = useState({});
  const [plusOneOverridesByDate, setPlusOneOverridesByDate] = useState({}); // ✅ 추가
  const [nightRule, setNightRule] = useState(DEFAULT_NIGHT_RULE);
  const [lockRule, setLockRule] = useState(DEFAULT_LOCK_RULE);
  const [publicHolidays, setPublicHolidays] = useState([]);

  const [currentUser, setCurrentUser] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_USER);
      if (!raw) return null;
      // eslint-disable-next-line no-unused-vars
      const { password: _pw, ...u } = JSON.parse(raw) || {};
      if (_pw !== undefined) {
        try {
          window.localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(u));
        } catch {
          /* ignore */
        }
      }
      return u.id ? u : null;
    } catch {
      return null;
    }
  });

  const [baseDate, setBaseDate] = useState(() => stripTime(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    stripTime(new Date())
  );

  // ✅ 캘린더/관리자/모달에서 쓰는 "캐시" 데이터(필요한 달 범위만 누적)
  const [entriesByDate, setEntriesByDate] = useState({});

  // ✅ 내 휴가 탭 전용 데이터(내 것만 전부 가져오기)
  const [myEntriesByDate, setMyEntriesByDate] = useState({});
  const [isMyLoading, setIsMyLoading] = useState(false);

  const [adminNotesByDate, setAdminNotesByDate] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const currentDateKey = selectedDate ? formatDateKey(selectedDate) : null;

  const [logs, setLogs] = useState([]);

  const LOG_PAGE_SIZE = 300;
  const [logsPage, setLogsPage] = useState(0);
  const [logsHasMore, setLogsHasMore] = useState(true);
  const [isLogsLoadingMore, setIsLogsLoadingMore] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "gyobeon";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_USER);
      if (!raw) return "gyobeon";
      const u = JSON.parse(raw);
      return u?.role === "admin" ? "logs" : "gyobeon";
    } catch {
      return "gyobeon";
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  // 휴충당 탭에 "다시 불러와" 신호 (새로고침/화면복귀 때 증가)
  const [hyuRefreshTick, setHyuRefreshTick] = useState(0);

  // 교번 설정
  const [shiftConfig, setShiftConfig] = useState({
    tsvTable: "",
    diaCount: 37,
    nightStartDia: 25,
    anchorDate: "2025-10-01",
  });

  // ✅ 서버에서 교번표를 실제로 불러왔는지 (못 불러왔으면 관리자 교번 편집 잠금)
  const [shiftLoaded, setShiftLoaded] = useState(false);

  // TSV 파싱된 교번 행 (메모이제이션)
  const shiftRows = useMemo(
    () => parsePeopleTable(shiftConfig.tsvTable),
    [shiftConfig.tsvTable]
  );

  /* ========= Supabase에서 초기 로딩 + 새로고침 ========= */

  const fetchUsersFromServer = async () => {
    const { data, error } = await supabase
      .from("ledger_users")
      .select("id,name,role,must_change_password,created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Supabase] ledger_users select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    if (!data || data.length === 0) {
      // ✅ 기본 계정(관리자/0000)으로 대체하지 않음
      setUserList([]);
      setUsersLoaded(true);
      return;
    }

    const mapped = data.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role || "user",
      mustChangePassword: !!row.must_change_password,
      dia: row.dia ?? null,
      diaAnchorDate: row.dia_anchor_date ?? null,
    }));

    setUserList(mapped);
    setUsersLoaded(true);
  };

  const fetchShiftConfigFromServer = async () => {
    const { data, error } = await supabase
      .from("shift_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      // 행이 아예 없는 경우(처음 설정 전)는 "불러오기 성공 + 빈 교번표"로 취급
      if (error.code === "PGRST116") {
        setShiftLoaded(true);
        return;
      }
      console.error("[Supabase] shift_config select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }
    if (!data) return;

    setShiftLoaded(true);
    setShiftConfig({
      tsvTable: data.tsv_table || "",
      diaCount: data.dia_count ?? 37,
      nightStartDia: data.night_start_dia ?? 25,
      anchorDate: data.anchor_date || "2025-10-01",
      updatedAt: data.updated_at || null,
    });
  };

  const fetchLeaveTypesFromServer = async () => {
    const { data, error } = await supabase
      .from("leave_types")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[Supabase] leave_types select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    if (!data || data.length === 0) {
      console.log(
        "[Supabase] leave_types 비어 있음 → DEFAULT_LEAVE_TYPES 사용"
      );
      setLeaveTypes(DEFAULT_LEAVE_TYPES);
      return;
    }

    const mapped = data.map((row) => ({
      id: row.id,
      label: row.label,
      onlyDay: !!row.only_day,
      excludeFromCount: !!row.exclude_from_count,
    }));

    setLeaveTypes(mapped);
  };

  const fetchSlotConfigFromServer = async () => {
    const { data, error } = await supabase
      .from("day_type_config")
      .select("*")
      .limit(1);

    if (error) {
      console.error("[Supabase] day_type_config select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    if (!data || data.length === 0) {
      return;
    }

    const row = data[0];
    setSlotConfig({
      weekday: row.weekday_slots ?? 5,
      saturday: row.saturday_slots ?? 7,
      holiday: row.holiday_slots ?? 8,
      publicHoliday: row.public_holiday_slots ?? row.holiday_slots ?? 8,
    });
  };

  const fetchNightRuleFromServer = async () => {
    const { data, error } = await supabase
      .from("night_rule_config")
      .select("*")
      .limit(1);

    if (error) {
      console.error("[Supabase] night_rule_config select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    if (!data || data.length === 0) {
      return;
    }

    const row = data[0];
    setNightRule({
      diaCount:
        typeof row.dia_count === "number"
          ? row.dia_count
          : DEFAULT_NIGHT_RULE.diaCount,
      nightStartDia:
        typeof row.night_start_dia === "number"
          ? row.night_start_dia
          : DEFAULT_NIGHT_RULE.nightStartDia,
    });
  };

  const fetchLockRuleFromServer = async () => {
    const { data, error } = await supabase
      .from("lock_rule_config")
      .select("*")
      .limit(1);

    if (error) {
      console.error("[Supabase] lock_rule_config select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    if (!data || data.length === 0) {
      return;
    }

    const row = data[0];
    setLockRule({
      lockDaysBefore:
        typeof row.lock_days_before === "number"
          ? row.lock_days_before
          : DEFAULT_LOCK_RULE.lockDaysBefore,
    });
  };

  const fetchSlotOverridesFromServer = async () => {
    const { data, error } = await supabase
      .from("day_slot_overrides")
      .select("*");

    if (error) {
      console.error("[Supabase] day_slot_overrides select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    const map = {};
    (data || []).forEach((row) => {
      if (row.date && typeof row.base_slots === "number") {
        map[row.date] = row.base_slots;
      }
    });
    setSlotOverridesByDate(map);
  };

  // ✅ 추가: 날짜별 "공휴일/일요일 다음날 비번+1" 예외 설정 불러오기
  const fetchPlusOneOverridesFromServer = async () => {
    const { data, error } = await supabase
      .from("day_plus_one_overrides")
      .select("*");

    if (error) {
      console.error("[Supabase] day_plus_one_overrides select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    const map = {};
    (data || []).forEach((row) => {
      if (row.date && typeof row.allow_plus_one === "boolean") {
        map[row.date] = row.allow_plus_one;
      }
    });
    setPlusOneOverridesByDate(map);
  };

  const fetchAdminNotesFromServer = async () => {
    const { data, error } = await supabase.from("admin_day_notes").select("*");

    if (error) {
      console.error("[Supabase] admin_day_notes select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    const map = {};
    (data || []).forEach((row) => {
      if (row.date) {
        map[row.date] = row.note || "";
      }
    });
    setAdminNotesByDate(map);
  };

  // ✅ (핵심) vac_entries: 기간(range)로 가져오되 1000개 넘으면 페이지네이션
  const fetchVacEntriesByRange = async (startIso, endIso) => {
    let from = 0;
    let all = [];

    while (true) {
      const { data, error } = await supabase
        .from("vac_entries")
        .select("*")
        .gte("date", startIso)
        .lte("date", endIso)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, from + VAC_PAGE_SIZE - 1);

      if (error) {
        console.error("[Supabase] vac_entries range select 에러:", error);
        throw error; // ✅ 일부만 받은 채로 화면을 덮어쓰지 않음
      }

      all = all.concat(data || []);
      if (!data || data.length < VAC_PAGE_SIZE) break;
      from += VAC_PAGE_SIZE;
    }

    // 날짜별로 모으기
    const byDate = {};
    (all || []).forEach((row) => {
      const entry = mapVacRowToEntry(row);
      if (!entry || !entry.date) return;
      const dateKey = entry.date;
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(entry);
    });

    return normalizeEntriesByDate(byDate);
  };

  // ✅ 캘린더용: 현재 달(±버퍼)만 가져와서 entriesByDate에 "누적 merge"
  const fetchCalendarEntriesForBaseMonth = async (base) => {
    const { startIso, endIso } = getCalendarRangeForMonth(base, 7);
    const byDate = await fetchVacEntriesByRange(startIso, endIso);

    setEntriesByDate((prev) => {
      const next = { ...(prev || {}) };

      // ✅ 1) 이번에 다시 불러온 범위(startIso~endIso)의 캐시를 싹 비움
      // (YYYY-MM-DD 문자열은 사전순 비교가 날짜순이라 범위 비교 가능)
      Object.keys(next).forEach((dateKey) => {
        if (dateKey >= startIso && dateKey <= endIso) {
          delete next[dateKey];
        }
      });

      // ✅ 2) 서버에서 받은 걸로 다시 채움 (merge가 아니라 "범위 덮어쓰기" 효과)
      return mergeEntriesByDate(next, byDate);
    });
  };

  // ✅ 내 휴가용: 내 것만 전부(페이지네이션) 가져오기
  const fetchMyEntriesAll = async (user) => {
    if (!user) return {};
    setIsMyLoading(true);

    try {
      let from = 0;
      let all = [];

      // applicant_id 우선, 혹시 옛 데이터 applicant_id 비어있으면 applicant_name도 포함
      const orFilter = `applicant_id.eq.${user.id},applicant_name.eq.${user.name}`;

      while (true) {
        const { data, error } = await supabase
          .from("vac_entries")
          .select("*")
          .or(orFilter)
          .order("date", { ascending: true })
          .order("created_at", { ascending: true })
          .range(from, from + VAC_PAGE_SIZE - 1);

        if (error) {
          console.error("[Supabase] my vac_entries select 에러:", error);
          throw error; // ✅ 일부만 받은 채로 화면을 덮어쓰지 않음
        }

        all = all.concat(data || []);
        if (!data || data.length < VAC_PAGE_SIZE) break;
        from += VAC_PAGE_SIZE;
      }

      const byDate = {};
      (all || []).forEach((row) => {
        const entry = mapVacRowToEntry(row);
        if (!entry?.date) return;
        (byDate[entry.date] ||= []).push(entry);
      });

      const normalized = normalizeEntriesByDate(byDate);

      // 내 탭은 전용 state에 저장
      setMyEntriesByDate(normalized);

      // 캘린더/모달에서도 내 과거 기록이 필요한 경우가 있어 캐시에 합쳐둠(선택사항)
      setEntriesByDate((prev) => mergeEntriesByDate(prev, normalized));

      return normalized;
    } finally {
      setIsMyLoading(false);
    }
  };

  // ✅ 첫 페이지(최근 LOG_PAGE_SIZE개)만 가져오기
  const fetchLogsFromServer = async () => {
    const from = 0;
    const to = LOG_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("vac_logs")
      .select("*")
      .order("ts", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[Supabase] vac_logs select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    const mapped = (data || []).map(mapLogRowToLog);
    setLogs(mapped);
    setLogsPage(0);
    setLogsHasMore((data || []).length === LOG_PAGE_SIZE);
  };

  // ✅ 더보기: 다음 페이지를 append
  const loadMoreLogs = async () => {
    if (isLogsLoadingMore) return;
    if (!logsHasMore) return;

    setIsLogsLoadingMore(true);
    try {
      const nextPage = logsPage + 1;
      const from = nextPage * LOG_PAGE_SIZE;
      const to = from + LOG_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("vac_logs")
        .select("*")
        .order("ts", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("[Supabase] vac_logs load more 에러:", error);
        return;
      }

      const mapped = (data || []).map(mapLogRowToLog);

      setLogs((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const add = mapped.filter((x) => !seen.has(x.id));
        return [...prev, ...add];
      });

      setLogsPage(nextPage);
      setLogsHasMore((data || []).length === LOG_PAGE_SIZE);
    } finally {
      setIsLogsLoadingMore(false);
    }
  };

  const fetchPublicHolidaysFromServer = async () => {
    const { data, error } = await supabase
      .from("public_holidays")
      .select("*")
      .order("date", { ascending: true });

    if (error) {
      console.error("[Supabase] public_holidays select 에러:", error);
      throw error; // ✅ 새로고침에서 실패를 알 수 있게
    }

    const list =
      data?.map((row) => ({
        date: row.date,
        label: row.label || "",
      })) || [];

    setPublicHolidays(list);
  };

  // ✅ 새로고침: vac_entries는 "전체"가 아니라 캘린더 달 범위만
  const refreshAllFromServer = async (showAlert = false) => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchUsersFromServer(),
        fetchLeaveTypesFromServer(),
        fetchSlotConfigFromServer(),
        fetchNightRuleFromServer(),
        fetchLockRuleFromServer(),
        fetchSlotOverridesFromServer(),
        fetchPlusOneOverridesFromServer(), // ✅ 추가
        fetchAdminNotesFromServer(),
        fetchCalendarEntriesForBaseMonth(baseDate), // ✅ 변경
        fetchLogsFromServer(),
        fetchPublicHolidaysFromServer(),
        fetchShiftConfigFromServer(),
      ]);
      setHyuRefreshTick((t) => t + 1);

      // 내 탭에 있을 때는 내 데이터도 같이 갱신 (관리자는 전체)
      if (activeTab === "my" && currentUser) {
        if (currentUser.role === "admin") {
          const byDate = await fetchVacEntriesByRange("2020-01-01", "2099-12-31");
          setMyEntriesByDate(byDate);
          setEntriesByDate((prev) => mergeEntriesByDate(prev, byDate));
        } else {
          await fetchMyEntriesAll(currentUser);
        }
      }
      // 관리자 탭이면 전체 기간도 최신으로
      if (activeTab === "admin" && currentUser?.role === "admin") {
        const byDate = await fetchVacEntriesByRange("2020-01-01", "2099-12-31");
        setEntriesByDate((prev) => mergeEntriesByDate(prev, byDate));
      }

      if (showAlert) {
        window.alert("서버에서 최신 데이터를 다시 불러왔습니다.");
      }
    } catch (err) {
      console.error("[Supabase] 전체 새로고침 에러:", err);
      if (!showAlert) {
        window.alert(
          "인터넷 연결이 불안정해서 일부 정보를 불러오지 못했습니다.\n위쪽 ↻ 버튼을 눌러 다시 불러와 주세요."
        );
      }
      if (showAlert) {
        window.alert(
          "서버에서 데이터를 다시 불러오는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
        );
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshAllFromServer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ PC(넓은 화면) 여부: PC는 탭을 위쪽 헤더에 넣고 배치를 따로 씀
  const isPc = useMediaQuery("(min-width: 1100px)");

  // PC에서 캘린더 탭에 들어가면 오른쪽에 오늘 상세를 바로 띄움
  useEffect(() => {
    if (!isPc || activeTab !== "calendar" || !currentUser) return;
    setSelectedDate((prev) => prev || stripTime(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPc, activeTab, currentUser?.id]);

  // ✅ 로그인 상태를 서버 계정 정보와 맞춤
  //  - 계정 삭제 → 로그아웃
  //  - 관리자가 비밀번호 초기화 → 로그아웃 (다시 로그인해서 새 비밀번호 설정)
  //  - 권한/이름 변경 → 바로 반영
  useEffect(() => {
    if (!usersLoaded || !currentUser) return;
    const logout = (msg) => {
      setCurrentUser(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY_USER);
      } catch {
        /* ignore */
      }
      window.alert(msg);
    };
    const row = userList.find((u) => u.id === currentUser.id);
    if (!row) {
      logout("계정 정보가 바뀌어 로그아웃되었습니다.\n다시 로그인해 주세요.");
      return;
    }
    if (row.mustChangePassword && !currentUser.mustChangePassword) {
      logout("비밀번호가 초기화되었습니다.\n다시 로그인해서 새 비밀번호를 정해 주세요.");
      return;
    }
    if (row.role !== currentUser.role || row.name !== currentUser.name) {
      const next = { ...currentUser, role: row.role, name: row.name };
      setCurrentUser(next);
      try {
        window.localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (row.role !== "admin" && activeTab === "admin") {
        setActiveTab("gyobeon");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersLoaded, userList, currentUser?.id]);

  // 앱을 다시 화면에 띄우면(백그라운드 → 복귀) 교번표 + 휴충당 최신화
  //  → 오래 켜둔 폰에 옛 교번표가 남아 있는 상황 방지
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 30000) return; // 30초 이내 재복귀는 생략
      last = Date.now();
      fetchShiftConfigFromServer().catch(() => {});
      fetchUsersFromServer().catch(() => {});
      setHyuRefreshTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
   *  ✅ 캘린더 달 이동 시: 그 달 범위만 추가로 가져오기
   * ========================= */
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab !== "calendar") return;

    fetchCalendarEntriesForBaseMonth(baseDate).catch(() =>
      window.alert("이 달 휴가 정보를 불러오지 못했습니다.\n잠시 후 ↻ 버튼을 눌러 주세요.")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, baseDate, currentUser?.id]);

  /* =========================
   *  ✅ 내 휴가 탭 들어갈 때: 내 것 전부 가져오기
   * ========================= */
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab !== "my") return;

    // 관리자: 모든 사람 데이터 로드 (전체 조회 지원)
    if (currentUser.role === "admin") {
      fetchVacEntriesByRange("2020-01-01", "2099-12-31")
        .then((byDate) => {
          setMyEntriesByDate(byDate);
          setEntriesByDate((prev) => mergeEntriesByDate(prev, byDate));
        })
        .catch(() => window.alert("휴가 기록을 불러오지 못했습니다.\n잠시 후 ↻ 버튼을 눌러 주세요."));
    } else {
      fetchMyEntriesAll(currentUser).catch(() =>
        window.alert("내 휴가 기록을 불러오지 못했습니다.\n잠시 후 ↻ 버튼을 눌러 주세요.")
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser?.id]);

  /* =========================
   *  ✅ 관리자 탭 들어갈 때: 전체 기간 vac_entries 로드
   * ========================= */
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab !== "admin") return;
    if (currentUser.role !== "admin") return;

    (async () => {
      try {
        const byDate = await fetchVacEntriesByRange("2020-01-01", "2099-12-31");
        setEntriesByDate((prev) => mergeEntriesByDate(prev, byDate));
      } catch {
        window.alert("전체 휴가 기록을 불러오지 못했습니다.\n잠시 후 ↻ 버튼을 눌러 주세요.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser?.id]);

  /* =========================
   *  캘린더 탭일 때 스크롤 막기
   * ========================= */

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    if (activeTab === "calendar") {
      root.classList.add("no-scroll-vertical");
    } else {
      root.classList.remove("no-scroll-vertical");
    }

    return () => {
      root.classList.remove("no-scroll-vertical");
    };
  }, [activeTab]);

  /* =========================
   *  요약/야간 리스트 계산
   * ========================= */

  const daySummaryMap = useMemo(() => {
    const map = {};
    const publicHolidaySet = new Set((publicHolidays || []).map((h) => h.date));

    // 1) 현재 보고 있는 달 전체 범위
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth();
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0); // 말일

    let cur = new Date(monthStart);
    while (cur <= monthEnd) {
      const dateKey = formatDateKey(cur);
      const summary = buildDaySummaryForDate(
        dateKey,
        entriesByDate,
        slotConfig,
        slotOverridesByDate,
        publicHolidaySet,
        plusOneOverridesByDate // ✅ 추가
      );
      if (summary) {
        map[dateKey] = summary;
      }
      cur.setDate(cur.getDate() + 1);
    }

    // 2) 달 밖에 있는 날짜라도, 이미 휴가/override가 있으면 포함
    const extraDates = new Set([
      ...Object.keys(entriesByDate || {}),
      ...Object.keys(slotOverridesByDate || {}),
      ...Object.keys(plusOneOverridesByDate || {}), // ✅ 추가
    ]);

    extraDates.forEach((dateKey) => {
      if (map[dateKey]) return;
      const summary = buildDaySummaryForDate(
        dateKey,
        entriesByDate,
        slotConfig,
        slotOverridesByDate,
        publicHolidaySet,
        plusOneOverridesByDate // ✅ 추가
      );
      if (summary) {
        map[dateKey] = summary;
      }
    });

    return map;
  }, [
    baseDate,
    entriesByDate,
    slotConfig,
    slotOverridesByDate,
    plusOneOverridesByDate, // ✅ 추가
    publicHolidays,
  ]);

  const nightOffDiaList = useMemo(() => {
    const { diaCount, nightStartDia } = nightRule;
    if (!Number.isFinite(diaCount) || !Number.isFinite(nightStartDia)) {
      return [];
    }
    const start = Math.max(1, nightStartDia);
    const end = Math.max(start, diaCount);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [nightRule]);

  const selectedDaySummary =
    currentDateKey && daySummaryMap[currentDateKey]
      ? daySummaryMap[currentDateKey]
      : null;

  /* =========================
   *  공통 핸들러
   * ========================= */

  // ✅ 29~31일에도 달을 건너뛰지 않게 항상 "그 달 1일"로 이동
  const handlePrevMonth = () => {
    setBaseDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setBaseDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // 탭 목록 (관리자는 교번 마지막, 일반 사용자는 교번 맨 앞)
  const tabDefs = [
    ...(currentUser?.role !== "admin" ? [["gyobeon", "교번"]] : []),
    ["logs", "로그"],
    ["hyu", "휴충당"],
    ["calendar", "캘린더"],
    ["my", "내 휴가"],
    ...(currentUser?.role === "admin"
      ? [
          ["admin", "관리자"],
          ["gyobeon", "교번"],
        ]
      : []),
  ];
  const goTab = (key) => {
    setActiveTab(key);
    if (key === "calendar") handleJumpToday();
  };

  const handleJumpToday = () => {
    const today = stripTime(new Date());
    setBaseDate(today);
    setSelectedCalendarDate(today);
  };


  const handleSelectYearMonth = (year, month) => {
    setBaseDate(new Date(year, month - 1, 1));
  };

  // 달력 더블탭 → 모달 오픈
  const handleDayDoubleTap = (date) => {
    const pure = stripTime(date);
    setSelectedDate(pure);
    setSelectedCalendarDate(pure);
  };

  const handleLogin = (rawUser) => {
    // ✅ 비밀번호는 폰에 저장하지 않음
    // eslint-disable-next-line no-unused-vars
    const { password: _pw, ...user } = rawUser || {};
    // 이 폰의 사용자 목록도 서버 확인 결과로 맞춤
    // (다른 기기에서 비밀번호를 이미 바꿨는데 옛 목록 때문에 바로 로그아웃되는 문제 방지)
    setUserList((prev) =>
      (prev || []).map((u) =>
        u.id === user.id
          ? {
              ...u,
              name: user.name ?? u.name,
              role: user.role ?? u.role,
              mustChangePassword: !!user.mustChangePassword,
            }
          : u
      )
    );
    setCurrentUser(user);
    setActiveTab(user.role === "admin" ? "logs" : "gyobeon");
    try {
      window.localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  };

  // ✅ 내 휴가 탭에서 특정 날짜 항목 클릭 → 해당 날짜 모달 열기 + 캘린더로 이동
  const handleOpenDateFromList = (dateKey) => {
    if (!dateKey) return;
    const [y, m, d] = dateKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const pure = stripTime(dt);

    // 1) 먼저 캘린더로 이동 + 달 변경
    setActiveTab("calendar");
    setBaseDate(stripTime(new Date(y, m - 1, 1)));
    setSelectedCalendarDate(pure);

    // 2) 다음 tick 에 모달 열기 (탭 전환 후 모달이 확실히 뜨도록)
    setTimeout(() => {
      setSelectedDate(pure);
    }, 50);
  };

  /* =========================
   *  사용자/권한/비번 (서버 우선)
   * ========================= */

  // ✅ 서버에서 비밀번호 확인 (비밀번호를 내려받지 않고 "맞는지"만 물어봄)
  const verifyLogin = async (userId, pw) => {
    const { data, error } = await supabase
      .from("ledger_users")
      .select("id,name,role,must_change_password")
      .eq("id", userId)
      .eq("password", pw)
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      role: row.role || "user",
      mustChangePassword: !!row.must_change_password,
    };
  };

  // opts.oldPassword: 본인이 바꿀 때 (지금 비밀번호가 맞아야 바뀜)
  // opts.forceChange: 관리자가 초기화할 때 (다음 로그인 때 새 비밀번호 설정)
  // opts.silent: 알림창 없이 결과만 돌려줌
  const handleChangePassword = async (userId, newPassword, opts = {}) => {
    try {
      let q = supabase
        .from("ledger_users")
        .update({
          password: newPassword,
          must_change_password: !!opts.forceChange,
        })
        .eq("id", userId);
      if (opts.oldPassword != null) q = q.eq("password", opts.oldPassword);
      const { data, error } = await q.select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        if (!opts.silent) window.alert("지금 비밀번호가 맞지 않아 바꾸지 못했습니다.");
        return false;
      }

      setUserList((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, mustChangePassword: !!opts.forceChange } : u
        )
      );

      if (opts.silent) return true;

      if (currentUser && currentUser.id === userId) {
        setCurrentUser(null);
        setActiveTab("logs");
        try {
          window.localStorage.removeItem(STORAGE_KEY_USER);
        } catch {
          /* ignore */
        }
        window.alert("비밀번호가 변경되었습니다. 다시 로그인해 주세요.");
      } else {
        window.alert(
          opts.forceChange
            ? "비밀번호를 초기화했습니다.\n그 사람은 다음 로그인 때 새 비밀번호를 정하게 됩니다."
            : "비밀번호를 저장했습니다."
        );
      }
      return true;
    } catch (err) {
      console.error("[Supabase] ledger_users 비밀번호 업데이트 에러:", err);
      if (!opts.silent) window.alert("서버에 비밀번호를 저장하는 중 오류가 발생했습니다.");
      return false;
    }
  };

  const handleAddUser = async (newUser) => {
    const newName = String(newUser.name || "").trim();
    if (!newName) {
      window.alert("이름을 입력하세요.");
      return;
    }
    newUser = { ...newUser, name: newName };
    if (
      userList.some(
        (u) => String(u.name || "").replace(/\s/g, "") === newName.replace(/\s/g, "")
      )
    ) {
      window.alert(
        "이미 같은 이름의 사용자가 있습니다.\n동명이인이면 '박재민A', '박재민B'처럼 구분해서 등록해 주세요.\n(교번표 이름도 똑같이 맞춰야 합니다)"
      );
      return;
    }

    const id = newUser.id || "u" + Date.now().toString(16);
    const user = {
      id,
      name: newUser.name,
      role: newUser.role || "user",
      password: newUser.password || "0000",
      mustChangePassword: true,
    };

    try {
      const { error } = await supabase.from("ledger_users").insert({
        id: user.id,
        name: user.name,
        role: user.role,
        password: user.password,
        must_change_password: true,
      });

      if (error) throw error;

      // eslint-disable-next-line no-unused-vars
      const { password: _pw, ...safeUser } = user;
      setUserList((prev) => [...prev, safeUser]);
    } catch (err) {
      console.error("[Supabase] ledger_users insert 에러:", err);
      window.alert("Supabase에 새 사용자를 저장하는 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (currentUser && currentUser.id === userId) {
      window.alert(
        "현재 로그인한 계정은 삭제할 수 없습니다.\n다른 관리자 계정을 만든 후 삭제해 주세요."
      );
      return;
    }

    if (
      !window.confirm(
        "정말 이 사용자를 삭제하시겠습니까?\n해당 사용자의 기존 휴가 기록은 남아 있지만,\n이 계정으로는 더 이상 로그인할 수 없습니다."
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("ledger_users")
        .delete()
        .eq("id", userId);

      if (error) throw error;

      setUserList((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      console.error("[Supabase] ledger_users delete 에러:", err);
      window.alert("Supabase에서 사용자를 삭제하는 중 오류가 발생했습니다.");
    }
  };

  const handleChangeUserRole = async (userId, nextRole) => {
    try {
      const { error } = await supabase
        .from("ledger_users")
        .update({ role: nextRole })
        .eq("id", userId);

      if (error) throw error;

      setUserList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u))
      );

      if (currentUser && currentUser.id === userId) {
        const updated = { ...currentUser, role: nextRole };
        setCurrentUser(updated);
        try {
          window.localStorage.setItem(
            STORAGE_KEY_USER,
            JSON.stringify(updated)
          );
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error("[Supabase] ledger_users role 업데이트 에러:", err);
      window.alert("Supabase에 권한 변경을 저장하는 중 오류가 발생했습니다.");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab("logs");
    setSelectedDate(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY_USER);
    } catch {
      /* ignore */
    }
  };

  /* =========================
   *  관리자: 휴가 종류 (서버 우선)
   * ========================= */

  // ✅ 휴가 종류 변경: 화면은 바로 바꾸고, 서버 저장은 순서대로 하나씩
  //    (빠르게 여러 번 눌러도 앞의 변경이 되돌아가지 않음)
  const leaveTypesRef = useRef(leaveTypes);
  useEffect(() => {
    leaveTypesRef.current = leaveTypes;
  }, [leaveTypes]);
  const leaveSaveChain = useRef(Promise.resolve());

  const persistLeaveTypes = async (prevList, nextList) => {
    // 1) 이미 등록된 휴가에 먼저 반영 (실패하면 종류 목록은 안 바뀜)
    //    2) 에서 실패하면 1) 에서 바꾼 것도 되돌림 (휴가 기록과 종류 목록이 어긋나지 않게)
    const excludeChangedLabels = [];
    const undo = [];
    for (const t of nextList) {
      const before = prevList.find((x) => x.id === t.id);
      if (!before) continue;
      if (before.label !== t.label && before.label) {
        const { error } = await supabase
          .from("vac_entries")
          .update({ leave_type: t.label })
          .eq("leave_type", before.label);
        if (error) throw error;
        undo.unshift({ leave_type: before.label, where: t.label });
      }
      if (!!before.excludeFromCount !== !!t.excludeFromCount) {
        const { error } = await supabase
          .from("vac_entries")
          .update({ exclude_from_count: !!t.excludeFromCount })
          .eq("leave_type", t.label);
        if (error) throw error;
        undo.unshift({ exclude_from_count: !!before.excludeFromCount, where: t.label });
        excludeChangedLabels.push(t.label);
      }
    }

    // 2) 휴가 종류 목록 저장
    try {
    const prevIds = new Set(prevList.map((t) => t.id));
    const nextIds = new Set(nextList.map((t) => t.id));
    const deletedIds = [...prevIds].filter((id) => !nextIds.has(id));
    if (deletedIds.length > 0) {
      const { error: delError } = await supabase
        .from("leave_types")
        .delete()
        .in("id", deletedIds);
      if (delError) throw delError;
    }
    const rows = nextList.map((t, idx) => ({
      id: t.id,
      label: t.label,
      only_day: !!t.onlyDay,
      exclude_from_count: !!t.excludeFromCount,
      sort_order: idx + 1,
    }));
    const { error: upsertError } = await supabase.from("leave_types").upsert(rows);
    if (upsertError) throw upsertError;
    } catch (listErr) {
      for (const u of undo) {
        const { where, ...patch } = u;
        try {
          await supabase.from("vac_entries").update(patch).eq("leave_type", where);
        } catch (undoErr) {
          console.error("[Supabase] 휴가 종류 되돌리기 실패:", undoErr);
        }
      }
      throw listErr;
    }

    // 3) 정원 제외가 바뀐 종류: 지난달부터 앞으로 날짜의 순번 다시 매김
    try {
      if (excludeChangedLabels.length) {
        const from = formatDateKey(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1));
        const { data: rowsToFix, error } = await supabase
          .from("vac_entries")
          .select("date")
          .in("leave_type", excludeChangedLabels)
          .gte("date", from);
        if (error) throw error;
        const dates = [...new Set((rowsToFix || []).map((r) => r.date))];
        for (const d of dates) applyDayToState(d, await resequenceDayOnServer(d));
      }
      await fetchCalendarEntriesForBaseMonth(baseDate);
    } catch (e) {
      console.error("[Supabase] 휴가 종류 변경 후 정리 에러:", e);
      window.alert("휴가 종류는 저장됐지만 화면 정리 중 오류가 났습니다.\n↻ 버튼으로 새로고침해 주세요.");
    }
  };

  const handleChangeLeaveTypes = (nextList) => {
    const prevList = leaveTypesRef.current;
    leaveTypesRef.current = nextList;
    setLeaveTypes(nextList);
    leaveSaveChain.current = leaveSaveChain.current
      .then(() => persistLeaveTypes(prevList, nextList))
      .catch((err) => {
        console.error("[Supabase] leave_types 저장 에러:", err);
        window.alert("휴가 종류를 서버에 저장하지 못했습니다.\n서버 값으로 되돌립니다.");
        fetchLeaveTypesFromServer().catch(() => {});
      });
  };

  /* =========================
   *  관리자: 요일별 정원, 야간 규칙, 공휴일, 수정 제한
   * ========================= */

  const handleChangeSlotConfig = (partial) => {
    setSlotConfig((prev) => ({
      ...prev,
      ...partial,
    }));
  };

  const handleSaveSlotConfigToServer = async (nextConfig) => {
    const src = nextConfig ?? slotConfig;

    const payload = {
      id: "singleton",
      weekday_slots: src.weekday,
      saturday_slots: src.saturday,
      holiday_slots: src.holiday,
      public_holiday_slots: src.publicHoliday,
    };

    try {
      const { error } = await supabase.from("day_type_config").upsert(payload);
      if (error) throw error;
      window.alert("날짜 유형별 휴가 정원을 저장했습니다.");
    } catch (err) {
      // ✅ 저장 실패 → 화면 값을 서버 값으로 되돌림
      fetchSlotConfigFromServer().catch(() => {});
      console.error("[Supabase] day_type_config upsert 에러:", err);
      window.alert(
        "날짜 유형별 휴가 정원을 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
    }
  };

  const handleChangeNightRule = (partial) => {
    setNightRule((prev) => {
      const next = { ...prev, ...partial };
      if (!Number.isFinite(next.diaCount) || next.diaCount < 1) {
        next.diaCount = 1;
      }
      if (!Number.isFinite(next.nightStartDia) || next.nightStartDia < 1) {
        next.nightStartDia = 1;
      }
      if (next.nightStartDia > next.diaCount) {
        next.nightStartDia = next.diaCount;
      }
      return next;
    });
  };

  const handleSaveNightRuleToServer = async (nextRule) => {
    const raw = nextRule ?? nightRule;
    // ✅ 화면과 같은 범위 보정을 저장 값에도 적용
    const dc = Math.max(1, Number(raw.diaCount) || DEFAULT_NIGHT_RULE.diaCount);
    const ns = Math.min(dc, Math.max(1, Number(raw.nightStartDia) || DEFAULT_NIGHT_RULE.nightStartDia));
    const src = { diaCount: dc, nightStartDia: ns };

    const payload = {
      id: "singleton",
      dia_count:
        typeof src.diaCount === "number"
          ? src.diaCount
          : DEFAULT_NIGHT_RULE.diaCount,
      night_start_dia:
        typeof src.nightStartDia === "number"
          ? src.nightStartDia
          : DEFAULT_NIGHT_RULE.nightStartDia,
    };

    try {
      const { error } = await supabase
        .from("night_rule_config")
        .upsert(payload);
      if (error) throw error;
      window.alert("야간 규칙(전체 DIA 개수 / 기준 DIA)을 저장했습니다.");
    } catch (err) {
      // ✅ 저장 실패 → 화면 값을 서버 값으로 되돌림
      fetchNightRuleFromServer().catch(() => {});
      console.error("[Supabase] night_rule_config upsert 에러:", err);
      window.alert(
        "야간 규칙을 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
    }
  };

  const handleChangeLockRule = (partial) => {
    setLockRule((prev) => ({
      ...prev,
      ...partial,
    }));
  };

  const handleSaveLockRuleToServer = async (nextRule) => {
    const src = nextRule ?? lockRule;
    const safe =
      typeof src.lockDaysBefore === "number" && src.lockDaysBefore >= 0
        ? Math.floor(src.lockDaysBefore)
        : 0;

    const payload = {
      id: "singleton",
      lock_days_before: safe,
    };

    try {
      const { error } = await supabase.from("lock_rule_config").upsert(payload);
      if (error) throw error;
      setLockRule({ lockDaysBefore: safe });
      window.alert("휴가 수정/취소 제한 규칙을 저장했습니다.");
    } catch (err) {
      // ✅ 저장 실패 → 화면 값을 서버 값으로 되돌림
      fetchLockRuleFromServer().catch(() => {});
      console.error("[Supabase] lock_rule_config upsert 에러:", err);
      window.alert(
        "휴가 수정/취소 제한 규칙을 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
    }
  };

  // 교번 TSV + 설정 저장
  // ✅ 교번 설정 저장: 성공 여부를 돌려줌 + 다른 관리자가 그 사이 바꿨으면 막음
  const handleSaveShiftConfig = async (next) => {
    try {
      const { data: cur, error: curErr } = await supabase
        .from("shift_config")
        .select("updated_at")
        .eq("id", 1)
        .limit(1);
      if (curErr) throw curErr;
      const serverUpdatedAt = cur?.[0]?.updated_at || null;
      // 편집을 시작할 때 본 버전과 지금 서버 버전이 다르면 막음
      const expected =
        next.expectedUpdatedAt !== undefined ? next.expectedUpdatedAt : shiftConfig.updatedAt;
      if (
        expected &&
        serverUpdatedAt &&
        new Date(serverUpdatedAt).getTime() !== new Date(expected).getTime()
      ) {
        window.alert(
          "다른 관리자가 그 사이 교번표를 바꿨습니다.\n최신 교번표를 다시 불러올 테니, 확인 후 다시 저장해 주세요."
        );
        await fetchShiftConfigFromServer().catch(() => {});
        return false;
      }

      const nowIso = new Date().toISOString();
      const payload = {
        id: 1,
        tsv_table: next.tsvTable ?? shiftConfig.tsvTable,
        dia_count: next.diaCount ?? shiftConfig.diaCount,
        night_start_dia: next.nightStartDia ?? shiftConfig.nightStartDia,
        anchor_date: next.anchorDate ?? shiftConfig.anchorDate,
        updated_at: nowIso,
      };
      const { data: saved, error } = await supabase
        .from("shift_config")
        .upsert(payload)
        .select("updated_at");
      if (error) throw error;
      // eslint-disable-next-line no-unused-vars
      const { expectedUpdatedAt: _e, ...cfg } = next;
      setShiftConfig((prev) => ({
        ...prev,
        ...cfg,
        updatedAt: saved?.[0]?.updated_at || nowIso,
      }));
      window.alert("교번 설정을 저장했습니다.");
      return true;
    } catch (err) {
      console.error("[Supabase] shift_config upsert 에러:", err);
      window.alert("교번 설정 저장 중 오류가 발생했습니다.\n바꾼 내용은 화면에 그대로 남겨두었습니다.");
      return false;
    }
  };


  const handleChangeSlotOverrideForDate = async (dateKey, baseSlots) => {
    if (!dateKey) return;
    const num = Number(baseSlots);

    try {
      if (!Number.isFinite(num) || num <= 0) {
        const { error } = await supabase
          .from("day_slot_overrides")
          .delete()
          .eq("date", dateKey);
        if (error) throw error;

        setSlotOverridesByDate((prev) => {
          const { [dateKey]: _, ...rest } = prev;
          return rest;
        });
      } else {
        const payload = {
          date: dateKey,
          base_slots: num,
        };

        const { data, error } = await supabase
          .from("day_slot_overrides")
          .upsert(payload)
          .select("*")
          .single();

        if (error) throw error;

        setSlotOverridesByDate((prev) => ({
          ...prev,
          [data.date]: data.base_slots,
        }));
      }
    } catch (err) {
      console.error("[Supabase] day_slot_overrides 저장 에러:", err);
      window.alert(
        "특정 일자 정원을 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
    }
  };

  // ✅ 추가: 날짜별 "공휴일/일요일 다음날 비번+1" 예외 저장/삭제
  // value === true  → 이 날짜만 무조건 +1 허용
  // value === null  → override 삭제(기본 규칙으로 복귀)
  const handleChangePlusOneOverride = async (dateKey, value) => {
    if (!currentUser || !dateKey) return;

    try {
      if (value == null) {
        const { error } = await supabase
          .from("day_plus_one_overrides")
          .delete()
          .eq("date", dateKey);
        if (error) throw error;

        setPlusOneOverridesByDate((prev) => {
          const { [dateKey]: _, ...rest } = prev;
          return rest;
        });
      } else {
        const payload = {
          date: dateKey,
          allow_plus_one: !!value,
          updated_by_name: currentUser.name,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("day_plus_one_overrides")
          .upsert(payload)
          .select("*")
          .single();

        if (error) throw error;

        setPlusOneOverridesByDate((prev) => ({
          ...prev,
          [data.date]: data.allow_plus_one,
        }));
      }
    } catch (err) {
      console.error("[Supabase] day_plus_one_overrides 저장 에러:", err);
      window.alert(
        "공휴일/일요일 다음날 비번 +1 규칙을 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
    }
  };

  const handleChangePublicHolidays = (nextList) => {
    setPublicHolidays(nextList || []);
  };

  const handleSavePublicHolidaysToServer = async (nextList) => {
    const rawList = nextList ?? publicHolidays;

    const byDate = new Map();
    (rawList || []).forEach((h) => {
      if (!h || !h.date) return;
      const date = h.date;
      const label = (h.label || "").trim();
      byDate.set(date, { date, label });
    });

    const normalized = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    try {
      const { data: oldData, error: oldErr } = await supabase
        .from("public_holidays")
        .select("date");
      if (oldErr) throw oldErr;

      const oldDates = new Set((oldData || []).map((row) => row.date));
      const newDates = new Set(normalized.map((row) => row.date));
      const toDelete = [...oldDates].filter((d) => !newDates.has(d));

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("public_holidays")
          .delete()
          .in("date", toDelete);
        if (delErr) throw delErr;
      }

      if (normalized.length > 0) {
        const { error: upsertErr } = await supabase
          .from("public_holidays")
          .upsert(normalized);
        if (upsertErr) throw upsertErr;
      }

      setPublicHolidays(normalized);
    } catch (err) {
      // ✅ 저장 실패 → 화면 값을 서버 값으로 되돌림
      fetchPublicHolidaysFromServer().catch(() => {});
      console.error("[Supabase] public_holidays 저장 에러:", err);
      window.alert(
        "공휴일 날짜 목록을 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
    }
  };

  /* =========================
   *  관리자 메모 (서버 먼저)
   * ========================= */

  const handleChangeAdminNote = async (dateKey, text) => {
    if (!currentUser || !dateKey) return;

    const trimmed = (text || "").trim();
    const nowIso = new Date().toISOString();

    try {
      if (!trimmed) {
        const { error } = await supabase
          .from("admin_day_notes")
          .delete()
          .eq("date", dateKey);
        if (error) throw error;

        setAdminNotesByDate((prev) => {
          const { [dateKey]: _, ...rest } = prev;
          return rest;
        });
      } else {
        const payload = {
          date: dateKey,
          note: trimmed,
          updated_at: nowIso,
          updated_by_name: currentUser.name,
        };

        const { data, error } = await supabase
          .from("admin_day_notes")
          .upsert(payload)
          .select("*")
          .single();

        if (error) throw error;

        setAdminNotesByDate((prev) => ({
          ...prev,
          [data.date]: data.note || "",
        }));
      }
      return true;
    } catch (err) {
      console.error("[Supabase] admin_day_notes 저장 에러:", err);
      window.alert(
        "관리자 메모를 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
      return false;
    }
  };

  /* =========================
   *  휴가 저장 / 취소 / 순번 / 확인자 (서버 먼저)
   * ========================= */

  /* =========================
   *  ✅ 서버 기준 하루 명단 / 순번 / 짝 비번 헬퍼
   * ========================= */
  const isNightDiaValue = (dia) => {
    const n =
      typeof dia === "number"
        ? dia
        : /^\d+$/.test(String(dia ?? "")) ? Number(dia) : null;
    return (
      typeof n === "number" &&
      n >= nightRule.nightStartDia &&
      n <= nightRule.diaCount
    );
  };

  // 이 DIA로 휴가를 내면 다음 날 생기는 비번의 DIA (없으면 null)
  const pairDiaFor = (dia) => {
    if (dia == null || dia === "") return null;
    if (isNightDiaValue(dia)) return `${Number(dia)}비번`;
    const s = String(dia);
    if (["대5", "대6", "대기5", "대기6"].includes(s)) return `${s}(비번)`;
    return null;
  };

  const fetchDayFresh = async (dateKey) => {
    const { data, error } = await supabase
      .from("vac_entries")
      .select("*")
      .eq("date", dateKey);
    if (error) throw error;
    const list = (data || []).map(mapVacRowToEntry).filter(Boolean);
    return normalizeEntriesByDate({ [dateKey]: list })[dateKey] || [];
  };

  // 순번(seq_no)이 바뀐 행만 저장 — 다른 칸은 절대 안 건드림
  // 순번 저장
  //  DB 트리거(vac_compact_seq_no)가 저장할 때마다 그날 순번을 1,2,3…으로 다시 매김
  //  (같은 번호면 신청 시각 순). 그래서 두 사람 번호를 하나씩 바꾸면 중간에 되돌아감.
  //  → 바뀌기 시작하는 자리부터 "원하는 순서대로 한 명씩 맨 뒤로 보내기"로 저장
  //    (한 번에 한 명만, 겹치는 번호 없이 움직이므로 트리거가 있어도 없어도 결과가 같음)
  const writeSeqChanges = async (beforeList, afterList) => {
    const isLive = (e) => e.status === "active" && !e.excludeFromCount;
    const want = afterList.filter(isLive).map((e) => e.id);
    const haveList = beforeList.filter(isLive);
    const have = haveList.map((e) => e.id);
    // 순서가 다르거나, 번호가 1,2,3…이 아닌(비어 있는 옛 데이터 등) 첫 자리부터 다시 저장
    let k = 0;
    while (
      k < want.length &&
      want[k] === have[k] &&
      Number(haveList[k]?.seqNo) === k + 1
    )
      k++;
    if (k >= want.length) return; // 순서·번호 그대로

    const check = (r) => {
      if (r.error) throw r.error;
      if (Array.isArray(r.data) && r.data.length === 0) {
        throw new Error("서버가 순번 저장을 받아들이지 않았습니다 (반영된 줄 없음)");
      }
    };
    for (let i = k; i < want.length; i++) {
      check(
        await supabase
          .from("vac_entries")
          .update({ seq_no: 100000 + i })
          .eq("id", want[i])
          .select("id")
      );
    }

    // 트리거가 없는 DB라면 큰 번호가 그대로 남으므로 1,2,3…으로 정리
    const { data, error } = await supabase
      .from("vac_entries")
      .select("id,seq_no,status,exclude_from_count")
      .eq("date", (afterList[0] || beforeList[0])?.date);
    if (error) throw error;
    const rows = (data || []).filter(
      (r) => (r.status || "active") === "active" && !r.exclude_from_count
    );
    if (rows.some((r) => Number(r.seq_no) >= 100000)) {
      for (let i = 0; i < want.length; i++) {
        const row = rows.find((r) => r.id === want[i]);
        if (!row || Number(row.seq_no) === i + 1) continue;
        check(
          await supabase
            .from("vac_entries")
            .update({ seq_no: i + 1 })
            .eq("id", want[i])
            .select("id")
        );
      }
    }
  };

  const resequenceDayOnServer = async (dateKey) => {
    const fresh = await fetchDayFresh(dateKey);
    const after = resequence(fresh);
    await writeSeqChanges(fresh, after);
    return after;
  };

  // 서버에서 받은 하루 명단으로 화면 상태 교체
  const applyDayToState = (dateKey, list) => {
    setEntriesByDate((prev) => ({ ...prev, [dateKey]: list }));
    setMyEntriesByDate((prev) => {
      const mine =
        currentUser?.role === "admin"
          ? list
          : list.filter(
              (e) =>
                e.applicantId === currentUser?.id ||
                e.applicantName === currentUser?.name
            );
      if (!prev[dateKey] && mine.length === 0) return prev;
      return { ...prev, [dateKey]: mine };
    });
  };

  // 야간/대기 휴가 저장 후 다음 날 비번 짝 맞추기
  //  - 짝이 있고 여전히 야간/대기 → 짝도 같이 수정
  //  - 짝이 있는데 주간으로 바뀜 → 짝 취소
  //  - 짝이 없고 야간/대기 → 새로 만듦 (같은 비번이 이미 있으면 안 만듦)
  const syncPairAfterSave = async (before, saved) => {
    const nextKey = addDaysToIso(saved.date, 1);
    const oldPairDia = before ? pairDiaFor(before.dia) : null;
    const newPairDia = pairDiaFor(saved.dia);
    if (!oldPairDia && !newPairDia) return null;

    const nextFresh = await fetchDayFresh(nextKey);
    const oldName = before?.applicantName ?? saved.applicantName;
    const existing = oldPairDia
      ? nextFresh.find(
          (e) =>
            e.status === "active" &&
            e.applicantName === oldName &&
            String(e.dia) === oldPairDia
        )
      : null;

    const now = new Date().toISOString();
    const isNight = isNightDiaValue(saved.dia);
    const autoNote = isNight ? "(야간 비번 자동 생성)" : "(대기 비번 자동 생성)";
    const note = saved.note ? `${saved.note} / ${autoNote}` : autoNote;
    const leaveType = isNight ? saved.leaveType || "비번" : saved.leaveType;

    if (existing && newPairDia) {
      await updateVacEntryFieldsOnSupabase(existing.id, {
        applicant_id: saved.applicantId || null,
        applicant_name: saved.applicantName,
        leave_type: leaveType,
        reason: saved.reason || "",
        dia: newPairDia,
        note,
        exclude_from_count: !!saved.excludeFromCount,
        last_action_type: "updated",
        last_action_at: now,
        last_action_by_name: currentUser.name,
      });
      return { action: "updated", leaveType, applicantName: saved.applicantName };
    }

    if (existing && !newPairDia) {
      await updateVacEntryFieldsOnSupabase(existing.id, {
        status: "cancelled",
        seq_no: null,
        last_action_type: "cancelled",
        last_action_at: now,
        last_action_by_name: currentUser.name,
      });
      return { action: "cancelled", leaveType: existing.leaveType, applicantName: existing.applicantName };
    }

    // 짝 비번만 따로 취소해 둔 경우: 야간 휴가의 메모 등만 고쳤으면 비번을 다시 만들지 않음
    if (
      before &&
      oldPairDia &&
      oldPairDia === newPairDia &&
      oldName === saved.applicantName &&
      before.date === saved.date
    ) {
      return { action: "skipped", leaveType, applicantName: saved.applicantName };
    }

    // 새로 만들기
    const samePairExists = nextFresh.some(
      (e) =>
        e.status === "active" &&
        e.applicantName === saved.applicantName &&
        String(e.dia) === newPairDia
    );
    const otherExists =
      currentUser.role !== "admin" &&
      nextFresh.some(
        (e) => e.status === "active" && e.applicantName === saved.applicantName
      );
    if (samePairExists || otherExists) {
      return { action: "skipped", leaveType, applicantName: saved.applicantName };
    }

    await upsertVacEntryOnSupabase({
      id: genId(),
      date: nextKey,
      applicantId: saved.applicantId,
      applicantName: saved.applicantName,
      leaveType,
      reason: saved.reason || "",
      note,
      dia: newPairDia,
      seqNo: null,
      approverName: "",
      status: "active",
      createdAt: now,
      lastActionType: "created",
      lastActionAt: now,
      lastActionByName: currentUser.name,
      createdByName: currentUser.name,
      excludeFromCount: !!saved.excludeFromCount,
    });
    return { action: "created", leaveType, applicantName: saved.applicantName };
  };

  const handleSaveEntry = async (payload) => {
    if (!currentUser) return;
    if (!currentDateKey) return;

    const iso = currentDateKey;

    const targetApplicantId = payload.applicantId || currentUser.id;
    const targetApplicantName = payload.applicantName || currentUser.name;
    const leaveMeta = leaveTypes.find((t) => t.label === payload.leaveType);
    const isExcludedType = !!leaveMeta?.excludeFromCount;

    const holidaySetForSummary = new Set(
      (publicHolidays || []).map((h) => h.date)
    );

    const todaySummary = buildDaySummaryForDate(
      iso,
      entriesByDate,
      slotConfig,
      slotOverridesByDate,
      holidaySetForSummary,
      plusOneOverridesByDate // ✅ 추가
    );

    const diaNum =
      typeof payload.dia === "number"
        ? payload.dia
        : /^\d+$/.test(String(payload.dia || ""))
        ? Number(payload.dia)
        : null;

    const isNightDiaCandidate =
      typeof diaNum === "number" &&
      diaNum >= nightRule.nightStartDia &&
      diaNum <= nightRule.diaCount;

    let nextDateIso = null;
    let nextSummary = null;
    if (isNightDiaCandidate) {
      nextDateIso = addDaysToIso(iso, 1);
      nextSummary = buildDaySummaryForDate(
        nextDateIso,
        entriesByDate,
        slotConfig,
        slotOverridesByDate,
        holidaySetForSummary,
        plusOneOverridesByDate // ✅ 추가
      );
    }

    let confirmMsg = "이 내용으로 휴가를 저장할까요?";

    if (todaySummary && todaySummary.usedCount >= todaySummary.capacity) {
      confirmMsg += `\n\n⚠️ ${iso} 기준 정원 ${todaySummary.capacity}명 / 사용 ${todaySummary.usedCount}명으로 이미 정원이 가득 찬 상태입니다.`;
    }

    if (
      isNightDiaCandidate &&
      nextSummary &&
      nextSummary.usedCount >= nextSummary.capacity
    ) {
      confirmMsg += `\n\n⚠️ 이번 휴가를 야간 DIA로 저장하면 다음날(${nextDateIso}) 자동 생성되는 비번으로 인해\n정원 ${nextSummary.capacity}명 / 사용 ${nextSummary.usedCount}명 기준으로 자리가 초과될 수 있습니다.`;
    }

    if (!window.confirm(confirmMsg)) return false; // 작성 폼 그대로 유지

    const nowIso = new Date().toISOString();
    const nextKey = addDaysToIso(iso, 1);

    try {
      // 서버의 그날 최신 명단 기준으로 처리 (내 폰에 남은 옛 명단으로 덮어쓰지 않음)
      const dayFresh = await fetchDayFresh(iso);

      let before = null;
      let savedMain;

      if (payload.id) {
        before = dayFresh.find((e) => e.id === payload.id);
        if (before && before.status !== "active") {
          window.alert("이 휴가는 그 사이 취소되었습니다.\n화면을 최신으로 바꿨습니다.");
          applyDayToState(iso, dayFresh);
          return;
        }
        if (!before) {
          window.alert(
            "기존 휴가 데이터를 찾을 수 없습니다.\n다른 사람이 먼저 바꿨을 수 있어요. 새로고침 후 다시 시도해 주세요."
          );
          applyDayToState(iso, dayFresh);
          return;
        }
        const afterDia = payload.dia;
        if (leaveMeta?.onlyDay && isNightDiaValue(afterDia)) {
          window.alert(
            `이 휴가 종류는 야간 다이아에는 사용할 수 없습니다.\n(야간 기준: DIA ≥ ${nightRule.nightStartDia})`
          );
          return false;
        }
        // ✅ 바뀐 칸만 저장 (상태·확인자·순번은 건드리지 않음)
        savedMain = await updateVacEntryFieldsOnSupabase(payload.id, {
          applicant_id: targetApplicantId || null,
          applicant_name: targetApplicantName,
          leave_type: payload.leaveType,
          reason: payload.reason,
          dia: afterDia == null || afterDia === "" ? null : String(afterDia),
          note: payload.note,
          exclude_from_count: isExcludedType,
          last_action_type: "updated",
          last_action_at: nowIso,
          last_action_by_name: currentUser.name,
        });
      } else {
        if (currentUser.role !== "admin") {
          const alreadyMine = dayFresh.some(
            (e) =>
              e.applicantName === targetApplicantName && e.status === "active"
          );
          if (alreadyMine) {
            window.alert(
              "이미 이 날짜에 등록한 휴가가 있습니다.\n" +
                "같은 사람은 같은 날에 한 건만 작성할 수 있어요.\n" +
                "기존 항목을 수정하거나 취소만 가능합니다."
            );
            applyDayToState(iso, dayFresh);
            return;
          }
        }
        if (leaveMeta?.onlyDay && isNightDiaValue(payload.dia)) {
          window.alert(
            `이 휴가 종류는 야간 다이아에는 사용할 수 없습니다.\n(야간 기준: DIA ≥ ${nightRule.nightStartDia})`
          );
          return false;
        }
        savedMain = await upsertVacEntryOnSupabase({
          id: genId(),
          date: iso,
          applicantId: targetApplicantId,
          applicantName: targetApplicantName,
          leaveType: payload.leaveType,
          seqNo: null,
          reason: payload.reason,
          dia: payload.dia,
          note: payload.note,
          approverName: "",
          status: "active",
          createdAt: nowIso,
          lastActionType: "created",
          lastActionAt: nowIso,
          lastActionByName: currentUser.name,
          createdByName: currentUser.name,
          excludeFromCount: isExcludedType,
        });
      }

      // ✅ 야간/대기 휴가 ↔ 다음 날 비번 짝 맞추기 + 순번 정리
      //    (휴가 자체는 이미 저장됨 → 여기서 실패하면 "다시 저장"하지 말라고 안내)
      let pairResult = null;
      try {
        pairResult = await syncPairAfterSave(before, savedMain);
        applyDayToState(iso, await resequenceDayOnServer(iso));
        if (pairResult) applyDayToState(nextKey, await resequenceDayOnServer(nextKey));
      } catch (afterErr) {
        console.error("[Supabase] 저장 후 정리 에러:", afterErr);
        window.alert(
          "휴가는 저장됐지만 순번·다음 날 비번 정리 중 오류가 났습니다.\n" +
            "다시 저장하지 말고 위쪽 ↻ 버튼으로 새로고침해 확인해 주세요."
        );
        try {
          applyDayToState(iso, await fetchDayFresh(iso));
        } catch {
          /* ignore */
        }
        return;
      }

      if (pairResult?.action === "skipped") {
        window.alert(
          `다음 날(${nextKey})에 이미 ${savedMain.applicantName}님의 휴가가 있어서\n비번은 자동으로 만들지 않았습니다.`
        );
      }

      try {
        const logsToAdd = [];
        logsToAdd.push(
          await insertLogToSupabase({
            action: payload.id ? "updated" : "created",
            actorId: currentUser.id,
            actorName: currentUser.name,
            targetDate: iso,
            leaveType: savedMain.leaveType,
            applicantName: savedMain.applicantName,
          })
        );
        if (pairResult && pairResult.action !== "skipped") {
          logsToAdd.push(
            await insertLogToSupabase({
              action: pairResult.action,
              actorId: currentUser.id,
              actorName: currentUser.name,
              targetDate: nextKey,
              leaveType: (pairResult.leaveType || "비번") + "(야간 자동)",
              applicantName: pairResult.applicantName,
            })
          );
        }
        setLogs((prev) => [...prev, ...logsToAdd]);
      } catch (logErr) {
        console.error("[Supabase] vac_logs insert 에러:", logErr);
        window.alert(
          "휴가 저장은 완료되었지만, 로그 기록 저장 중 오류가 발생했습니다.\n관리자에게 문의해 주세요."
        );
      }
    } catch (err) {
      console.error("[Supabase] vac_entries 저장 에러:", err);
      window.alert(
        "서버에 휴가를 저장하는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요."
      );
      // 화면은 서버 상태로 맞춰 둠
      try {
        applyDayToState(iso, await fetchDayFresh(iso));
      } catch {
        /* ignore */
      }
      return false; // 저장 실패 → 작성 폼 그대로 유지 (다시 시도 가능)
    }
    return true;
  };

  /* ========== 휴가 취소 (내 것 한 건만 바꾸고, 순번은 서버 명단으로 다시 매김) ========== */

  const handleCancelEntry = async (entryId) => {
    if (!currentUser) return;

    let found = null;
    let foundDateKey = null;

    Object.entries(entriesByDate).forEach(([dateKey, list]) => {
      if (found) return;
      const e = list.find((x) => x.id === entryId);
      if (e) {
        found = e;
        foundDateKey = dateKey;
      }
    });

    if (!found || !foundDateKey) {
      window.alert("데이터를 찾을 수 없습니다.");
      return;
    }

    const lockDays = lockRule?.lockDaysBefore ?? 0;
    if (currentUser.role !== "admin" && lockDays > 0) {
      const diffDays = getDiffInDaysFromToday(foundDateKey);
      if (diffDays <= lockDays) {
        window.alert(`D-${lockDays}부터는 취소할 수 없습니다.`);
        return;
      }
    }

    try {
      const fresh = await fetchDayFresh(foundDateKey);
      const target = fresh.find((e) => e.id === entryId);
      if (!target || target.status === "cancelled") {
        applyDayToState(foundDateKey, fresh);
        window.alert(
          target ? "이미 취소된 휴가입니다." : "이미 지워졌거나 찾을 수 없는 휴가입니다."
        );
        return;
      }

      // 짝 비번 찾기 (같은 사람 + 다음 날 + 맞는 비번 DIA)
      const pairDia = pairDiaFor(target.dia);
      const nextKey = addDaysToIso(foundDateKey, 1);
      let pair = null;
      if (pairDia) {
        const nextFresh = await fetchDayFresh(nextKey);
        pair =
          nextFresh.find(
            (e) =>
              e.status === "active" &&
              e.applicantName === target.applicantName &&
              String(e.dia) === pairDia
          ) || null;
      }
      if (
        pair &&
        !window.confirm(
          `다음 날(${nextKey}) ${pairDia}도 함께 취소됩니다.\n계속할까요?`
        )
      ) {
        return;
      }

      const nowIso = new Date().toISOString();
      const cancelPatch = {
        status: "cancelled",
        seq_no: null,
        last_action_type: "cancelled",
        last_action_at: nowIso,
        last_action_by_name: currentUser.name,
      };

      await updateVacEntryFieldsOnSupabase(entryId, cancelPatch);
      if (pair) await updateVacEntryFieldsOnSupabase(pair.id, cancelPatch);

      applyDayToState(foundDateKey, await resequenceDayOnServer(foundDateKey));
      if (pair) applyDayToState(nextKey, await resequenceDayOnServer(nextKey));

      try {
        const logsToAdd = [
          await insertLogToSupabase({
            action: "cancelled",
            actorId: currentUser.id,
            actorName: currentUser.name,
            targetDate: foundDateKey,
            leaveType: target.leaveType,
            applicantName: target.applicantName,
          }),
        ];
        if (pair) {
          logsToAdd.push(
            await insertLogToSupabase({
              action: "cancelled",
              actorId: currentUser.id,
              actorName: currentUser.name,
              targetDate: nextKey,
              leaveType: (pair.leaveType || "비번") + "(야간 자동)",
              applicantName: pair.applicantName,
            })
          );
        }
        setLogs((prev) => [...prev, ...logsToAdd]);
      } catch (logErr) {
        console.error("[Supabase] vac_logs insert 에러:", logErr);
      }
    } catch (err) {
      console.error("서버 업데이트 실패:", err);
      window.alert("서버에 취소를 저장하지 못했습니다. 다시 시도해주세요.");
      try {
        applyDayToState(foundDateKey, await fetchDayFresh(foundDateKey));
      } catch {
        /* ignore */
      }
    }
  };

  /* ========== 관리자 순번 이동 (서버 최신 명단 기준, 바뀐 순번만 저장) ========== */
  // 같은 목록에서 한 칸 위/아래로 옮긴 결과 (정원 제외·취소는 건드리지 않음)
  const moveInList = (list, entryId, direction) => {
    const newList = [...list];
    const activeIdxs = [];
    newList.forEach((e, idx) => {
      if (e.status === "active" && !e.excludeFromCount) activeIdxs.push(idx);
    });
    const currentIdx = newList.findIndex((e) => e.id === entryId);
    const pos = activeIdxs.indexOf(currentIdx);
    if (currentIdx === -1 || pos === -1) return null;
    const swapWithIdx =
      direction === "up"
        ? pos > 0
          ? activeIdxs[pos - 1]
          : null
        : pos < activeIdxs.length - 1
        ? activeIdxs[pos + 1]
        : null;
    if (swapWithIdx == null) return null;
    [newList[currentIdx], newList[swapWithIdx]] = [
      newList[swapWithIdx],
      newList[currentIdx],
    ];
    return resequence(newList);
  };

  // 순번 이동: 화면은 바로 바뀌고, 서버 저장은 누른 순서대로 하나씩 (빨리 여러 번 눌러도 안 꼬이게)
  const entriesRef = useRef(entriesByDate);
  entriesRef.current = entriesByDate;
  const reorderQueueRef = useRef(Promise.resolve());
  const reorderPendingRef = useRef(0);

  const handleAdminReorder = (dateKey, entryId, direction) => {
    if (!currentUser || currentUser.role !== "admin") return;

    // 1) 화면 먼저 바꿈
    const local = moveInList(entriesRef.current[dateKey] || [], entryId, direction);
    if (!local) return;
    entriesRef.current = { ...entriesRef.current, [dateKey]: local };
    applyDayToState(dateKey, local);

    // 2) 서버 저장 (앞에 누른 것 끝난 뒤, 서버 최신 명단 기준으로)
    reorderPendingRef.current += 1;
    reorderQueueRef.current = reorderQueueRef.current
      .then(async () => {
        const fresh = await fetchDayFresh(dateKey);
        const updated = moveInList(fresh, entryId, direction);
        if (updated) await writeSeqChanges(fresh, updated);
      })
      .catch(async (err) => {
        console.error("[Supabase] vac_entries 순번 조정 에러:", err);
        window.alert(
          "서버에 순번 변경을 저장하지 못했습니다.\n" +
            (err?.message ? `(${err.message})\n` : "") +
            "화면을 서버 기준으로 되돌립니다."
        );
      })
      .finally(async () => {
        reorderPendingRef.current -= 1;
        // 누른 것을 다 저장한 뒤에만 서버 기준으로 화면 맞춤 (중간에 깜빡이지 않게)
        if (reorderPendingRef.current === 0) {
          try {
            const finalList = await fetchDayFresh(dateKey);
            if (reorderPendingRef.current === 0) {
              entriesRef.current = { ...entriesRef.current, [dateKey]: finalList };
              applyDayToState(dateKey, finalList);
            }
          } catch {
            /* ignore */
          }
        }
      });
  };

  const handleToggleApprove = async (entryId) => {
    if (!currentUser) return;

    let found = null;
    let foundDateKey = null;

    Object.entries(entriesByDate).forEach(([dateKey, list]) => {
      if (found) return;
      const e = list.find((x) => x.id === entryId);
      if (e) {
        found = e;
        foundDateKey = dateKey;
      }
    });

    if (!found || !foundDateKey) {
      window.alert(
        "대상 휴가 데이터를 찾을 수 없습니다.\n페이지를 새로고침 해 주세요."
      );
      return;
    }

    const willApprove = !found.approverName;
    const nowIso = new Date().toISOString();

    const newApproverName = willApprove ? currentUser.name : "";
    const newApproverAt = willApprove ? nowIso : null;

    let saved;
    try {
      saved = await updateVacEntryFieldsOnSupabase(entryId, {
        approver_name: newApproverName || null,
        approver_at: newApproverAt,
      });
    } catch (err) {
      console.error("[Supabase] vac_entries approve update 에러:", err);
      window.alert(
        "Supabase에서 확인자 정보를 저장하는 중 오류가 발생했습니다.\n화면 내용은 변경하지 않았습니다."
      );
      return;
    }

    setEntriesByDate((prev) => {
      const list = prev[foundDateKey] || [];
      const idx = list.findIndex((e) => e.id === entryId);
      if (idx === -1) return prev;

      const newList = [...list];
      newList[idx] = saved;
      return {
        ...prev,
        [foundDateKey]: newList,
      };
    });

    setMyEntriesByDate((prev) => {
      const list = prev[foundDateKey] || null;
      if (!list) return prev;
      const idx = list.findIndex((e) => e.id === entryId);
      if (idx === -1) return prev;
      const newList = [...list];
      newList[idx] = saved;
      return { ...prev, [foundDateKey]: newList };
    });
  };

  const selectedEntries =
    currentDateKey && entriesByDate[currentDateKey]
      ? entriesByDate[currentDateKey].slice()
      : [];

  /* =========================
   *  로그인 전
   * ========================= */
  if (!currentUser) {
    return (
      <div className="app">
        <LoginView
          users={userList}
          onLogin={handleLogin}
          onChangePassword={handleChangePassword}
          onVerify={verifyLogin}
        />
      </div>
    );
  }

  /* =========================
   *  메인 UI
   * ========================= */

  return (
    <div className={"app" + (selectedDate ? " app--side-open" : "")}>
      <header className="app-header">
        <div className="header-title">🗓 휴가 장부</div>
        {isPc && (
          <nav className="pc-nav" aria-label="메뉴">
            {tabDefs.map(([key, label]) => (
              <button
                key={key + label}
                className={"tab-btn pc-nav-btn " + (activeTab === key ? "tab-btn-active" : "")}
                onClick={() => goTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="header-right">
          {currentUser.role === "admin" && (
            <button
              className="header-sheet-btn"
              onClick={() => window.open(GOOGLE_SHEET_URL, "_blank")}
            >
              📊<span className="hdr-label"> 시트</span>
            </button>
          )}
          <UiSizeButton />
          <button
            className="header-refresh-btn"
            onClick={() => refreshAllFromServer(true)}
            disabled={isRefreshing}
          >
            {isRefreshing ? "⏳" : "↻"}
          </button>
          <span className="header-user">
            <span className="header-user-name">{currentUser.name}</span>
            {currentUser.role === "admin" && (
              <span
                className="header-user-badge"
                style={{
                  marginLeft: 3,
                  fontSize: "0.7rem",
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "1px 6px",
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                관리자
              </span>
            )}
          </span>
          <button className="header-logout-btn" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {/* 탭 (휴대폰) — PC는 위쪽 헤더에 표시 */}
          {!isPc && (
            <div className="tab-bar">
              {tabDefs.map(([key, label]) => (
                <button
                  key={key + label}
                  className={"tab-btn " + (activeTab === key ? "tab-btn-active" : "")}
                  onClick={() => goTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 탭 내용 */}
          <div
            className={
              "tab-content " +
              (activeTab === "gyobeon"
                ? "tab-content--gyobeon"
                : activeTab === "calendar"
                ? "tab-content--calendar"
                : activeTab === "logs" || activeTab === "my" || activeTab === "hyu"
                ? "tab-content--logs"
                : "tab-content--admin")
            }
          >
            {activeTab === "logs" && (
              <LogsPanel
                logs={logs}
                onLoadMore={loadMoreLogs}
                hasMore={logsHasMore}
                isLoadingMore={isLogsLoadingMore}
              />
            )}

            {activeTab === "hyu" && (
              <HyuPanel
                currentUser={currentUser}
                shiftConfig={shiftConfig}
                shiftRows={shiftRows}
                publicHolidays={publicHolidays}
                refreshTick={hyuRefreshTick}
                onRequestRefresh={() => refreshAllFromServer(false)}
              />
            )}

            {activeTab === "calendar" && (
              <CalendarView
                baseDate={baseDate}
                selectedDate={selectedCalendarDate}
                onSelectDate={(date) =>
                  setSelectedCalendarDate(stripTime(date))
                }
                onDayDoubleTap={handleDayDoubleTap}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onSelectYearMonth={handleSelectYearMonth}
                daySummaryMap={daySummaryMap}
                onJumpToday={handleJumpToday}
                currentUser={currentUser}
                shiftConfig={shiftConfig}
                shiftRows={shiftRows}
              />
            )}

            {activeTab === "my" && (
              <MyLedgerPanel
                currentUser={currentUser}
                entriesByDate={myEntriesByDate} // ✅ 내 탭은 "내 것 전체" 데이터 사용
                daySummaryMap={daySummaryMap}
                selectedDate={selectedDate}
                onOpenDate={handleOpenDateFromList}
                isLoading={isMyLoading} // ✅ (MyLedgerPanel이 props 받으면 로딩 표시 가능)
              />
            )}

            {activeTab === "gyobeon" && (
              <GyobeonFrame />
            )}

            {activeTab === "admin" && currentUser.role === "admin" && (
              <AdminPanel
                userList={userList}
                currentUser={currentUser}
                onChangePassword={handleChangePassword}
                onAddUser={handleAddUser}
                onDeleteUser={handleDeleteUser}
                onChangeUserRole={handleChangeUserRole}
                slotConfig={slotConfig}
                onChangeSlotConfig={handleChangeSlotConfig}
                onSaveSlotConfig={handleSaveSlotConfigToServer}
                publicHolidays={publicHolidays}
                onChangePublicHolidays={handleChangePublicHolidays}
                onSavePublicHolidays={handleSavePublicHolidaysToServer}
                leaveTypes={leaveTypes}
                onChangeLeaveTypes={handleChangeLeaveTypes}
                nightRule={nightRule}
                onChangeNightRule={handleChangeNightRule}
                onSaveNightRule={handleSaveNightRuleToServer}
                nightOffDiaList={nightOffDiaList}
                entriesByDate={entriesByDate}
                slotOverridesByDate={slotOverridesByDate}
                onChangeSlotOverrideForDate={handleChangeSlotOverrideForDate}
                lockRule={lockRule}
                onChangeLockRule={handleChangeLockRule}
                onSaveLockRule={handleSaveLockRuleToServer}
                onRefreshAll={refreshAllFromServer}
                isRefreshing={isRefreshing}
                shiftConfig={shiftConfig}
                shiftRows={shiftRows}
                shiftLoaded={shiftLoaded}
                onSaveShiftConfig={handleSaveShiftConfig}
                shiftPublicHolidays={publicHolidays}
                onOpenDate={handleOpenDateFromList}
              />
            )}
          </div>
        </div>
      </main>

      {selectedDate && (
        <DayLedgerModal
          date={selectedDate}
          dateKey={currentDateKey}
          entries={selectedEntries}
          currentUser={currentUser}
          userList={userList}
          leaveTypes={leaveTypes}
          nightRule={nightRule}
          nightOffDiaList={nightOffDiaList}
          daySummary={selectedDaySummary}
          onSaveEntry={handleSaveEntry}
          onCancelEntry={handleCancelEntry}
          onToggleApprove={handleToggleApprove}
          onAdminReorder={handleAdminReorder}
          onClose={() => setSelectedDate(null)}
          adminNote={adminNotesByDate[currentDateKey] || ""}
          onChangeAdminNote={handleChangeAdminNote}
          publicHolidays={publicHolidays}
          shiftConfig={shiftConfig}
          shiftRows={shiftRows}
          plusOneOverride={
            currentDateKey ? plusOneOverridesByDate[currentDateKey] : undefined
          }
          onChangePlusOneOverride={handleChangePlusOneOverride}
        />
      )}
    </div>
  );
}
