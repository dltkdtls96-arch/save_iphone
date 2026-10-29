// /project/workspace/src/App.jsx
import React, { useEffect, useMemo, useState, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { AlarmCheckIcon, Route as RouteIcon } from "lucide-react";
import WakeIcsPanel from "./components/WakeIcsPanel";
import WakeMidPanel from "./components/WakeMidPanel";
import "./App.css";
import {
  loadZipToCommonMap,
  loadCommonDataFromDB,
  saveCommonDataToDB,
  saveZipBlobToDB,
  tsvRowsToCommon,
  loadPathsIntoCommon,
  restoreZipHandleFromDB,
  DEPOT_TO_ZIP_KEY,
  rebaseDepotToToday,
  resetAllStorage,
  repairCommonMapFromZipBlob,
  normalizeCommonWorktime,
  fetchKoreanHolidaysDetailed,
} from "./dataEngine";
import SetupWizard from "./components/SetupWizard";
import { buildTemplates, applyOverride } from "./overrideEngine";
import {
  KR_HOLIDAYS,
  HOLIDAY_DEFAULTS_VERSION,
  HOLIDAY_ADDED_BY_VERSION,
  mergeHolidayText,
} from "./holidays";
import PersonEditModal from "./components/PersonEditModal";
import { RouteImageView, tsvDiaToRouteCode } from "./components/routeImage";

const SettingsView = React.lazy(() => import("./SettingsView"));

function usePortraitOnly() {
  const getPortrait = () =>
    typeof window !== "undefined"
      ? window.matchMedia?.("(orientation: portrait)")?.matches ??
        window.innerHeight >= window.innerWidth
      : true;
  const [isPortrait, setIsPortrait] = useState(getPortrait);
  useEffect(() => {
    const mm = window.matchMedia?.("(orientation: portrait)");
    const onChange = () => setIsPortrait(getPortrait());
    window.addEventListener("resize", onChange, { passive: true });
    window.addEventListener("orientationchange", onChange, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onChange, { passive: true });
    if (mm?.addEventListener) mm.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      vv?.removeEventListener("resize", onChange);
      if (mm?.removeEventListener) mm.removeEventListener("change", onChange);
    };
  }, []);
  useEffect(() => {
    if (!isPortrait) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [isPortrait]);
  return isPortrait;
}

function LandscapeOverlay() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black text-white"
      style={{ touchAction: "none" }}
    >
      <div className="px-6 py-5 text-center">
        <div className="text-2xl font-semibold mb-2">세로 모드만 지원해요</div>
        <div className="text-sm text-gray-300">기기를 세로로 돌려주세요.</div>
      </div>
    </div>
  );
}

import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  Settings,
  List,
  User,
  Users,
  Upload,
} from "lucide-react";
import PasswordGate from "./lock/PasswordGate";

const STORAGE_KEY = "workCalendarSettingsV3";

const DEPOTS = ["안심", "월배", "경산", "문양", "교대", "교대(외)"];

const defaultAnchorByDepot = {
  문양: "2025-10-01",
  월배: "2025-11-01",
  안심: "2025-10-01",
  경산: "2025-10-01",
  교대: "2025-09-29",
  "교대(외)": "2025-05-01",
};

const defaultBusMap = {
  안심: "/bus/timetable.png",
  월배: "/bus/wolbus.png",
  경산: "/bus/line2.png",
  문양: "/bus/line2.png",
  교대: "/bus/line2.png",
  "교대(외)": "/bus/line2.png",
};

const toDiaNum = (dia) => {
  const n = Number(dia);
  return Number.isFinite(n) ? n : NaN;
};
const getYesterday = (date) => {
  const t = new Date(date);
  t.setDate(t.getDate() - 1);
  return t;
};

function prevNightTag(yDiaNum, yPrevLabel, threshold) {
  if (Number.isFinite(yDiaNum) && yDiaNum >= threshold) return `${yDiaNum}~`;
  if (typeof yPrevLabel === "string") {
    const clean = yPrevLabel.replace(/\s/g, "").trim();
    const num = Number(clean.replace(/[^0-9]/g, ""));
    const prefix = clean.replace(/[0-9]/g, "");
    if (prefix === "대" && Number.isFinite(num)) return `대${num}~`;
  }
  return "비번";
}

function buildGyodaeTable() {
  const header =
    "순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근";
  const DAY_IN = "09:00",
    DAY_OUT = "18:00",
    NIGHT_IN = "18:00",
    NIGHT_OUT = "09:00";
  const rows = [];
  for (let i = 1; i <= 21; i++) {
    const isDay = i <= 7;
    const isNight = !isDay && (i - 8) % 2 === 0;
    const dia = isDay ? "주" : isNight ? "야" : "휴";
    let name = "";
    if (i === 1) name = "갑반";
    if (i === 8) name = "을반";
    if (i === 15) name = "병반";
    let wdIn = "",
      wdOut = "",
      saIn = "",
      saOut = "",
      hoIn = "",
      hoOut = "";
    if (dia === "주") {
      wdIn = saIn = hoIn = DAY_IN;
      wdOut = saOut = hoOut = DAY_OUT;
    } else if (dia === "야") {
      wdIn = saIn = hoIn = NIGHT_IN;
      wdOut = saOut = hoOut = NIGHT_OUT;
    }
    rows.push([i, name, dia, wdIn, wdOut, saIn, saOut, hoIn, hoOut].join("\t"));
  }
  return [header, ...rows].join("\n");
}

function buildGyodaeExtTable() {
  const header =
    "순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근";
  const D_IN = "07:30",
    D_OUT = "19:00",
    N_IN = "18:30",
    N_OUT = "08:00";
  const rows = [
    [1, "A조", "주", D_IN, D_OUT, D_IN, D_OUT, D_IN, D_OUT],
    [2, "", "주", D_IN, D_OUT, D_IN, D_OUT, D_IN, D_OUT],
    [3, "B조", "야", N_IN, N_OUT, N_IN, N_OUT, N_IN, N_OUT],
    [4, "", "야", N_IN, N_OUT, N_IN, N_OUT, N_IN, N_OUT],
    [5, "C조", "비", "", "", "", "", "", ""],
    [6, "", "휴", "", "", "", "", "", ""],
  ];
  return [header, ...rows.map((r) => r.join("\t"))].join("\n");
}

// 기본 TSV 데이터 (기존과 동일하게 유지)
const defaultTableTSV = ``;

const SHUTTLE_HM = {};

