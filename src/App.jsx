// /project/workspace/src/App.jsx

//import React, { useEffect, useMemo, useState } from "react";
// App.jsx 최상단 import들 아래
import React, { useEffect, useMemo, useState, useLayoutEffect } from "react";
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

    // iOS PWA 대응: resize, orientationchange, visualViewport
    window.addEventListener("resize", onChange, { passive: true });
    window.addEventListener("orientationchange", onChange, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onChange, { passive: true });

    // matchMedia 리스너
    if (mm?.addEventListener) mm.addEventListener("change", onChange);

    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      vv?.removeEventListener("resize", onChange);
      if (mm?.removeEventListener) mm.removeEventListener("change", onChange);
    };
  }, []);

  // 가로일 땐 스크롤/인터랙션 잠금
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

// ✅ 행로표 이미지 자동 스캔 (Vite 전용)
import {
  Calendar as CalendarIcon,
  Settings,
  List,
  User,
  Upload,
} from "lucide-react";

/** ======================================================
 *  표 포맷 (CSV/TSV)
 *  순번, 이름, dia, 평일출근, 평일퇴근, 토요일출근, 토요일퇴근, 휴일출근, 휴일퇴근
 *
 *  규칙:
 *  - 일요일은 자동 '휴'
 *  - 야간: dia 숫자 >= nightDiaThreshold → 출근은 당일 타입 in, 퇴근은 "다음날" 타입 out
 *  - 공휴일(설정) 입력 시 해당 날짜는 '휴'
 *  - 회전: "기준일"을 기준으로 날짜가 하루 지나면 표의 다음 순번 행을 사용
 * ====================================================== */

const STORAGE_KEY = "workCalendarSettingsV3"; // ← 버전 키 (구버전과 충돌 방지)

// 소속(차고/센터)
const DEPOTS = ["안심", "월배", "경산", "문양"];

// 소속별 샘플 테이블 (헤더 동일, 1~10, 이름 a~j)
function sampleTableFor(depot) {
  const header =
    "순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근";

  const rows = [
    "1\ta\t1\t06:00\t14:00\t06:00\t14:00\t06:00\t14:00",
    "2\tb\t3\t07:00\t15:00\t07:00\t15:00\t07:00\t15:00",
    "3\tc\t6\t19:00\t10:00\t19:00\t10:00\t19:00\t10:00",
    "4\td\t비번\t\t\t\t\t\t",
    "5\te\t휴\t\t\t\t\t\t",
    "6\tf\t2\t08:00\t16:00\t08:00\t16:00\t08:00\t16:00",
    "7\tg\t4\t09:00\t17:00\t09:00\t17:00\t09:00\t17:00",
    "8\th\t5\t18:00\t09:00\t18:00\t09:00\t18:00\t09:00",
    "9\ti\t비\t\t\t\t\t\t",
    "10\tj\t휴\t\t\t\t\t\t",
  ];

  return [header, ...rows].join("\n");
}

const defaultTableTSV = `순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근
1\t신동훈\t4\t6:43\t15:23\t6:55\t16:37\ts4\ts4
2\t홍성민\t14\t9:13\t18:50\t9:29\t19:26\t8:50\t18:44
3\t이성철\t32\t19:39\t10:06\t20:13\t10:37\t20:40\t10:38
4\t강원희\t비번\t\t\t\t\t\t
5\t김치완\t휴1\t\t\t\t\t\t
6\t최병환\t9\t7:23\t18:45\t7:29\t17:41\t7:20\t16:12
7\t이기환\t24\t13:05\t21:41\t13:56\t21:43\t12:42\t21:16
8\t박재민\t대5\t18:00\t9:00\t18:00\t9:00\t18:00\t9:00
9\t박도현\t비번\t\t\t\t\t\t
10\t오중구\t휴2\t\t\t\t\t\t
11\t유용우\t2\t06:35\t15:47\ts2\ts2\ts2\ts2
12\t김찬우\t12\t08:53\t19:33\t09:00\t18:37\t08:05\t17:24
13\t채준호\t26\t17:15\t08:05\t17:15\t08:04\t17:49\t08:05
14\t이상원\t비번\t\t\t\t\t\t
15\t박상현\t휴3\t\t\t\t\t\t
16\t(김선정)\t휴4\t\t\t\t\t\t
17\t함일남\t대1\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00
18\t이원준\t16\t09:37\t19:53\t10:33\t20:47\t09:35\t19:19
19\t류기철\t35\t20:03\t10:23\t19:49\t09:34\t19:55\t09:17
20\t김관동\t비번\t\t\t\t\t\t
21\t우진우\t휴5\t\t\t\t\t\t
22\t강동우\t1\t06:31\t14:03\ts1\ts1\ts1\ts1
23\t김호열\t17\t10:25\t20:29\t10:49\t20:55\t09:44\t18:37
24\t엄인철\t30\t19:23\t10:23\t19:17\t10:23\t19:46\t10:20
25\t최동현\t비번\t\t\t\t\t\t
26\t송기중\t휴6\t\t\t\t\t\t
27\t박경섭\t5\t06:50\t16:43\t06:58\t15:57\ts5\ts5
28\t권기석\t15\t09:21\t19:45\t09:45\t19:50\t09:08\t18:20
29\t강유덕\t29\t19:15\t08:53\t19:41\t10:17\t18:43\t09:53
30\t김상수\t비번\t\t\t\t\t\t
31\t권용록\t휴7\t\t\t\t\t\t
32\t구민혁\t휴8\t\t\t\t\t\t
33\t황병두\t대2\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00
34\t이상훈\t20\t11:21\t20:10\t11:37\t21:27\t11:05\t20:49
35\t김성열\t36\t20:11\t08:32\t20:05\t08:36\t20:13\t08:32
36\t허준석\t비번\t\t\t\t\t\t
37\t이상욱\t휴9\t\t\t\t\t\t
38\t김경구\t3\t06:41\t14:19\t06:50\t15:06\ts3\ts3
39\t임대기\t13\t09:06\t19:10\t09:07\t17:01\t08:23\t17:48
40\t조덕헌\t27\t17:20\t08:48\t18:53\t08:52\t18:07\t08:50
41\t권혁기\t비번\t\t\t\t\t\t
42\t김희준\t휴10\t\t\t\t\t\t
43\t박형민\t11\t07:58\t19:22\t08:53\t19:00\t07:47\t17:32
44\t임병길\t18\t10:41\t21:01\t10:57\t20:21\t10:20\t19:37
45\t박종률\t31\t19:31\t08:58\t19:25\t08:44\t19:19\t08:41
46\t강병웅\t비번\t\t\t\t\t\t
47\t이성재\t휴11\t\t\t\t\t\t
48\t이재헌\t휴12\t\t\t\t\t\t
49\t박문우\t대3\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00
50\t문경주\t21\t11:29\t21:17\t11:40\t20:04\t11:22\t21:07
51\t윤영준\t37\t21:07\t07:47\t21:01\t07:47\t20:58\t07:47
52\t김종규\t비번\t\t\t\t\t\t
53\t한남권\t휴13\t\t\t\t\t\t
54\t이근수\t6\t06:56\t16:11\t07:06\t15:26\ts6\ts6
55\t김종훈\t23\t12:49\t21:33\t13:42\t21:11\t12:10\t21:25
56\t조재훈\t25\t16:35\t08:26\t16:34\t08:28\t16:50\t09:35
57\t강근영\t비번\t\t\t\t\t\t
58\t이희한\t휴14\t\t\t\t\t\t
59\t이재문\t7\t07:02\t16:51\t07:14\t17:09\t06:53\t16:36
60\t김성탁\t대4\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00
61\t최우용\t19\t10:57\t20:45\t11:24\t20:23\t10:34\t20:13
62\t진위동\t34\t19:55\t08:13\t20:29\t08:12\t20:22\t08:14
63\t김병재\t비번\t\t\t\t\t\t
64\t이동혁\t휴15\t\t\t\t\t\t
65\t김우년\t10\t07:28\t17:31\t08:04\t18:45\t07:29\t17:24
66\t이원진\t22\t12:17\t21:09\t12:24\t21:35\t11:54\t19:55
67\t이동호\t33\t19:47\t09:28\t19:57\t08:59\t19:37\t08:59
68\t우진하\t비번\t\t\t\t\t\t
69\t왕진섭\t휴16\t\t\t\t\t\t
70\t정범철\t휴17\t\t\t\t\t\t
71\t정호창\t8\t07:18\t17:07\t07:22\t16:29\t07:11\t17:40
72\t김성규\t28\t18:59\t08:20\t17:56\t08:20\t18:25\t08:23
73\t권정진\t비번\t\t\t\t\t\t
74\t이상신\t휴18\t\t\t\t\t\t
75\t백상우\t휴19\t\t\t\t\t\t`;