function toHMorNull(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const hh = +m[1],
    mm = +m[2];
  if (hh < 0 || hh > 23) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function normalizeHM(v) {
  const s = String(v ?? "").trim();
  const hm = toHMorNull(s);
  if (hm) return hm;
  const mapped = SHUTTLE_HM[s.toLowerCase()];
  return mapped ? toHMorNull(mapped) : null;
}
function fmt(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function fmtWithWeekday(date) {
  const tz = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tz);
  const iso = local.toISOString().slice(0, 10);
  const weekday = weekdaysKR[(local.getDay() + 6) % 7];
  return `${iso} (${weekday})`;
}
function stripTime(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
// "YYYY-MM-DD" → 로컬 자정 Date (형식이 틀리면 null)
//  · <input type="date"> 를 비우면 "" 가 들어오는데, new Date("") 는
//    Invalid Date 라서 fmt() 에서 RangeError → 앱 전체가 하얗게 죽었음.
function parseYMD(v) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}
const TSV_HEADER =
  "순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근";
// 오늘로 재배치된 ZIP commonMap → TSV 사본 (IndexedDB 유실 시 폴백용)
function commonToTsv(c) {
  if (!c?.names?.length || !c?.gyobun?.length) return "";
  const rows = c.names.map((name, i) => {
    const code = c.gyobun[i] || "";
    const k = code.toLowerCase();
    const sp = (wt) => String(wt || "----").replace(/\s+/g, "").split("-");
    const [a1, a2] = sp(c.worktime?.nor?.[k]);
    const [b1, b2] = sp(c.worktime?.sat?.[k]);
    const [h1, h2] = sp(c.worktime?.hol?.[k]);
    return [i + 1, name, code.replace(/d$/i, ""), a1 || "", a2 || "", b1 || "", b2 || "", h1 || "", h2 || ""].join("\t");
  });
  return [TSV_HEADER, ...rows].join("\n");
}

// 기준일에 baseName 이 baseCode 교번을 받도록 하는 자리 보정값
function calcSeatShift(common) {
  if (!common?.names?.length || !common?.gyobun?.length) return 0;
  const norm = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
  const bn = common.baseName
    ? common.names.findIndex((n) => norm(n) === norm(common.baseName))
    : -1;
  const bc = common.baseCode
    ? common.gyobun.findIndex((c) => norm(c) === norm(common.baseCode))
    : -1;
  return bn >= 0 && bc >= 0 ? bc - bn : 0;
}
function diffDays(a, b) {
  return Math.floor((stripTime(a) - stripTime(b)) / 86400000);
}
function mod(n, m) {
  return ((n % m) + m) % m;
}
function addMonthsSafe(date, months) {
  const d = new Date(date);
  const cm = d.getMonth() + months;
  d.setMonth(cm);
  if (d.getMonth() !== ((cm % 12) + 12) % 12) d.setDate(0);
  return d;
}
function addDaysSafe(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return stripTime(d);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthGridSunday(date) {
  const y = date.getFullYear(),
    m = date.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(stripTime(d));
  }
  return cells;
}

const weekdaysKR = ["월", "화", "수", "목", "금", "토", "일"];
function startOfWeekMonday(d) {
  const day = (d.getDay() + 6) % 7;
  const x = new Date(d);
  x.setDate(d.getDate() - day);
  return x;
}
function monthGridMonday(selectedDate) {
  const start = startOfMonth(selectedDate);
  const firstMon = startOfWeekMonday(start);
  const days = [];
  let cur = new Date(firstMon);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const DEFAULT_HOLIDAYS_25_26 = KR_HOLIDAYS.join("\n");

function getDayType(date, holidaySet) {
  const dow = date.getDay();
  if (holidaySet.has(fmt(date))) return "휴";
  if (dow === 0) return "휴";
  if (dow === 6) return "토";
  return "평";
}

function parsePeopleTable(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(delim).map((s) => s.trim());
  const idx = (k) =>
    header.findIndex((h) => h.replace(/\s/g, "") === k.replace(/\s/g, ""));
  const iSeq = idx("순번"),
    iName = idx("이름"),
    iDia = idx("dia");
  const iWdIn = idx("평일출근"),
    iWdOut = idx("평일퇴근");
  const iSaIn = idx("토요일출근"),
    iSaOut = idx("토요일퇴근");
  const iHoIn = idx("휴일출근"),
    iHoOut = idx("휴일퇴근");
  const iPhone =
    idx("전화번호") >= 0
      ? idx("전화번호")
      : idx("전화") >= 0
      ? idx("전화")
      : idx("휴대폰") >= 0
      ? idx("휴대폰")
      : idx("phone");
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(delim);
    const diaRaw = (cols[iDia] || "").trim();
    const dia = /^\d+$/.test(diaRaw) ? Number(diaRaw) : diaRaw;
    rows.push({
      seq: (cols[iSeq] || "").trim(),
      name: (cols[iName] || "").trim(),
      dia,
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

function buildNameIndexMap(rows) {
  const m = new Map();
  rows.forEach((r, i) => {
    if (r.name) m.set(r.name, i);
  });
  return m;
}

// ─────────────────────────────────────────────
//  야간 판정 — worktime 기반 (threshold 폐기)
//
//  원칙:
//   • row.weekday/saturday/holiday 의 out 이 비어있으면 → 야간 출근
//   • row.*.in 이 비어있으면 → 야간에서 이어진 비번 자리 ("N~")
//   • 야간일 때 실제 퇴근 시간은 row.weekdayNext/saturdayNext/holidayNext
//     (= 다음 자리 교번의 worktime.out)
//
//  교대/교대(외) (TSV 기반) 는 dia 가 "주"/"야"/"비"/"휴" 라벨이라
//  아래 라벨 분기에서 먼저 처리됨 — worktime 자동 판정 대상 아님.
// ─────────────────────────────────────────────
function getDaySrc(row, date, holidaySet) {
  const tType = getDayType(date, holidaySet);
  const src =
    tType === "평" ? row.weekday : tType === "토" ? row.saturday : row.holiday;
  const next =
    tType === "평"
      ? row.weekdayNext
      : tType === "토"
      ? row.saturdayNext
      : row.holidayNext;
  return { tType, src: src || { in: "", out: "" }, next: next || null };
}

function computeInOut(row, date, holidaySet /* , nightDiaThreshold (무시) */) {
  if (!row)
    return {
      in: "-",
      out: "-",
      note: "데이터 없음",
      combo: "-",
      isNight: false,
    };

  // ── 라벨 기반 (교대/교대(외) TSV) ──
  if (typeof row.dia === "string") {
    const label = row.dia;
    const clean = label.replace(/\s/g, "");
    if (clean.includes("비번") || clean === "비")
      return { in: "-", out: "-", note: "비번", combo: "-", isNight: false };
    if (clean.startsWith("휴"))
      return { in: "-", out: "-", note: "휴무", combo: "-", isNight: false };
    if (label === "교육" || label === "휴가")
      return { in: "-", out: "-", note: label, combo: "-", isNight: false };
    if (label === "주" || label === "야") {
      const { tType, src } = getDaySrc(row, date, holidaySet);
      const isNight = label === "야";
      return {
        in: src.in || "-",
        out: src.out || "-",
        note: `${tType}${isNight ? " (야간)" : ""}`,
        combo: tType,
        isNight,
      };
    }
    // "N~" 형태 라벨 — 비번 자리
    if (/~$/.test(clean))
      return { in: "-", out: "-", note: "비번", combo: "-", isNight: false };
    // "대N" — 아래 worktime 로직으로 떨어뜨려서 자동 판정
  }

  // ── worktime 기반 자동 야간 판정 (ZIP 기지 전부 + 대N 포함) ──
  const { tType, src, next } = getDaySrc(row, date, holidaySet);

  // out 비었고 in 차있음 → 야간 출근
  const outEmpty = !src.out;
  const inEmpty = !src.in;

  if (outEmpty && !inEmpty) {
    // 야간. 퇴근 시간은 다음 자리 worktime.out 에서 가져오되, 다음날 dayType 기준.
    const tomorrow = new Date(date);
    tomorrow.setDate(date.getDate() + 1);
    const tomorrowType = getDayType(tomorrow, holidaySet);
    const nextSrc =
      tomorrowType === "평"
        ? row.weekdayNext
        : tomorrowType === "토"
        ? row.saturdayNext
        : row.holidayNext;
    const nightOut = nextSrc?.out || next?.out || "";
    const noteLabel =
      typeof row.dia === "string" && row.dia.startsWith("대")
        ? "대근·야간"
        : "야간";
    return {
      in: src.in,
      out: nightOut || "-",
      note: `${noteLabel} (${tType}-${tomorrowType})`,
      combo: `${tType}-${tomorrowType}`,
      isNight: true,
    };
  }

  // in 비었음 → 비번 자리 (야간 다음날). 출퇴근 표시 없음.
  if (inEmpty && !outEmpty) {
    return { in: "-", out: "-", note: "비번", combo: "-", isNight: false };
  }

  // 둘 다 비었거나 둘 다 차있으면 일반 주간.
  const noteLabel =
    typeof row.dia === "string" && row.dia.startsWith("대") ? "대근" : "";
  return {
    in: src.in || "-",
    out: src.out || "-",
    note: noteLabel ? `${noteLabel}·${tType}` : tType,
    combo: tType,
    isNight: false,
  };
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target.result || ""));
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function useDaySwipeHandlers() {
  const ref = React.useRef(null);
  const [dragX, setDragX] = React.useState(0);
  const [snapping, setSnapping] = React.useState(false);
  const stateRef = React.useRef({ x: 0, y: 0, lock: null });
  const lastRef = React.useRef({ x: 0, t: 0 });
  const TH = 40,
    VEL = 0.35,
    ACT = 14,
    DIR = 1.25,
    SNAP = 280;
  const onStart = (e) => {
    if (e.target.closest("[data-no-gesture]")) return;
    const t = e.touches[0];
    stateRef.current = { x: t.clientX, y: t.clientY, lock: null };
    lastRef.current = { x: t.clientX, t: performance.now() };
    setSnapping(false);
    setDragX(0);
  };
  const onMove = (e) => {
    if (e.target.closest("[data-no-gesture]")) return;
    const t = e.touches[0];
    const dx = t.clientX - stateRef.current.x,
      dy = t.clientY - stateRef.current.y;
    if (stateRef.current.lock === null) {
      if (Math.abs(dx) > Math.abs(dy) * DIR && Math.abs(dx) > ACT)
        stateRef.current.lock = "h";
      else if (Math.abs(dy) > Math.abs(dx) * DIR && Math.abs(dy) > ACT)
        stateRef.current.lock = "v";
    }
    if (stateRef.current.lock === "h") {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation?.();
      setDragX(dx);
      lastRef.current = { x: t.clientX, t: performance.now() };
    }
  };
  const onEnd = (onPrev, onNext) => (e) => {
    if (stateRef.current.lock !== "h") {
      setDragX(0);
      return;
    }
    const t = e.changedTouches[0];
    const now = performance.now(),
      dt = Math.max(1, now - lastRef.current.t);
    const vx = (t.clientX - lastRef.current.x) / dt;
    const dx = t.clientX - stateRef.current.x;
    const width = ref.current?.offsetWidth || window.innerWidth;
    const goNext = dx < 0 && (Math.abs(dx) > TH || Math.abs(vx) > VEL);
    const goPrev = dx > 0 && (Math.abs(dx) > TH || Math.abs(vx) > VEL);
    setSnapping(true);
    if (goNext) {
      setDragX(-width);
      setTimeout(() => {
        onNext?.();
        setSnapping(false);
        setDragX(0);
      }, SNAP);
    } else if (goPrev) {
      setDragX(width);
      setTimeout(() => {
        onPrev?.();
        setSnapping(false);
        setDragX(0);
      }, SNAP);
    } else {
      setDragX(0);
      setTimeout(() => setSnapping(false), SNAP);
    }
    stateRef.current = { x: 0, y: 0, lock: null };
  };
  const style = {
    transform: `translateX(${dragX}px)`,
    transition: snapping ? `transform ${SNAP}ms ease-out` : "none",
    willChange: "transform",
  };
  return { ref, onStart, onMove, onEnd, style };
}

/* ===========================================
 * App
 * ===========================================*/
export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark" || saved === "light" ? saved : "dark";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const [selectedTab, setSelectedTab] = useState("home");
  const [orderMode, setOrderMode] = useState("person");
  // "오늘" — 앱을 켜둔 채 자정을 넘기거나, 다음날 백그라운드에서 돌아와도
  // 갱신되도록 상태로 관리 (이전엔 렌더될 때만 바뀌어서 하루가 밀려 보였음)
  const [todayKey, setTodayKey] = useState(() => fmt(stripTime(new Date())));
  const today = useMemo(() => parseYMD(todayKey), [todayKey]);
  const [selectedDate, setSelectedDate] = useState(today);
  const todayKeyRef = React.useRef(todayKey);
  useEffect(() => {
    const check = () => {
      const k = fmt(stripTime(new Date()));
      const prev = todayKeyRef.current;
      if (k === prev) return;
      todayKeyRef.current = k;
      setTodayKey(k);
      // 어제를 "오늘"로 보고 있던 경우에만 새 오늘로 이동
      setSelectedDate((sd) => (fmt(sd) === prev ? parseYMD(k) : sd));
    };
    const id = setInterval(check, 30000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  const goPrevDay = () => {
    flushSync(() => setSelectedDate((d) => addDaysSafe(d, -1)));
    setAltView(false);
  };
  const goNextDay = () => {
    flushSync(() => setSelectedDate((d) => addDaysSafe(d, 1)));
    setAltView(false);
  };

  const [tempName, setTempName] = useState("");
  const gridWrapRef = React.useRef(null);
  const [dragX, setDragX] = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState("안심");
  // 사용자의 "기본 기지" — 홈/전체/설정 탭에서 항상 이 기지를 봄.
  // 행로/그룹에서 임시로 다른 기지 데이터를 봐도 selectedDepot 만 잠깐 바뀌고,
  // 다시 홈/전체로 돌아가면 이 값으로 복원됨.
  const [homeDepot, setHomeDepot] = useState("안심");

  const [overridesByDepot, setOverridesByDepot] = useState({});
  const [dutyModal, setDutyModal] = useState({
    open: false,
    date: null,
    name: null,
  });

  // ── 새 추가: commonMap, SetupWizard ──
  const [commonMap, setCommonMap] = useState(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  // ── 근무자 편집 모달 (이름 + 교번 동시) ──
  const [personEditModal, setPersonEditModal] = useState({
    open: false,
    oldName: "",
    oldCode: "",
    // 되돌리기용 메타
    baseName: "", // override 적용 전 원본 이름
    baseCode: "", // override 적용 전 원본 교번
    hasTodayCode: false, // 오늘 교번 override 걸려있는지
    hasTodayName: false, // 오늘 이름 override 걸려있는지
  });
  const [rosterEditMode, setRosterEditMode] = useState(false);

  // 이름 override (오늘 하루만): { depot: { iso: { oldName: newName } } }
  const [nameOverridesByDepot, setNameOverridesByDepot] = useState({});

  function setOverride(depot, dateObj, name, value) {
    const iso = fmt(stripTime(new Date(dateObj)));
    setOverridesByDepot((prev) => {
      const depotMap = { ...(prev?.[depot] || {}) };
      const dayMap = { ...(depotMap[iso] || {}) };
      if (value == null) delete dayMap[name];
      else dayMap[name] = value;
      return { ...prev, [depot]: { ...depotMap, [iso]: dayMap } };
    });
  }

  function applyOverrideToRow(row, depot, dateObj, name) {
    const iso = fmt(stripTime(new Date(dateObj)));
    const vRaw = overridesByDepot?.[depot]?.[iso]?.[name];
    return applyOverride(row, vRaw, overrideTemplates);
  }

  function rowAtDateForNameWithOverride(name, dateObj) {
    const base = rowAtDateForName(name, dateObj);
    return applyOverrideToRow(base, selectedDepot, dateObj, name);
  }

  function hasOverride(depot, dateObj, name) {
    const iso = fmt(stripTime(new Date(dateObj)));
    return !!overridesByDepot?.[depot]?.[iso]?.[name];
  }

  // ── 이름 편집 헬퍼 ──
  //
  // displayName: row에 적용된 이름 override 해석
  //   오늘 하루만 "홍길동 → 박영희" override가 있으면 displayName("홍길동", today) === "박영희"
  function displayName(name, dateObj) {
    const iso = fmt(stripTime(new Date(dateObj)));
    const v = nameOverridesByDepot?.[selectedDepot]?.[iso]?.[name];
    return v || name;
  }

  function hasNameOverride(depot, dateObj, name) {
    const iso = fmt(stripTime(new Date(dateObj)));
    return !!nameOverridesByDepot?.[depot]?.[iso]?.[name];
  }

  // 영구 개명/교환:
  //   newName 이 기존에 없는 이름이면  → 단순 개명 (names[idx] = newName)
  //   newName 이 기존 인물이면         → swap (두 사람 자리 교환)
  async function applyPermanentRename(oldNameIn, newNameIn) {
    // 입력 정규화: 앞뒤 공백 제거 + 중간 다중 공백 축약
    const clean = (s) =>
      String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    const oldName = clean(oldNameIn);
    const newName = clean(newNameIn);
    if (!oldName || !newName) return;

    const key = DEPOT_TO_ZIP_KEY[selectedDepot] || selectedDepot;
    const common = commonMap?.[key];
    if (!common?.names) return;

    // 비교용 정규화 (공백 전부 제거 + 소문자)
    const norm = (s) =>
      String(s || "")
        .replace(/\s+/g, "")
        .toLowerCase();
    const oldKey = norm(oldName);
    const newKey = norm(newName);

    // 실질적으로 같은 이름이면 단순 trim 업데이트 후 리턴
    if (oldKey === newKey) {
      // 공백/대소문자만 다른 경우 → names 엔트리 표기 정리
      const idx = common.names.findIndex((n) => norm(n) === oldKey);
      if (idx >= 0 && common.names[idx] !== newName) {
        const newNames = [...common.names];
        newNames[idx] = newName;
        const nextMap = { ...commonMap, [key]: { ...common, names: newNames } };
        setCommonMap(nextMap);
        try {
          await saveCommonDataToDB(nextMap);
        } catch {}
      }
      return;
    }

    // oldName 위치 찾기
    const idxACandidates = common.names
      .map((n, i) => ({ n, i }))
      .filter((x) => norm(x.n) === oldKey);
    if (idxACandidates.length === 0) return;
    if (idxACandidates.length > 1) {
      // 동명이인인 oldName이 여러 명 — 가장 가까운 위치를 특정할 수 없으니 중단
      console.warn(
        `[applyPermanentRename] "${oldName}" 동명이인 ${idxACandidates.length}명 — 처리 중단`
      );
      alert(
        `"${oldName}" 이름을 가진 사람이 ${idxACandidates.length}명입니다.\n` +
          `중복을 먼저 정리한 후 다시 시도해주세요.`
      );
      return;
    }
    const idxA = idxACandidates[0].i;

    // newName 매칭 찾기 (본인 제외)
    const idxBCandidates = common.names
      .map((n, i) => ({ n, i }))
      .filter((x) => norm(x.n) === newKey && x.i !== idxA);

    if (idxBCandidates.length > 1) {
      alert(
        `"${newName}" 이름을 가진 사람이 여러 명입니다.\n자리 교환 대상을 특정할 수 없습니다.`
      );
      return;
    }
    const idxB = idxBCandidates.length === 1 ? idxBCandidates[0].i : -1;
    const isSwap = idxB >= 0;

    const newNames = [...common.names];
    const oldPhones = common.phones || [];
    const newPhones = [...oldPhones];

    if (isSwap) {
      newNames[idxA] = common.names[idxB];
      newNames[idxB] = common.names[idxA];
      if (oldPhones.length === common.names.length) {
        newPhones[idxA] = oldPhones[idxB] || "";
        newPhones[idxB] = oldPhones[idxA] || "";
      }
    } else {
      newNames[idxA] = newName;
    }

    const nextMap = {
      ...commonMap,
      [key]: { ...common, names: newNames, phones: newPhones },
    };
    setCommonMap(nextMap);
    try {
      await saveCommonDataToDB(nextMap);
    } catch {}

    // TSV 동기화
    setTablesByDepot((prev) => {
      const tsv = prev?.[selectedDepot];
      if (!tsv) return prev;
      const lines = tsv.split(/\r?\n/);
      if (isSwap) {
        const aLine = idxA + 1;
        const bLine = idxB + 1;
        if (lines.length > Math.max(aLine, bLine)) {
          const aCols = lines[aLine].split("\t");
          const bCols = lines[bLine].split("\t");
          if (aCols.length >= 2 && bCols.length >= 2) {
            const tmp = aCols[1];
            aCols[1] = bCols[1];
            bCols[1] = tmp;
            lines[aLine] = aCols.join("\t");
            lines[bLine] = bCols.join("\t");
            return { ...prev, [selectedDepot]: lines.join("\n") };
          }
        }
      } else {
        if (lines.length > idxA + 1) {
          const cols = lines[idxA + 1].split("\t");
          if (cols.length >= 2) {
            cols[1] = newName;
            lines[idxA + 1] = cols.join("\t");
            return { ...prev, [selectedDepot]: lines.join("\n") };
          }
        }
      }
      return prev;
    });

    // ── override 이관 ──
    //  일일 변경(휴가·교육·교번 변경)과 하루 이름 변경은 "사람" 에 붙은 정보.
    //  · 단순 개명(오타 수정 등): 옛 이름 → 새 이름으로 옮김
    //  · 두 사람 자리 교환: 각자 자기 것을 그대로 가짐 (예전엔 서로 맞바꿔서
    //    A 의 휴가가 B 에게 넘어가는 문제가 있었음)
    const actualOldName = common.names[idxA];
    if (!isSwap) {
      const migrate = (prev) => {
        const depotMap = prev?.[selectedDepot];
        if (!depotMap) return prev;
        let changed = false;
        const nextDepotMap = {};
        for (const [iso, dayMap] of Object.entries(depotMap)) {
          if (
            dayMap &&
            Object.prototype.hasOwnProperty.call(dayMap, actualOldName)
          ) {
            const nextDay = { ...dayMap, [newName]: dayMap[actualOldName] };
            delete nextDay[actualOldName];
            nextDepotMap[iso] = nextDay;
            changed = true;
          } else nextDepotMap[iso] = dayMap;
        }
        return changed ? { ...prev, [selectedDepot]: nextDepotMap } : prev;
      };
      setOverridesByDepot(migrate);
      setNameOverridesByDepot(migrate);
      migratePersonRefs(selectedDepot, actualOldName, newName);
    }

    // 내 이름/행로 대상 연동
    if (!isSwap) {
      if (myName === actualOldName) setMyNameForDepot(selectedDepot, newName);
      if (routeTargetName === actualOldName) setRouteTargetName(newName);
    }
  }

  // 영구 교번 변경 — "이 사람을 (보고 있는 날짜 기준) newCode 자리로"
  //
  //  날짜 D 에 자리 p 의 사람은 gyobun[(p + seatShift + dd) % len] 을 받는다
  //  (dd = D - 기준일). 따라서 D 에 newCode(인덱스 c) 를 받으려면
  //  자리 p = c - seatShift - dd 로 옮겨야 한다.
  //  예전엔 dd 를 무시해서, 오늘이 아닌 날짜를 보고 바꾸면 그 날짜엔
  //  엉뚱한 교번이 들어갔음.
  async function applyPermanentCode(targetName, newCode, dateObj) {
    const key = DEPOT_TO_ZIP_KEY[selectedDepot] || selectedDepot;
    const common = commonMap?.[key];
    if (!common?.names?.length || !common?.gyobun?.length) {
      alert("이 소속은 교번 데이터가 없어 영구 변경을 할 수 없습니다.");
      return;
    }
    const norm = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
    const len = common.names.length;
    const srcIdx = common.names.findIndex((n) => norm(n) === norm(targetName));
    const codeIdx = common.gyobun.findIndex((c) => norm(c) === norm(newCode));
    if (srcIdx < 0) {
      alert(`"${targetName}" 을(를) 교번표에서 찾을 수 없습니다.`);
      return;
    }
    if (codeIdx < 0) {
      alert(
        `"${newCode}" 는 교번표에 없는 값이라 영구 변경할 수 없습니다.\n"이 날짜만" 으로 적용하세요.`
      );
      return;
    }
    const dd = diffDays(dateObj, anchorDate);
    const shift = calcSeatShift(common);
    const dstIdx = mod(codeIdx - shift - dd, len);
    if (dstIdx === srcIdx) return; // 이미 그 교번
    const swapName = common.names[dstIdx] || "";
    const srcCodeOnDate = common.gyobun[mod(srcIdx + shift + dd, len)];
    const needConfirm = !!swapName.trim();
    const ok = needConfirm
      ? window.confirm(
          `"${targetName}"을(를) ${fmt(dateObj)} 기준 교번 ${newCode} 자리로 옮기면\n` +
            `그 자리의 "${swapName}"은(는) 교번 ${srcCodeOnDate} 자리로 이동합니다.\n\n` +
            `두 사람의 자리를 서로 바꾸시겠습니까? (이후 모든 날짜에 적용)`
        )
      : true;
    if (!ok) return;

    const newNames = [...common.names];
    newNames[srcIdx] = swapName;
    newNames[dstIdx] = common.names[srcIdx];
    const oldPhones = common.phones || [];
    const newPhones = [...oldPhones];
    while (newPhones.length < len) newPhones.push("");
    newPhones[srcIdx] = oldPhones[dstIdx] || "";
    newPhones[dstIdx] = oldPhones[srcIdx] || "";

    const nextMap = {
      ...commonMap,
      [key]: { ...common, names: newNames, phones: newPhones },
    };
    setCommonMap(nextMap);
    try {
      await saveCommonDataToDB(nextMap);
    } catch {}

    // TSV(교대 등 TSV 소속은 이것이 원본) — 이름 칸만 교환
    setTablesByDepot((prev) => {
      const tsv = prev?.[selectedDepot];
      if (!tsv) return prev;
      const lines = tsv.split(/\r?\n/);
      const aLine = srcIdx + 1;
      const bLine = dstIdx + 1;
      if (lines.length <= Math.max(aLine, bLine)) return prev;
      const aCols = lines[aLine].split("\t");
      const bCols = lines[bLine].split("\t");
      if (aCols.length < 2 || bCols.length < 2) return prev;
      const tmp = aCols[1];
      aCols[1] = bCols[1];
      bCols[1] = tmp;
      lines[aLine] = aCols.join("\t");
      lines[bLine] = bCols.join("\t");
      return { ...prev, [selectedDepot]: lines.join("\n") };
    });

    // 본인의 그 날짜 일일 변경만 해제 (상대방의 휴가 등은 그대로 둠)
    setOverride(selectedDepot, dateObj, targetName, null);
  }

  // 개명 시 강조색·그룹 인원 목록도 새 이름으로
  function migratePersonRefs(depot, oldName, newName) {
    setHighlightMap((prev) => {
      if (!prev || !prev[oldName]) return prev;
      const next = { ...prev, [newName]: prev[oldName] };
      delete next[oldName];
      return next;
    });
    const fix = (list) =>
      Array.isArray(list)
        ? list.map((p) =>
            p && p.name === oldName && p.depot === depot
              ? { ...p, name: newName }
              : p
          )
        : list;
    setCompareSelected((prev) => fix(prev));
    try {
      const raw = localStorage.getItem("compareGroups_v1");
      if (raw) {
        const groups = JSON.parse(raw);
        if (Array.isArray(groups)) {
          localStorage.setItem(
            "compareGroups_v1",
            JSON.stringify(
              groups.map((g) => ({ ...g, people: fix(g.people || []) }))
            )
          );
        }
      }
    } catch {}
  }

  // 오늘 하루만: nameOverridesByDepot 에 저장
  function applyTodayRename(oldNameIn, newNameIn, dateObj) {
    const clean = (s) =>
      String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    const oldName = clean(oldNameIn);
    const newName = clean(newNameIn);
    const norm = (s) =>
      String(s || "")
        .replace(/\s+/g, "")
        .toLowerCase();
    const iso = fmt(stripTime(new Date(dateObj)));
    setNameOverridesByDepot((prev) => {
      const depotMap = { ...(prev?.[selectedDepot] || {}) };
      const dayMap = { ...(depotMap[iso] || {}) };
      // 실질적으로 같은 이름이면 override 해제
      if (!newName || norm(newName) === norm(oldName)) {
        delete dayMap[oldName];
      } else {
        dayMap[oldName] = newName;
      }
      if (Object.keys(dayMap).length === 0) delete depotMap[iso];
      else depotMap[iso] = dayMap;
      return { ...prev, [selectedDepot]: depotMap };
    });
  }

  const defaultAnchorMap = useMemo(
    () =>
      Object.fromEntries(
        DEPOTS.map((d) => [d, d === "안심" ? "2025-10-01" : fmt(today)])
      ),
    []
  );
  const [anchorDateByDepot, setAnchorDateByDepot] = useState(defaultAnchorMap);
  // 기준일: commonMap 의 baseDate(이름 배치의 실제 기준)를 우선 사용.
  //  예전엔 localStorage 의 anchorDateByDepot 와 IndexedDB 의 baseDate 가
  //  따로 저장돼서, 한쪽만 저장된 채 앱이 꺼지면 하루 종일 교번이 1칸 밀렸음.
  const anchorDateStr =
    commonMap?.[DEPOT_TO_ZIP_KEY[selectedDepot] || selectedDepot]?.baseDate ||
    anchorDateByDepot[selectedDepot] ||
    fmt(today);
  const anchorDate = useMemo(
    () => parseYMD(anchorDateStr) || stripTime(new Date()),
    [anchorDateStr]
  );
  const setAnchorDateStrForDepot = (depot, value) =>
    setAnchorDateByDepot((prev) => ({ ...prev, [depot]: value }));

  const [tablesByDepot, setTablesByDepot] = useState({
    안심: "",
    월배: "",
    경산: "",
    문양: "",
    교대: buildGyodaeTable(),
    "교대(외)": buildGyodaeExtTable(),
  });

  // 변경 후 — commonMap 우선, 없으면 tablesByDepot 폴백
  const currentTableText = useMemo(
    () => tablesByDepot[selectedDepot] ?? "",
    [tablesByDepot, selectedDepot]
  );

  // commonMap에서 직접 rows 생성 (ZIP/TSV 모두 커버)
  //
  //  🌙 야간 판정 & 퇴근 시간 이어붙이기 (threshold 로직 폐기):
  //   각 교번의 worktime 이 "HH:MM -" 형태(퇴근 비어있음)이면 "야간 출근"이고,
  //   그 사람의 실제 퇴근 시간은 **다음 교번(= 다음 자리의 사람)의 worktime.out** 이다.
  //   보통 다음 자리 교번은 "N~" 형태로 in 이 비어있고 out 만 있음.
  //
  //   → row 에 weekdayNext/saturdayNext/holidayNext (다음 자리 worktime) 을 넣어두고
  //     computeInOut 에서 "오늘 out 비어있으면 야간 → next out 사용" 으로 판정.
  const peopleRows = useMemo(() => {
    const key = DEPOT_TO_ZIP_KEY[selectedDepot] || selectedDepot;
    const common = commonMap?.[key];
    if (common?.names?.length && common?.gyobun?.length) {
      const splitWT = (wt) => {
        const s = String(wt || "").replace(/\s/g, "");
        if (!s || s === "----") return { in: "", out: "" };
        const parts = s.split("-");
        const start = parts[0] || "";
        const end = parts[1] || "";
        // S코드 보정: 출근이 s[1-6]이면 퇴근도 동일하게
        if (/^s[1-6]$/i.test(start)) {
          return { in: start, out: start };
        }
        return { in: start, out: end };
      };
      const wtFor = (code) => {
        const k = String(code || "")
          .trim()
          .toLowerCase();
        return {
          weekday: splitWT(common.worktime?.nor?.[k] || "----"),
          saturday: splitWT(common.worktime?.sat?.[k] || "----"),
          holiday: splitWT(common.worktime?.hol?.[k] || "----"),
        };
      };
      const len = common.names.length;
      return common.names.map((name, i) => {
        const code = common.gyobun[i] || "";
        const wt = wtFor(code);
        // 다음 자리 (= 다음 사람) 의 worktime — 오늘 야간이라면 내 퇴근 시간은 여기에 있음
        const nextCode = common.gyobun[(i + 1) % len] || "";
        const wtNext = wtFor(nextCode);
        const dia = /^\d+d$/i.test(code)
          ? Number(code.replace(/d$/i, ""))
          : code;
        return {
          seq: String(i + 1),
          name,
          dia,
          phone: common.phones?.[i] || "",
          weekday: wt.weekday,
          saturday: wt.saturday,
          holiday: wt.holiday,
          // 야간 판정 전용 — 다음 자리 worktime
          weekdayNext: wtNext.weekday,
          saturdayNext: wtNext.saturday,
          holidayNext: wtNext.holiday,
        };
      });
    }
    // 폴백: 기존 TSV 파싱 (교대 계열은 label 기반이라 next 불필요)
    return parsePeopleTable(currentTableText);
  }, [commonMap, selectedDepot, currentTableText]);

  const nameIndexMap = useMemo(
    () => buildNameIndexMap(peopleRows),
    [peopleRows]
  );
  const nameList = useMemo(
    () => peopleRows.map((r) => r.name).filter(Boolean),
    [peopleRows]
  );

  // 기준일에 "names[i] ↔ gyobun[i]" 가 아닌 경우(아직 오늘로 재배치 전인
  // ZIP 원본)에도 맞게 계산되도록 baseName/baseCode 로 자리 차이를 보정.
  // 재배치(rebase) 후에는 항상 0.
  const seatShift = useMemo(() => {
    const common = commonMap?.[DEPOT_TO_ZIP_KEY[selectedDepot] || selectedDepot];
    return calcSeatShift(common);
  }, [commonMap, selectedDepot]);

  // 일일 변경(override) 적용용 템플릿 — 현재 소속 데이터 기준
  const overrideTemplates = React.useMemo(
    () => buildTemplates(peopleRows),
    [peopleRows]
  );

  const DUTY_OPTIONS = React.useMemo(() => {
    const set = new Set(["비번", "휴", "교육", "휴가"]);
    peopleRows.forEach((r) => {
      const d = r?.dia;
      if (typeof d === "number") set.add(`${d}D`);
      else if (typeof d === "string") {
        const clean = d.replace(/\s+/g, "");
        if (/^대\d+$/i.test(clean)) set.add(clean);
        if (/^대기\d+$/i.test(clean)) set.add(clean);
        else if (clean === "비") set.add("비번");
        else if (["주", "야", "휴", "비번"].includes(clean)) set.add(clean);
      }
    });
    const orderKey = (v) => {
      if (/^\d+D$/.test(v)) return parseInt(v);
      if (/^대\d+$/.test(v)) return 100 + parseInt(v.replace(/\D/g, ""));
      if (/^대기\d+$/i.test(v)) return 200 + parseInt(v.replace(/\D/g, ""));
      const fixed = { 비번: 1000, 휴: 1001, 주: 1002, 야: 1003 };
      return fixed[v] ?? 9999;
    };
    return Array.from(set).sort((a, b) => orderKey(a) - orderKey(b));
  }, [peopleRows]);

  const [myNameMap, setMyNameMap] = useState({
    안심: "",
    월배: "",
    경산: "",
    문양: "",
    교대: "",
    "교대(외)": "",
  });
  const myName = myNameMap[selectedDepot] || "";
  const setMyNameForDepot = (depot, name) =>
    setMyNameMap((prev) => ({ ...prev, [depot]: name }));

  const [holidaysText, setHolidaysText] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const lastClickedRef = React.useRef(null);
  const longPressTimerRef = React.useRef(null);
  const longPressActiveRef = React.useRef(false);
  const longPressDidFireRef = React.useRef(false);
  const LONG_MS = 600;

  const holidaySet = useMemo(() => {
    const s = new Set();
    holidaysText
      .split(/[, \n\r]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((d) => s.add(d));
    return s;
  }, [holidaysText]);

  const tabbarRef = React.useRef(null);
  const appRef = React.useRef(null);
  const [slideViewportH, setSlideViewportH] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const tabbarH = tabbarRef.current?.offsetHeight || 0;
      setSlideViewportH(Math.max(360, window.innerHeight - tabbarH - 12));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const [routeTargetName, setRouteTargetName] = useState("");
  const [nightDiaByDepot, setNightDiaByDepot] = useState({
    안심: 25,
    월배: 5,
    경산: 5,
    문양: 5,
    교대: 5,
    "교대(외)": 5,
  });
  const nightDiaThreshold = nightDiaByDepot[selectedDepot] ?? 25;
  const setNightDiaForDepot = (depot, val) =>
    setNightDiaByDepot((prev) => ({ ...prev, [depot]: val }));

  // 기지별 행로표 이미지 배율 (0.5 ~ 2.0)
  const [routeScaleByDepot, setRouteScaleByDepot] = useState({
    안심: 1,
    월배: 1,
    경산: 1,
    문양: 1,
    교대: 1,
    "교대(외)": 1,
  });
  const routeScale = routeScaleByDepot[selectedDepot] ?? 1;
  const setRouteScaleForDepot = (depot, val) =>
    setRouteScaleByDepot((prev) => ({ ...prev, [depot]: val }));
  const [highlightMap, setHighlightMap] = useState({});
  const [compareSelected, setCompareSelected] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const SAVE_DEBOUNCE = 300;
  const [calHasSelection, setCalHasSelection] = useState(true);

  const scrollLockRef = React.useRef({ locked: false, scrollY: 0 });
  function lockBodyScroll() {
    if (scrollLockRef.current.locked) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";
    scrollLockRef.current.locked = true;
  }
  function unlockBodyScroll() {
    if (!scrollLockRef.current.locked) return;
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
    document.body.style.overscrollBehavior = "";
    scrollLockRef.current.locked = false;
  }

  const [homePage, setHomePage] = useState(0);
  const [routePage, setRoutePage] = useState(0);
  const [routeTransitioning, setRouteTransitioning] = useState(false);

  function triggerRouteTransition() {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      background: "black",
      opacity: "0",
      transform: "scale(1)",
      transition: "all 0.35s cubic-bezier(0.25,1,0.5,1)",
      zIndex: "9998",
      pointerEvents: "none",
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = "0.12";
      overlay.style.transform = "scale(0.96)";
    });
    setTimeout(() => {
      setSelectedTab("route");
      setRoutePage(0);
      setDragYRoute(0);
      const routePanel = document.getElementById("route-panel0");
      if (routePanel)
        routePanel.animate(
          [
            { opacity: 0, transform: "translateY(14px) scale(0.97)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 200, easing: "cubic-bezier(0.25,1,0.5,1)" }
        );
    }, 150);
    setTimeout(() => {
      overlay.style.opacity = "0";
      overlay.style.transform = "scale(1)";
      setTimeout(() => overlay.remove(), 220);
    }, 400);
  }

  const isHomeCalLocked = selectedTab === "home" && homePage === 0;
  const isRouteLocked = selectedTab === "route";
  const isAnyLocked = isHomeCalLocked || isRouteLocked;

  // ── 초기 로드 ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const seenHolidayVer =
        Number(localStorage.getItem("holidayDefaultsVersion")) || 1;
      try {
        localStorage.setItem(
          "holidayDefaultsVersion",
          String(HOLIDAY_DEFAULTS_VERSION)
        );
      } catch {}
      if (!raw) {
        setHolidaysText(DEFAULT_HOLIDAYS_25_26);
      } else {
        const s = JSON.parse(raw);
        if (s.nightDiaByDepot) setNightDiaByDepot(s.nightDiaByDepot);
        else if (typeof s.nightDiaThreshold === "number")
          setNightDiaByDepot({
            안심: s.nightDiaThreshold,
            월배: s.nightDiaThreshold,
            경산: s.nightDiaThreshold,
            문양: s.nightDiaThreshold,
          });
        if (s.routeScaleByDepot) setRouteScaleByDepot(s.routeScaleByDepot);
        if (s.tablesByDepot) setTablesByDepot(s.tablesByDepot);
        if (s.myNameMap) setMyNameMap(s.myNameMap);
        if (s.selectedDepot) setSelectedDepot(s.selectedDepot);
        if (s.homeDepot) setHomeDepot(s.homeDepot);
        else if (s.selectedDepot) setHomeDepot(s.selectedDepot);
        if (s.overridesByDepot) setOverridesByDepot(s.overridesByDepot);
        if (s.nameOverridesByDepot)
          setNameOverridesByDepot(s.nameOverridesByDepot);
        if (!s.tablesByDepot && s.tableText)
          setTablesByDepot((prev) => ({ ...prev, 안심: s.tableText }));
        if (!s.myNameMap && s.myName) setMyNameForDepot("안심", s.myName);
        if (s.anchorDateByDepot) setAnchorDateByDepot(s.anchorDateByDepot);
        else if (s.anchorDateStr)
          setAnchorDateByDepot(
            Object.fromEntries(DEPOTS.map((d) => [d, s.anchorDateStr]))
          );
        if (!s.holidaysText || !String(s.holidaysText).trim()) {
          setHolidaysText(DEFAULT_HOLIDAYS_25_26);
        } else {
          // 저장된 목록이 있으면 그대로 쓰되, 앱 업데이트로 새로 추가된
          // 공휴일(2027년, 노동절·제헌절·선거일 등)만 1회 병합
          let text = s.holidaysText;
          for (let v = seenHolidayVer + 1; v <= HOLIDAY_DEFAULTS_VERSION; v++) {
            text = mergeHolidayText(text, HOLIDAY_ADDED_BY_VERSION[v]);
          }
          setHolidaysText(text);
        }
        if (s.highlightMap) setHighlightMap(s.highlightMap);
        if (Array.isArray(s.compareSelected))
          setCompareSelected(s.compareSelected);
        // selectedDate 는 복원하지 않음 — 앱은 항상 "오늘"로 열려야 함
      }
    } catch (e) {
      console.warn("[LOAD] 설정 로드 실패", e);
    }

    // commonMap IndexedDB 복원 + ZIP 핸들 복원 (병렬)
    // ⚠️ 중요: loaded=true 는 commonMap 복원 완료 후에만 호출해야 함.
    // 그렇지 않으면 "tablesByDepot/anchorDateByDepot 동기화" useEffect 가
    // commonMap=null 인 상태에서 실행되어 ZIP 기지의 paths 를 {} 로 덮어쓰는
    // 레이스가 발생 (→ IDB commonMap 까지 망가져서 이미지 인덱스가 증발).
    Promise.all([
      loadCommonDataFromDB(),
      restoreZipHandleFromDB("latest").catch(() => false),
    ])
      .then(async ([saved]) => {
        let current = saved;
        // 🚑 망가진 commonMap 자동 복구:
        //   과거 레이스 버그로 ZIP 기지 paths 가 비어있는 사용자를 위해,
        //   IDB 에 ZIP blob 이 살아있으면 자동으로 이미지 인덱스를 재구성.
        try {
          const { repaired, commonMap: repairedMap } =
            await repairCommonMapFromZipBlob(saved);
          if (repaired) {
            console.log("[App] commonMap 자동 복구 성공");
            current = repairedMap;
          }
        } catch (e) {
          console.warn("[App] commonMap 복구 시도 실패", e);
        }
        if (current) {
          // 근무시간 데이터 오타 보정 (18::27, 18;00, ~줄의 "-" 누락 등)
          let fixedAny = false;
          const fixed = {};
          for (const [k, v] of Object.entries(current)) {
            const nv = v && typeof v === "object" ? normalizeCommonWorktime(v) : v;
            if (nv !== v) fixedAny = true;
            fixed[k] = nv;
          }
          if (fixedAny) {
            current = fixed;
            saveCommonDataToDB(current).catch(() => {});
          }
          setCommonMap(current);
        }
      })
      .catch(() => {})
      .finally(() => {
        // commonMap 반영은 다음 렌더에 일어나지만, setLoaded 가 그 뒤에
        // 오면 "loaded=true 시점에 commonMap 이 아직 null" 인 창은 없음
        // (setState 배치 처리로 같은 렌더에 둘 다 적용됨).
        setLoaded(true);
      });

    (async () => {
      try {
        if ("storage" in navigator && "persist" in navigator.storage)
          await navigator.storage.persist();
      } catch {}
    })();
  }, []);

  // ── 공휴일 자동 확인 (1주일에 한 번, 공식 데이터만, 추가만) ──
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const last = Number(localStorage.getItem("holidaySyncAt")) || 0;
        if (Date.now() - last < 7 * 86400000) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false)
          return;
        const y = new Date().getFullYear();
        const add = [];
        let thisYearSource = "";
        for (const yy of [y, y + 1]) {
          const { dates, source } = await fetchKoreanHolidaysDetailed(yy);
          if (yy === y) thisYearSource = source;
          if (source === "kasi" || source === "official") add.push(...dates);
        }
        try {
          localStorage.setItem(
            "holidaySyncInfo",
            JSON.stringify({ source: thisYearSource, at: Date.now() })
          );
        } catch {}
        if (cancelled) return;
        // 한 번 받아 본 날짜는 다시 넣지 않음 → 사용자가 일부러 지운 날짜
        // (예: 회사가 휴일 다이아를 안 도는 노동절)는 되살아나지 않음
        let seen = [];
        try {
          seen = JSON.parse(localStorage.getItem("holidaySyncSeen") || "[]");
        } catch {}
        const seenSet = new Set(seen);
        const fresh = add.filter((d) => !seenSet.has(d));
        if (fresh.length)
          setHolidaysText((prev) => mergeHolidayText(prev, fresh));
        add.forEach((d) => seenSet.add(d));
        localStorage.setItem(
          "holidaySyncSeen",
          JSON.stringify([...seenSet].sort())
        );
        localStorage.setItem("holidaySyncAt", String(Date.now()));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  // ── TSV → commonMap 자동 변환 (기존 사용자, commonMap 없을 때) ──
  //
  //  ⚠️ ZIP 기지(안심/월배/경산/문양) 는 이 effect 에서 만들지 않음.
  //  ZIP 기지에 tablesByDepot 가 남아있을 수 있지만, 그건 ZIP 등록 시
  //  자동 생성된 사본이라 별도 변환 대상이 아님. TSV 전용 기지만 변환.
  useEffect(() => {
    if (!loaded || commonMap) return;
    try {
      const TSV_ONLY_DEPOTS = new Set(["교대", "교대(외)"]);
      const map = {};
      for (const depot of DEPOTS) {
        if (!TSV_ONLY_DEPOTS.has(depot)) continue;
        const tsv = tablesByDepot[depot],
          anchor = anchorDateByDepot[depot];
        if (!tsv || !anchor) continue;
        const rows = parsePeopleTable(tsv);
        if (!rows.length) continue;
        const key = DEPOT_TO_ZIP_KEY[depot] || depot;
        map[key] = tsvRowsToCommon(depot, rows, anchor);
      }
      if (Object.keys(map).length) {
        setCommonMap(map);
        saveCommonDataToDB(map).catch(() => {});
      }
    } catch (e) {
      console.warn("[TSV→Common]", e);
    }
  }, [loaded]);
  // ── commonMap 없으면 SetupWizard 자동 표시 ──
  useEffect(() => {
    if (!loaded) return;

    const done = localStorage.getItem("setupDone");

    if (!commonMap && !done) {
      setShowSetupWizard(true);
    }
  }, [loaded]);

  // ── tablesByDepot / anchorDateByDepot 바뀔 때 commonMap 동기화 ──
  //
  //  이 useEffect 의 목적: **교대/교대(외) 같은 TSV 기지**에서 TSV 텍스트가
  //  변경됐을 때 commonMap 에도 반영하기 위함.
  //
  //  ⚠️ ZIP 기지(안심/월배/경산/문양) 는 여기서 절대 건드리면 안 됨.
  //  과거 버그: commonMap 복원이 아직 안 끝난 상태(prev=null)에서 이 effect 가
  //  실행되면 `prev?.[key]?.source === "zip"` 가드를 뚫고 안심 TSV 로
  //  재구성하면서 paths(이미지 인덱스) 를 {} 로 덮어써서 IDB 까지 망가뜨렸음.
  useEffect(() => {
    if (!loaded) return;
    // commonMap 이 아직 복원되지 않았으면 아무것도 하지 않음 — 레이스 방지
    if (commonMap === null) return;

    const TSV_ONLY_DEPOTS = new Set(["교대", "교대(외)"]); // ZIP 기지는 절대 제외
    setCommonMap((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      for (const depot of DEPOTS) {
        if (!TSV_ONLY_DEPOTS.has(depot)) continue; // ZIP 기지는 건너뜀 (이중 방어)
        const key = DEPOT_TO_ZIP_KEY[depot] || depot;
        if (prev?.[key]?.source === "zip") continue; // 삼중 방어
        const tsv = tablesByDepot[depot],
          anchor = anchorDateByDepot[depot];
        if (!tsv || !anchor) continue;
        const rows = parsePeopleTable(tsv);
        if (!rows.length) continue;
        const existingPaths = prev?.[key]?.paths || {};
        const existingAlarms = prev?.[key]?.alarms || {
          nor: {},
          sat: {},
          hol: {},
        };
        const updated = tsvRowsToCommon(depot, rows, anchor);
        updated.paths = existingPaths;
        updated.alarms = existingAlarms;
        next[key] = updated;
        changed = true;
      }
      if (changed) saveCommonDataToDB(next).catch(() => {});
      return changed ? next : prev;
    });
  }, [tablesByDepot, anchorDateByDepot, loaded, commonMap === null]);

  // ── 매일 기준일 자동 갱신 (오늘로 고정) ──
  //
  //  · ZIP 데이터(commonMap, source=zip): rebaseDepotToToday 로 이름 재배치.
  //    anchorDateByDepot 상태와 무관하게 baseDate 만 보고 판단한다.
  //  · ZIP 소속의 TSV 사본: commonMap 에서 매번 다시 만들어 항상 일치시킴
  //    (예전엔 회전되지 않은 채 anchor 만 오늘로 바뀌어, IndexedDB 가
  //     날아가 TSV 로 폴백되면 틀린 교번을 조용히 보여줬음)
  //  · TSV 전용 소속(교대 등): 이름 칸 회전.
  useEffect(() => {
    if (!loaded) return;
    const todayStr = fmt(today);

    // 1) ZIP commonMap 재배치
    setCommonMap((prevMap) => {
      if (!prevMap) return prevMap;
      const nextMap = { ...prevMap };
      let changed = false;
      for (const depot of DEPOTS) {
        const key = DEPOT_TO_ZIP_KEY[depot] || depot;
        const data = prevMap[key];
        if (!data?.names?.length || !data?.gyobun?.length) continue;
        if (data.source !== "zip") continue;
        if (data.baseDate === todayStr) continue;
        const rebuilt = rebaseDepotToToday(data, todayStr);
        if (rebuilt !== data) {
          nextMap[key] = rebuilt;
          changed = true;
        }
      }
      if (changed) saveCommonDataToDB(nextMap).catch(() => {});
      return changed ? nextMap : prevMap;
    });

    // 2) TSV
    setTablesByDepot((prevTables) => {
      const nextTables = { ...prevTables };
      let changed = false;
      for (const depot of DEPOTS) {
        const key = DEPOT_TO_ZIP_KEY[depot] || depot;
        const zipData = commonMap?.[key];
        if (zipData?.source === "zip") {
          // 오늘로 재배치된 commonMap 에서만 사본 생성 (재배치 전이면 다음 렌더에)
          if (zipData.baseDate !== todayStr) continue;
          const tsv = commonToTsv(zipData);
          if (tsv && tsv !== prevTables[depot]) {
            nextTables[depot] = tsv;
            changed = true;
          }
          continue;
        }

        const currentAnchor = anchorDateByDepot[depot];
        if (!currentAnchor || currentAnchor === todayStr) continue;
        const tsv = prevTables[depot];
        if (!tsv) continue;
        const lines = tsv.split(/\r?\n/);
        if (lines.length < 2) continue;
        const header = lines[0];
        const dataLines = lines.slice(1).filter((l) => l.trim());
        if (!dataLines.length) continue;
        const anchorD = parseYMD(currentAnchor);
        if (!anchorD) continue;
        const dd = diffDays(today, anchorD);
        if (dd === 0) continue;
        const len = dataLines.length;
        const names = dataLines.map((row) => row.split("\t")[1] || "");
        const newNames = new Array(len);
        for (let j = 0; j < len; j++) newNames[j] = names[mod(j - dd, len)];
        const newDataLines = dataLines.map((row, i) => {
          const cols = row.split("\t");
          cols[1] = newNames[i];
          return cols.join("\t");
        });
        nextTables[depot] = [header, ...newDataLines].join("\n");
        changed = true;
      }
      return changed ? nextTables : prevTables;
    });

    // 3) anchor 를 오늘로
    setAnchorDateByDepot((prev) => {
      if (DEPOTS.every((d) => prev[d] === todayStr)) return prev;
      const next = { ...prev };
      for (const depot of DEPOTS) next[depot] = todayStr;
      return next;
    });
  }, [loaded, commonMap, todayKey]);

  // ── SetupWizard 완료 ──
  //
  //  핵심: anchor=today 가 되도록 names 배열을 미리 재배치해서 넘김.
  //  → "매일 자동 갱신" useEffect가 중복 회전하지 않음 (이미 오늘이라서 skip)
  async function handleSetupComplete(result) {
    const {
      mode,
      depot,
      myName: wizName,
      myCode,
      anchorDate: wizAnchor, // Wizard가 today로 보냄 (이미 오늘 배치 완료)
      commonMap: newMap,
    } = result;

    const todayISO = fmt(today);

    let finalMap = { ...(commonMap || {}) };
    if (mode === "zip") {
      // Wizard가 이미 names 를 오늘 정답 배치로 만들어서 넘김
      // (baseDate 도 today 로 세팅됨)
      // 마법사를 다시 돌려도 이미 입력해 둔 전화번호는 이름 기준으로 유지
      for (const [k, fresh] of Object.entries(newMap || {})) {
        const old = commonMap?.[k];
        if (!fresh?.names?.length || !old?.names?.length || !old?.phones?.length)
          continue;
        const byName = {};
        old.names.forEach((n, i) => {
          if (n && old.phones[i]) byName[String(n).replace(/\s+/g, "")] = old.phones[i];
        });
        const phones = fresh.names.map(
          (n, i) =>
            (fresh.phones && fresh.phones[i]) ||
            byName[String(n || "").replace(/\s+/g, "")] ||
            ""
        );
        newMap[k] = { ...fresh, phones };
      }
      Object.assign(finalMap, newMap);
    } else {
      if (newMap?._pathsOnly)
        for (const key of Object.keys(finalMap))
          finalMap[key] = loadPathsIntoCommon(finalMap[key], newMap._pathsOnly);
    }

    // ZIP 모드: tablesByDepot에도 오늘 배치된 이름으로 TSV 생성
    if (mode === "zip") {
      const key = DEPOT_TO_ZIP_KEY[depot] || depot;
      const zipData = finalMap[key];
      if (zipData?.names?.length && zipData?.gyobun?.length) {
        const header =
          "순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근";
        const rows = zipData.names.map((name, i) => {
          const code = zipData.gyobun[i] || "";
          const dia = code.replace(/d$/i, "");
          const nor = zipData.worktime?.nor?.[code.toLowerCase()] || "----";
          const sat = zipData.worktime?.sat?.[code.toLowerCase()] || "----";
          const hol = zipData.worktime?.hol?.[code.toLowerCase()] || "----";
          const [norIn, norOut] = nor.split("-");
          const [satIn, satOut] = sat.split("-");
          const [holIn, holOut] = hol.split("-");
          return [
            i + 1,
            name,
            dia,
            norIn || "",
            norOut || "",
            satIn || "",
            satOut || "",
            holIn || "",
            holOut || "",
          ].join("\t");
        });
        const tsvText = [header, ...rows].join("\n");
        setTablesByDepot((prev) => ({ ...prev, [depot]: tsvText }));
      }
    }

    setCommonMap(finalMap);
    saveCommonDataToDB(finalMap).catch(() => {});
    setSelectedDepot(depot);
    setHomeDepot(depot);
    if (wizName) setMyNameForDepot(depot, wizName);
    // anchor = today (Wizard가 이미 오늘 배치로 넘겼으므로)
    setAnchorDateByDepot((prev) => ({ ...prev, [depot]: todayISO }));
    setShowSetupWizard(false);
    localStorage.setItem("setupDone", "true");
  }

  // ── 탭 변경 ──
  useEffect(() => {
    if (appRef.current) appRef.current.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "instant" });
    if (selectedTab === "roster" || selectedTab === "settings") setTempName("");
  }, [selectedTab]);

  useEffect(() => {
    if (selectedTab === "home") {
      setHomePage(0);
      setDragYHome(0);
      setSnapYHome(false);
      if (fmt(selectedDate) !== fmt(today) || !calHasSelection) {
        setSelectedDate(today);
        setCalHasSelection(true);
        lastClickedRef.current = fmt(today);
      }
    }
  }, [selectedTab]);

  useEffect(() => {
    if (selectedTab === "compare" && fmt(selectedDate) !== fmt(today))
      setSelectedDate(today);
  }, [selectedTab]);
  // 홈/전체/설정 탭으로 들어올 때, 행로/그룹에서 임시로 바뀐 기지가 있으면
  // 사용자의 기본 기지(homeDepot)로 복원.
  useEffect(() => {
    if (
      (selectedTab === "home" ||
        selectedTab === "roster" ||
        selectedTab === "settings") &&
      selectedDepot !== homeDepot
    ) {
      setSelectedDepot(homeDepot);
    }
  }, [selectedTab]);
  useEffect(() => {
    if (selectedTab === "route") {
      setRoutePage(0);
      setDragYRoute(0);
      setSnapYRoute(false);
    }
  }, [selectedTab]);
  useEffect(() => {
    if (isAnyLocked) {
      lockBodyScroll();
      return () => unlockBodyScroll();
    } else unlockBodyScroll();
  }, [isAnyLocked]);

  // ── 자동 저장 ──
  useEffect(() => {
    if (!loaded) return;
    const data = {
      myNameMap,
      selectedDepot,
      anchorDateByDepot,
      holidaysText,
      nightDiaByDepot,
      routeScaleByDepot,
      highlightMap,
      tablesByDepot,
      homeDepot,
      selectedDate: fmt(selectedDate),
      compareSelected,
      overridesByDepot,
      nameOverridesByDepot,
    };
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn("[SAVE]", e);
      }
    }, SAVE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [
    loaded,
    myNameMap,
    anchorDateByDepot,
    holidaysText,
    homeDepot,
    nightDiaByDepot,
    routeScaleByDepot,
    highlightMap,
    tablesByDepot,
    selectedDate,
    compareSelected,
    overridesByDepot,
    nameOverridesByDepot,
  ]);

  useEffect(() => {
    window.triggerRouteTransition = triggerRouteTransition;
    window.setRouteTargetName = setRouteTargetName;
    return () => delete window.triggerRouteTransition;
  }, []);

  function rowAtDateForName(name, date) {
    if (!nameIndexMap.has(name) || !peopleRows.length) return undefined;
    const baseIdx = nameIndexMap.get(name);
    const dd = diffDays(date, anchorDate);
    const idx = mod(baseIdx + seatShift + dd, peopleRows.length);
    return peopleRows[idx];
  }

  function rosterAt(date) {
    return nameList.map((n) => {
      const r = rowAtDateForNameWithOverride(n, date);
      return { name: n, row: r, dia: r?.dia };
    });
  }

  const diaGridRows = useMemo(() => {
    if (!nameList?.length) return [];
    const yester = getYesterday(selectedDate);
    const entries = nameList.map((name) => {
      const rowToday = rowAtDateForNameWithOverride(name, selectedDate);
      const todayDia = rowToday?.dia;
      let type = "work",
        diaNum = toDiaNum(todayDia),
        daeNum = null,
        origHasTilde = false; // 원본 교번에 이미 ~가 있는지 (대N~, 25~ 등)
      if (typeof todayDia === "string") {
        const clean = todayDia.replace(/\s/g, "");
        if (clean.startsWith("휴")) type = "holiday";
        // 🔑 대N~ / N~ 은 원본 gyobun 상의 "비번 자리" — biban 으로 분류하되
        //    원본 표기를 그대로 유지하기 위해 플래그 기록.
        else if (clean.endsWith("~")) {
          type = "biban";
          origHasTilde = true;
        } else if (clean.includes("비번") || clean === "비") type = "biban";
        else if (/^대\d+$/i.test(clean)) {
          type = "dae";
          daeNum = Number(clean.replace(/[^0-9]/g, ""));
        }
      }
      let yDiaNum = null;
      if (type === "biban" || type === "dae") {
        const yRow = rowAtDateForNameWithOverride(name, yester);
        const n = toDiaNum(yRow?.dia);
        yDiaNum = Number.isFinite(n) ? n : null;
      }
      return {
        name,
        row: rowToday,
        type,
        diaNum,
        daeNum,
        origHasTilde,
        yDiaNum,
      };
    });
    const work = entries
      .filter((e) => e.type === "work" && Number.isFinite(e.diaNum))
      .sort((a, b) => a.diaNum - b.diaNum);
    const dae = entries
      .filter((e) => e.type === "dae" && Number.isFinite(e.daeNum))
      .sort(
        (a, b) =>
          a.daeNum - b.daeNum ||
          String(a.name).localeCompare(String(b.name), "ko")
      );
    const biban = entries
      .filter((e) => e.type === "biban")
      .sort((a, b) => {
        const ak = a.yDiaNum ?? 9999,
          bk = b.yDiaNum ?? 9999;
        if (ak !== bk) return ak - bk;
        return String(a.name).localeCompare(String(b.name), "ko");
      });
    const holiday = entries
      .filter((e) => e.type === "holiday")
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
    // 위 4개 분류 어디에도 안 들어간 사람 (교육·휴가·대기N·주·야 등)
    //  — 예전엔 목록에서 아예 사라졌음
    const used = new Set([...work, ...dae, ...biban, ...holiday]);
    const other = entries
      .filter((e) => !used.has(e))
      .sort(
        (a, b) =>
          String(a.row?.dia ?? "").localeCompare(String(b.row?.dia ?? ""), "ko", {
            numeric: true,
          }) || String(a.name).localeCompare(String(b.name), "ko")
      );
    return [...work, ...dae, ...other, ...biban, ...holiday].map(
      ({ name, row, type, origHasTilde }) => {
        let displayDia = row?.dia;

        // dae (대N 근무) — 원본 교번을 그대로 표시.
        // (과거 버그: 어제가 야간이면 "대N~" 로 덮어써서 비번처럼 보이게 만들었음.
        //  "~" 는 원본 gyobun 에 이미 대N~ 형태로 존재하는 "비번 자리" 전용이므로
        //  dae 자리에는 절대 덧붙이지 않는다.)

        if (type === "biban") {
          // 원본이 이미 대N~, N~ 같이 ~ 붙은 교번이면 그대로 표시
          if (origHasTilde && typeof displayDia === "string") {
            displayDia = displayDia.replace(/\s+/g, "");
          } else {
            // override 등으로 "비번" 문자열이 들어온 경우 — 어제 야간 여부로 표기 결정
            const yRow = rowAtDateForNameWithOverride(name, yester);
            const yDiaRaw = yRow?.dia;
            const yDia =
              typeof yDiaRaw === "string"
                ? yDiaRaw.trim().replace(/\s+/g, "")
                : yDiaRaw;
            // 🌙 worktime 기반 판정 (threshold 폐기)
            const prevNight = yRow
              ? computeInOut(yRow, yester, holidaySet).isNight
              : false;
            displayDia = prevNight ? `${String(yDia)}~` : "비번";
          }
        }
        return { name, row: { ...row, dia: displayDia } };
      }
    );
  }, [
    nameList,
    selectedDate,
    selectedDepot,
    overridesByDepot,
    commonMap,
    anchorDateStr,
    holidaySet,
    peopleRows,
    overrideTemplates,
    seatShift,
  ]);

  const nameGridRows = useMemo(() => {
    const rows = rosterAt(selectedDate);
    return [...rows].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "ko")
    );
  }, [
    selectedDate,
    nameList,
    selectedDepot,
    overridesByDepot,
    anchorDateStr,
    commonMap,
    peopleRows,
    overrideTemplates,
    seatShift,
  ]);

  const days = monthGridMonday(selectedDate);
  const todayISO = fmt(today);

  const swipeRef = React.useRef({ x: 0, y: 0, lock: null });
  const lastMoveRef = React.useRef({ x: 0, t: 0 });
  const SWIPE_X_THRESHOLD = 40,
    VELOCITY_THRESHOLD = 0.35,
    ACTIVATION_THRESHOLD = 10,
    SNAP_MS = 320;

  const onCalTouchStart = (e) => {
    if (e.target.closest("[data-no-gesture]")) return;
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, lock: null };
    lastMoveRef.current = { x: t.clientX, t: performance.now() };
    setIsSnapping(false);
    setDragX(0);
  };
  const onCalTouchMove = (e) => {
    if (e.target.closest("[data-no-gesture]")) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeRef.current.x,
      dy = t.clientY - swipeRef.current.y;
    if (swipeRef.current.lock === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > ACTIVATION_THRESHOLD)
        swipeRef.current.lock = "h";
      else if (
        Math.abs(dy) > Math.abs(dx) &&
        Math.abs(dy) > ACTIVATION_THRESHOLD
      )
        swipeRef.current.lock = "v";
    }
    if (swipeRef.current.lock === "h") {
      e.preventDefault();
      setDragX(dx);
      lastMoveRef.current = { x: t.clientX, t: performance.now() };
    }
  };
  const onCalTouchEnd = (e) => {
    if (swipeRef.current.lock !== "h") {
      setDragX(0);
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeRef.current.x;
    const now = performance.now(),
      dt = Math.max(1, now - lastMoveRef.current.t);
    const vx = (t.clientX - lastMoveRef.current.x) / dt;
    const width =
      gridWrapRef.current?.parentElement?.offsetWidth ||
      (gridWrapRef.current?.offsetWidth
        ? gridWrapRef.current.offsetWidth / 3
        : window.innerWidth);
    const goNext =
      dx < 0 &&
      (Math.abs(dx) > SWIPE_X_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD);
    const goPrev =
      dx > 0 &&
      (Math.abs(dx) > SWIPE_X_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD);
    setIsSnapping(true);
    if (goNext) {
      setDragX(-width);
      setTimeout(() => {
        setSelectedDate((prev) => addMonthsSafe(prev, 1));
        setCalHasSelection(false);
        setIsSnapping(false);
        setDragX(0);
      }, SNAP_MS);
    } else if (goPrev) {
      setDragX(width);
      setTimeout(() => {
        setSelectedDate((prev) => addMonthsSafe(prev, -1));
        setCalHasSelection(false);
        setIsSnapping(false);
        setDragX(0);
      }, SNAP_MS);
    } else {
      setDragX(0);
      setTimeout(() => setIsSnapping(false), SNAP_MS);
    }
    swipeRef.current = { x: 0, y: 0, lock: null };
  };

  const V_SNAP_MS = 300,
    V_DIST_RATIO = 0.1,
    V_VELOCITY_THRESHOLD = 0.1,
    V_ACTIVATE = 12,
    V_DIR = 1.2;
  function rubberband(distance, limit) {
    const constant = 0.55;
    if (Math.abs(distance) < limit) return distance;
    const excess = Math.abs(distance) - limit,
      sign = Math.sign(distance);
    return (
      sign *
      (limit +
        (1 - Math.exp(-excess / (limit / constant))) * (limit / constant))
    );
  }

  const [dragYHome, setDragYHome] = useState(0);
  const [dragYRoute, setDragYRoute] = useState(0);
  const [snapYHome, setSnapYHome] = useState(false);
  const [snapYRoute, setSnapYRoute] = useState(false);
  const [altView, setAltView] = React.useState(false);
  const longPressTimer = React.useRef(null);
  const longPressActive = React.useRef(false);

  const handleTouchStart = React.useCallback(() => {
    if (selectedDepot === "문양" || selectedDepot === "경산") return;
    longPressActive.current = true;
    longPressTimer.current = setTimeout(() => {
      if (longPressActive.current) setAltView((v) => !v);
    }, 600);
  }, [selectedDepot]);
  const handleTouchEnd = React.useCallback(() => {
    longPressActive.current = false;
    clearTimeout(longPressTimer.current);
  }, []);

  React.useEffect(() => {
    setAltView(false);
  }, []);
  React.useEffect(() => {
    if (selectedTab === "route") setAltView(false);
  }, [selectedTab]);
  React.useEffect(() => {
    setAltView(false);
  }, [selectedDate]);
  React.useEffect(() => {
    setAltView(false);
  }, [routeTargetName, selectedDate]);

  const homeWrapRef = React.useRef(null);
  const homePanelRefs = [React.useRef(null), React.useRef(null)];
  const routeWrapRef = React.useRef(null);
  const routePanelRefs = [
    React.useRef(null),
    React.useRef(null),
    React.useRef(null),
    React.useRef(null),
  ];
  const [homeHeight, setHomeHeight] = useState(0);
  const [routeHeight, setRouteHeight] = useState(0);

  useLayoutEffect(() => {
    const el = homePanelRefs[homePage].current;
    if (!el) return;
    const measure = () =>
      setHomeHeight(el.offsetHeight || el.clientHeight || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", measure);
    };
  }, [
    homePage,
    selectedDate,
    currentTableText,
    holidaysText,
    nightDiaThreshold,
    myName,
    tempName,
  ]);

  useLayoutEffect(() => {
    const el = routePanelRefs[routePage].current;
    if (!el) return;
    const measure = () =>
      setRouteHeight(el.offsetHeight || el.clientHeight || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", measure);
    };
  }, [
    routePage,
    selectedDate,
    holidaysText,
    nightDiaThreshold,
    myName,
    routeTargetName,
  ]);

  function makeVerticalHandlers(kind) {
    const swipeRef = React.useRef({ x: 0, y: 0, lock: null });
    const lastMoveRef = React.useRef({ y: 0, t: 0 });
    const [pendingDir, setPendingDir] = React.useState(null);
    const onStart = (e) => {
      if (e.target.closest("[data-no-gesture]")) return;
      const t = e.touches[0];
      swipeRef.current = { x: t.clientX, y: t.clientY, lock: null };
      lastMoveRef.current = { y: t.clientY, t: performance.now() };
      if (kind === "home") setSnapYHome(false);
      else setSnapYRoute(false);
    };
    const onMove = (e) => {
      if (e.target.closest("[data-no-gesture]")) return;
      const t = e.touches[0];
      const dx = t.clientX - swipeRef.current.x,
        dy = t.clientY - swipeRef.current.y;
      if (swipeRef.current.lock === null) {
        if (Math.abs(dy) > Math.abs(dx) * V_DIR && Math.abs(dy) > V_ACTIVATE) {
          swipeRef.current.lock = "v";
          lockBodyScroll();
        } else if (
          Math.abs(dx) > Math.abs(dy) * V_DIR &&
          Math.abs(dx) > V_ACTIVATE
        )
          swipeRef.current.lock = "h";
      }
      if (swipeRef.current.lock !== "v") return;
      if (e.cancelable) e.preventDefault();
      const wrap = kind === "home" ? homeWrapRef.current : routeWrapRef.current;
      const page = kind === "home" ? homePage : routePage,
        MAX = kind === "home" ? 1 : 3;
      const wrapH = wrap?.offsetHeight || window.innerHeight * 0.6;
      const rb = rubberband(dy, wrapH);
      let bounded = rb;
      if (page <= 0) bounded = Math.min(0, rb);
      else if (page >= MAX) bounded = Math.max(0, rb);
      bounded = clamp(bounded, -wrapH, wrapH);
      if (kind === "home") setDragYHome(bounded);
      else setDragYRoute(bounded);
      lastMoveRef.current = { y: t.clientY, t: performance.now() };
    };
    const onEnd = (e) => {
      if (swipeRef.current.lock !== "v") {
        if (kind === "home") setDragYHome(0);
        else setDragYRoute(0);
        unlockBodyScroll();
        return;
      }
      const t = e.changedTouches[0];
      const dy = t.clientY - swipeRef.current.y;
      const now = performance.now(),
        dt = Math.max(1, now - lastMoveRef.current.t);
      const vy = (t.clientY - lastMoveRef.current.y) / dt;
      const wrap = kind === "home" ? homeWrapRef.current : routeWrapRef.current;
      const page = kind === "home" ? homePage : routePage,
        MAX = kind === "home" ? 1 : 3;
      const setDrag = kind === "home" ? setDragYHome : setDragYRoute,
        setSnap = kind === "home" ? setSnapYHome : setSnapYRoute;
      const height = wrap?.offsetHeight || window.innerHeight * 0.6;
      const passedDist = Math.abs(dy) > height * V_DIST_RATIO,
        fast = Math.abs(vy) > V_VELOCITY_THRESHOLD;
      const goNext = dy < 0 && (passedDist || fast),
        goPrev = dy > 0 && (passedDist || fast);
      setSnap(true);
      if (goNext && page < MAX) {
        setPendingDir("next");
        setDrag(-height);
      } else if (goPrev && page > 0) {
        setPendingDir("prev");
        setDrag(height);
      } else {
        setDrag(0);
        setTimeout(() => setSnap(false), V_SNAP_MS);
      }
      swipeRef.current = { x: 0, y: 0, lock: null };
    };
    const onTransitionEnd = () => {
      if (!pendingDir) return;
      if (kind === "home") {
        if (pendingDir === "next") setHomePage((p) => Math.min(p + 1, 1));
        else setHomePage((p) => Math.max(p - 1, 0));
        setDragYHome(0);
        setSnapYHome(false);
      } else {
        if (pendingDir === "next") setRoutePage((p) => Math.min(p + 1, 3));
        else setRoutePage((p) => Math.max(p - 1, 0));
        setDragYRoute(0);
        setSnapYRoute(false);
      }
      setPendingDir(null);
    };
    const onCancel = () => {
      if (kind === "home") {
        setDragYHome(0);
        setSnapYHome(false);
      } else {
        setDragYRoute(0);
        setSnapYRoute(false);
      }
      setPendingDir(null);
      unlockBodyScroll();
    };
    return { onStart, onMove, onEnd, onTransitionEnd, onCancel };
  }

  const vHome = makeVerticalHandlers("home");
  const vRoute = makeVerticalHandlers("route");
  const swipeHomeP1 = useDaySwipeHandlers();
  const swipeRosterP0 = useDaySwipeHandlers();
  const swipeRouteP0 = useDaySwipeHandlers();
  const swipeRouteP1 = useDaySwipeHandlers();
  const swipeRouteP2 = useDaySwipeHandlers();
  const swipeRouteP3 = useDaySwipeHandlers();

  async function onUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await readTextFile(f);
    setTablesByDepot((prev) => ({ ...prev, [selectedDepot]: txt }));
    e.target.value = "";
  }

  async function resetAll() {
    if (
      !confirm(
        "모든 저장 데이터를 초기화할까요?\n(ZIP 파일, 설정, 일일 변경 등 모두 삭제)"
      )
    )
      return;

    // 1) localStorage 전체 비우기 (setupDone 포함)
    try {
      localStorage.clear();
    } catch {}

    // 2) IndexedDB 전체 삭제 (commonMap, zip blobs, zip handles 모두)
    try {
      await resetAllStorage();
    } catch (e) {
      console.warn("[resetAll] IDB 삭제 실패", e);
    }

    // 3) Cache Storage + Service Worker 정리
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}

    // 4) 새로고침 — reload 이후 모든 state 가 기본값으로 다시 초기화되고
    //    SetupWizard 가 자동 표시됨 (commonMap 없음 + setupDone 없음).
    //    reload 전에 setState 는 의미 없으므로 호출하지 않음.
    try {
      window.location.reload();
    } catch {}
  }

  const isPortrait = usePortraitOnly();

  // ── ROUTE 공통 계산 ──
  const routeTarget = routeTargetName || myName;
  const routeRow = React.useMemo(
    () => rowAtDateForNameWithOverride(routeTarget, selectedDate),
    [
      routeTarget,
      selectedDate,
      selectedDepot,
      overridesByDepot, // 교번 override 적용/해제 반영
      commonMap, // 영구 변경(swap) 반영
      anchorDateStr, // anchor 이동 시 반영
      peopleRows,
      overrideTemplates,
      seatShift,
    ]
  );
  const routeT = React.useMemo(
    () => computeInOut(routeRow, selectedDate, holidaySet, nightDiaThreshold),
    [routeRow, selectedDate, holidaySet, nightDiaThreshold]
  );
  const routeCombo = routeT?.combo || "";
  const routeDia = routeRow?.dia ?? null;
  const routeIn = routeT.in,
    routeOut = routeT.out;
  const routeDiaLabel = routeRow?.dia == null ? "-" : String(routeRow.dia);
  const routeNote = `${routeT.combo}${routeT.isNight ? " (야간)" : ""}`;
  const iso = fmt(selectedDate);
  const wk = weekdaysKR[(selectedDate.getDay() + 6) % 7];
  const startHM = normalizeHM(routeIn),
    endHM = normalizeHM(routeOut);

  // ── 새 방식: commonMap 기반 파생값 ──
  const depotKey = DEPOT_TO_ZIP_KEY[selectedDepot] || selectedDepot;
  const currentCommonData = commonMap?.[depotKey] || null;
  const currentGyobunList = currentCommonData?.gyobun || DUTY_OPTIONS;
  // 근무자 편집 > 교번: 교번표 + "이 날짜만" 용 비번/휴/교육/휴가
  const personEditCodeList = React.useMemo(() => {
    const base = currentCommonData?.gyobun?.length
      ? currentCommonData.gyobun
      : DUTY_OPTIONS;
    return Array.from(new Set([...base, "비번", "휴", "교육", "휴가"]));
  }, [currentCommonData, DUTY_OPTIONS]);
  const currentPaths = currentCommonData?.paths || {};
  const routeCodeStr = tsvDiaToRouteCode(routeRow?.dia);

  // 각 교번을 "지금" 소유한 사람 맵 — PersonEditModal swap 미리보기용
  // (anchor=today, dd=0 이므로 names[i] 의 교번 = gyobun[i])
  // 각 교번을 "보고 있는 날짜에" 받는 사람 — PersonEditModal 교환 미리보기용
  const codeOwnerMap = React.useMemo(() => {
    const map = {};
    const names = currentCommonData?.names || [];
    const gyobun = currentCommonData?.gyobun || [];
    const len = Math.min(names.length, gyobun.length);
    if (!len) return map;
    const dd = diffDays(selectedDate, anchorDate);
    for (let c = 0; c < len; c++) {
      const code = gyobun[c];
      if (code) map[code] = names[mod(c - seatShift - dd, len)] || "";
    }
    return map;
  }, [currentCommonData, selectedDate, anchorDate, seatShift]);

  // 수정모드 셀 탭 → PersonEditModal 열기 (override 정보 함께 전달)
  function openPersonEditModal(name, row) {
    const iso = fmt(stripTime(new Date(selectedDate)));
    const hasTodayCode = !!overridesByDepot?.[selectedDepot]?.[iso]?.[name];
    const hasTodayName = !!nameOverridesByDepot?.[selectedDepot]?.[iso]?.[name];
    // row 는 override 적용된 상태 → base 를 따로 계산
    const baseRow = rowAtDateForName(name, selectedDate);
    const baseCode = tsvDiaToRouteCode(baseRow?.dia);
    // 현재 표시중인 교번(override 적용)
    const currentCode = tsvDiaToRouteCode(row?.dia);
    setPersonEditModal({
      open: true,
      oldName: name,
      oldCode: currentCode,
      baseName: name,
      baseCode,
      hasTodayCode,
      hasTodayName,
    });
  }

  const routeTargetPhone = React.useMemo(() => {
    const p =
      (peopleRows || []).find((r) => r.name === routeTarget)?.phone || "";
    return String(p).trim();
  }, [peopleRows, routeTarget]);

  return (
    <div className="app-shell">
      {!isPortrait && <LandscapeOverlay />}
      <div
        aria-hidden={!isPortrait}
        inert={!isPortrait ? "" : undefined}
        ref={appRef}
        className="max-w-7xl mx-auto relative pb-0"
        style={{
          height: "100vh",
          overflowY:
            selectedTab === "settings" || selectedTab === "compare"
              ? "auto"
              : "hidden",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          touchAction: selectedTab === "compare" ? "pan-y" : "manipulation",
          // compare 탭에서 아래 탭바에 가려지지 않도록 하단 패딩
          paddingBottom: selectedTab === "compare" ? "80px" : undefined,
        }}
      >
        {/* 홈 탭 */}
        {selectedTab === "home" && (
          <div
            ref={homeWrapRef}
            className="mt-4 select-none overflow-hidden rounded-2xl overscroll-contain"
            style={{
              height: slideViewportH,
              touchAction: isHomeCalLocked ? "none" : "pan-y",
            }}
            onTouchStart={vHome.onStart}
            onTouchMove={vHome.onMove}
            onTouchEnd={vHome.onEnd}
            onTouchCancel={vHome.onCancel}
            onWheel={(e) => {
              if (isHomeCalLocked) e.preventDefault();
              if (snapYHome) return;
              const TH = 40;
              if (e.deltaY > TH && homePage === 0) {
                setSnapYHome(true);
                setDragYHome(-(homeWrapRef.current?.offsetHeight || 500));
                setTimeout(() => {
                  setHomePage(1);
                  setSnapYHome(false);
                  setDragYHome(0);
                }, 320);
              } else if (e.deltaY < -TH && homePage === 1) {
                setSnapYHome(true);
                setDragYHome(homeWrapRef.current?.offsetHeight || 500);
                setTimeout(() => {
                  setHomePage(0);
                  setSnapYHome(false);
                  setDragYHome(0);
                }, 320);
              }
            }}
          >
            <div
              className="relative"
              style={{
                transform: `translateY(${
                  (homePage === 0 ? 0 : -slideViewportH) + dragYHome
                }px)`,
                transition: snapYHome
                  ? `transform ${V_SNAP_MS}ms ease-out`
                  : "none",
                willChange: "transform",
              }}
              onTransitionEnd={vHome.onTransitionEnd}
            >
              {/* Panel 0: 캘린더 */}
              <div
                ref={homePanelRefs[0]}
                className="bg-gray-800 rounded-2xl p-3 shadow mb-7"
                style={{ minHeight: slideViewportH }}
              >
                <div className="flex items-center justify-between mb-0">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}
                    월
                  </h2>
                  <div className="flex items-center gap-2">
                    <input
                      type="month"
                      className="bg-gray-700 rounded-xl px-2 py-1 text-xs"
                      value={`${selectedDate.getFullYear()}-${String(
                        selectedDate.getMonth() + 1
                      ).padStart(2, "0")}`}
                      onChange={(e) => {
                        const [y, m] = String(e.target.value || "")
                          .split("-")
                          .map(Number);
                        if (!y || !m) return; // 비우기(지우기) 시 무시
                        setSelectedDate(
                          stripTime(new Date(y, (m || 1) - 1, 1))
                        );
                        setCalHasSelection(false);
                      }}
                    />
                    {fmt(selectedDate) !== fmt(today) && (
                      <button
                        className="px-2 py-1 rounded-xl bg-indigo-500 text-white text-xs"
                        onClick={() => {
                          setSelectedDate(today);
                          setCalHasSelection(true);
                          lastClickedRef.current = fmt(today);
                        }}
                      >
                        오늘로
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300">소속</span>
                    <select
                      className="bg-gray-700 rounded-xl p-1 text-xs"
                      value={selectedDepot}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedDepot(v);
                        setHomeDepot(v);
                      }}
                    >
                      {DEPOTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-300">대상 이름</span>
                    <select
                      className="bg-gray-700 rounded-xl p-1 text-xs"
                      value={tempName || myName}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === myName) setTempName("");
                        else setTempName(val);
                      }}
                    >
                      {[myName, ...nameList.filter((n) => n !== myName)].map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        )
                      )}
                    </select>
                    {tempName && (
                      <button
                        onClick={() => setTempName("")}
                        className="px-2 py-1 rounded-xl bg-orange-700 text-[11px] text-gray-200"
                      >
                        내이름
                      </button>
                    )}
                  </div>
                  {tempName && (
                    <div className="text-[11px] text-yellow-400">
                      {tempName}님의 근무표 임시 보기 중
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-300 mb-1">
                  {["일", "월", "화", "수", "목", "금", "토"].map((w, idx) => (
                    <div
                      key={w}
                      className={
                        "py-0.5 " +
                        (idx === 6
                          ? "text-blue-400"
                          : idx === 0
                          ? "text-red-400"
                          : "text-white")
                      }
                    >
                      {w}
                    </div>
                  ))}
                </div>

                <div
                  className="select-none overflow-hidden"
                  onTouchStart={onCalTouchStart}
                  onTouchMove={onCalTouchMove}
                  onTouchEnd={onCalTouchEnd}
                >
                  <div
                    ref={gridWrapRef}
                    className="flex"
                    style={{
                      width: "300%",
                      transform: `translateX(calc(-33.333% + ${dragX}px))`,
                      transition: isSnapping
                        ? "transform 320ms ease-out"
                        : "none",
                      willChange: "transform",
                    }}
                  >
                    {[-1, 0, 1].map((offset) => {
                      const monthDate = addMonthsSafe(selectedDate, offset);
                      const monthDays = monthGridSunday(monthDate);
                      const thisMonthIdx = monthDate.getMonth();
                      const lastCellIdx = (() => {
                        let last = 0;
                        for (let i = 0; i < monthDays.length; i++) {
                          if (monthDays[i].getMonth() === thisMonthIdx)
                            last = i;
                        }
                        return last;
                      })();
                      const actualRows = Math.floor(lastCellIdx / 7) + 1;
                      return (
                        <div
                          key={offset}
                          className="grid grid-cols-7 gap-1 px-1 py-1 box-border flex-shrink-0"
                          style={{
                            width: "calc(100% / 3)",
                            height: "100%",
                            gridTemplateRows: "repeat(6, minmax(0,1fr))",
                          }}
                        >
                          {monthDays.map((d, i) => {
                            const rowIndex = Math.floor(i / 7),
                              isHiddenRow = rowIndex >= actualRows;
                            const isoD = fmt(d),
                              isToday = isoD === fmt(today),
                              isSelected =
                                calHasSelection && isoD === fmt(selectedDate);
                            const isOutside = d.getMonth() !== thisMonthIdx;
                            const activeName = tempName || myName;
                            const row = rowAtDateForNameWithOverride(
                              activeName,
                              d
                            );
                            const t = computeInOut(row, d, holidaySet);
                            const diaLabel =
                              row?.dia == null
                                ? "-"
                                : (hasOverride(selectedDepot, d, activeName)
                                    ? "*"
                                    : "") +
                                  (typeof row.dia === "number"
                                    ? `${row.dia}D`
                                    : String(row.dia));
                            const dayType = getDayType(d, holidaySet);
                            const dayColor =
                              dayType === "토"
                                ? "text-blue-400"
                                : dayType === "휴"
                                ? "text-red-400"
                                : "text-gray-100";
                            // 🌙 색상: computeInOut 의 isNight 로 통일 (worktime 기반)
                            //   - 야간 → 하늘색
                            //   - 일반 근무 → 노란색
                            //   - 비번/휴무 → 색 없음
                            let diaColorClass = "";
                            const diaStr = String(row?.dia || "").replace(
                              /\s/g,
                              ""
                            );
                            const isOff =
                              !diaStr ||
                              diaStr.startsWith("휴") ||
                              diaStr.includes("비번") ||
                              diaStr === "비" ||
                              diaStr.endsWith("~");
                            if (!isOff && row?.dia != null) {
                              diaColorClass = t.isNight
                                ? "text-sky-300"
                                : "text-yellow-300";
                            }
                            return (
                              <button
                                key={i}
                                onTouchStart={(e) => {
                                  longPressDidFireRef.current = false;
                                  longPressActiveRef.current = true;
                                  clearTimeout(longPressTimerRef.current);
                                  longPressTimerRef.current = setTimeout(() => {
                                    if (!longPressActiveRef.current) return;
                                    longPressDidFireRef.current = true;
                                    const person = (
                                      tempName ||
                                      myName ||
                                      ""
                                    ).trim();
                                    if (!person) return; // 대상 이름 없음
                                    setDutyModal({
                                      open: true,
                                      date: stripTime(d),
                                      name: person,
                                    });
                                  }, LONG_MS);
                                }}
                                onTouchMove={(e) => {
                                  longPressActiveRef.current = false;
                                  clearTimeout(longPressTimerRef.current);
                                }}
                                onTouchEnd={(e) => {
                                  clearTimeout(longPressTimerRef.current);
                                  longPressActiveRef.current = false;
                                }}
                                onClick={() => {
                                  if (longPressDidFireRef.current) {
                                    longPressDidFireRef.current = false;
                                    return;
                                  }
                                  const iso2 = fmt(d);
                                  if (lastClickedRef.current === iso2) {
                                    setRouteTargetName(
                                      tempName ? tempName : ""
                                    );
                                    setSelectedTab("route");
                                    setRoutePage(0);
                                    setDragYRoute(0);
                                  } else {
                                    setSelectedDate(stripTime(d));
                                    lastClickedRef.current = iso2;
                                    setCalHasSelection(true);
                                  }
                                }}
                                className={
                                  "w-full h-full rounded-lg text-left relative " +
                                  (isHiddenRow
                                    ? " invisible pointer-events-none "
                                    : "") +
                                  (isOutside
                                    ? "bg-gray-800/40 opacity-60"
                                    : "bg-gray-700/60 hover:bg-gray-700")
                                }
                                aria-hidden={isHiddenRow ? "true" : undefined}
                                tabIndex={isHiddenRow ? -1 : 0}
                                style={{ padding: "0.5rem" }}
                                title={`${diaLabel} / ${t.combo}/${t.in}/${t.out}`}
                              >
                                {/* 오늘 빨강 테두리 (항상 유지) */}
                                {isToday && (
                                  <span className="absolute inset-0 rounded-lg ring-2 ring-red-400 pointer-events-none" />
                                )}
                                {/* 선택 파랑 테두리 — 오늘이 아닐 때만 */}
                                {isSelected && !isToday && (
                                  <span className="absolute inset-0 rounded-lg ring-2 ring-blue-400 pointer-events-none" />
                                )}
                                <div>
                                  <div className="flex items-center justify-between">
                                    <div
                                      className={
                                        "font-semibold text-sm " + dayColor
                                      }
                                    >
                                      {d.getDate()}
                                    </div>
                                  </div>
                                  <div
                                    className={
                                      "mt-1 text-[10px] leading-4 " +
                                      (isOutside
                                        ? "text-gray-300"
                                        : "text-gray-100")
                                    }
                                  >
                                    <div
                                      className={`whitespace-nowrap text-[clamp(14px,2.8vw,15px)] leading-tight ${diaColorClass} mb-[4px]`}
                                    >
                                      {diaLabel}
                                    </div>
                                    <div className="flex flex-col gap-[3px] leading-[1.08]">
                                      <div className="whitespace-nowrap text-[clamp(12px,2.6vw,12px)]">
                                        {t.in}
                                      </div>
                                      <div className="whitespace-nowrap text-[clamp(11px,2.6vw,12px)]">
                                        {t.out}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Panel 1: 선택일 전체 교번 */}
              <div
                ref={homePanelRefs[1]}
                className="bg-gray-800 rounded-2xl p-3 shadow"
                style={{ minHeight: slideViewportH }}
              >
                <div
                  className="flex items-center justify-between mb-2"
                  data-no-gesture
                >
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <List className="w-5 h-5" />
                    전체 교번
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      className="bg-gray-700 rounded-xl px-2 py-1 text-sm"
                      value={fmt(selectedDate)}
                      onChange={(e) => {
                        const d = parseYMD(e.target.value);
                        if (d) setSelectedDate(d);
                      }}
                    />
                    <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-200 text-[11px]">
                      {weekdaysKR[(selectedDate.getDay() + 6) % 7]}
                    </span>
                    {fmt(selectedDate) !== fmt(today) && (
                      <button
                        className="px-2 py-1 rounded-xl bg-indigo-600 text-white text-xs"
                        onClick={() => setSelectedDate(stripTime(new Date()))}
                      >
                        오늘로
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-end mb-2 gap-1.5" data-no-gesture>
                  <button
                    className={
                      "rounded-full px-3 py-1 text-sm font-semibold transition " +
                      (rosterEditMode
                        ? "bg-amber-500 hover:bg-amber-400 text-gray-900"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-100")
                    }
                    onClick={() => setRosterEditMode((v) => !v)}
                  >
                    {rosterEditMode ? "✓ 완료" : "✏️ 수정"}
                  </button>
                  <button
                    className="rounded-full px-3 py-1 text-sm bg-cyan-600 text-white"
                    onClick={() =>
                      setOrderMode((m) =>
                        m === "person" ? "dia" : m === "dia" ? "name" : "person"
                      )
                    }
                  >
                    {orderMode === "person"
                      ? "DIA 순서로 보기"
                      : orderMode === "dia"
                      ? "이름순으로 보기"
                      : "순번으로 보기"}
                  </button>
                </div>
                {rosterEditMode && (
                  <div className="mb-2 p-2 rounded-lg bg-amber-900/30 border border-amber-500/40 text-[11px] text-amber-200">
                    🔧 이름 수정 모드 — 셀을 탭하면 이름 변경 창이 열립니다.
                  </div>
                )}
                {/* 홈 panel1 RosterGrid — onPick 유지 (행로표 이동) */}
                {orderMode === "person" && (
                  <RosterGrid
                    rows={rosterAt(selectedDate)}
                    holidaySet={holidaySet}
                    date={selectedDate}
                    nightDiaThreshold={nightDiaThreshold}
                    highlightMap={highlightMap}
                    onPick={(name) => {
                      setRouteTargetName(name);
                      if (window.triggerRouteTransition)
                        window.triggerRouteTransition();
                      else setSelectedTab("route");
                    }}
                    onEditTap={openPersonEditModal}
                    editMode={rosterEditMode}
                    displayName={displayName}
                    hasNameOverride={hasNameOverride}
                    selectedDepot={selectedDepot}
                    daySwipe={{
                      ref: swipeHomeP1.ref,
                      onStart: swipeHomeP1.onStart,
                      onMove: swipeHomeP1.onMove,
                      onEnd: swipeHomeP1.onEnd(goPrevDay, goNextDay),
                      style: swipeHomeP1.style,
                    }}
                    isOverridden={(name, d) =>
                      hasOverride(selectedDepot, d, name)
                    }
                  />
                )}
                {orderMode === "dia" && (
                  <RosterGrid
                    rows={diaGridRows}
                    holidaySet={holidaySet}
                    date={selectedDate}
                    nightDiaThreshold={nightDiaThreshold}
                    highlightMap={highlightMap}
                    onPick={(name) => {
                      setRouteTargetName(name);
                      if (window.triggerRouteTransition)
                        window.triggerRouteTransition();
                      else setSelectedTab("route");
                    }}
                    onEditTap={openPersonEditModal}
                    editMode={rosterEditMode}
                    displayName={displayName}
                    hasNameOverride={hasNameOverride}
                    selectedDepot={selectedDepot}
                    daySwipe={{
                      ref: swipeHomeP1.ref,
                      onStart: swipeHomeP1.onStart,
                      onMove: swipeHomeP1.onMove,
                      onEnd: swipeHomeP1.onEnd(goPrevDay, goNextDay),
                      style: swipeHomeP1.style,
                    }}
                    isOverridden={(name, d) =>
                      hasOverride(selectedDepot, d, name)
                    }
                  />
                )}
                {orderMode === "name" && (
                  <RosterGrid
                    rows={nameGridRows}
                    holidaySet={holidaySet}
                    date={selectedDate}
                    nightDiaThreshold={nightDiaThreshold}
                    highlightMap={highlightMap}
                    onPick={(name) => {
                      setRouteTargetName(name);
                      triggerRouteTransition();
                    }}
                    onEditTap={openPersonEditModal}
                    editMode={rosterEditMode}
                    displayName={displayName}
                    hasNameOverride={hasNameOverride}
                    selectedDepot={selectedDepot}
                    daySwipe={{
                      ref: swipeRosterP0.ref,
                      onStart: swipeRosterP0.onStart,
                      onMove: swipeRosterP0.onMove,
                      onEnd: swipeRosterP0.onEnd(goPrevDay, goNextDay),
                      style: swipeRosterP0.style,
                    }}
                    isOverridden={(name, d) =>
                      hasOverride(selectedDepot, d, name)
                    }
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 전체 탭 — onCodeTap 으로 교번 변경 */}
        {selectedTab === "roster" && (
          <div
            className="bg-gray-800 rounded-2xl p-3 shadow mt-4"
            style={{ minHeight: slideViewportH }}
          >
            <div
              className="flex items-center justify-between mb-2"
              data-no-gesture
            >
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <List className="w-5 h-5" />
                전체 교번
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  className="bg-gray-700 rounded-xl px-2 py-1 text-sm"
                  value={fmt(selectedDate)}
                  onChange={(e) => {
                    const d = parseYMD(e.target.value);
                    if (d) setSelectedDate(d);
                  }}
                />
                <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-200 text-[11px]">
                  {weekdaysKR[(selectedDate.getDay() + 6) % 7]}
                </span>
                {fmt(selectedDate) !== fmt(today) && (
                  <button
                    className="px-2 py-1 rounded-xl bg-indigo-600 text-white text-xs"
                    onClick={() => setSelectedDate(stripTime(new Date()))}
                  >
                    오늘로
                  </button>
                )}
              </div>
            </div>
            <div
              className="flex items-center justify-between mb-2 gap-2 flex-wrap"
              data-no-gesture
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">소속</span>
                <select
                  className="bg-gray-700 rounded-xl px-2 py-1 text-sm"
                  value={selectedDepot}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedDepot(v);
                    setHomeDepot(v);
                  }}
                >
                  {DEPOTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className={
                    "rounded-full px-3 py-1 text-sm font-semibold transition " +
                    (rosterEditMode
                      ? "bg-amber-500 hover:bg-amber-400 text-gray-900"
                      : "bg-gray-700 hover:bg-gray-600 text-gray-100")
                  }
                  onClick={() => setRosterEditMode((v) => !v)}
                  title="이름 편집"
                >
                  {rosterEditMode ? "✓ 완료" : "✏️ 수정"}
                </button>
                <button
                  className="rounded-full px-3 py-1 text-sm bg-cyan-600 text-white"
                  onClick={() =>
                    setOrderMode((m) =>
                      m === "person" ? "dia" : m === "dia" ? "name" : "person"
                    )
                  }
                >
                  {orderMode === "person"
                    ? "DIA 순서로 보기"
                    : orderMode === "dia"
                    ? "이름순으로 보기"
                    : "순번으로 보기"}
                </button>
              </div>
            </div>
            {rosterEditMode && (
              <div className="mb-2 p-2 rounded-lg bg-amber-900/30 border border-amber-500/40 text-[11px] text-amber-200">
                🔧 이름 수정 모드 — 셀을 탭하여 이름을 변경하세요.{" "}
                <span className="text-amber-300">"오늘 하루만"</span> 또는{" "}
                <span className="text-amber-300">"영구 개명"</span> 선택 가능.
              </div>
            )}
            {orderMode === "person" && (
              <RosterGrid
                rows={rosterAt(selectedDate)}
                holidaySet={holidaySet}
                date={selectedDate}
                nightDiaThreshold={nightDiaThreshold}
                highlightMap={highlightMap}
                onPick={(name) => {
                  setRouteTargetName(name);
                  if (window.triggerRouteTransition)
                    window.triggerRouteTransition();
                  else setSelectedTab("route");
                }}
                onEditTap={openPersonEditModal}
                editMode={rosterEditMode}
                displayName={displayName}
                hasNameOverride={hasNameOverride}
                selectedDepot={selectedDepot}
                daySwipe={{
                  ref: swipeRosterP0.ref,
                  onStart: swipeRosterP0.onStart,
                  onMove: swipeRosterP0.onMove,
                  onEnd: swipeRosterP0.onEnd(goPrevDay, goNextDay),
                  style: swipeRosterP0.style,
                }}
                isOverridden={(name, d) => hasOverride(selectedDepot, d, name)}
              />
            )}
            {orderMode === "dia" && (
              <RosterGrid
                rows={diaGridRows}
                holidaySet={holidaySet}
                date={selectedDate}
                nightDiaThreshold={nightDiaThreshold}
                highlightMap={highlightMap}
                onPick={(name) => {
                  setRouteTargetName(name);
                  if (window.triggerRouteTransition)
                    window.triggerRouteTransition();
                  else setSelectedTab("route");
                }}
                onEditTap={openPersonEditModal}
                editMode={rosterEditMode}
                displayName={displayName}
                hasNameOverride={hasNameOverride}
                selectedDepot={selectedDepot}
                daySwipe={{
                  ref: swipeRosterP0.ref,
                  onStart: swipeRosterP0.onStart,
                  onMove: swipeRosterP0.onMove,
                  onEnd: swipeRosterP0.onEnd(goPrevDay, goNextDay),
                  style: swipeRosterP0.style,
                }}
                isOverridden={(name, d) => hasOverride(selectedDepot, d, name)}
              />
            )}
            {orderMode === "name" && (
              <RosterGrid
                rows={nameGridRows}
                holidaySet={holidaySet}
                date={selectedDate}
                nightDiaThreshold={nightDiaThreshold}
                highlightMap={highlightMap}
                onPick={(name) => {
                  setRouteTargetName(name);
                  if (window.triggerRouteTransition)
                    window.triggerRouteTransition();
                  else setSelectedTab("route");
                }}
                onEditTap={openPersonEditModal}
                editMode={rosterEditMode}
                displayName={displayName}
                hasNameOverride={hasNameOverride}
                selectedDepot={selectedDepot}
                daySwipe={{
                  ref: swipeRosterP0.ref,
                  onStart: swipeRosterP0.onStart,
                  onMove: swipeRosterP0.onMove,
                  onEnd: swipeRosterP0.onEnd(goPrevDay, goNextDay),
                  style: swipeRosterP0.style,
                }}
                isOverridden={(name, d) => hasOverride(selectedDepot, d, name)}
              />
            )}
          </div>
        )}

        {/* 행로 탭 */}
        {selectedTab === "route" && (
          <div
            ref={routeWrapRef}
            className="mt-4 select-none overflow-hidden rounded-2xl overscroll-contain"
            style={{
              height: slideViewportH,
              touchAction: isRouteLocked ? "none" : "pan-y",
            }}
            onTouchStart={vRoute.onStart}
            onTouchMove={vRoute.onMove}
            onTouchEnd={vRoute.onEnd}
            onTouchCancel={vRoute.onCancel}
            onWheel={(e) => {
              if (isRouteLocked) e.preventDefault();
              if (snapYRoute) return;
              const TH = 40;
              if (e.deltaY > TH && routePage < 3) {
                setSnapYRoute(true);
                setDragYRoute(-(routeWrapRef.current?.offsetHeight || 500));
                setTimeout(() => {
                  setRoutePage((p) => Math.min(p + 1, 3));
                  setSnapYRoute(false);
                  setDragYRoute(0);
                }, V_SNAP_MS);
              } else if (e.deltaY < -TH && routePage > 0) {
                setSnapYRoute(true);
                setDragYRoute(routeWrapRef.current?.offsetHeight || 500);
                setTimeout(() => {
                  setRoutePage((p) => Math.max(p - 1, 0));
                  setSnapYRoute(false);
                  setDragYRoute(0);
                }, V_SNAP_MS);
              }
            }}
          >
            <div
              className="relative"
              style={{
                transform: `translateY(${
                  -routePage * slideViewportH + dragYRoute
                }px)`,
                transition: snapYRoute
                  ? `transform ${V_SNAP_MS}ms ease-out`
                  : "none",
                willChange: "transform",
              }}
              onTransitionEnd={vRoute.onTransitionEnd}
            >
              {/* Panel 0: 행로 카드 */}
              <div
                id="route-panel0"
                ref={routePanelRefs[0]}
                className="bg-gray-800 rounded-2xl p-3 shadow mb-10"
                style={{ minHeight: slideViewportH }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <User className="w-5 h-5" />
                    행로표 ({routeTarget})
                  </h2>
                  <div className="flex gap-2 items-center">
                    <select
                      className="bg-gray-700 rounded-xl px-2 py-1 text-xs"
                      value={selectedDepot}
                      onChange={(e) => setSelectedDepot(e.target.value)}
                    >
                      {DEPOTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="bg-gray-700 rounded-xl px-2 py-1 text-xs"
                      value={fmt(selectedDate)}
                      onChange={(e) => {
                        const d = parseYMD(e.target.value);
                        if (d) setSelectedDate(d);
                      }}
                    />
                    <span className="text-[11px] text-gray-300">{wk}</span>
                    {fmt(selectedDate) !== fmt(today) && (
                      <button
                        className="px-2 py-1 rounded-xl bg-indigo-500 text-white text-xs"
                        onClick={() => setSelectedDate(stripTime(new Date()))}
                      >
                        오늘로
                      </button>
                    )}
                    {routeTargetName && (
                      <button
                        className="px-2 py-1 rounded-xl bg-orange-700 text-xs"
                        onClick={() => setRouteTargetName("")}
                      >
                        내이름
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-gray-300">대상 이름</span>
                  <select
                    className="bg-gray-700 rounded-xl p-1 text-sm"
                    value={routeTarget}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === myName) setRouteTargetName("");
                      else setRouteTargetName(v);
                    }}
                  >
                    {[myName, ...nameList.filter((n) => n !== myName)].map(
                      (n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      )
                    )}
                  </select>
                  <div className="ml-auto mr-1 flex items-center gap-2">
                    <span className="text-xs text-gray-400">전화번호</span>
                    {routeTargetPhone ? (
                      <a
                        href={`tel:${String(routeTargetPhone).replace(
                          /[^0-9+]/g,
                          ""
                        )}`}
                        className="text-xs px-2 py-1 rounded-xl bg-emerald-600 text-white"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {routeTargetPhone}
                      </a>
                    ) : (
                      <span className="text-xs text-gray-500">번호없음</span>
                    )}
                  </div>
                </div>
                <div
                  className="p-3 rounded-xl bg-gray-900/60 text-sm mt-3"
                  ref={swipeRouteP0.ref}
                  onTouchStart={swipeRouteP0.onStart}
                  onTouchMove={swipeRouteP0.onMove}
                  onTouchEnd={swipeRouteP0.onEnd(goPrevDay, goNextDay)}
                  style={swipeRouteP0.style}
                >
                  {/* ✅ 새 방식: RouteImageView (v3 - common 전체 전달) */}
                  <RouteImageView
                    paths={currentPaths}
                    common={currentCommonData}
                    depot={selectedDepot}
                    code={routeCodeStr}
                    dateStr={fmt(selectedDate)}
                    holidaySet={holidaySet}
                    busImageSrc={defaultBusMap[selectedDepot]}
                    scale={routeScale}
                    onScaleChange={(v) =>
                      setRouteScaleForDepot(selectedDepot, v)
                    }
                  />
                </div>
              </div>

              {/* Panel 1: 전체 교번 — onCodeTap */}
              <div
                ref={routePanelRefs[1]}
                className="bg-gray-800 rounded-2xl p-3 shadow mb-16"
                style={{ minHeight: slideViewportH }}
              >
                <div
                  className="flex items-center justify-between mb-2"
                  data-no-gesture
                >
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <List className="w-5 h-5" />
                    전체 교번
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      className="bg-gray-700 rounded-xl px-2 py-1 text-xs"
                      value={fmt(selectedDate)}
                      onChange={(e) => {
                        const d = parseYMD(e.target.value);
                        if (d) setSelectedDate(d);
                      }}
                    />
                    <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-200 text-[11px]">
                      {wk}
                    </span>
                    {fmt(selectedDate) !== fmt(today) && (
                      <button
                        className="px-2 py-1 rounded-xl bg-indigo-600 text-white text-xs"
                        onClick={() => setSelectedDate(stripTime(new Date()))}
                      >
                        오늘로
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="flex items-center justify-between mb-2 gap-2 flex-wrap"
                  data-no-gesture
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300">소속</span>
                    <select
                      className="bg-gray-700 rounded-xl px-2 py-1 text-sm"
                      value={selectedDepot}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedDepot(v);
                        setHomeDepot(v);
                      }}
                    >
                      {DEPOTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      className={
                        "rounded-full px-3 py-1 text-sm font-semibold transition " +
                        (rosterEditMode
                          ? "bg-amber-500 hover:bg-amber-400 text-gray-900"
                          : "bg-gray-700 hover:bg-gray-600 text-gray-100")
                      }
                      onClick={() => setRosterEditMode((v) => !v)}
                    >
                      {rosterEditMode ? "✓ 완료" : "✏️ 수정"}
                    </button>
                    <button
                      className="rounded-full px-3 py-1 text-sm bg-cyan-600 text-white"
                      onClick={() =>
                        setOrderMode((m) =>
                          m === "person"
                            ? "dia"
                            : m === "dia"
                            ? "name"
                            : "person"
                        )
                      }
                    >
                      {orderMode === "person"
                        ? "DIA 순서로 보기"
                        : orderMode === "dia"
                        ? "이름순으로 보기"
                        : "순번으로 보기"}
                    </button>
                  </div>
                </div>
                {rosterEditMode && (
                  <div className="mb-2 p-2 rounded-lg bg-amber-900/30 border border-amber-500/40 text-[11px] text-amber-200">
                    🔧 이름 수정 모드 — 셀을 탭하면 이름 변경 창이 열립니다.
                  </div>
                )}
                {orderMode === "person" && (
                  <RosterGrid
                    rows={rosterAt(selectedDate)}
                    holidaySet={holidaySet}
                    date={selectedDate}
                    nightDiaThreshold={nightDiaThreshold}
                    highlightMap={highlightMap}
                    onPick={(name) => {
                      setRouteTargetName(name);
                      if (window.triggerRouteTransition)
                        window.triggerRouteTransition();
                      else setSelectedTab("route");
                    }}
                    onEditTap={openPersonEditModal}
                    editMode={rosterEditMode}
                    displayName={displayName}
                    hasNameOverride={hasNameOverride}
                    selectedDepot={selectedDepot}
                    daySwipe={{
                      ref: swipeRouteP1.ref,
                      onStart: swipeRouteP1.onStart,
                      onMove: swipeRouteP1.onMove,
                      onEnd: swipeRouteP1.onEnd(goPrevDay, goNextDay),
                      style: swipeRouteP1.style,
                    }}
                    isOverridden={(name, d) =>
                      hasOverride(selectedDepot, d, name)
                    }
                  />
                )}
                {orderMode === "dia" && (
                  <RosterGrid
                    rows={diaGridRows}
                    holidaySet={holidaySet}
                    date={selectedDate}
                    nightDiaThreshold={nightDiaThreshold}
                    highlightMap={highlightMap}
                    onPick={(name) => {
                      setRouteTargetName(name);
                      if (window.triggerRouteTransition)
                        window.triggerRouteTransition();
                      else setSelectedTab("route");
                    }}
                    onEditTap={openPersonEditModal}
                    editMode={rosterEditMode}
                    displayName={displayName}
                    hasNameOverride={hasNameOverride}
                    selectedDepot={selectedDepot}
                    daySwipe={{
                      ref: swipeRouteP1.ref,
                      onStart: swipeRouteP1.onStart,
                      onMove: swipeRouteP1.onMove,
                      onEnd: swipeRouteP1.onEnd(goPrevDay, goNextDay),
                      style: swipeRouteP1.style,
                    }}
                    isOverridden={(name, d) =>
                      hasOverride(selectedDepot, d, name)
                    }
                  />
                )}
                {orderMode === "name" && (
                  <RosterGrid
                    rows={nameGridRows}
                    holidaySet={holidaySet}
                    date={selectedDate}
                    nightDiaThreshold={nightDiaThreshold}
                    highlightMap={highlightMap}
                    onPick={(name) => {
                      setRouteTargetName(name);
                      if (window.triggerRouteTransition)
                        window.triggerRouteTransition();
                      else setSelectedTab("route");
                    }}
                    onEditTap={openPersonEditModal}
                    editMode={rosterEditMode}
                    displayName={displayName}
                    hasNameOverride={hasNameOverride}
                    selectedDepot={selectedDepot}
                    daySwipe={{
                      ref: swipeRosterP0.ref,
                      onStart: swipeRosterP0.onStart,
                      onMove: swipeRosterP0.onMove,
                      onEnd: swipeRosterP0.onEnd(goPrevDay, goNextDay),
                      style: swipeRosterP0.style,
                    }}
                    isOverridden={(name, d) =>
                      hasOverride(selectedDepot, d, name)
                    }
                  />
                )}
              </div>

              {/* Panel 2: 알람 */}
              <div
                ref={routePanelRefs[2]}
                className="bg-gray-800 rounded-2xl p-3 shadow mb-16"
                style={{ minHeight: slideViewportH }}
              >
                <div
                  className="flex items-center justify-between mb-2"
                  data-no-gesture
                >
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <AlarmCheckIcon className="w-5 h-5" />
                    출근/중간(1/2)
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      className="bg-gray-700 rounded-xl px-2 py-1 text-xs"
                      value={fmt(selectedDate)}
                      onChange={(e) => {
                        const d = parseYMD(e.target.value);
                        if (d) setSelectedDate(d);
                      }}
                    />
                    <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-200 text-[11px]">
                      {wk}
                    </span>
                    {fmt(selectedDate) !== fmt(today) && (
                      <button
                        className="px-2 py-1 rounded-xl bg-indigo-600 text-white text-xs"
                        onClick={() => setSelectedDate(stripTime(new Date()))}
                      >
                        오늘로
                      </button>
                    )}
                  </div>
                </div>
                <div
                  ref={swipeRouteP2.ref}
                  onTouchStart={swipeRouteP2.onStart}
                  onTouchMove={swipeRouteP2.onMove}
                  onTouchEnd={swipeRouteP2.onEnd(goPrevDay, goNextDay)}
                  style={swipeRouteP2.style}
                  className="rounded-xl bg-gray-900/60 p-3"
                >
                  <WakeIcsPanel
                    dateObj={selectedDate}
                    selectedDate={selectedDate}
                    who={routeTarget}
                    startHM={startHM ?? toHMorNull(routeIn)}
                    endHM={endHM ?? toHMorNull(routeOut)}
                    rawLabel={routeIn}
                  />
                </div>
              </div>

              {/* Panel 3: 중간 알람 */}
              <div
                ref={routePanelRefs[3]}
                className="bg-gray-800 rounded-2xl p-3 shadow mb-16"
                style={{ minHeight: slideViewportH }}
              >
                <div
                  className="flex items-center justify-between mb-2"
                  data-no-gesture
                >
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <AlarmCheckIcon className="w-5 h-5" />
                    출근/중간(2/2)
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      className="bg-gray-700 rounded-xl px-2 py-1 text-xs"
                      value={fmt(selectedDate)}
                      onChange={(e) => {
                        const d = parseYMD(e.target.value);
                        if (d) setSelectedDate(d);
                      }}
                    />
                    <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-200 text-[11px]">
                      {wk}
                    </span>
                    {fmt(selectedDate) !== fmt(today) && (
                      <button
                        className="px-2 py-1 rounded-xl bg-indigo-600 text-white text-xs"
                        onClick={() => setSelectedDate(stripTime(new Date()))}
                      >
                        오늘로
                      </button>
                    )}
                  </div>
                </div>
                <div
                  ref={swipeRouteP3.ref}
                  onTouchStart={swipeRouteP3.onStart}
                  onTouchMove={swipeRouteP3.onMove}
                  onTouchEnd={swipeRouteP3.onEnd(goPrevDay, goNextDay)}
                  style={swipeRouteP3.style}
                  className="rounded-xl bg-gray-900/60 p-3"
                >
                  <WakeMidPanel
                    selectedDate={selectedDate}
                    selectedDepot={selectedDepot}
                    routeCombo={routeT?.combo || ""}
                    routeDia={routeRow?.dia ?? null}
                    row={routeRow}
                    shortcutName="교번-알람-만들기"
                    commonData={currentCommonData}
                    holidaySet={holidaySet}
                    routeCode={routeCodeStr}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 그룹(비교) 탭 */}
        {selectedTab === "compare" && (
          <CompareWeeklyBoard
            {...{
              selectedDepot,
              setSelectedDepot,
              selectedDate,
              setSelectedDate,
              nameList,
              myName,
              holidaySet,
              monthGridMonday,
              computeInOut,
              compareSelected,
              setCompareSelected,
              slideViewportH,
              tablesByDepot,
              commonMap,
              anchorDateByDepot,
              highlightMap,
              overridesByDepot,
              setRouteTargetName,
              setSelectedTab,
            }}
          />
        )}

        {/* 설정 탭 */}
        {selectedTab === "settings" && (
          <React.Suspense fallback={<div className="p-4">로딩…</div>}>
            <SettingsView
              {...{
                selectedDepot,
                // 설정에서 바꾼 소속은 "기본 소속" — 홈으로 가도 유지되도록
                setSelectedDepot: (v) => {
                  setSelectedDepot(v);
                  setHomeDepot(v);
                },
                onRenamePerson: (oldN, newN) =>
                  applyPermanentRename(oldN, newN),
                myName,
                setMyNameForDepot,
                nameList,
                anchorDateStr: anchorDateByDepot[selectedDepot] ?? fmt(today),
                setAnchorDateStr: (v) =>
                  setAnchorDateStrForDepot(selectedDepot, v),
                holidaysText,
                setHolidaysText,
                newHolidayDate,
                setNewHolidayDate,
                nightDiaByDepot,
                setNightDiaForDepot,
                routeScaleByDepot,
                setRouteScaleForDepot,
                highlightMap,
                setHighlightMap,
                currentTableText,
                setTablesByDepot,
                selectedDate,
                setSelectedDate,
                DEPOTS,
                DEFAULT_HOLIDAYS_25_26,
                onUpload,
                buildGyodaeTable,
                theme,
                setTheme,
                onOpenSetupWizard: () => setShowSetupWizard(true),
                onResetAll: resetAll,
                commonMap,
                setCommonMap,
                peopleRows,
              }}
            />
          </React.Suspense>
        )}

        {/* 하단 탭바 */}
        <FixedTabbarPortal>
          <nav
            ref={tabbarRef}
            className="bg-gray-900/90 backdrop-blur-md border-t border-gray-700 fixed left-0 right-0 bottom-0 pt-3 pb-[0]"
          >
            <div className="flex justify-around items-center text-gray-300 text-xs">
              <button
                onClick={() => {
                  const alreadyHome = selectedTab === "home";
                  setHomePage(0);
                  setDragYHome(0);
                  setSnapYHome(false);
                  if (alreadyHome) {
                    const t = new Date();
                    t.setHours(0, 0, 0, 0);
                    setSelectedDate(t);
                    return;
                  }
                  setSelectedTab("home");
                }}
                className={`flex flex-col items-center ${
                  selectedTab === "home" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <CalendarIcon className="w-5 h-5 mb-0" />홈
              </button>
              <button
                onClick={() => setSelectedTab("roster")}
                className={`flex flex-col items-center ${
                  selectedTab === "roster" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <List className="w-5 h-5 mb-0" />
                전체
              </button>
              <button
                onClick={() => {
                  setRoutePage(0);
                  setDragYRoute(0);
                  setSnapYRoute(false);
                  setSelectedTab("route");
                }}
                className={`flex flex-col items-center ${
                  selectedTab === "route" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <RouteIcon className="w-5 h-5 mb-0" strokeWidth={1.75} />
                행로
              </button>
              <button
                onClick={() => setSelectedTab("compare")}
                className={`flex flex-col items-center ${
                  selectedTab === "compare" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <Users className="w-5 h-5 mb-0" />
                그룹
              </button>
              <button
                onClick={() => setSelectedTab("settings")}
                className={`flex flex-col items-center ${
                  selectedTab === "settings" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <Settings className="w-5 h-5 mb-0" />
                설정
              </button>
            </div>
          </nav>
        </FixedTabbarPortal>
      </div>

      <DutyModalView
        open={dutyModal.open}
        date={dutyModal.date}
        name={dutyModal.name}
        options={DUTY_OPTIONS}
        currentLabel={(() => {
          if (!dutyModal.open || !dutyModal.date) return "";
          const r = rowAtDateForNameWithOverride(dutyModal.name, dutyModal.date);
          if (r?.dia == null) return "";
          return typeof r.dia === "number" ? `${r.dia}D` : String(r.dia);
        })()}
        hasOverride={
          dutyModal.open &&
          !!dutyModal.date &&
          hasOverride(selectedDepot, dutyModal.date, dutyModal.name)
        }
        onApply={(opt) => {
          setOverride(selectedDepot, dutyModal.date, dutyModal.name, opt);
          setDutyModal({ open: false, date: null, name: null });
        }}
        onClear={() => {
          setOverride(selectedDepot, dutyModal.date, dutyModal.name, null);
          setDutyModal({ open: false, date: null, name: null });
        }}
        onClose={() => setDutyModal({ open: false, date: null, name: null })}
      />

      {/* ✅ SetupWizard — ZIP/TSV 초기설정 */}
      {showSetupWizard && (
        <div className="fixed inset-0 z-[99999] bg-gray-900 overflow-y-auto">
          <SetupWizard
            onComplete={handleSetupComplete}
            onCancel={
              commonMap && localStorage.getItem("setupDone")
                ? () => setShowSetupWizard(false)
                : undefined
            }
            existingTsvData={commonMap}
            defaultDepot={selectedDepot}
          />
        </div>
      )}

      {/* ✅ 근무자 편집 모달 (이름 + 교번) */}
      <PersonEditModal
        open={personEditModal.open}
        oldName={personEditModal.oldName}
        oldCode={personEditModal.oldCode}
        baseName={personEditModal.baseName}
        baseCode={personEditModal.baseCode}
        hasTodayCode={personEditModal.hasTodayCode}
        hasTodayName={personEditModal.hasTodayName}
        nameList={nameList}
        codeList={personEditCodeList}
        codeOwnerMap={codeOwnerMap}
        onClose={() =>
          setPersonEditModal({
            open: false,
            oldName: "",
            oldCode: "",
            baseName: "",
            baseCode: "",
            hasTodayCode: false,
            hasTodayName: false,
          })
        }
        onResetToday={(kind) => {
          // kind: "name" | "code"
          const name = personEditModal.oldName;
          const iso = fmt(stripTime(new Date(selectedDate)));
          if (kind === "code") {
            setOverride(
              selectedDepot,
              stripTime(new Date(selectedDate)),
              name,
              null
            );
          } else if (kind === "name") {
            setNameOverridesByDepot((prev) => {
              const depotMap = { ...(prev?.[selectedDepot] || {}) };
              const dayMap = { ...(depotMap[iso] || {}) };
              delete dayMap[name];
              if (Object.keys(dayMap).length === 0) delete depotMap[iso];
              else depotMap[iso] = dayMap;
              return { ...prev, [selectedDepot]: depotMap };
            });
          }
          setPersonEditModal({
            open: false,
            oldName: "",
            oldCode: "",
            baseName: "",
            baseCode: "",
            hasTodayCode: false,
            hasTodayName: false,
          });
        }}
        onApply={async ({ newName, newCode }, scope) => {
          const oldName = personEditModal.oldName;
          // 영구 개명 시 oldName→newName 이관이 일어나므로,
          // 교번 override 대상 이름은 "영구 개명 후 이름"으로 잡는다.
          const targetName =
            newName && scope === "permanent" ? newName : oldName;

          // 1) 이름 변경
          if (newName) {
            if (scope === "today") {
              applyTodayRename(oldName, newName, selectedDate);
            } else {
              await applyPermanentRename(oldName, newName);
            }
          }

          // 2) 교번 변경
          if (newCode) {
            if (scope === "today") {
              // 이 날짜만 — overridesByDepot 에 저장.
              // 원래 교번을 다시 고르면 변경 해제로 처리.
              const nz = (x) => String(x || "").replace(/\s+/g, "").toLowerCase();
              setOverride(
                selectedDepot,
                stripTime(new Date(selectedDate)),
                targetName,
                nz(newCode) === nz(personEditModal.baseCode) ? null : newCode
              );
            } else {
              applyPermanentCode(targetName, newCode, selectedDate);
            }
          }
        }}
      />
    </div>
  );
}

/* ─── 공통 컴포넌트 ─── */

/* ─── 근무 변경 모달 (달력 길게 누르기) ───
 *  예전엔 App 안에서 정의된 컴포넌트라 App 이 다시 그려질 때마다 새로
 *  만들어졌고, onPointerDown 에서 선택 → 같은 탭의 onClick 에서 "이미 선택됨"
 *  으로 판단해 한 번만 눌러도 바로 반영됐음. 또 "완료" 는 선택을 버렸음.
 *  지금: 한 번 탭 = 선택, 같은 걸 한 번 더 탭 또는 "완료" = 반영.
 */
function DutyModalView({
  open,
  date,
  name,
  options,
  currentLabel,
  hasOverride,
  onApply,
  onClear,
  onClose,
}) {
  const [pendingOpt, setPendingOpt] = React.useState(null);
  React.useEffect(() => {
    if (open) setPendingOpt(null);
  }, [open, date, name]);
  if (!open || !date) return null;
  const iso2 = fmt(date);
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-2">
      <div
        className="w-[min(680px,100vw)] rounded-2xl bg-gray-800 text-gray-100 p-3 shadow-lg mb-[72px] sm:mb-0"
        style={{ marginBottom: "max(72px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">근무 변경</div>
          <button className="text-sm opacity-70" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="text-xs text-gray-300 mb-3">
          {name} · {iso2}
          {currentLabel ? ` · 현재 ${hasOverride ? "*" : ""}${currentLabel}` : ""}
        </div>
        <div
          className="grid gap-2 grid-cols-6 sm:grid-cols-8"
          style={{ paddingBottom: "80px" }}
        >
          {options.map((opt) => {
            const active = pendingOpt === opt;
            return (
              <button
                key={opt}
                onClick={() => {
                  if (pendingOpt === opt) onApply(opt);
                  else setPendingOpt(opt);
                }}
                className={[
                  "h-9 rounded-lg bg-gray-700 hover:bg-gray-600",
                  "text-xs font-medium flex items-center justify-center",
                  active ? "ring-2 ring-indigo-400" : "",
                ].join(" ")}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <div className="mt-3 mb-6 flex items-center justify-between">
          <div className="text-[11px] text-gray-400">
            한 번 누르면 선택,{" "}
            <span className="text-gray-200">두 번 누르거나 완료로 반영</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              disabled={!hasOverride}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs disabled:opacity-40"
            >
              설정 해제
            </button>
            <button
              onClick={() => (pendingOpt ? onApply(pendingOpt) : onClose())}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white"
            >
              완료
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RosterGrid({
  rows,
  holidaySet,
  date,
  nightDiaThreshold,
  highlightMap,
  onPick,
  onCodeTap,
  onEditTap, // 수정 모드에서 셀 탭시 (name, row) 전달
  editMode = false, // 이름 수정 모드 on/off
  displayName, // (name, date) => 표시 이름 (override 반영)
  hasNameOverride, // (depot, date, name) => boolean
  daySwipe,
  selectedDepot,
  isOverridden,
}) {
  const [selectedName, setSelectedName] = React.useState(null);
  return (
    <div
      className="grid gap-1"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))",
        ...(daySwipe?.style || {}),
      }}
      ref={daySwipe?.ref}
      onTouchStart={daySwipe?.onStart}
      onTouchMove={daySwipe?.onMove}
      onTouchEnd={daySwipe?.onEnd}
    >
      {rows.map(({ name, row }) => {
        const t = computeInOut(row, date, holidaySet, nightDiaThreshold);
        const diaLabel =
          row?.dia == null
            ? "-"
            : (isOverridden?.(name, date) ? "*" : "") +
              (typeof row.dia === "number" ? String(row.dia) : String(row.dia));
        const color = highlightMap?.[name];
        const isHighlighted = !!color;
        const style = isHighlighted
          ? {
              backgroundColor: color,
              color: "#ffffff",
              WebkitTextFillColor: "#ffffff",
              "--tw-text-opacity": "1",
            }
          : {};
        const isSelected = selectedName === name;

        // 표시할 이름 (override 적용)
        const shownName = displayName ? displayName(name, date) : name;
        const hasNameOv = !!hasNameOverride?.(selectedDepot, date, name);

        return (
          <button
            key={name}
            onClick={(e) => {
              // 편집 모드면 PersonEditModal 열기 우선
              if (editMode && onEditTap) {
                onEditTap(name, row);
                return;
              }
              if (onCodeTap) {
                // 전체탭/행로탭: 교번 변경 피커 열기
                onCodeTap(name, row?.dia, selectedDepot);
              } else if (onPick) {
                // 홈탭: 기존 행로표 이동 (onPick 직접 호출)
                setSelectedName(name);
                const btn = e.currentTarget;
                btn.animate(
                  [
                    {
                      transform: "scale(1)",
                      filter: "brightness(1)",
                      opacity: 1,
                    },
                    {
                      transform: "scale(1.15)",
                      filter: "brightness(1.4)",
                      boxShadow: "0 0 18px rgba(255,255,255,0.9)",
                      opacity: 1,
                    },
                    {
                      transform: "scale(1)",
                      filter: "brightness(1)",
                      opacity: 1,
                    },
                  ],
                  { duration: 300, easing: "cubic-bezier(0.22,1,0.36,1)" }
                );
                setTimeout(() => {
                  onPick(name);
                }, 130);
              }
            }}
            className={
              "aspect-square w-full rounded-lg p-1.5 text-left transition-all duration-200 relative " +
              (isSelected
                ? "ring-4 ring-white/80 shadow-[0_0_10px_rgba(255,255,255,0.4)] "
                : editMode
                ? "bg-amber-900/40 hover:bg-amber-800/60 ring-1 ring-amber-500/60 "
                : "bg-gray-700/80 hover:bg-gray-600 hover:shadow-[0_0_6px_rgba(255,255,255,0.3)]") +
              (isHighlighted ? " roster-person-colored" : "")
            }
            style={style}
            title={`${shownName} • ${diaLabel} • ${t.combo}${
              t.isNight ? " (야)" : ""
            }`}
          >
            {editMode && (
              <span className="absolute top-0.5 left-0.5 text-[9px]">✏️</span>
            )}
            <div className="text-[11px] font-semibold whitespace-nowrap w-full text-center">
              {hasNameOv ? "*" : ""}
              {shownName}
            </div>
            <div className="text-[12px] font-extrabold text-gray-200 whitespace-nowrap">
              {diaLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FixedTabbarPortal({ children }) {
  const mountRef = React.useRef(null);
  if (!mountRef.current && typeof document !== "undefined")
    mountRef.current = document.createElement("div");
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    el.style.position = "fixed";
    el.style.left = "0";
    el.style.right = "0";
    el.style.bottom = "0";
    el.style.zIndex = "9999";
    el.style.width = "100%";
    el.style.pointerEvents = "none";
    el.style.transform = "translateY(0)";
    el.style.willChange = "transform";
    document.body.appendChild(el);
    const vv = window.visualViewport;
    const isEditableFocused = () => {
      const ae = document.activeElement;
      if (!ae) return false;
      const tag = (ae.tagName || "").toLowerCase();
      return (
        tag === "input" || tag === "textarea" || ae.isContentEditable === true
      );
    };
    const sync = () => {
      if (!vv) return;
      const layoutH = window.innerHeight,
        visibleH = vv.height + vv.offsetTop,
        deficit = Math.max(0, layoutH - visibleH);
      const looksLikeKeyboard = isEditableFocused() && deficit >= 260;
      el.style.transform = looksLikeKeyboard
        ? `translateY(${-deficit}px)`
        : "translateY(0)";
      el.style.bottom = "0px";
    };
    sync();
    const onResize = () => sync(),
      onFocusIn = () => sync(),
      onFocusOut = () => setTimeout(sync, 0);
    vv?.addEventListener("resize", onResize, { passive: true });
    vv?.addEventListener("scroll", onResize, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    return () => {
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      try {
        el.remove();
      } catch {}
    };
  }, []);
  return mountRef.current
    ? createPortal(
        <div style={{ pointerEvents: "auto" }}>{children}</div>,
        mountRef.current
      )
    : null;
} // CompareWeeklyBoard — commonMap 기반 row + 단일 야간 판정 (worktime)
// v2: 세로 스와이프 제거, 좌/우 스와이프로 "주 단위" 이동 (월 경계 자동 넘김)
//     인원이 많으면 내부 영역 자체가 스크롤 가능
function CompareWeeklyBoard({
  selectedDepot,
  setSelectedDepot,
  selectedDate,
  setSelectedDate,
  nameList,
  myName,
  holidaySet,
  monthGridMonday,
  computeInOut,
  highlightMap,
  tablesByDepot,
  commonMap,
  anchorDateByDepot,
  compareSelected,
  setCompareSelected,
  slideViewportH,
  overridesByDepot,
  setRouteTargetName,
  setSelectedTab,
}) {
  const isOverridden = React.useCallback(
    (name, depot, date) => {
      const iso = fmt(stripTime(new Date(date)));
      return overridesByDepot?.[depot]?.[iso]?.[name] != null;
    },
    [overridesByDepot]
  );
  const parsedByDepot = React.useMemo(() => {
    const map = {};
    for (const depot of DEPOTS) {
      const key = DEPOT_TO_ZIP_KEY[depot] || depot;
      const common = commonMap?.[key];
      if (common?.names?.length && common?.gyobun?.length) {
        const splitWT = (wt) => {
          const s = String(wt || "").replace(/\s/g, "");
          if (!s || s === "----") return { in: "", out: "" };
          const parts = s.split("-");
          const start = parts[0] || "";
          const end = parts[1] || "";
          // S코드 보정: 출근이 s[1-6]이면 퇴근도 동일하게
          if (/^s[1-6]$/i.test(start)) {
            return { in: start, out: start };
          }
          return { in: start, out: end };
        };
        const wtFor = (code) => {
          const k = String(code || "")
            .trim()
            .toLowerCase();
          return {
            weekday: splitWT(common.worktime?.nor?.[k] || "----"),
            saturday: splitWT(common.worktime?.sat?.[k] || "----"),
            holiday: splitWT(common.worktime?.hol?.[k] || "----"),
          };
        };
        const len = common.names.length;
        const rows = common.names.map((name, i) => {
          const code = common.gyobun[i] || "";
          const wt = wtFor(code);
          const nextCode = common.gyobun[(i + 1) % len] || "";
          const wtNext = wtFor(nextCode);
          const dia = /^\d+d$/i.test(code)
            ? Number(code.replace(/d$/i, ""))
            : code;
          return {
            seq: String(i + 1),
            name,
            dia,
            phone: common.phones?.[i] || "",
            weekday: wt.weekday,
            saturday: wt.saturday,
            holiday: wt.holiday,
            weekdayNext: wtNext.weekday,
            saturdayNext: wtNext.saturday,
            holidayNext: wtNext.holiday,
          };
        });
        const nameMap = buildNameIndexMap(rows);
        map[depot] = {
          rows,
          nameMap,
          names: rows.map((r) => r.name).filter(Boolean),
          templates: buildTemplates(rows),
          baseDate: common.baseDate || null,
          shift: calcSeatShift(common),
        };
        continue;
      }
      const text = tablesByDepot?.[depot] || "";
      const rows = parsePeopleTable(text);
      const len = rows.length;
      for (let i = 0; i < len; i++) {
        const nx = rows[(i + 1) % len];
        rows[i].weekdayNext = nx?.weekday || { in: "", out: "" };
        rows[i].saturdayNext = nx?.saturday || { in: "", out: "" };
        rows[i].holidayNext = nx?.holiday || { in: "", out: "" };
      }
      const nameMap = buildNameIndexMap(rows);
      map[depot] = {
        rows,
        nameMap,
        names: rows.map((r) => r.name).filter(Boolean),
        templates: buildTemplates(rows),
        baseDate: null,
        shift: 0,
      };
    }
    return map;
  }, [tablesByDepot, commonMap]);
  const rowAtDateFor = React.useCallback(
    (name, depot, date) => {
      const pack = parsedByDepot[depot];
      if (!pack) return undefined;
      const { rows, nameMap } = pack;
      if (!nameMap.has(name) || !rows.length) return undefined;
      const baseIdx = nameMap.get(name);
      // 기준일: commonMap 의 baseDate 가 있으면 그것을 우선 (이름 배치의 실제 기준)
      const anchorStr = pack.baseDate || anchorDateByDepot?.[depot];
      const anchor = anchorStr
        ? parseYMD(anchorStr) || stripTime(new Date())
        : stripTime(new Date());
      const dd = diffDays(date, anchor);
      const k = baseIdx + (pack.shift || 0) + dd;
      const idx = ((k % rows.length) + rows.length) % rows.length;
      const baseRow = rows[idx];
      const iso = fmt(stripTime(new Date(date)));
      const v = overridesByDepot?.[depot]?.[iso]?.[name];
      // 다른 소속 사람도 "그 사람 소속" 의 교번표로 적용
      return applyOverride(baseRow, v, pack.templates);
    },
    [parsedByDepot, anchorDateByDepot, overridesByDepot]
  );
  const normalized = React.useMemo(() => {
    if (!Array.isArray(compareSelected) || !compareSelected.length)
      return myName ? [{ name: myName, depot: selectedDepot }] : [];
    return compareSelected.map((x) =>
      typeof x === "string" ? { name: x, depot: selectedDepot } : x
    );
  }, [compareSelected, myName, selectedDepot]);
  const [groups, setGroups] = React.useState(() => {
    try {
      const saved = localStorage.getItem("compareGroups_v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    const basePeople =
      normalized.length > 0
        ? normalized
        : myName
        ? [{ name: myName, depot: selectedDepot }]
        : [];
    return [{ id: "g1", label: "그룹 1", people: basePeople }];
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("compareGroups_v1", JSON.stringify(groups));
    } catch {}
  }, [groups]);
  const [activeGroupId, setActiveGroupId] = React.useState(() => {
    try {
      const saved = localStorage.getItem("compareActiveGroupId_v1");
      if (saved) return saved;
    } catch {}
    return "g1";
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("compareActiveGroupId_v1", activeGroupId);
    } catch {}
  }, [activeGroupId]);
  // 저장된 activeGroupId 가 실제로 존재하는지 확인
  React.useEffect(() => {
    if (!groups.length) return;
    if (!groups.some((g) => g.id === activeGroupId)) {
      const fallbackId = groups[0].id;
      setActiveGroupId(fallbackId);
      setCompareSelected(groups[0].people || []);
    }
  }, [groups, activeGroupId]);
  const [editingGroupId, setEditingGroupId] = React.useState(null);
  const [editingLabel, setEditingLabel] = React.useState("");
  const activeGroup =
    groups.find((g) => g.id === activeGroupId) || groups[0] || null;
  const people = activeGroup ? activeGroup.people : [];
  const handleDeleteGroup = () => {
    if (!activeGroup) return;
    if (groups.length <= 1) {
      alert("마지막 그룹은 삭제할 수 없어요.");
      return;
    }
    if (!window.confirm(`"${activeGroup.label}" 그룹을 삭제할까요?`)) return;
    const nextGroups = groups.filter((g) => g.id !== activeGroup.id);
    setGroups(nextGroups);
    const nextActive = nextGroups[0] || null;
    setActiveGroupId(nextActive?.id || "");
    setCompareSelected(nextActive?.people || []);
    setEditingGroupId(null);
    setEditingLabel("");
  };
  const addPerson = (name, depot) => {
    setGroups((prev) => {
      if (!prev.length) return prev;
      const idxRaw = prev.findIndex((g) => g.id === activeGroupId);
      const idx = idxRaw === -1 ? 0 : idxRaw;
      const target = prev[idx] || prev[0];
      const base = target.people || [];
      if (base.some((p) => p.name === name && p.depot === depot)) return prev;
      const nextPeople = [...base, { name, depot }];
      const nextGroups = [...prev];
      nextGroups[idx] = { ...target, people: nextPeople };
      setCompareSelected(nextPeople);
      return nextGroups;
    });
  };
  const removePerson = (name, depot) => {
    setGroups((prev) => {
      if (!prev.length) return prev;
      const idxRaw = prev.findIndex((g) => g.id === activeGroupId);
      const idx = idxRaw === -1 ? 0 : idxRaw;
      const target = prev[idx] || prev[0];
      const base = target.people || [];
      let nextPeople = base.filter(
        (p) => !(p.name === name && p.depot === depot)
      );
      if (!nextPeople.length && myName)
        nextPeople = [{ name: myName, depot: selectedDepot }];
      const nextGroups = [...prev];
      nextGroups[idx] = { ...target, people: nextPeople };
      setCompareSelected(nextPeople);
      return nextGroups;
    });
  };

  // ─────────────────────────────────────────
  //  탭 동작: 첫 탭은 선택 (파란 테두리), 같은 사람 또 탭하면 행로 이동
  //   • 시간 제한 없음 — 다른 사람 탭하면 선택만 옮겨짐
  //   • 같은 사람 두 번째 탭 → 행로 탭으로 이동
  // ─────────────────────────────────────────
  // 셀 단위 선택 — depot::name::iso 가 키
  const [selectedCellKey, setSelectedCellKey] = React.useState(null);
  const handleCellTap = (name, depot, dateObj) => {
    const iso = fmt(stripTime(new Date(dateObj)));
    const key = `${depot}::${name}::${iso}`;
    if (selectedCellKey === key) {
      // 같은 셀 두 번째 탭 — 그 셀의 날짜로 행로 이동
      setSelectedCellKey(null);
      try {
        navigator.vibrate?.(10);
      } catch {}
      const targetDate = stripTime(new Date(dateObj));
      // ⚠️ 순서 중요: 날짜·이름·기지를 flushSync 로 동기 반영한 후
      //    탭 전환을 트리거해야 행로 탭이 그 날짜의 dia 를 표시함.
      flushSync(() => {
        if (depot !== selectedDepot) setSelectedDepot(depot);
        setRouteTargetName(name);
        setSelectedDate(targetDate);
      });
      if (window.triggerRouteTransition) {
        window.triggerRouteTransition();
      } else {
        setSelectedTab("route");
      }
      return;
    }
    // 첫 탭 또는 다른 셀 탭 — 선택만 옮김
    setSelectedCellKey(key);
  };
  // ─────────────────────────────────────────
  //  주(week) 계산 — 선택 날짜가 속한 주를 month-independent 로 추출
  //  좌/우 스와이프 시 selectedDate 를 ±7 일 이동. 이 때 달이 자동으로 바뀜.
  //  (monthGridMonday 는 헤더의 월 라벨 결정용으로만 사용, 데이터 그리드는
  //   selectedDate 기준 "해당 주"만 렌더)
  // ─────────────────────────────────────────
  const currentWeekDays = React.useMemo(() => {
    const d = stripTime(selectedDate);
    const dow = (d.getDay() + 6) % 7; // 월=0, 일=6
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow);
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const x = new Date(monday);
      x.setDate(monday.getDate() + i);
      arr.push(stripTime(x));
    }
    return arr;
  }, [selectedDate]);

  // ─────────────────────────────────────────
  //  viewMonth — 라벨/음영 기준이 되는 "표시 중인 달".
  //  selectedDate 와 분리해서 관리한다.
  //   • 같은 주 안에서 4월↔5월 시점만 토글 가능 (selectedDate 는 그대로)
  //   • 다른 주로 점프하면 selectedDate 의 달로 자동 동기화
  // ─────────────────────────────────────────
  const [viewMonth, setViewMonth] = React.useState(() => ({
    year: selectedDate.getFullYear(),
    month: selectedDate.getMonth(),
  }));

  // selectedDate 가 "다른 주"로 점프하면 viewMonth 를 그 달로 동기화.
  // (월 picker, 오늘로 버튼, 외부에서 setSelectedDate 가 호출될 때 모두 처리)
  const prevSelectedRef = React.useRef(selectedDate);
  React.useEffect(() => {
    const prev = prevSelectedRef.current;
    const curr = selectedDate;
    const weekStartTime = (d) => {
      const dow = (d.getDay() + 6) % 7;
      const x = new Date(d);
      x.setDate(d.getDate() - dow);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    };
    if (weekStartTime(prev) !== weekStartTime(curr)) {
      // 새 주의 7일 계산
      const dow = (curr.getDay() + 6) % 7;
      const monday = new Date(curr);
      monday.setDate(curr.getDate() - dow);
      const weekDays = [];
      for (let i = 0; i < 7; i++) {
        const x = new Date(monday);
        x.setDate(monday.getDate() + i);
        weekDays.push(x);
      }
      // 방향성 반영: forward(다음 주) → 가장 이른 달, backward(이전 주) → 가장 늦은 달
      const goingForward = curr.getTime() > prev.getTime();
      const target = goingForward
        ? weekDays.reduce((a, b) =>
            a.getFullYear() < b.getFullYear() ||
            (a.getFullYear() === b.getFullYear() && a.getMonth() < b.getMonth())
              ? a
              : b
          )
        : weekDays.reduce((a, b) =>
            a.getFullYear() > b.getFullYear() ||
            (a.getFullYear() === b.getFullYear() && a.getMonth() > b.getMonth())
              ? a
              : b
          );
      setViewMonth({
        year: target.getFullYear(),
        month: target.getMonth(),
      });
    }
    prevSelectedRef.current = curr;
  }, [selectedDate]);
  // ─────────────────────────────────────────
  //  순서 변경 (long-press → 들어올림 → 드래그)
  //
  //  draggingIdx: 현재 들어올린 행의 인덱스 (null = 비활성)
  //  hoverIdx:    현재 손가락이 가리키는 슬롯 인덱스 (= 놓으면 들어갈 자리)
  //  dragOffsetY: 들어올린 행이 시각적으로 따라가는 Y 거리 (px)
  // ─────────────────────────────────────────
  const [draggingIdx, setDraggingIdx] = React.useState(null);
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const [dragOffsetY, setDragOffsetY] = React.useState(0);

  // long-press 타이머 + 시작 좌표
  const lpRef = React.useRef({
    timer: null,
    startY: 0,
    startX: 0,
    rowHeight: 56, // 측정 후 갱신됨
    listTop: 0,
    fired: false,
    moved: false,
  });
  const LP_MS = 500;
  const LP_MOVE_CANCEL_PX = 8;

  // 행 DOM 측정용 — 리스트 컨테이너
  const listRef = React.useRef(null);

  // 들어올림 모드 종료 (commit 또는 cancel)
  const endDrag = React.useCallback(
    (commit) => {
      if (
        commit &&
        draggingIdx != null &&
        hoverIdx != null &&
        draggingIdx !== hoverIdx
      ) {
        setGroups((prev) => {
          const idxRaw = prev.findIndex((g) => g.id === activeGroupId);
          const gi = idxRaw === -1 ? 0 : idxRaw;
          const target = prev[gi];
          if (!target?.people?.length) return prev;
          const arr = [...target.people];
          const [moved] = arr.splice(draggingIdx, 1);
          // hoverIdx 가 draggingIdx 보다 뒤면 splice 로 인해 한 칸 당겨졌으므로
          // 그대로 insert. 앞이면 그대로.
          arr.splice(hoverIdx, 0, moved);
          const next = [...prev];
          next[gi] = { ...target, people: arr };
          setCompareSelected(arr);
          return next;
        });
      }
      setDraggingIdx(null);
      setHoverIdx(null);
      setDragOffsetY(0);
    },
    [draggingIdx, hoverIdx, activeGroupId, setCompareSelected]
  );

  // 행 핸들러 팩토리
  const makeRowDragHandlers = (idx) => ({
    onTouchStart: (e) => {
      // 1명뿐이거나 X 버튼 등은 무시
      if (people.length < 2) return;
      if (e.target.closest("[data-no-drag]")) return;
      const t = e.touches[0];
      lpRef.current.startY = t.clientY;
      lpRef.current.startX = t.clientX;
      lpRef.current.fired = false;
      lpRef.current.moved = false;
      // 행 높이 측정 (첫 행 기준)
      const firstRow = listRef.current?.querySelector("[data-row]");
      if (firstRow) lpRef.current.rowHeight = firstRow.offsetHeight || 56;
      // 리스트 상단 좌표 측정
      const listRect = listRef.current?.getBoundingClientRect();
      lpRef.current.listTop = listRect?.top || 0;

      clearTimeout(lpRef.current.timer);
      lpRef.current.timer = setTimeout(() => {
        if (lpRef.current.moved) return;
        lpRef.current.fired = true;
        try {
          navigator.vibrate?.(15);
        } catch {}
        setDraggingIdx(idx);
        setHoverIdx(idx);
        setDragOffsetY(0);
      }, LP_MS);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      const dy = t.clientY - lpRef.current.startY;
      const dx = t.clientX - lpRef.current.startX;

      // 아직 long-press 발동 전 — 일정 거리 이상 움직였으면 long-press 취소
      if (!lpRef.current.fired) {
        if (
          Math.abs(dx) > LP_MOVE_CANCEL_PX ||
          Math.abs(dy) > LP_MOVE_CANCEL_PX
        ) {
          lpRef.current.moved = true;
          clearTimeout(lpRef.current.timer);
        }
        return;
      }

      // 들어올림 모드 — 페이지 스크롤/스와이프 모두 막고 위치 추적
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      setDragOffsetY(dy);

      // 손가락 Y 가 어느 행 위에 있는지 계산
      const rh = lpRef.current.rowHeight || 56;
      const relY = t.clientY - lpRef.current.listTop;
      let target = Math.floor(relY / rh);
      if (target < 0) target = 0;
      if (target > people.length - 1) target = people.length - 1;
      setHoverIdx(target);
    },
    onTouchEnd: () => {
      clearTimeout(lpRef.current.timer);
      if (lpRef.current.fired) {
        endDrag(true);
      }
      lpRef.current.fired = false;
      lpRef.current.moved = false;
    },
    onTouchCancel: () => {
      clearTimeout(lpRef.current.timer);
      if (lpRef.current.fired) endDrag(false);
      lpRef.current.fired = false;
      lpRef.current.moved = false;
    },
  });

  // 다른 행들이 비켜줄 거리 계산
  // - 들린 행: 손가락 따라 dragOffsetY 만큼 이동
  // - 들린 행과 hoverIdx 사이의 다른 행들: rowHeight 만큼 위/아래로 비켜줌
  const getRowTransform = (idx) => {
    if (draggingIdx == null || hoverIdx == null) return "";
    if (idx === draggingIdx) {
      return `translateY(${dragOffsetY}px) scale(1.03)`;
    }
    const rh = lpRef.current.rowHeight || 56;
    if (draggingIdx < hoverIdx) {
      // 아래로 이동 중 — 들린 행 다음 ~ hoverIdx 까지는 위로 한 칸 비킴
      if (idx > draggingIdx && idx <= hoverIdx) return `translateY(-${rh}px)`;
    } else if (draggingIdx > hoverIdx) {
      // 위로 이동 중 — hoverIdx ~ 들린 행 직전 까지는 아래로 한 칸 비킴
      if (idx >= hoverIdx && idx < draggingIdx) return `translateY(${rh}px)`;
    }
    return "";
  };

  const headerRef = React.useRef(null);
  const [headerH, setHeaderH] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ─────────────────────────────────────────
  //  좌/우 스와이프만 처리 — 헤더 영역에만 붙음
  //  스크롤 영역은 완전 독립적으로 자연 스크롤
  // ─────────────────────────────────────────
  const wrapRef = React.useRef(null);
  const [dragX, setDragX] = React.useState(0);
  const [snapping, setSnapping] = React.useState(false);
  const gRef = React.useRef({ sx: 0, sy: 0, lock: null, lx: 0, t: 0 });
  const X_DIST = 40,
    VEL = 0.35,
    SNAP_MS = 300;

  const onTouchStart = (e) => {
    if (e.target.closest("[data-no-gesture]")) return;
    if (draggingIdx != null) return;
    const t = e.touches[0];
    gRef.current = {
      sx: t.clientX,
      sy: t.clientY,
      lock: null,
      lx: t.clientX,
      t: performance.now(),
    };
    setSnapping(false);
    setDragX(0);
  };
  const onTouchMove = (e) => {
    if (e.target.closest("[data-no-gesture]")) return;
    // 행 들어올림 중에는 가로 스와이프(주 이동) 무시
    if (draggingIdx != null) return;
    const t = e.touches[0];
    const dx = t.clientX - gRef.current.sx,
      dy = t.clientY - gRef.current.sy;
    if (gRef.current.lock === null) {
      // 가로 우세면 'h', 세로 우세면 'v' 로 lock.
      // 본문 영역은 touchAction:pan-y 라 세로는 브라우저가 처리 → lock="v" 면 리턴.
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy))
        gRef.current.lock = "h";
      else if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx))
        gRef.current.lock = "v";
    }
    if (gRef.current.lock === "h") {
      if (e.cancelable) e.preventDefault();
      setDragX(dx);
      gRef.current.lx = t.clientX;
      gRef.current.t = performance.now();
    }
  };
  const onTouchEnd = (e) => {
    if (gRef.current.lock !== "h") {
      gRef.current.lock = null;
      setDragX(0);
      return;
    }
    const t = e.changedTouches[0];
    const now = performance.now(),
      dt = Math.max(1, now - gRef.current.t);
    const vx = (t.clientX - gRef.current.lx) / dt;
    const goNext = dragX < -X_DIST || vx < -VEL;
    const goPrev = dragX > X_DIST || vx > VEL;
    const width = wrapRef.current?.offsetWidth || 320;
    setSnapping(true);
    if (goNext) {
      setDragX(-width);
      setTimeout(() => {
        // 현재 주가 spanning week 인지 확인 (viewMonth 와 viewMonth+1 둘 다 포함)
        const nextM = (viewMonth.month + 1) % 12;
        const nextY =
          viewMonth.month === 11 ? viewMonth.year + 1 : viewMonth.year;
        const hasCurrentMonth = currentWeekDays.some(
          (d) =>
            d.getMonth() === viewMonth.month &&
            d.getFullYear() === viewMonth.year
        );
        const hasNextMonth = currentWeekDays.some(
          (d) => d.getMonth() === nextM && d.getFullYear() === nextY
        );

        if (hasCurrentMonth && hasNextMonth) {
          // 현재 주가 spanning week — viewMonth 만 다음 달로 (같은 주 유지)
          // 예: 4/27~5/3 (4월 라벨) → 4/27~5/3 (5월 라벨)
          setViewMonth({ year: nextY, month: nextM });
        } else {
          // 일반 주 이동 (+7일)
          // 다음 주가 spanning week 라면 useEffect 가 viewMonth 를 selectedDate 의 달로 맞춰줌
          // → 4/20~26 (4월) → +7 → selectedDate=4/27, useEffect → viewMonth=4월
          //   → 4/27~5/3 (4월 라벨) 로 진입 ✓
          setSelectedDate((prev) => {
            const d = new Date(prev);
            d.setDate(d.getDate() + 7);
            return stripTime(d);
          });
        }
        setDragX(0);
        setSnapping(false);
      }, SNAP_MS);
    } else if (goPrev) {
      setDragX(width);
      setTimeout(() => {
        const prevM = (viewMonth.month + 11) % 12;
        const prevY =
          viewMonth.month === 0 ? viewMonth.year - 1 : viewMonth.year;
        const hasCurrentMonth = currentWeekDays.some(
          (d) =>
            d.getMonth() === viewMonth.month &&
            d.getFullYear() === viewMonth.year
        );
        const hasPrevMonth = currentWeekDays.some(
          (d) => d.getMonth() === prevM && d.getFullYear() === prevY
        );

        if (hasCurrentMonth && hasPrevMonth) {
          // 현재 주가 spanning week — viewMonth 만 이전 달로 (같은 주 유지)
          // 예: 4/27~5/3 (5월 라벨) → 4/27~5/3 (4월 라벨)
          setViewMonth({ year: prevY, month: prevM });
        } else {
          // 일반 주 이동 (-7일)
          setSelectedDate((prev) => {
            const d = new Date(prev);
            d.setDate(d.getDate() - 7);
            return stripTime(d);
          });
        }
        setDragX(0);
        setSnapping(false);
      }, SNAP_MS);
    } else {
      setDragX(0);
      setTimeout(() => setSnapping(false), SNAP_MS);
    }
    gRef.current.lock = null;
  };

  function jumpToToday() {
    const today = stripTime(new Date());
    setSelectedDate(today);
    setSnapping(true);
    setDragX(0);
    setTimeout(() => setSnapping(false), 300);
  }
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [filterText, setFilterText] = React.useState("");
  const [pickerDepot, setPickerDepot] = React.useState(selectedDepot);
  const selectableNames = React.useMemo(() => {
    const src = parsedByDepot[pickerDepot]?.names ?? [];
    const pickedKey = new Set(people.map((p) => `${p.depot}::${p.name}`));
    return src
      .filter(
        (n) =>
          !pickedKey.has(`${pickerDepot}::${n}`) &&
          (filterText.trim()
            ? n.toLowerCase().includes(filterText.trim().toLowerCase())
            : true)
      )
      .sort((a, b) => String(a).localeCompare(String(b), "ko"));
  }, [parsedByDepot, pickerDepot, people, filterText]);
  const NAME_COL_W = 80;
  const displayedWeekDays = currentWeekDays;
  // 라벨/음영 모두 viewMonth 기준으로 일원화
  const monthIdx = viewMonth.month;
  const monthYear = viewMonth.year;
  const todayISO = fmt(stripTime(new Date()));
  const isCurrentWeekHasToday = React.useMemo(
    () => displayedWeekDays.some((d) => fmt(d) === todayISO),
    [displayedWeekDays, todayISO]
  );
  const todayColIndex = React.useMemo(() => {
    if (!isCurrentWeekHasToday) return -1;
    return displayedWeekDays.findIndex((d) => fmt(d) === todayISO);
  }, [isCurrentWeekHasToday, displayedWeekDays, todayISO]);

  const monthLabel = `${monthYear}.${String(monthIdx + 1).padStart(2, "0")}`;

  function getContrastText(bg) {
    if (!bg) return "#fff";
    const c = bg.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16),
      g = parseInt(c.slice(2, 4), 16),
      b = parseInt(c.slice(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? "#000" : "#fff";
  }

  // 스크롤 영역 높이 = 뷰포트 - 헤더(요일 바) - 상단 툴바 - picker(열려있을 때) - 하단 안내
  // 넉넉히 빼서 안전하게
  const scrollAreaH = Math.max(
    200,
    slideViewportH - headerH - (pickerOpen ? 340 : 80) - 40
  );

  return (
    <div
      ref={wrapRef}
      className="bg-gray-800 rounded-2xl p-3 shadow mt-4 select-none"
      style={{
        // height 제거 → 내용만큼 자라서 appRef 전체 스크롤로 흐르게
        touchAction: "pan-y",
      }}
    >
      <div
        className="mb-2 flex items-center justify-between gap-2 text-[11px] text-gray-300"
        data-no-gesture
        style={{ position: "relative", zIndex: 3, touchAction: "auto" }}
      >
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="bg-gray-900/70 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-100"
            value={`${selectedDate.getFullYear()}-${String(
              selectedDate.getMonth() + 1
            ).padStart(2, "0")}`}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const [y, m] = v.split("-").map(Number);
              const next = new Date(selectedDate);
              next.setFullYear(y);
              next.setMonth(m - 1, 1);
              setSelectedDate(stripTime(next));
            }}
          />
          <select
            className="bg-gray-900/70 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-100 max-w-[140px]"
            value={activeGroupId}
            onChange={(e) => {
              const id = e.target.value;
              setActiveGroupId(id);
              const g = groups.find((gg) => gg.id === id);
              setCompareSelected(g?.people || []);
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="px-2 py-1 rounded-xl bg-gray-100 text-gray-900 text-xs"
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
          >
            {pickerOpen ? "상단 접기" : "인원·그룹 관리"}
          </button>
          {!isCurrentWeekHasToday && (
            <button
              className="px-2 py-1 rounded-xl bg-indigo-600 text-xs text-white"
              type="button"
              onClick={jumpToToday}
            >
              오늘로
            </button>
          )}
        </div>
      </div>
      {pickerOpen && (
        <div
          className="mb-2 rounded-2xl overflow-hidden"
          data-no-gesture
          style={{
            position: "relative",
            zIndex: 3,
            touchAction: "auto",
            background: "var(--surface-2)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="p-3">
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              그룹
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setActiveGroupId(g.id)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                  type="button"
                  style={
                    g.id === activeGroupId
                      ? {
                          background: "var(--accent)",
                          color: "#fff",
                          boxShadow: "0 2px 6px rgba(49,130,246,0.28)",
                        }
                      : {
                          background: "var(--surface)",
                          color: "var(--text-secondary)",
                          boxShadow: "inset 0 0 0 1px var(--border)",
                        }
                  }
                >
                  <span className="truncate max-w-[110px] inline-block align-middle">
                    {g.label}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setGroups((prev) => {
                    const used = new Set(
                      prev.map((g) => g.label).filter(Boolean)
                    );
                    let n = 1;
                    while (used.has(`그룹 ${n}`)) n++;
                    const label = `그룹 ${n}`,
                      id = `g${Date.now()}_${n}`;
                    const newGroup = { id, label, people: [] };
                    const next = [...prev, newGroup];
                    setActiveGroupId(id);
                    setCompareSelected([]);
                    return next;
                  });
                }}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium"
                style={{
                  background: "transparent",
                  color: "var(--accent)",
                  boxShadow: "inset 0 0 0 1px var(--accent)",
                }}
              >
                + 새 그룹
              </button>
            </div>

            {activeGroup && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingGroupId(activeGroup.id);
                    setEditingLabel(activeGroup.label || "");
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-secondary)",
                  }}
                >
                  이름 변경
                </button>
                <button
                  type="button"
                  disabled={groups.length <= 1}
                  onClick={handleDeleteGroup}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium disabled:opacity-40"
                  style={{
                    background: "var(--red-soft)",
                    color: "var(--red)",
                  }}
                >
                  그룹 삭제
                </button>
              </div>
            )}

            {editingGroupId && (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  className="flex-1 px-3 py-2 text-[13px] rounded-lg"
                  placeholder="그룹 이름 입력…"
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = editingLabel.trim();
                      setGroups((prev) =>
                        prev.map((g) =>
                          g.id === editingGroupId
                            ? { ...g, label: trimmed || g.label }
                            : g
                        )
                      );
                      setEditingGroupId(null);
                      setEditingLabel("");
                    } else if (e.key === "Escape") {
                      setEditingGroupId(null);
                      setEditingLabel("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = editingLabel.trim();
                    setGroups((prev) =>
                      prev.map((g) =>
                        g.id === editingGroupId
                          ? { ...g, label: trimmed || g.label }
                          : g
                      )
                    );
                    setEditingGroupId(null);
                    setEditingLabel("");
                  }}
                  className="px-3 py-2 rounded-lg text-[12px] font-semibold"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingGroupId(null);
                    setEditingLabel("");
                  }}
                  className="px-2.5 py-2 rounded-lg text-[12px]"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-secondary)",
                  }}
                >
                  취소
                </button>
              </div>
            )}
          </div>

          <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              인원 추가 {activeGroup ? `→ ${activeGroup.label}` : ""}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <select
                className="px-2 py-1.5 text-[12px] rounded-lg"
                value={pickerDepot}
                onChange={(e) => setPickerDepot(e.target.value)}
                style={{ minWidth: "90px" }}
              >
                {DEPOTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                className="flex-1 px-3 py-1.5 text-[12px] rounded-lg"
                placeholder="이름 검색…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>

            {selectableNames.length > 0 ? (
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
                }}
              >
                {selectableNames.map((n) => {
                  const bg = highlightMap?.[n] || null;
                  const fg = bg ? getContrastText(bg) : null;
                  return (
                    <button
                      key={`${pickerDepot}::${n}`}
                      onClick={() => addPerson(n, pickerDepot)}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold truncate transition-all active:scale-95"
                      title={`${pickerDepot} • ${n} 추가`}
                      style={
                        bg
                          ? {
                              backgroundColor: bg,
                              color: fg,
                            }
                          : {
                              background: "var(--surface)",
                              color: "var(--text-primary)",
                              boxShadow: "inset 0 0 0 1px var(--border)",
                            }
                      }
                      type="button"
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="text-center py-4 text-[12px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {filterText.trim()
                  ? "검색 결과가 없습니다"
                  : "추가할 인원이 없습니다"}
              </div>
            )}
          </div>
        </div>
      )}

      {/*
        본문 구조:
        - 헤더 + 인원 리스트를 하나의 transform 그룹으로 묶어 함께 translateX
        - 헤더와 리스트 모두 가로 스와이프 감지
        - 리스트는 pan-y 도 허용 (세로 스크롤은 appRef 로)
      */}
      <div
        ref={headerRef}
        className="relative"
        style={{
          // 세로 스크롤 시 상단 고정 (appRef 기준)
          position: "sticky",
          top: 0,
          zIndex: 5,
          // 헤더는 가로 스와이프 시에도 움직이지 않음 (transform 없음)
          // → 아래 리스트만 좌우로 밀려 보이게
          touchAction: "pan-x",
          // 부모 카드와 동일한 배경 (테마 변수 사용)
          background: "var(--surface-2)",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="grid rounded-t-xl overflow-hidden"
          style={{
            gridTemplateColumns: `${NAME_COL_W}px repeat(7, minmax(0,1fr))`,
          }}
        >
          <div className="px-1 py-4 text-[17px] font-semibold border-r border-gray-700">
            <span>{monthLabel}</span>
          </div>
          {displayedWeekDays.map((d) => {
            const dow = d.getDay(),
              isoD = fmt(d),
              outside =
                d.getMonth() !== monthIdx || d.getFullYear() !== monthYear;
            const color =
              dow === 0 || holidaySet?.has(isoD)
                ? "text-red-400"
                : dow === 6
                ? "text-blue-400"
                : "text-gray-100";
            return (
              <div
                key={isoD}
                className={
                  "px-2 py-2 text-center text-sm font-semibold border-l border-gray-700 " +
                  (outside ? "text-gray-500" : color)
                }
                title={fmtWithWeekday(d)}
              >
                <div>{d.getDate()}</div>
                <div className="text-[11px] opacity-80">
                  {["일", "월", "화", "수", "목", "금", "토"][dow]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 인원 리스트 — 헤더와 같은 translateX 로 함께 움직임, 가로 스와이프도 여기서 감지 */}
      <div
        data-scroll-area
        className="rounded-b-xl"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: snapping ? "transform 300ms ease-out" : "none",
          willChange: "transform",
          // pan-y: 세로 스크롤은 appRef 에 넘김. 가로는 앱이 감지해서 preventDefault.
          touchAction: "pan-y",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 인원 리스트를 감싸는 relative — 빨간 박스는 이 안에서만 차지 */}
        <div className="relative" ref={listRef}>
          {/* 오늘 열 표시 — 인원 리스트 실제 높이만큼만 */}
          {todayColIndex >= 0 && people.length > 0 && (
            <div
              className="absolute pointer-events-none border-2 border-red-400 rounded-md"
              style={{
                top: 0,
                bottom: 0,
                left: `calc(${NAME_COL_W}px + ${todayColIndex} * ((100% - ${NAME_COL_W}px) / 7))`,
                width: `calc((100% - ${NAME_COL_W}px) / 7)`,
                zIndex: 4,
              }}
            />
          )}
          <div className="divide-y divide-gray-700">
            {people.map(({ name, depot }, rowIdx) => {
              const isDragging = draggingIdx === rowIdx;
              const rowTransform = getRowTransform(rowIdx);
              const dragHandlers = makeRowDragHandlers(rowIdx);
              return (
                <div
                  key={`${depot}::${name}`}
                  data-row
                  className="grid bg-gray-800/60 hover:bg-gray-800"
                  style={{
                    gridTemplateColumns: `${NAME_COL_W}px repeat(7, minmax(0,1fr))`,
                    transform: rowTransform || undefined,
                    transition:
                      draggingIdx == null
                        ? "transform 200ms ease"
                        : isDragging
                        ? "none"
                        : "transform 180ms ease",
                    zIndex: isDragging ? 10 : "auto",
                    position: "relative",
                    boxShadow: isDragging
                      ? "0 8px 20px rgba(0,0,0,0.45)"
                      : undefined,
                    background: isDragging ? "rgba(31,41,55,0.95)" : undefined,
                    touchAction: isDragging ? "none" : undefined,
                  }}
                >
                  <div
                    className="px-2 py-1 border-r border-gray-700 flex items-center justify-between min-w-0"
                    onTouchStart={dragHandlers.onTouchStart}
                    onTouchMove={dragHandlers.onTouchMove}
                    onTouchEnd={dragHandlers.onTouchEnd}
                    onTouchCancel={dragHandlers.onTouchCancel}
                    style={{ touchAction: "pan-y" }}
                  >
                    <div
                      className="text-white font-semibold truncate text-[12px] min-w-0"
                      title={`${depot} • ${name} (꾹 눌러서 순서 변경)`}
                    >
                      {name}
                    </div>
                    <button
                      data-no-drag
                      className="w-4 h-4 rounded-full bg-gray-700 hover:bg-gray-600 text-[10px] flex items-center justify-center flex-shrink-0 ml-0.5"
                      onClick={() => removePerson(name, depot)}
                      type="button"
                    >
                      −
                    </button>
                  </div>
                  {displayedWeekDays.map((d) => {
                    const row = rowAtDateFor(name, depot, d);
                    const t = computeInOut(row, d, holidaySet);
                    const dia =
                      row?.dia === undefined
                        ? "-"
                        : typeof row.dia === "number"
                        ? row.dia
                        : String(row.dia).replace(/\s+/g, "");
                    const diaLabel =
                      row?.dia == null
                        ? ""
                        : String(row.dia).replace(/\s+/g, "");
                    const finalLabel = isOverridden(name, depot, d)
                      ? diaLabel
                        ? `*${diaLabel}`
                        : "*"
                      : diaLabel || "-";
                    const outside =
                      d.getMonth() !== monthIdx ||
                      d.getFullYear() !== monthYear;

                    let bgColor = "bg-gray-800/60";
                    const todayDiaStr = String(row?.dia || "").replace(
                      /\s/g,
                      ""
                    );
                    const isOff =
                      !todayDiaStr ||
                      todayDiaStr.startsWith("휴") ||
                      todayDiaStr.includes("비번") ||
                      todayDiaStr === "비" ||
                      todayDiaStr.endsWith("~");
                    if (!isOff) {
                      const isTime = (v) =>
                        typeof v === "string" &&
                        /^\d{1,2}\s*:\s*\d{2}$/.test(v);
                      const hasWork = isTime(t.in) || isTime(t.out);
                      if (t.isNight) bgColor = "bg-sky-500/30";
                      else if (hasWork) bgColor = "bg-yellow-500/30";
                    }
                    const cellKey = `${depot}::${name}::${fmt(d)}`;
                    const isCellSelected = selectedCellKey === cellKey;
                    return (
                      <div
                        key={`${depot}::${name}_${fmt(d)}`}
                        onClick={() => handleCellTap(name, depot, d)}
                        className={`px-1 py-1 text-[11px] leading-tight border-l border-gray-700 cursor-pointer ${bgColor} ${
                          outside ? "opacity-50" : ""
                        }`}
                        style={{
                          position: "relative",
                          boxShadow: isCellSelected
                            ? "inset 0 0 0 2px #60a5fa"
                            : undefined,
                          zIndex: isCellSelected ? 6 : undefined,
                        }}
                        title={`${depot} • ${name} • ${fmtWithWeekday(
                          d
                        )} • DIA ${dia} / ${t.in}~${
                          t.out
                        } (한 번 탭 선택, 또 탭하면 행로)`}
                      >
                        <div className="font-semibold">{finalLabel}</div>
                        <div className="mt-0.5">{t.in || "-"}</div>
                        <div>{t.out || "-"}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {people.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-500">
                "인원·그룹 관리" 로 사람을 추가하세요.
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1 text-[10px] text-gray-400 text-center">
        주 이동은 ← / → 스와이프 · 이름을 꾹 눌러 순서 변경
      </div>
    </div>
  );
}