// App.jsx 최상단 상수/유틸 근처
const ansimGlobs = import.meta.glob("./ansim/*.png", {
  eager: true,
  as: "url",
});

function getRouteImageSrc(key) {
  const path = `./ansim/${key}.png`;
  if (ansimGlobs[path]) return ansimGlobs[path];
  // 🔎 못 찾으면 근사치 탐색 (하이픈/정규화/언더스코어 등)
  const keys = Object.keys(ansimGlobs);
  const variants = [
    key,
    key.normalize("NFC"),
    key.normalize("NFD"),
    key.replaceAll("-", "-"), // (U+2011, non-breaking hyphen)
    key.replaceAll("-", "–"), // (en dash)
    key.replaceAll("-", "_"),
    key.replaceAll(" ", ""),
  ];
  for (const v of variants) {
    const p = `./ansim/${v}.png`;
    if (ansimGlobs[p]) return ansimGlobs[p];
  }
  // 부분일치로 마지막 시도
  const hit = keys.find((k) => k.includes(key));
  if (hit) return ansimGlobs[hit];
  console.warn("[ansim] not found:", path, "\navailable:", keys);
  return "";
}

/* ---------- 유틸 ---------- */
function fmt(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
// 기존 fmt 아래쪽에 추가
function fmtWithWeekday(date) {
  const tz = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tz);
  const iso = local.toISOString().slice(0, 10);
  const weekday = weekdaysKR[(local.getDay() + 6) % 7]; // ← 일(0)→월(0)로 보정
  return `${iso} (${weekday})`;
}

function stripTime(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
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
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
const weekdaysKR = ["월", "화", "수", "목", "금", "토", "일"];
function startOfWeekMonday(d) {
  const day = (d.getDay() + 6) % 7; // 월=0
  const x = new Date(d);
  x.setDate(d.getDate() - day);
  return x;
}
function monthGridMonday(selectedDate) {
  const start = startOfMonth(selectedDate);
  const firstMon = startOfWeekMonday(start);
  const days = [];
  let cur = new Date(firstMon);
  // 항상 6주(=42칸) 보장
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
// 기본 공휴일(2025·2026) — 줄바꿈 구분
const DEFAULT_HOLIDAYS_25_26 = `
2025-01-01
2025-01-28
2025-01-29
2025-01-30
2025-03-01
2025-03-03
2025-05-05
2025-06-06
2025-08-15
2025-10-03
2025-10-05
2025-10-06
2025-10-07
2025-10-09
2025-12-25
2026-01-01
2026-02-16
2026-02-17
2026-02-18
2026-03-01
2026-03-02
2026-05-05
2026-05-24
2026-05-25
2026-06-06
2026-08-15
2026-08-17
2026-09-24
2026-09-25
2026-09-26
2026-09-27
2026-10-03
2026-10-05
2026-10-09
2026-12-25
`.trim();

/* 요일타입: 평/토/휴 (일요일=휴) + 공휴일 */
function getDayType(date, holidaySet) {
  const dow = date.getDay();
  if (holidaySet.has(fmt(date))) return "휴";
  if (dow === 0) return "휴";
  if (dow === 6) return "토";
  return "평";
}

/* 표 파싱(CSV/TSV) */
function parsePeopleTable(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
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

  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(delim);
    const diaRaw = (cols[iDia] || "").trim();
    const dia = /^\d+$/.test(diaRaw) ? Number(diaRaw) : diaRaw;
    rows.push({
      seq: (cols[iSeq] || "").trim(),
      name: (cols[iName] || "").trim(),
      dia,
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

/* 이름 -> 원본 행 인덱스 */
function buildNameIndexMap(rows) {
  const m = new Map();
  rows.forEach((r, i) => {
    if (r.name) m.set(r.name, i);
  });
  return m;
}

/* (row, date, holidays, nightDiaThreshold) → {in, out, note, combo, isNight} */
function computeInOut(row, date, holidaySet, nightDiaThreshold) {
  if (!row)
    return {
      in: "-",
      out: "-",
      note: "데이터 없음",
      combo: "-",
      isNight: false,
    };

  if (typeof row.dia === "string") {
    const label = row.dia;
    if (label.includes("비번"))
      return { in: "-", out: "-", note: "비번", combo: "-", isNight: false };
    if (label.replace(/\s/g, "").startsWith("휴"))
      return { in: "-", out: "-", note: "휴무", combo: "-", isNight: false };
    if (label.startsWith("대")) {
      const tType = getDayType(date, holidaySet);
      const src =
        tType === "평"
          ? row.weekday
          : tType === "토"
          ? row.saturday
          : row.holiday;
      return {
        in: src.in || "-",
        out: src.out || "-",
        note: `대근·${tType}`,
        combo: tType,
        isNight: false,
      };
    }
  }

  const tType = getDayType(date, holidaySet);
  const srcToday =
    tType === "평" ? row.weekday : tType === "토" ? row.saturday : row.holiday;

  let outTime = srcToday.out || "-";
  let combo = `${tType}-${tType}`;
  let night = false;

  if (typeof row.dia === "number" && row.dia >= nightDiaThreshold) {
    const tomorrow = new Date(date);
    tomorrow.setDate(date.getDate() + 1);
    const nextType = getDayType(tomorrow, holidaySet);
    const srcNext =
      nextType === "평"
        ? row.weekday
        : nextType === "토"
        ? row.saturday
        : row.holiday;
    outTime = srcNext.out || "-";
    combo = `${tType}-${nextType}`;
    night = true;
  }

  return {
    in: srcToday.in || "-",
    out: outTime,
    note: night ? `${combo} (야간)` : combo,
    combo,
    isNight: night,
  };
}

/* 파일 업로드 (텍스트) */
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target.result || ""));
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

/* 이미지 → dataURL (localStorage 저장 가능) */
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* 행로표 이미지 키 생성: "{dia}dia{combo}" 예) "27dia평-휴" */
function routeKey(dia, combo) {
  if (typeof dia !== "number") return "";
  return `${dia}dia${combo}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* ===========================================
 * App
 * ===========================================*/

export default function App() {
  const [selectedTab, setSelectedTab] = useState("home");

  // 오늘/선택일
  const today = stripTime(new Date());
  const [selectedDate, setSelectedDate] = useState(today);

  const [tempName, setTempName] = useState(""); // 홈 탭용 임시 이름
  // 👉 슬라이드 애니메이션을 위한 상태/참조
  const gridWrapRef = React.useRef(null);
  const [dragX, setDragX] = useState(0); // 손가락 따라 이동하는 x(px)
  const [isSnapping, setIsSnapping] = useState(false); // 스냅 중이면 true

  // 회전 "기준일" — 기본은 오늘
  const [anchorDateStr, setAnchorDateStr] = useState(fmt(today));
  const anchorDate = useMemo(
    () => stripTime(new Date(anchorDateStr)),
    [anchorDateStr]
  );
  // 소속 선택
  const [selectedDepot, setSelectedDepot] = useState("안심");

  // ✅ 여기에 추가
  const [tablesByDepot, setTablesByDepot] = useState({
    안심: defaultTableTSV,
    월배: sampleTableFor("월배"),
    경산: sampleTableFor("경산"),
    문양: sampleTableFor("문양"),
  });

  // 데이터/이름 목록
  //const [tableText, setTableText] = useState(defaultTableTSV);

  // 현재 소속의 테이블 텍스트
  const currentTableText = useMemo(
    () => tablesByDepot[selectedDepot] ?? defaultTableTSV,
    [tablesByDepot, selectedDepot]
  );

  //const peopleRows = useMemo(() => parsePeopleTable(tableText), [tableText]);
  const peopleRows = useMemo(
    () => parsePeopleTable(currentTableText),
    [currentTableText]
  );

  // ✅ 여기에 추가
  const nameIndexMap = useMemo(
    () => buildNameIndexMap(peopleRows),
    [peopleRows]
  );

  const nameList = useMemo(
    () => peopleRows.map((r) => r.name).filter(Boolean),
    [peopleRows]
  );

  // 내 이름/공휴일
  //const [myName, setMyName] = useState("");

  // 소속별 내 이름
  const [myNameMap, setMyNameMap] = useState({
    안심: "",
    월배: "",
    경산: "",
    문양: "",
  });
  const myName = myNameMap[selectedDepot] || "";
  const setMyNameForDepot = (depot, name) =>
    setMyNameMap((prev) => ({ ...prev, [depot]: name }));
  const [holidaysText, setHolidaysText] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState(""); // ✅ 추가 (공휴일 추가용)
  const lastClickedRef = React.useRef(null);
  const holidaySet = useMemo(() => {
    const s = new Set();
    holidaysText
      .split(/[, \n\r]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((d) => s.add(d));
    return s;
  }, [holidaysText]);

  // ✅ 탭바 높이 반영: 세로 슬라이드 뷰포트 고정 높이 계산
  const tabbarRef = React.useRef(null);
  const appRef = React.useRef(null); // ← 추가
  const [slideViewportH, setSlideViewportH] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const tabbarH = tabbarRef.current?.offsetHeight || 0;
      // 탭바를 뺀 화면 높이(약간의 여유 여백 포함). 최소값으로 안전장치
      const vh = window.innerHeight - tabbarH - 12;
      setSlideViewportH(Math.max(360, vh));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 행로표 보기 대상 (클릭 임시 선택) — 내 이름은 유지
  const [routeTargetName, setRouteTargetName] = useState("");

  // 행로표 이미지 매핑: { "27dia평-휴": dataUrl, ... }
  const [routeImageMap, setRouteImageMap] = useState({});

  // 야간 기준값(설정에서 변경)
  //const [nightDiaThreshold, setNightDiaThreshold] = useState(25);
  const [nightDiaByDepot, setNightDiaByDepot] = useState({
    안심: 25,
    월배: 5,
    경산: 5,
    문양: 5,
  });
  // 선택된 소속의 야간 기준값 (기존 nightDiaThreshold 대체)
  const nightDiaThreshold = nightDiaByDepot[selectedDepot] ?? 25;
  const setNightDiaForDepot = (depot, val) =>
    setNightDiaByDepot((prev) => ({ ...prev, [depot]: val }));

  // 여러 사람 강조 색상: { [name]: "#RRGGBB" }
  const [highlightMap, setHighlightMap] = useState({});
  // ===== 상단 state 부근에 추가 =====
  const [loaded, setLoaded] = useState(false); // 로컬스토리지에서 다 읽어왔는지 플래그
  const SAVE_DEBOUNCE = 300; // 저장 디바운스(ms)

  const [calHasSelection, setCalHasSelection] = useState(true);

  // 🔒 수직 스와이프 중 문서 스크롤 잠금/해제 (iOS 대응 포함)
  const scrollLockRef = React.useRef({ locked: false, scrollY: 0 });

  function lockBodyScroll() {
    if (scrollLockRef.current.locked) return;
    scrollLockRef.current.scrollY = window.scrollY || window.pageYOffset || 0;
    // iOS 사파리 대응: position: fixed + top 보정
    //document.body.style.position = "fixed";
    //document.body.style.top = `-${scrollLockRef.current.scrollY}px`;
    //document.body.style.left = "0";
    //document.body.style.right = "0";
    //document.body.style.width = "100%";
    //document.body.style.overflow = "hidden";
    // 바운스/오버스크롤 방지
    //document.documentElement.style.overscrollBehavior = "none";
    //document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";
    scrollLockRef.current.locked = true;
  }

  function unlockBodyScroll() {
    if (!scrollLockRef.current.locked) return;
    const y = scrollLockRef.current.scrollY || 0;
    //document.body.style.position = "";
    //document.body.style.top = "";
    //document.body.style.left = "";
    //document.body.style.right = "";
    //document.body.style.width = "";
    //document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
    document.body.style.overscrollBehavior = "";
    scrollLockRef.current.locked = false;
    // 복귀
    //window.scrollTo(0, y);
  }

  /* -----------------------
   * 1) 초기 로드: localStorage → 상태

  
   * ----------------------- */

  // 홈, 행로 각각의 수직 페이저 상태  ✅ isHomeCalLocked보다 먼저!
  const [homePage, setHomePage] = useState(0); // 0=캘린더, 1=전체교번
  const [routePage, setRoutePage] = useState(0); // 0=행로카드, 1=전체교번
  // 🔥 iOS 전환 효과용 상태
  const [routeTransitioning, setRouteTransitioning] = useState(false);

  // 🔥 행로표 탭으로 부드럽게 전환하는 함수
  function triggerRouteTransition() {
    // 🔹 오버레이 요소 생성 (기존 화면 페이드아웃용)
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
      transition: "all 0.35s cubic-bezier(0.25, 1, 0.5, 1)", // iOS 감속 커브
      zIndex: "9998",
      pointerEvents: "none",
    });
    document.body.appendChild(overlay);

    // 🔹 현재 화면이 살짝 뒤로 밀리면서 어두워짐
    requestAnimationFrame(() => {
      overlay.style.opacity = "0.12";
      overlay.style.transform = "scale(0.96)";
    });

    // 🔹 약간의 지연 후 route 화면 전환
    setTimeout(() => {
      setSelectedTab("route");
      setRoutePage(0);
      setDragYRoute(0);

      // 🔹 새 화면이 확대되며 등장 (depth-in)
      const routePanel = document.getElementById("route-panel0");
      if (routePanel) {
        routePanel.animate(
          [
            { opacity: 0, transform: "translateY(14px) scale(0.97)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          {
            duration: 200,
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          }
        );
      }
    }, 150);

    // 🔹 페이드아웃 종료 후 오버레이 제거
    setTimeout(() => {
      overlay.style.opacity = "0";
      overlay.style.transform = "scale(1)";
      setTimeout(() => overlay.remove(), 220);
    }, 400);
  }

  // ✅ useEffect보다 "위"에서 선언해야 함 (homePage를 이미 선언한 뒤)
  const isHomeCalLocked = selectedTab === "home" && homePage === 0;
  const isRouteLocked = selectedTab === "route"; // 행로는 두 페이지 모두 잠금
  const isRosterLocked = false; // ✅ 전체 탭은 잠금 해제
  const isAnyLocked = isHomeCalLocked || isRouteLocked; // ✅ roster 제외

  // ===== 초기 로드 useEffect 수정 =====
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        //setMyName((prev) => prev || nameList[0] || "");
        // 초기 진입: 안심 표의 첫 이름을 내 이름 후보로
        setMyNameForDepot("안심", nameList[0] || "");
        setHolidaysText(DEFAULT_HOLIDAYS_25_26); // ← 기본 공휴일 미리 채워 넣기
        setLoaded(true);
        return;
      }
      const s = JSON.parse(raw);

      // ✅ 새로 추가 (야간 규칙 소속별 버전 로드)
      if (s.nightDiaByDepot) {
        setNightDiaByDepot(s.nightDiaByDepot);
      } else if (typeof s.nightDiaThreshold === "number") {
        // ⬅️ 과거 단일값을 쓰던 버전 호환: 모든 소속에 동일 적용
        setNightDiaByDepot({
          안심: s.nightDiaThreshold,
          월배: s.nightDiaThreshold,
          경산: s.nightDiaThreshold,
          문양: s.nightDiaThreshold,
        });
      }
      //if (s.tableText) setTableText(s.tableText);
      //if (s.myName) setMyName(s.myName);
      // V3
      if (s.tablesByDepot) setTablesByDepot(s.tablesByDepot);
      if (s.myNameMap) setMyNameMap(s.myNameMap);
      if (s.selectedDepot) setSelectedDepot(s.selectedDepot);

      // 하위 호환(V2) → 안심에 이관
      if (!s.tablesByDepot && s.tableText) {
        setTablesByDepot((prev) => ({ ...prev, 안심: s.tableText }));
      }
      if (!s.myNameMap && s.myName) {
        setMyNameForDepot("안심", s.myName);
      }

      if (s.anchorDateStr) setAnchorDateStr(s.anchorDateStr);
      //if (s.holidaysText) setHolidaysText(s.holidaysText);
      if (s.holidaysText) setHolidaysText(s.holidaysText);
      // 저장된 값이 비거나 공백뿐이면 기본값으로 보정
      if (!s.holidaysText || !String(s.holidaysText).trim()) {
        setHolidaysText(DEFAULT_HOLIDAYS_25_26);
      }
      //if (typeof s.nightDiaThreshold === "number")
      // setNightDiaThreshold(s.nightDiaThreshold);
      if (s.highlightMap) setHighlightMap(s.highlightMap);
      if (s.selectedDate) setSelectedDate(stripTime(new Date(s.selectedDate)));
      if (s.routeImageMap) setRouteImageMap(s.routeImageMap);
    } catch (e) {
      console.warn("[LOAD] 설정 로드 실패", e);
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 홈, 행로 각각의 수직 페이저 상태

  // 탭 변경 시 스크롤 맨 위로 이동
  // 탭 변경 시 스크롤 초기화 + 홈에서 나가면 임시 이름 복귀
  useEffect(() => {
    if (appRef.current) appRef.current.scrollTop = 0; // ← 핵심
    window.scrollTo({ top: 0, behavior: "instant" });

    // ✅ '전체(roster)'나 '설정(settings)'으로 나갔다가 돌아올 때만 임시 대상 초기화
    if (selectedTab === "roster" || selectedTab === "settings") {
      setTempName("");
    }
  }, [selectedTab]);

  useEffect(() => {
    console.log("🔑 ansimGlobs keys:", Object.keys(ansimGlobs));
  }, []);

  // 홈 탭 들어올 때는 항상 panel0로 고정
  useEffect(() => {
    if (selectedTab === "home") {
      setHomePage(0);
      setDragYHome(0);
      setSnapYHome(false);
      // 홈으로 돌아오면 '오늘'로 복귀 (다른 달로 슬라이드해둔 상태 정리)
      if (fmt(selectedDate) !== fmt(today) || !calHasSelection) {
        setSelectedDate(today);
        setCalHasSelection(true); // 하이라이트 켜기
        lastClickedRef.current = fmt(today); // 더블탭 기준도 오늘로 동기화
      }
    }
  }, [selectedTab]);

  // ✅ 행로 탭으로 들어올 때는 항상 panel0로 강제 리셋
  useEffect(() => {
    if (selectedTab === "route") {
      setRoutePage(0);
      setDragYRoute(0);
      setSnapYRoute(false);
    }
  }, [selectedTab]);

  // 홈 캘린더(페이지 0) 노출 동안 문서 스크롤 잠금
  useEffect(() => {
    if (isAnyLocked) {
      lockBodyScroll();
      return () => unlockBodyScroll();
    } else {
      unlockBodyScroll();
    }
  }, [isAnyLocked]);

  /* 이름 리스트가 갱신되었는데 내 이름이 없으면 첫 항목으로 자동 보정 */
  // ===== 이름 자동 보정 useEffect 보완 (loaded 이후에만 작동) =====
  // ✅ /src/ansim 안의 이미지 자동 등록
  useEffect(() => {
    const targetName = routeTargetName || myName;
    if (!targetName) return;

    (async () => {
      const row = rowAtDateForName(targetName, selectedDate);
      const t = computeInOut(row, selectedDate, holidaySet, nightDiaThreshold);
      const key =
        typeof row?.dia === "number" ? routeKey(row.dia, t.combo) : "";
      if (!key) return;

      // 이미 캐시에 있으면 스킵
      if (routeImageMap[key]) return;

      const src = getRouteImageSrc(key);
      if (src) setRouteImageMap((prev) => ({ ...prev, [key]: src }));
    })();
  }, [routeTargetName, myName, selectedDate, holidaySet, nightDiaThreshold]);

  //useEffect(() => {
  //  console.log("✅ ansimImages keys:", Object.keys(ansimImages));
  // }, []);

  useEffect(() => {
    console.log("🧩 routeImageMap keys:", Object.keys(routeImageMap));
  }, [routeImageMap]);

  console.log("🧩 routeImageMap keys:", Object.keys(routeImageMap));
  useEffect(() => {
    // 지원 브라우저에서 저장소를 "가능하면 지우지 않도록" 요청
    (async () => {
      try {
        if ("storage" in navigator && "persist" in navigator.storage) {
          await navigator.storage.persist();
        }
      } catch {}
    })();
  }, []);

  /* -----------------------
   * 2) 상태 변경 시: 상태 → localStorage (자동 저장)
   * ----------------------- */
  // ===== 저장 useEffect: 디바운스 & 용량 초과해도 앱 죽지 않게 =====
  useEffect(() => {
    if (!loaded) return; // 초기 로드 끝나기 전에는 저장 안 함

    const data = {
      //myName,
      myNameMap,
      selectedDepot,
      anchorDateStr,
      holidaysText,
      //nightDiaThreshold,
      nightDiaByDepot,
      highlightMap,
      //tableText,
      tablesByDepot,
      selectedDate: fmt(selectedDate),
      routeImageMap, // 서버 URL만 보관할 예정(2번에서 수정)
    };

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn(
          "[SAVE] 저장 실패(아마 용량 초과). routeImageMap 용량 확인",
          e
        );
        // 용량 초과 시, 이미지맵만 날리고 재시도(설정 값은 반드시 남도록)
        try {
          const lite = { ...data, routeImageMap: {} };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(lite));
        } catch (e2) {
          console.warn("[SAVE] 이미지 제거 후에도 실패", e2);
        }
      }
    }, SAVE_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [
    loaded,
    //myName,
    myNameMap,
    anchorDateStr,
    holidaysText,
    nightDiaByDepot,
    //nightDiaThreshold,
    highlightMap,
    //tableText,
    tablesByDepot,
    selectedDate,
    routeImageMap,
  ]);

  // ✅ RosterGrid에서 접근 가능하게 전역 등록
  useEffect(() => {
    window.triggerRouteTransition = triggerRouteTransition;
    window.setRouteTargetName = setRouteTargetName; // ✅ 추가!
    return () => delete window.triggerRouteTransition;
  }, []);

  // --- 회전 로직: "기준일"을 0으로 보고 날짜차이만큼 전진 ---
  function rowAtDateForName(name, date) {
    if (!nameIndexMap.has(name) || peopleRows.length === 0) return undefined;
    const baseIdx = nameIndexMap.get(name);
    const dd = diffDays(date, anchorDate);
    const idx = mod(baseIdx + dd, peopleRows.length);
    return peopleRows[idx];
  }

  // 선택일 전체 로스터
  function rosterAt(date) {
    return nameList.map((n) => {
      const r = rowAtDateForName(n, date);
      return { name: n, row: r, dia: r?.dia };
    });
  }

  // 캘린더 그리드
  // 캘린더 그리드
  const days = monthGridMonday(selectedDate);
  const monthOfSelected = selectedDate.getMonth();
  const todayISO = fmt(today);

  // 👉 부드러운 슬라이드 전용 스와이프 핸들러 추가
  // 👉 부드러운 슬라이드용 스와이프 (속도+거리 기준 스냅)
  const swipeRef = React.useRef({ x: 0, y: 0, lock: null });
  const lastMoveRef = React.useRef({ x: 0, t: 0 });
  const SWIPE_X_THRESHOLD = 40; // 거리 임계
  const VELOCITY_THRESHOLD = 0.35; // 속도 임계(px/ms)
  const ACTIVATION_THRESHOLD = 10; // 방향 잠금 시작
  const SNAP_MS = 320;

  const onCalTouchStart = (e) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, lock: null };
    lastMoveRef.current = { x: t.clientX, t: performance.now() };
    setIsSnapping(false);
    setDragX(0);
  };

  const onCalTouchMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - swipeRef.current.x;
    const dy = t.clientY - swipeRef.current.y;

    if (swipeRef.current.lock === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > ACTIVATION_THRESHOLD) {
        swipeRef.current.lock = "h";
      } else if (
        Math.abs(dy) > Math.abs(dx) &&
        Math.abs(dy) > ACTIVATION_THRESHOLD
      ) {
        swipeRef.current.lock = "v";
      }
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

    // 속도 계산
    const now = performance.now();
    const dt = Math.max(1, now - lastMoveRef.current.t);
    const vx = (t.clientX - lastMoveRef.current.x) / dt; // px/ms

    // 한 패널(=부모 너비)을 기준으로 스냅
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
        setCalHasSelection(false); // ✅ 월 넘길 때 선택표시 끔
        setIsSnapping(false);
        setDragX(0);
      }, SNAP_MS);
    } else if (goPrev) {
      setDragX(width);
      setTimeout(() => {
        setSelectedDate((prev) => addMonthsSafe(prev, -1));
        setCalHasSelection(false); // ✅ 월 넘길 때 선택표시 끔
        setIsSnapping(false);
        setDragX(0);
      }, SNAP_MS);
    } else {
      setDragX(0);
      setTimeout(() => setIsSnapping(false), SNAP_MS);
    }

    swipeRef.current = { x: 0, y: 0, lock: null };
  };
  // ===== 수직 스와이프 공통 상수 =====
  //const V_SW_THRESHOLD = 10; // 이동거리 임계(px)
  //const V_VELOCITY_THRESHOLD = 0.1; // 속도 임계(px/ms)
  //const V_SNAP_MS = 320;

  const V_SNAP_MS = 300; // transform/height 전환 시간을 통일
  const V_DIST_RATIO = 0.1;
  const V_VELOCITY_THRESHOLD = 0.1;
  const V_ACTIVATE = 1;

  // iOS 스타일 러버밴드 (limit 바깥으로 당기면 저항)
  function rubberband(distance, limit) {
    const constant = 0.55; // 0.5~0.7 사이가 자연스러움
    if (Math.abs(distance) < limit) return distance;
    const excess = Math.abs(distance) - limit;
    const sign = Math.sign(distance);
    return (
      sign *
      (limit +
        (1 - Math.exp(-excess / (limit / constant))) * (limit / constant))
    );
  }

  // 드래그 상태
  const [dragYHome, setDragYHome] = useState(0);
  const [dragYRoute, setDragYRoute] = useState(0);
  const [snapYHome, setSnapYHome] = useState(false);
  const [snapYRoute, setSnapYRoute] = useState(false);

  // 각 페이저 래퍼 & 패널 참조 (높이 측정용)
  const homeWrapRef = React.useRef(null);
  const homePanelRefs = [React.useRef(null), React.useRef(null)];
  const routeWrapRef = React.useRef(null);
  const routePanelRefs = [React.useRef(null), React.useRef(null)];

  // 활성 패널 높이로 래퍼 높이 맞추기
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
    routeImageMap,
    holidaysText,
    nightDiaThreshold,
    myName,
    routeTargetName,
  ]);

  // 수직 스와이프 핸들러 팩토리
  function makeVerticalHandlers(kind /* 'home' | 'route' */) {
    const swipeRef = React.useRef({ x: 0, y: 0, lock: null });
    const lastMoveRef = React.useRef({ y: 0, t: 0 });
    const [pendingDir, setPendingDir] = React.useState(null); // 'next' | 'prev' | null

    const onStart = (e) => {
      const t = e.touches[0];
      swipeRef.current = { x: t.clientX, y: t.clientY, lock: null };
      lastMoveRef.current = { y: t.clientY, t: performance.now() };
      if (kind === "home") {
        setSnapYHome(false);
      } else {
        setSnapYRoute(false);
      }
    };
    const onMove = (e) => {
      const t = e.touches[0];
      const dx = t.clientX - swipeRef.current.x;
      const dy = t.clientY - swipeRef.current.y;

      if (swipeRef.current.lock === null) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > V_ACTIVATE) {
          swipeRef.current.lock = "v";
          lockBodyScroll();
        } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > V_ACTIVATE) {
          swipeRef.current.lock = "h";
        }
      }
      if (swipeRef.current.lock !== "v") return;

      e.preventDefault();

      const wrap = kind === "home" ? homeWrapRef.current : routeWrapRef.current;
      const page = kind === "home" ? homePage : routePage;

      // 실제 패널 높이(=한 장 높이) 측정
      const wrapH = wrap?.offsetHeight || window.innerHeight * 0.6;

      // iOS 러버밴드 감각은 유지하되, 최종적으로는 클램프
      const rb = rubberband(dy, wrapH);

      // 페이지별 허용 방향만 반영: page0 => 위로만(음수), page1 => 아래로만(양수)
      let bounded =
        page === 0
          ? Math.min(0, rb) // 위로만
          : Math.max(0, rb); // 아래로만

      // 절대값이 패널 높이를 넘지 않도록 하드 클램프
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

      const now = performance.now();
      const dt = Math.max(1, now - lastMoveRef.current.t);
      const vy = (t.clientY - lastMoveRef.current.y) / dt; // px/ms

      const wrap = kind === "home" ? homeWrapRef.current : routeWrapRef.current;
      const page = kind === "home" ? homePage : routePage;
      const setPage = kind === "home" ? setHomePage : setRoutePage;
      const setDrag = kind === "home" ? setDragYHome : setDragYRoute;
      const setSnap = kind === "home" ? setSnapYHome : setSnapYRoute;

      const height = wrap?.offsetHeight || window.innerHeight * 0.6;

      //const goNext =
      //  dy < 0 &&
      //  (Math.abs(dy) > V_SW_THRESHOLD || Math.abs(vy) > V_VELOCITY_THRESHOLD);
      // const goPrev =
      //   dy > 0 &&
      //    (Math.abs(dy) > V_SW_THRESHOLD || Math.abs(vy) > V_VELOCITY_THRESHOLD);

      const passedDist = Math.abs(dy) > height * V_DIST_RATIO;
      const fast = Math.abs(vy) > V_VELOCITY_THRESHOLD;
      const goNext = dy < 0 && (passedDist || fast);
      const goPrev = dy > 0 && (passedDist || fast);

      setSnap(true);
      /* if (goNext && page === 0) {
        // 아래로 넘기기(0→1)
        setDrag(-height);
        setTimeout(() => {
          setPage(1);
          setSnap(false);
          setDrag(0);
        }, V_SNAP_MS);
      } else if (goPrev && page === 1) {
        // 위로 넘기기(1→0)
        setDrag(height);
        setTimeout(() => {
          setPage(0);
          setSnap(false);
          setDrag(0);
        }, V_SNAP_MS);
      } else {
        setDrag(0);
        setTimeout(() => setSnap(false), V_SNAP_MS);
      }
      */
      if (goNext && page === 0) {
        setPendingDir("next"); // 전환 예약
        setDrag(-height); // 현재 페이지 기준으로 -height까지 애니메
        // page는 아직 그대로 0 → overshoot 방지
      } else if (goPrev && page === 1) {
        setPendingDir("prev");
        setDrag(height);
      } else {
        setDrag(0); // 원위치 복귀
        setTimeout(() => setSnap(false), V_SNAP_MS);
      }

      swipeRef.current = { x: 0, y: 0, lock: null };
    };

    // 내부 슬라이더 div에 연결할 transitionend 핸들러
    const onTransitionEnd = () => {
      if (!pendingDir) return;
      if (kind === "home") {
        if (pendingDir === "next") setHomePage(1);
        else if (pendingDir === "prev") setHomePage(0);
        setDragYHome(0);
        setSnapYHome(false);
      } else {
        if (pendingDir === "next") setRoutePage(1);
        else if (pendingDir === "prev") setRoutePage(0);
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

  // 업로드 (표)
  async function onUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await readTextFile(f);
    //setTableText(txt);
    setTablesByDepot((prev) => ({ ...prev, [selectedDepot]: txt }));
    e.target.value = "";
  }

  function resetAll() {
    if (!confirm("모든 저장 데이터를 초기화할까요?")) return;

    // 저장 데이터 삭제
    localStorage.removeItem(STORAGE_KEY);

    // 화면 상태 초기화
    setSelectedTab("home");
    setSelectedDate(today);
    setAnchorDateStr(fmt(today));
    setSelectedDepot("안심");

    // ✅ 소속별 테이블 리셋
    setTablesByDepot({
      안심: defaultTableTSV,
      월배: sampleTableFor("월배"),
      경산: sampleTableFor("경산"),
      문양: sampleTableFor("문양"),
    });

    // ✅ 소속별 내 이름 리셋
    setMyNameMap({
      안심: "",
      월배: "",
      경산: "",
      문양: "",
    });

    // ✅ 소속별 야간 규칙 리셋 (안심=25, 나머지=5)
    setNightDiaByDepot({
      안심: 25,
      월배: 5,
      경산: 5,
      문양: 5,
    });

    // ✅ 기타 상태들 리셋
    setHolidaysText("");
    setHighlightMap({});
    setRouteImageMap({});
    setRouteTargetName("");
  }
  const isPortrait = usePortraitOnly(); // ✅ 추가

  return (
    <>
      {!isPortrait && <LandscapeOverlay />}
      <div
        aria-hidden={!isPortrait}
        inert={!isPortrait ? "" : undefined}
        ref={appRef}
        className="max-w-7xl mx-auto relative pb-0"
        style={{
          height: "100vh",
          overflowY: selectedTab === "settings" ? "auto" : "hidden", // ✅ 세로 스크롤 허용
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch", // ✅ iOS 스크롤 자연스럽게
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          touchAction: selectedTab === "settings" ? "pan-y" : "none",
        }}
      >
        {/* 홈(캘린더 + 선택일 전체 다이아) */}
        {selectedTab === "home" && (
          <div
            ref={homeWrapRef}
            className="mt-4 select-none overflow-hidden rounded-2xl overscroll-contain"
            style={{
              height: slideViewportH,
              touchAction: isHomeCalLocked ? "none" : "auto",
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
                {/* === 캘린더 카드 헤더 === */}
                <div className="flex items-center justify-between mb-0">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" /> 캘린더
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 rounded-xl bg-gray-700 text-xs"
                      onClick={() =>
                        setSelectedDate(addMonthsSafe(selectedDate, -1))
                      }
                    >
                      이전
                    </button>
                    <div className="px-2 py-1 rounded-xl bg-gray-700 text-xs">
                      {selectedDate.getFullYear()}년{" "}
                      {selectedDate.getMonth() + 1}월
                    </div>
                    <button
                      className="px-2 py-1 rounded-xl bg-gray-700 text-xs"
                      onClick={() =>
                        setSelectedDate(addMonthsSafe(selectedDate, 1))
                      }
                    >
                      다음
                    </button>
                    {/* ✅ '오늘로'는 선택된 날짜가 오늘이 아닐 때만 보이게.
       하이라이트(calHasSelection)와 무관하게 표시됩니다. */}
                    {fmt(selectedDate) !== fmt(today) && (
                      <button
                        className="px-2 py-1 rounded-xl bg-indigo-500 text-white text-xs"
                        onClick={() => {
                          setSelectedDate(today);
                          setCalHasSelection(true); // 하이라이트 복구
                          lastClickedRef.current = fmt(today); // 더블탭 기준 동기화
                        }}
                      >
                        오늘로
                      </button>
                    )}
                  </div>
                </div>

                {/* 대상/소속 셀렉트 */}
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300">소속</span>
                    <select
                      className="bg-gray-700 rounded-xl p-1 text-xs"
                      value={selectedDepot}
                      onChange={(e) => setSelectedDepot(e.target.value)}
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
                        className="px-2 py-1 rounded-xl bg-orange-700 hover:bg-gray-600 text-[11px] text-gray-200"
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

                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-300 mb-1">
                  {weekdaysKR.map((w, idx) => (
                    <div
                      key={w}
                      className={
                        "py-0.5 " +
                        (idx === 5
                          ? "text-blue-400"
                          : idx === 6
                          ? "text-red-400"
                          : "text-white")
                      }
                    >
                      {w}
                    </div>
                  ))}
                </div>

                {/* 3달 가로 스와이프 달력 */}
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
                      const monthDays = monthGridMonday(monthDate);
                      const thisMonthIdx = monthDate.getMonth();

                      const lastCellIdxOfThisMonth = (() => {
                        let last = 0;
                        for (let i = 0; i < monthDays.length; i++) {
                          if (monthDays[i].getMonth() === thisMonthIdx)
                            last = i;
                        }
                        return last;
                      })();
                      const lastRowIndex = Math.floor(
                        lastCellIdxOfThisMonth / 7
                      );
                      const actualRows = lastRowIndex + 1; // 4~6
                      const compressLastRow = actualRows === 6;

                      return (
                        <div
                          key={offset}
                          className="grid grid-cols-7 gap-1 px-1 py-1 box-border flex-shrink-0"
                          style={{
                            width: "calc(100% / 3)",
                            height: "100%",
                            gridTemplateRows: compressLastRow
                              ? `repeat(5, minmax(0,1fr)) minmax(0, 0.66fr)`
                              : "repeat(6, minmax(0,1fr))",
                          }}
                        >
                          {monthDays.map((d, i) => {
                            const rowIndex = Math.floor(i / 7);
                            const isHiddenRow = rowIndex >= actualRows;

                            const iso = fmt(d);
                            const isToday = iso === fmt(today);
                            const isSelected =
                              calHasSelection && iso === fmt(selectedDate);

                            const isOutside = d.getMonth() !== thisMonthIdx;

                            const activeName = tempName || myName;
                            const row = rowAtDateForName(activeName, d);
                            const t = computeInOut(
                              row,
                              d,
                              holidaySet,
                              nightDiaThreshold
                            );
                            const diaLabel =
                              row?.dia === undefined
                                ? "-"
                                : typeof row.dia === "number"
                                ? `${row.dia}dia`
                                : String(row.dia);

                            const dayType = getDayType(d, holidaySet);
                            const dayColor =
                              dayType === "토"
                                ? "text-blue-400"
                                : dayType === "휴"
                                ? "text-red-400"
                                : "text-gray-100";

                            const isLastRowCompressed =
                              compressLastRow && rowIndex === 5;

                            let diaColorClass = "";
                            if (typeof row?.dia === "number") {
                              diaColorClass =
                                row.dia >= nightDiaThreshold
                                  ? "text-sky-300"
                                  : "text-yellow-300";
                            } else if (
                              typeof row?.dia === "string" &&
                              row.dia.startsWith("대")
                            ) {
                              const nextDate = new Date(d);
                              nextDate.setDate(d.getDate() + 1);
                              const nextRow = rowAtDateForName(
                                activeName,
                                nextDate
                              );
                              const nextDia = nextRow?.dia;
                              const nextIsBibeon =
                                typeof nextDia === "string" &&
                                nextDia.replace(/\s/g, "").includes("비번");
                              diaColorClass = nextIsBibeon
                                ? "text-sky-300"
                                : "text-yellow-300";
                            }

                            return (
                              <button
                                key={i}
                                onClick={() => {
                                  const iso2 = fmt(d);
                                  if (lastClickedRef.current === iso2) {
                                    // 임시 대상(tempName)이 있을 때만 지정. 내이름(기본)인 경우 비워둔다.
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
                                    : "bg-gray-700/60 hover:bg-gray-700") +
                                  (isSelected ? " ring-2 ring-blue-400" : "")
                                }
                                aria-hidden={isHiddenRow ? "true" : undefined}
                                tabIndex={isHiddenRow ? -1 : 0}
                                style={{
                                  padding: isLastRowCompressed
                                    ? `${0.5 * 0.66}rem`
                                    : "0.5rem",
                                }}
                                title={`${diaLabel} / ${t.combo}/${t.in}/${
                                  t.out
                                }${t.isNight ? " (야간)" : ""}`}
                              >
                                <div
                                  style={
                                    isLastRowCompressed
                                      ? {
                                          transform: `scale(0.66)`,
                                          transformOrigin: "top center",
                                          display: "flex",
                                          flexDirection: "column",
                                          height: "100%",
                                          justifyContent: "flex-start",
                                        }
                                      : undefined
                                  }
                                >
                                  <div className="flex items-center justify-between">
                                    <div
                                      className={
                                        "font-semibold text-sm " + dayColor
                                      }
                                    >
                                      {d.getDate()}
                                    </div>
                                    {isToday && (
                                      <span className="absolute inset-0 rounded-lg ring-2 ring-red-400 pointer-events-none" />
                                    )}
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
                                      className={`break-words text-[clamp(11px,1vw,11px)] leading-tight ${diaColorClass}`}
                                    >
                                      {diaLabel}
                                    </div>
                                    <div className="truncate text-[clamp(10px,1vw,11px)] max-w-[50px]">
                                      {t.in}
                                    </div>
                                    <div className="truncate text-[clamp(9px,1vw,11px)] max-w-[50px]">
                                      {t.out}
                                    </div>
                                    <div className="truncate text-[clamp(8px,1vw,11px)] max-w-[50px]">
                                      {t.isNight ? (
                                        `${t.combo}`
                                      ) : (
                                        <span className="invisible">공백</span>
                                      )}
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
                className="bg-gray-800 rounded-2xl p-3 shadow shadow "
                style={{ minHeight: slideViewportH }}
              >
                <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                  <List className="w-5 h-5" /> 전체 교번 (선택일)
                </h3>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-s text-red-300">
                    {fmtWithWeekday(selectedDate)}
                  </div>
                  <div className="flex-1" />
                  <input
                    type="date"
                    className="bg-gray-700 rounded-xl px-2 py-1 text-sm"
                    value={fmt(selectedDate)}
                    onChange={(e) =>
                      setSelectedDate(stripTime(new Date(e.target.value)))
                    }
                  />
                </div>

                <RosterGrid
                  rows={rosterAt(selectedDate)}
                  holidaySet={holidaySet}
                  date={selectedDate}
                  nightDiaThreshold={nightDiaThreshold}
                  highlightMap={highlightMap}
                  onPick={(name) => {
                    setRouteTargetName(name);
                    if (window.triggerRouteTransition) {
                      window.triggerRouteTransition();
                    } else {
                      setSelectedTab("route");
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 전체 다이아 (독립 탭) — 초소형 정사각 그리드 */}
        {selectedTab === "roster" && (
          <div
            className="bg-gray-800 rounded-2xl p-3 shadow mt-4"
            style={{ minHeight: slideViewportH }}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <List className="w-5 h-5" /> {fmtWithWeekday(selectedDate)}
              </h2>

              <select
                className="bg-gray-700 rounded-xl px-2 py-1 text-sm"
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
                className="bg-gray-700 rounded-xl px-2 py-1 text-sm"
                value={fmt(selectedDate)}
                onChange={(e) =>
                  setSelectedDate(stripTime(new Date(e.target.value)))
                }
              />
            </div>
            <RosterGrid
              rows={rosterAt(selectedDate)}
              holidaySet={holidaySet}
              date={selectedDate}
              nightDiaThreshold={nightDiaThreshold}
              highlightMap={highlightMap}
              onPick={(name) => {
                setRouteTargetName(name);
                setSelectedTab("route");
                setRoutePage(0);
                setDragYRoute(0);
              }}
            />
          </div>
        )}

        {/* 행로표 */}
        {selectedTab === "route" && (
          <div
            ref={routeWrapRef}
            className="mt-4 select-none overflow-hidden rounded-2xl overscroll-contain"
            style={{
              height: slideViewportH,
              touchAction: isRouteLocked ? "none" : "auto",
            }}
            onTouchStart={vRoute.onStart}
            onTouchMove={vRoute.onMove}
            onTouchEnd={vRoute.onEnd}
            onTouchCancel={vRoute.onCancel}
            onWheel={(e) => {
              if (isRouteLocked) e.preventDefault();
              if (snapYRoute) return;
              const TH = 40;
              if (e.deltaY > TH && routePage === 0) {
                setSnapYRoute(true);
                setDragYRoute(-(routeWrapRef.current?.offsetHeight || 500));
                setTimeout(() => {
                  setRoutePage(1);
                  setSnapYRoute(false);
                  setDragYRoute(0);
                }, V_SNAP_MS);
              } else if (e.deltaY < -TH && routePage === 1) {
                setSnapYRoute(true);
                setDragYRoute(routeWrapRef.current?.offsetHeight || 500);
                setTimeout(() => {
                  setRoutePage(0);
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
                  (routePage === 0 ? 0 : -slideViewportH) + dragYRoute
                }px)`,
                transition: snapYRoute
                  ? `transform ${V_SNAP_MS}ms ease-out`
                  : "none",
                willChange: "transform",
              }}
              onTransitionEnd={vRoute.onTransitionEnd}
            >
              {/* Panel 0: 행로 카드(요약+이미지) */}
              <div
                id="route-panel0"
                ref={routePanelRefs[0]}
                className="bg-gray-800 rounded-2xl p-3 shadow shadow mb-10"
                style={{ minHeight: slideViewportH }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <User className="w-5 h-5" /> 행로표 (
                    {routeTargetName || myName})
                  </h2>
                  <div className="flex gap-2">
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
                      onChange={(e) =>
                        setSelectedDate(stripTime(new Date(e.target.value)))
                      }
                    />
                    {routeTargetName && (
                      <button
                        className="px-2 py-1 rounded-xl bg-orange-700 hover:bg-gray-600 text-xs"
                        onClick={() => setRouteTargetName("")}
                        title="내 이름으로 보기"
                      >
                        내이름
                      </button>
                    )}
                  </div>
                </div>

                {/* 대상 이름 변경(임시) */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-gray-300">대상 이름</span>
                  <select
                    className="bg-gray-700 rounded-xl p-1 text-sm"
                    value={routeTargetName || myName}
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
                </div>

                <div className="p-3 rounded-xl bg-gray-900/60 text-sm mt-3">
                  {(() => {
                    const targetName = routeTargetName || myName;
                    const row = rowAtDateForName(targetName, selectedDate);
                    const t = computeInOut(
                      row,
                      selectedDate,
                      holidaySet,
                      nightDiaThreshold
                    );
                    const diaLabel =
                      row?.dia === undefined
                        ? "-"
                        : typeof row.dia === "number"
                        ? `${row.dia}`
                        : String(row.dia);

                    return (
                      <>
                        <div>
                          이름: <b>{targetName}</b> / Dia: <b>{diaLabel}</b>
                        </div>
                        <div>
                          선택일: {fmtWithWeekday(selectedDate)} / 상태:{" "}
                          <b>
                            {t.combo}
                            {t.isNight ? " (야간)" : ""}
                          </b>
                        </div>

                        <div className="mt-1">
                          출근: <b>{t.in}</b> · 퇴근: <b>{t.out}</b>
                        </div>

                        {(() => {
                          const key =
                            typeof row?.dia === "number"
                              ? routeKey(row.dia, t.combo)
                              : "";
                          const src = key ? routeImageMap[key] : "";
                          if (!src) return null;

                          return (
                            <div className="mt-2 rounded-xl overflow-hidden bg-black/30">
                              <div className="relative w-full aspect-[1/1.414]">
                                <img
                                  src={src}
                                  alt={key}
                                  className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                                  style={{
                                    transform: "scale(1.5) translateY(7.7%)",
                                    transformOrigin: "center center",
                                  }}
                                />
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                매칭: {key}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Panel 1: 해당일 전체 교번 */}
              <div
                ref={routePanelRefs[1]}
                className="bg-gray-800 rounded-2xl p-3 shadow mb-16"
                style={{ minHeight: slideViewportH }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <List className="w-5 h-5" /> 전체 교번
                    <span className="text-sm text-gray-300 ml-1">
                      {fmtWithWeekday(selectedDate)}
                    </span>
                  </h3>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="bg-gray-700 rounded-xl px-2 py-1 text-xs"
                      value={fmt(selectedDate)}
                      onChange={(e) =>
                        setSelectedDate(stripTime(new Date(e.target.value)))
                      }
                    />
                  </div>
                </div>

                <RosterGrid
                  rows={rosterAt(selectedDate)}
                  holidaySet={holidaySet}
                  date={selectedDate}
                  nightDiaThreshold={nightDiaThreshold}
                  highlightMap={highlightMap}
                  onPick={(name) => {
                    setRouteTargetName(name);
                    triggerRouteTransition();
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 설정 */}
        {selectedTab === "settings" && (
          <React.Suspense fallback={<div className="p-4">로딩…</div>}>
            <SettingsView
              {...{
                selectedDepot,
                setSelectedDepot,
                myName,
                setMyNameForDepot,
                nameList,
                anchorDateStr,
                setAnchorDateStr,
                holidaysText,
                setHolidaysText,
                newHolidayDate,
                setNewHolidayDate,
                nightDiaByDepot,
                setNightDiaForDepot,
                highlightMap,
                setHighlightMap,
                currentTableText,
                setTablesByDepot, // 주의: { ...prev, [selectedDepot]: ... } 형태로 내부에서 사용
                selectedDate,
                setSelectedDate,
                DEPOTS,
                DEFAULT_HOLIDAYS_25_26,
                onUpload, // 파일 업로드 핸들러도 그대로 넘김
              }}
            />
          </React.Suspense>
        )}

        {/* 하단 고정 탭바 */}
        <FixedTabbarPortal>
          <nav
            ref={tabbarRef}
            className="bg-gray-900/90 backdrop-blur-md border-t border-gray-700 fixed left-0 right-0 bottom-[-3px] pt-3"
          >
            <div className="flex justify-around items-center text-gray-300 text-xs">
              {/* 홈 */}
              <button
                onClick={() => {
                  setHomePage(0);
                  setDragYHome(0);
                  setSnapYHome(false);
                  setSelectedTab("home");
                }}
                className={`flex flex-col items-center ${
                  selectedTab === "home" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <CalendarIcon className="w-5 h-5 mb-0.5" />홈
              </button>

              {/* 전체 */}
              <button
                onClick={() => setSelectedTab("roster")}
                className={`flex flex-col items-center ${
                  selectedTab === "roster" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <List className="w-5 h-5 mb-0.5" />
                전체
              </button>

              {/* 행로 */}
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
                <User className="w-5 h-5 mb-0.5" />
                행로
              </button>

              {/* 설정 */}
              <button
                onClick={() => setSelectedTab("settings")}
                className={`flex flex-col items-center ${
                  selectedTab === "settings" ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <Settings className="w-5 h-5 mb-0.5" />
                설정
              </button>

              {/* 초기화 */}
              <button
                onClick={resetAll}
                className="flex flex-col items-center text-gray-400 hover:text-red-400"
                title="저장된 설정/내용 초기화"
              >
                <Upload className="w-5 h-5 mb-0.5 rotate-180" />
                초기화
              </button>
            </div>
          </nav>
        </FixedTabbarPortal>
      </div>
    </>
  );
}
/* ---- 공통 컴포넌트 ---- */
function Header({ onReset }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-xl font-bold">교번 캘린더</div>
      <div className="flex items-center gap-2">
        <button
          onClick={onReset}
          className="ml-2 px-2 py-1 rounded-xl bg-gray-700 hover:bg-gray-600 text-xs"
          title="저장된 설정/내용 초기화"
        >
          초기화
        </button>
      </div>
    </div>
  );
}

function Tabs({ selectedTab, onChange }) {
  const tabs = [
    { k: "home", label: "홈(캘린더)" },
    { k: "roster", label: "전체교번" },
    { k: "route", label: "행로표" },
    { k: "settings", label: "설정" },
  ];
  return (
    <div className="flex gap-2">
      {tabs.map((t) => (
        <button
          key={t.k}
          onClick={() => onChange(t.k)}
          className={
            "px-3 py-1.5 rounded-2xl text-sm " +
            (selectedTab === t.k
              ? "bg-white text-gray-900"
              : "bg-gray-800 text-gray-200")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* 초소형 정사각 그리드 카드 */
function RosterGrid({
  rows,
  holidaySet,
  date,
  nightDiaThreshold,
  highlightMap,
  onPick,
}) {
  const [selectedName, setSelectedName] = React.useState(null);

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))" }}
    >
      {rows.map(({ name, row }) => {
        const t = computeInOut(row, date, holidaySet, nightDiaThreshold);
        const diaLabel =
          row?.dia === undefined
            ? "-"
            : typeof row.dia === "number"
            ? `${row.dia}dia`
            : String(row.dia);

        const color = highlightMap?.[name];
        const style = color ? { backgroundColor: color, color: "white" } : {};
        const isSelected = selectedName === name;

        return (
          <button
            key={name}
            onClick={(e) => {
              setSelectedName(name);
              //onPick?.(name);

              if (window.setRouteTargetName) {
                window.setRouteTargetName(name);
              }

              const btn = e.currentTarget;

              // 🍎 iOS 클릭 애니메이션 (완전 강화판)
              btn.animate(
                [
                  {
                    transform: "scale(1)",
                    filter: "brightness(1)",
                    opacity: 1,
                  },
                  {
                    transform: "scale(1.15)", // 눌렀을 때 살짝 커지며 반짝임
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
                {
                  duration: 300,
                  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                }
              );

              // 🚀 애니메이션이 완전히 끝난 뒤 전환 (눈에 확실히 보임)
              setTimeout(() => {
                if (window.triggerRouteTransition) {
                  window.triggerRouteTransition();
                }
              }, 130);
            }}
            className={
              "aspect-square w-full rounded-lg p-1.5 text-left transition-all duration-200 " +
              (isSelected
                ? "ring-4 ring-white/80 shadow-[0_0_10px_rgba(255,255,255,0.4)] "
                : "bg-gray-700/80 hover:bg-gray-600 hover:shadow-[0_0_6px_rgba(255,255,255,0.3)]")
            }
            style={style}
            title={`${name} • ${diaLabel} • ${t.combo}${
              t.isNight ? " (야)" : ""
            }`}
          >
            <div className="text-[11px] font-semibold truncate">{name}</div>
            <div className="text-[10px] text-gray-200 truncate">{diaLabel}</div>
          </button>
        );
      })}
    </div>
  );
}

function FixedTabbarPortal({ children }) {
  const mountRef = React.useRef(null);

  if (!mountRef.current && typeof document !== "undefined") {
    mountRef.current = document.createElement("div");
  }

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

      const layoutH = window.innerHeight;
      const visibleH = vv.height + vv.offsetTop;
      const deficit = Math.max(0, layoutH - visibleH);

      // 키보드로 볼만한 '큰' 감소 + 실제 입력 포커스가 있을 때만 보정
      // (툴바 접힘/펼침은 100~200px 사이에서 흔들려도 보정 X)
      const BIG_DEFICIT = 260; // 기기별로 230~300 사이가 무난
      const looksLikeKeyboard = isEditableFocused() && deficit >= BIG_DEFICIT;

      el.style.transform = looksLikeKeyboard
        ? `translateY(${-deficit}px)`
        : "translateY(0px)"; // 0px 고정으로 안전 여백 유지
      el.style.bottom = "0px"; // ✅ 강제 하단 정렬
    };

    const opts = { passive: true };
    vv?.addEventListener("resize", sync, opts);
    vv?.addEventListener("scroll", sync, opts);
    window.addEventListener("focusin", sync, opts);
    window.addEventListener("focusout", sync, opts);
    window.addEventListener("orientationchange", sync, opts);

    sync();

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("focusin", sync);
      window.removeEventListener("focusout", sync);
      window.removeEventListener("orientationchange", sync);
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  return mountRef.current
    ? createPortal(
        <div style={{ pointerEvents: "auto" }}>{children}</div>,
        mountRef.current
      )
    : null;
}
