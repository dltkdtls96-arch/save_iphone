// /src/components/AdminPanel.jsx
import React, { useState, useMemo, useEffect } from "react";

/* ─────────────────── 아코디언 섹션 ─────────────────── */
function Section({ id, icon, title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ap-section" data-section={id}>
      <button
        type="button"
        className={
          "ap-section-header" + (open ? " ap-section-header--open" : "")
        }
        onClick={() => setOpen((p) => !p)}
      >
        <span className="ap-section-icon">{icon}</span>
        <span className="ap-section-title">{title}</span>
        {badge != null && <span className="ap-badge">{badge}</span>}
        <span className="ap-section-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="ap-section-body">{children}</div>}
    </div>
  );
}

/* ─────────────────── 저장 버튼 ─────────────────── */
function findDuplicates(names) {
  const seen = new Set();
  const dup = new Set();
  (names || []).forEach((n) => {
    const k = String(n || "").trim();
    if (!k) return;
    if (seen.has(k)) dup.add(k);
    seen.add(k);
  });
  return [...dup];
}

function SaveBtn({ onClick, loading, children, variant = "primary", disabled = false }) {
  return (
    <button
      type="button"
      className={"ap-save-btn ap-save-btn--" + variant}
      onClick={onClick}
      disabled={loading || disabled}
    >
      {loading ? <span className="ap-spinner" /> : null}
      {loading ? "저장 중..." : children}
    </button>
  );
}

/* ─────────────────── 인풋 ─────────────────── */
function Field({ label, hint, children }) {
  return (
    <div className="ap-field">
      {label && <label className="ap-label">{label}</label>}
      {children}
      {hint && <span className="ap-hint">{hint}</span>}
    </div>
  );
}

function Input(props) {
  return <input className="ap-input" {...props} />;
}

function Select({ children, ...props }) {
  return (
    <select className="ap-input" {...props}>
      {children}
    </select>
  );
}

/* ─────────────────── D-day 계산 (✅ 신규) ─────────────────── */
function getDdayInfo(dateStr, todayStr) {
  const [y1, m1, d1] = dateStr.split("-").map(Number);
  const [y2, m2, d2] = todayStr.split("-").map(Number);
  const target = new Date(y1, m1 - 1, d1);
  const today = new Date(y2, m2 - 1, d2);
  const diff = Math.floor((target - today) / 86400000);
  if (diff === 0) return { label: "D-Day", cls: "ap-dday--today", diff };
  if (diff > 0) {
    if (diff <= 3) return { label: `D-${diff}`, cls: "ap-dday--soon", diff };
    if (diff <= 10) return { label: `D-${diff}`, cls: "ap-dday--upcoming", diff };
    return { label: `D-${diff}`, cls: "ap-dday--far", diff };
  }
  return { label: `D+${-diff}`, cls: "ap-dday--past", diff };
}

/* ─────────────────── 메인 ─────────────────── */
export default function AdminPanel({
  userList,
  currentUser,
  onChangePassword,
  onAddUser,
  onDeleteUser,
  onChangeUserRole,
  slotConfig,
  onChangeSlotConfig,
  onSaveSlotConfig,
  publicHolidays,
  onChangePublicHolidays,
  onSavePublicHolidays,
  leaveTypes,
  onChangeLeaveTypes,
  nightRule,
  onChangeNightRule,
  onSaveNightRule,
  nightOffDiaList,
  entriesByDate,
  slotOverridesByDate,
  onChangeSlotOverrideForDate,
  lockRule,
  onChangeLockRule,
  onSaveLockRule,
  onRefreshAll,
  isRefreshing,
  shiftConfig,
  shiftRows,
  shiftLoaded = true,
  onSaveShiftConfig,
  shiftPublicHolidays,
  onOpenDate, // ✅ 신규: 날짜 모달 열기 콜백
}) {
  /* ── 비밀번호 ── */
  const [pwUserId, setPwUserId] = useState(currentUser.id);
  const [newPw, setNewPw] = useState("");

  /* ── 사용자 추가 ── */
  const [newName, setNewName] = useState("");
  const [newUserPw, setNewUserPw] = useState("");
  const [newRole, setNewRole] = useState("user");

  /* ── 정원 ── */
  const [editSlot, setEditSlot] = useState(slotConfig);
  const [savingSlot, setSavingSlot] = useState(false);
  useEffect(() => {
    setEditSlot(slotConfig);
  }, [slotConfig]);

  /* ── 특정일 정원 ── */
  const [overDate, setOverDate] = useState("");
  const [overCap, setOverCap] = useState("");

  /* ── 야간 규칙 ── */
  const [editNight, setEditNight] = useState(
    nightRule || { diaCount: 37, nightStartDia: 25 }
  );
  const [savingNight, setSavingNight] = useState(false);
  useEffect(() => {
    setEditNight(nightRule || { diaCount: 37, nightStartDia: 25 });
  }, [nightRule]);

  /* ── 잠금 규칙 ── */
  const [lockDays, setLockDays] = useState(
    Number(lockRule?.lockDaysBefore ?? 0)
  );
  const [savingLock, setSavingLock] = useState(false);
  useEffect(() => {
    setLockDays(Number(lockRule?.lockDaysBefore ?? 0));
  }, [lockRule]);

  /* ── 공휴일 ── */
  const [editHolidays, setEditHolidays] = useState(publicHolidays || []);
  const [holDate, setHolDate] = useState("");
  const [holLabel, setHolLabel] = useState("");
  const [savingHol, setSavingHol] = useState(false);
  // 공공 API 불러오기
  const nowYear = new Date().getFullYear();
  const [apiYear, setApiYear] = useState(nowYear);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiResult, setApiResult] = useState(null); // { year, items } | { error }
  useEffect(() => {
    setEditHolidays(publicHolidays || []);
  }, [publicHolidays]);

  /* ── 확인 현황 필터 ── */
  const [approvalFilter, setApprovalFilter] = useState("unconfirmed");
  const [approvalSearch, setApprovalSearch] = useState("");
  const [approvalLimit, setApprovalLimit] = useState(200);
  const [lastClickedKey, setLastClickedKey] = useState(null); // ✅ 더블클릭 검출

  useEffect(() => {
    setApprovalLimit(200);
  }, [approvalFilter, approvalSearch]);

  /* ── 계산 ── */
  const diaCount = Number(editNight?.diaCount) || 37;
  const nightStart = Number(editNight?.nightStartDia) || 25;

  const previewNightList = useMemo(() => {
    const s = Math.max(1, nightStart),
      e = Math.max(s, diaCount);
    return Array.from({ length: e - s + 1 }, (_, i) => s + i);
  }, [diaCount, nightStart]);

  const sortedHolidays = useMemo(
    () =>
      [...editHolidays].sort((a, b) =>
        (a.date || "").localeCompare(b.date || "")
      ),
    [editHolidays]
  );

  const overrideList = useMemo(
    () =>
      Object.entries(slotOverridesByDate || {})
        .filter(([, v]) => typeof v === "number" && v > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    [slotOverridesByDate]
  );

  const approvalRows = useMemo(() => {
    if (!entriesByDate) return [];
    const rows = [];
    Object.entries(entriesByDate).forEach(([date, list]) => {
      list.forEach((e) => {
        if (e.status !== "active") return;
        rows.push({
          id: e.id,
          date,
          applicantName: e.applicantName,
          leaveType: e.leaveType,
          dia: e.dia,
          approverName: e.approverName,
          createdAt: e.createdAt || "",
        });
      });
    });
    return rows.sort((a, b) =>
      a.date === b.date
        ? b.createdAt.localeCompare(a.createdAt)
        : b.date.localeCompare(a.date)
    );
  }, [entriesByDate]);

  const confirmedCount = approvalRows.filter((r) => r.approverName).length;
  const unconfirmedCount = approvalRows.length - confirmedCount;

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const filteredRows = useMemo(() => {
    const q = approvalSearch.trim();

    const filtered = approvalRows.filter((r) => {
      if (approvalFilter === "confirmed" && !r.approverName) return false;
      if (approvalFilter === "unconfirmed" && r.approverName) return false;

      if (approvalFilter === "all" && r.approverName && r.date < todayStr) {
        return false;
      }

      if (q)
        return (
          (r.applicantName || "").includes(q) ||
          (r.approverName || "").includes(q)
        );
      return true;
    });

    if (approvalFilter === "unconfirmed") {
      filtered.sort((a, b) => {
        const aPast = a.date < todayStr;
        const bPast = b.date < todayStr;
        if (aPast !== bPast) return aPast ? -1 : 1;
        if (aPast) return b.date.localeCompare(a.date);
        return a.date.localeCompare(b.date);
      });
    }

    if (approvalFilter === "all") {
      filtered.sort((a, b) => a.date.localeCompare(b.date));
    }

    return filtered;
  }, [approvalRows, approvalFilter, approvalSearch, todayStr]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, approvalLimit),
    [filteredRows, approvalLimit]
  );

  /* ✅ 행 클릭: 한 번 선택 → 두 번째 클릭 시 모달 */
  const handleRowClick = (row) => {
    if (lastClickedKey === row.id) {
      onOpenDate?.(row.date);
      setLastClickedKey(null);
    } else {
      setLastClickedKey(row.id);
    }
  };

  /* ── 핸들러 ── */
  const handlePwSubmit = (e) => {
    e.preventDefault();
    if (!pwUserId || !newPw.trim()) {
      window.alert("대상 사용자와 새 비밀번호를 입력하세요.");
      return;
    }
    // 다른 사람 비밀번호를 바꾸면 "초기화" → 그 사람은 다음 로그인 때 새 비밀번호를 정함
    onChangePassword?.(pwUserId, newPw.trim(), {
      forceChange: pwUserId !== currentUser.id,
    });
    setNewPw("");
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      window.alert("이름을 입력하세요.");
      return;
    }
    onAddUser?.({
      name: newName.trim(),
      password: newUserPw.trim() || "0000",
      role: newRole,
    });
    setNewName("");
    setNewUserPw("");
    setNewRole("user");
  };

  const handleSaveSlot = async () => {
    const p = {
      weekday: Number(editSlot?.weekday) || 1,
      saturday: Number(editSlot?.saturday) || 1,
      holiday: Number(editSlot?.holiday) || 1,
      publicHoliday: Number(editSlot?.publicHoliday) || 1,
    };
    setSavingSlot(true);
    try {
      onChangeSlotConfig?.(p);
      await onSaveSlotConfig?.(p);
    } catch {
      window.alert("저장 실패");
    } finally {
      setSavingSlot(false);
    }
  };

  const handleSaveNight = async () => {
    const p = {
      diaCount: Number(editNight?.diaCount) || 37,
      nightStartDia: Number(editNight?.nightStartDia) || 25,
    };
    setSavingNight(true);
    try {
      onChangeNightRule?.(p);
      await onSaveNightRule?.(p);
    } catch {
      window.alert("저장 실패");
    } finally {
      setSavingNight(false);
    }
  };

  const handleSaveLock = async () => {
    const v = Math.max(0, Number(lockDays) || 0);
    setSavingLock(true);
    try {
      onChangeLockRule?.({ lockDaysBefore: v });
      await onSaveLockRule?.({ lockDaysBefore: v });
    } catch {
      window.alert("저장 실패");
    } finally {
      setSavingLock(false);
    }
  };

  const handleAddHoliday = () => {
    if (!holDate) {
      window.alert("날짜를 선택하세요.");
      return;
    }
    const label = holLabel.trim() || holDate;
    setEditHolidays((prev) => {
      const idx = prev.findIndex((h) => h.date === holDate);
      if (idx >= 0) {
        const n = [...prev];
        n[idx] = { ...n[idx], label };
        return n;
      }
      return [...prev, { date: holDate, label }];
    });
    setHolLabel("");
  };

  const handleFetchApiHolidays = async () => {
    const year = apiYear;
    setApiLoading(true);
    setApiResult(null);
    try {
      const resp = await fetch(`/api/holidays?year=${year}`);
      const text = await resp.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("이 환경에서는 공휴일 불러오기를 사용할 수 없습니다.");
      }
      if (!resp.ok || !Array.isArray(json.items)) {
        throw new Error(json?.error || "불러오지 못했습니다.");
      }
      const d = new Date();
      setApiResult({
        year,
        items: json.items,
        checkedAt: `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`,
      });
    } catch (err) {
      setApiResult({ year, error: err?.message || "불러오지 못했습니다." });
    } finally {
      setApiLoading(false);
    }
  };

  const apiNewItems = useMemo(() => {
    if (!apiResult?.items) return [];
    const have = new Set(editHolidays.map((h) => h.date));
    return apiResult.items.filter((it) => !have.has(it.date));
  }, [apiResult, editHolidays]);

  const apiMissingFromApi = useMemo(() => {
    // 내가 직접 등록했지만 공식 목록에는 없는 날 (해당 연도만)
    if (!apiResult?.items) return [];
    const official = new Set(apiResult.items.map((it) => it.date));
    return editHolidays.filter(
      (h) => (h.date || "").startsWith(`${apiResult.year}-`) && !official.has(h.date)
    );
  }, [apiResult, editHolidays]);

  const handleApplyApiHolidays = () => {
    if (apiNewItems.length === 0) return;
    setEditHolidays((prev) => {
      const have = new Set(prev.map((h) => h.date));
      const add = apiNewItems
        .filter((it) => !have.has(it.date))
        .map((it) => ({ date: it.date, label: it.name || it.date }));
      return [...prev, ...add];
    });
  };

  const handleSaveHolidays = async () => {
    setSavingHol(true);
    try {
      onChangePublicHolidays?.(editHolidays);
      await onSavePublicHolidays?.(editHolidays);
    } catch {
      window.alert("저장 실패");
    } finally {
      setSavingHol(false);
    }
  };

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!overDate) {
      window.alert("날짜를 선택하세요.");
      return;
    }
    const n = Number(overCap);
    if (!n || n < 1) {
      window.alert("정원은 1 이상이어야 합니다.");
      return;
    }
    await onChangeSlotOverrideForDate?.(overDate, n);
    setOverCap("");
  };

  /* ─────────────────── JSX ─────────────────── */
  return (
    <div className="ap-root">
      {/* ── 상단 헤더 ── */}
      <div className="ap-top">
        <div className="ap-top-info">
          <div className="ap-top-title">관리자 설정</div>
          <div className="ap-top-sub">
            사용자 · 정원 · 공휴일 · 휴가 종류 · DIA 규칙 관리
          </div>
        </div>
        <button
          type="button"
          className={
            "ap-refresh-btn" + (isRefreshing ? " ap-refresh-btn--loading" : "")
          }
          onClick={() => onRefreshAll?.(true)}
          disabled={isRefreshing}
        >
          {isRefreshing ? "⏳" : "↻"}{" "}
          {isRefreshing ? "새로고침 중" : "서버 동기화"}
        </button>
      </div>

      {/* ── 요약 카드 3개 ── */}
      <div className="ap-stats">
        <div className="ap-stat">
          <div className="ap-stat-num">{userList.length}</div>
          <div className="ap-stat-label">전체 사용자</div>
        </div>
        <div className="ap-stat ap-stat--warn">
          <div className="ap-stat-num">{unconfirmedCount}</div>
          <div className="ap-stat-label">미확인 휴가</div>
        </div>
        <div className="ap-stat ap-stat--green">
          <div className="ap-stat-num">{confirmedCount}</div>
          <div className="ap-stat-label">확인 완료</div>
        </div>
      </div>

      {/* ══════════════════════════════════
          1. 확인 현황
      ══════════════════════════════════ */}
      <Section
        id="approval"
        icon="✅"
        title="확인 현황"
        badge={unconfirmedCount > 0 ? `미확인 ${unconfirmedCount}` : null}
        defaultOpen
      >
        {/* 필터 탭 */}
        <div className="ap-filter-tabs">
          {[
            ["unconfirmed", "미확인만"],
            ["confirmed", "확인 완료"],
            ["all", "전체"],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={
                "ap-filter-tab" +
                (approvalFilter === v ? " ap-filter-tab--active" : "")
              }
              onClick={() => setApprovalFilter(v)}
            >
              {label}
            </button>
          ))}
          <input
            className="ap-search"
            placeholder="이름 검색"
            value={approvalSearch}
            onChange={(e) => setApprovalSearch(e.target.value)}
          />
        </div>

        {/* ✅ 안내 */}
        <div className="ap-row-hint">
          💡 행을 한 번 클릭해서 선택 · 다시 클릭하면 해당 날짜 휴가장부가
          열립니다
        </div>

        {/* 테이블 */}
        <div className="ap-table-wrap">
          {visibleRows.length === 0 ? (
            <div className="ap-table-empty">
              {approvalFilter === "unconfirmed"
                ? "✅ 미확인 항목이 없습니다"
                : "조건에 맞는 항목이 없습니다"}
            </div>
          ) : (
            <table className="ap-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>신청자</th>
                  <th>종류</th>
                  <th>DIA</th>
                  <th>확인자</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const isPastUnconfirmed =
                    !row.approverName && row.date < todayStr;
                  const dday = getDdayInfo(row.date, todayStr);
                  // ✅ D-day: 미확인이면서 0~10일 이내일 때 표시
                  const showDday =
                    !row.approverName &&
                    dday.diff >= 0 &&
                    dday.diff <= 10;
                  const isSelected = lastClickedKey === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={[
                        isSelected ? "ap-table-row--selected" : "",
                        isPastUnconfirmed
                          ? "ap-table-row--past-unconfirmed"
                          : !row.approverName
                          ? "ap-table-row--unconfirmed"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleRowClick(row)}
                      title="클릭해서 선택 · 다시 클릭하면 해당 날짜 휴가장부 열기"
                    >
                      <td className="ap-td-date">
                        {isPastUnconfirmed && (
                          <span className="ap-past-badge">⚠️ 지남</span>
                        )}
                        {showDday && (
                          <span className={"ap-dday-badge " + dday.cls}>
                            {dday.label}
                          </span>
                        )}
                        <span className="ap-date-text">
                          {row.date.slice(5).replace("-", "/")}
                        </span>
                      </td>
                      <td className="ap-td-name">{row.applicantName}</td>
                      <td>{row.leaveType}</td>
                      <td>{row.dia ?? "-"}</td>
                      <td>
                        {row.approverName ? (
                          <span className="ap-confirmed-chip">
                            ✓ {row.approverName}
                          </span>
                        ) : (
                          <span className="ap-unconfirmed-chip">미확인</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 더 보기 */}
        {filteredRows.length > visibleRows.length && (
          <button
            type="button"
            className="ap-load-more-btn"
            onClick={() => setApprovalLimit((p) => p + 200)}
          >
            더 보기 ({visibleRows.length} / {filteredRows.length})
          </button>
        )}
      </Section>

      {/* ══════════════════════════════════
          2. 사용자 관리
      ══════════════════════════════════ */}
      <Section id="users" icon="👥" title="사용자 관리" badge={userList.length}>
        <div className="ap-user-list">
          {[...userList]
            .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"))
            .map((u) => (
              <div
                key={u.id}
                className={
                  "ap-user-row" +
                  (u.id === currentUser.id ? " ap-user-row--me" : "")
                }
              >
                <div className="ap-user-avatar">{u.name.charAt(0)}</div>
                <div className="ap-user-info">
                  <div className="ap-user-name">
                    {u.name}
                    {u.id === currentUser.id && (
                      <span className="ap-me-badge">나</span>
                    )}
                  </div>
                  <div className="ap-user-meta">{u.id}</div>
                </div>
                <select
                  className="ap-role-select"
                  value={u.role}
                  onChange={(e) => onChangeUserRole?.(u.id, e.target.value)}
                >
                  <option value="user">일반</option>
                  <option value="admin">관리자</option>
                </select>
                <span className={"ap-role-badge ap-role-badge--" + u.role}>
                  {u.role === "admin" ? "관리자" : "일반"}
                </span>
                <button
                  type="button"
                  className="ap-delete-btn"
                  onClick={() => onDeleteUser?.(u.id)}
                  title="사용자 삭제"
                >
                  🗑
                </button>
              </div>
            ))}
        </div>

        <div className="ap-divider" />

        <div className="ap-sub-title">새 사용자 추가</div>
        <form className="ap-form-row" onSubmit={handleAddUser}>
          <Field label="이름">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 홍길동"
            />
          </Field>
          <Field label="초기 비밀번호">
            <Input
              value={newUserPw}
              onChange={(e) => setNewUserPw(e.target.value)}
              placeholder="기본: 0000"
            />
          </Field>
          <Field label="권한">
            <Select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              <option value="user">일반 사용자</option>
              <option value="admin">관리자</option>
            </Select>
          </Field>
          <button type="submit" className="ap-add-btn">
            + 추가
          </button>
        </form>

        <div className="ap-divider" />

        <div className="ap-sub-title">비밀번호 변경</div>
        <form className="ap-form-row" onSubmit={handlePwSubmit}>
          <Field label="대상 사용자">
            <Select
              value={pwUserId}
              onChange={(e) => setPwUserId(e.target.value)}
            >
              {userList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === "admin" ? "관리자" : "일반"})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="새 비밀번호"
            hint="본인 비밀번호 변경 시 자동 로그아웃됩니다"
          >
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="새 비밀번호"
            />
          </Field>
          <button type="submit" className="ap-add-btn">
            변경
          </button>
        </form>
      </Section>

      {/* ══════════════════════════════════
          3. 휴가 정원 설정
      ══════════════════════════════════ */}
      <Section id="slots" icon="📊" title="날짜별 정원 설정">
        <div className="ap-info-box">
          💡 비번이 포함된 날은 여기서 설정한 정원에 +1이 자동으로 적용됩니다.
        </div>

        <div className="ap-sub-title">요일 유형별 기본 정원</div>
        <div className="ap-slot-grid">
          {[
            { key: "weekday", label: "평일", icon: "📅" },
            { key: "saturday", label: "토요일", icon: "🟦" },
            { key: "holiday", label: "일요일·휴일", icon: "🔴" },
            { key: "publicHoliday", label: "공휴일", icon: "🇰🇷" },
          ].map(({ key, label, icon }) => (
            <div key={key} className="ap-slot-card">
              <div className="ap-slot-icon">{icon}</div>
              <div className="ap-slot-label">{label}</div>
              <input
                className="ap-slot-input"
                type="number"
                min={1}
                value={editSlot?.[key] ?? ""}
                onChange={(e) =>
                  setEditSlot((p) => ({
                    ...p,
                    [key]: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
              />
              <div className="ap-slot-unit">명</div>
            </div>
          ))}
        </div>
        <SaveBtn onClick={handleSaveSlot} loading={savingSlot}>
          정원 저장
        </SaveBtn>

        <div className="ap-divider" />

        <div className="ap-sub-title">특정 날짜 정원 조정</div>
        <div className="ap-info-box">
          체육대회, 대규모 교육 등 특정 날짜만 별도로 설정합니다.
        </div>
        <form className="ap-form-row" onSubmit={handleOverrideSubmit}>
          <Field label="날짜">
            <Input
              type="date"
              value={overDate}
              onChange={(e) => setOverDate(e.target.value)}
            />
          </Field>
          <Field label="기본 정원 (명)">
            <Input
              type="number"
              min={1}
              value={overCap}
              onChange={(e) => setOverCap(e.target.value)}
              placeholder="예: 3"
            />
          </Field>
          <button type="submit" className="ap-add-btn">
            적용
          </button>
        </form>

        {overrideList.length > 0 && (
          <div className="ap-override-list">
            {overrideList.map(([date, cap]) => (
              <div key={date} className="ap-override-row">
                <div className="ap-override-info">
                  <span className="ap-override-date">{date}</span>
                  <span className="ap-override-cap">
                    기본 {cap}명 (비번 포함 시 {cap + 1}명)
                  </span>
                </div>
                <button
                  type="button"
                  className="ap-delete-btn"
                  onClick={() => {
                    if (
                      window.confirm(
                        `${date}의 개별 정원 설정을 삭제하시겠습니까?`
                      )
                    )
                      onChangeSlotOverrideForDate?.(date, 0);
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════
          4. 공휴일 관리
      ══════════════════════════════════ */}
      <Section
        id="holidays"
        icon="🇰🇷"
        title="공휴일 관리"
        badge={editHolidays.length}
      >
        <div className="ap-info-box">
          국경일, 대체공휴일 등을 등록하면 캘린더에서 공휴일 정원이 적용됩니다.
        </div>

        <div
          style={{
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 12,
            lineHeight: 1.6,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            공공 API에서 공휴일 불러오기
          </div>
          <div style={{ fontSize: 12, marginBottom: 8, color: "#166534", lineHeight: 1.6 }}>
            <b>
              ✅ 출처: 한국천문연구원 특일정보 (공공데이터포털)
              {apiResult?.checkedAt ? ` · 마지막 확인 ${apiResult.checkedAt}` : ""}
            </b>
            <br />
            정부 공식 데이터 · 매년 발표되는 월력요항 기준, 대체·임시공휴일·선거일까지
            반영 · 신뢰도 가장 높음
          </div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            ⚠️ 임시공휴일·대체공휴일·선거일은 늦게 반영되거나 빠질 수 있습니다.
            불러온 뒤 달력과 뉴스·정부 공지를 확인하고, 빠진 날은 아래에서
            직접 추가해 주세요. 직접 등록한 날은 지워지지 않습니다.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={apiYear}
              onChange={(e) => {
                setApiYear(Number(e.target.value));
                setApiResult(null);
              }}
              style={{ height: 36, borderRadius: 8, padding: "0 8px" }}
            >
              {Array.from({ length: 6 }, (_, i) => nowYear + i).map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ap-add-btn"
              onClick={handleFetchApiHolidays}
              disabled={apiLoading}
            >
              {apiLoading ? "불러오는 중…" : "공휴일 불러오기"}
            </button>
          </div>

          {apiResult?.error && (
            <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 700 }}>
              {apiResult.error}
              <div style={{ fontWeight: 500, fontSize: 12, marginTop: 2 }}>
                기존 목록은 그대로입니다. 필요하면 직접 추가해 주세요.
              </div>
            </div>
          )}

          {apiResult?.items && apiResult.items.length === 0 && (
            <div style={{ marginTop: 10, fontWeight: 700 }}>
              {apiResult.year}년 공휴일이 아직 공개되지 않았습니다.
              <div style={{ fontWeight: 500, fontSize: 12, marginTop: 2 }}>
                나중에 다시 불러오거나, 필요한 날을 직접 추가해 주세요.
              </div>
            </div>
          )}

          {apiResult?.items && apiResult.items.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>
                {apiResult.year}년 공식 공휴일 {apiResult.items.length}건 · 새로
                추가될 날 {apiNewItems.length}건
              </div>
              {apiNewItems.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  {apiNewItems.map((it) => (
                    <div key={it.date}>
                      ＋ {it.date} {it.name}
                    </div>
                  ))}
                </div>
              )}
              {apiMissingFromApi.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  참고: 직접 등록했지만 공식 목록에 없는 날{" "}
                  {apiMissingFromApi.map((h) => h.date).join(", ")} (그대로
                  유지됩니다)
                </div>
              )}
              <button
                type="button"
                className="ap-add-btn"
                style={{ marginTop: 8 }}
                onClick={handleApplyApiHolidays}
                disabled={apiNewItems.length === 0}
              >
                {apiNewItems.length > 0
                  ? `새 ${apiNewItems.length}건 목록에 추가`
                  : "추가할 새 공휴일 없음"}
              </button>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                추가한 뒤 아래 <b>공휴일 목록 저장</b>을 눌러야 저장됩니다.
              </div>
            </div>
          )}
        </div>

        <div className="ap-form-row">
          <Field label="날짜">
            <Input
              type="date"
              value={holDate}
              onChange={(e) => setHolDate(e.target.value)}
            />
          </Field>
          <Field label="이름">
            <Input
              value={holLabel}
              onChange={(e) => setHolLabel(e.target.value)}
              placeholder="예: 삼일절"
            />
          </Field>
          <button
            type="button"
            className="ap-add-btn"
            onClick={handleAddHoliday}
          >
            추가
          </button>
        </div>

        <div className="ap-holiday-list">
          {sortedHolidays.length === 0 ? (
            <div className="ap-empty-msg">등록된 공휴일이 없습니다</div>
          ) : (
            sortedHolidays.map((h) => (
              <div key={h.date} className="ap-holiday-row">
                <span className="ap-holiday-date">{h.date}</span>
                <span className="ap-holiday-label">{h.label || "-"}</span>
                <button
                  type="button"
                  className="ap-delete-btn"
                  onClick={() =>
                    setEditHolidays((p) => p.filter((x) => x.date !== h.date))
                  }
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>

        <SaveBtn onClick={handleSaveHolidays} loading={savingHol}>
          공휴일 목록 저장
        </SaveBtn>
      </Section>

      {/* ══════════════════════════════════
          5. 휴가 종류
      ══════════════════════════════════ */}
      <Section
        id="leaveTypes"
        icon="📋"
        title="휴가 종류 관리"
        badge={leaveTypes.length}
      >
        <div className="ap-info-box">
          <b>주간 전용</b>: 야간 DIA에 사용 불가 &nbsp;·&nbsp;{" "}
          <b>정원·순번 제외</b>: 정원 카운트에서 제외되며 0번으로 표시
        </div>

        <div className="ap-leave-list">
          {leaveTypes.map((t, idx) => (
            <div key={t.id} className="ap-leave-row">
              <span className="ap-leave-num">{idx + 1}</span>
              <input
                key={t.label /* 저장 실패로 이름이 되돌아가면 입력칸도 같이 되돌림 */}
                className="ap-leave-input"
                defaultValue={t.label}
                // ✅ 글자 칠 때마다 저장하지 않고, 입력을 마쳤을 때 한 번만 저장
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v || v === t.label) {
                    e.target.value = t.label;
                    return;
                  }
                  if (
                    !window.confirm(
                      `'${t.label}' → '${v}' 로 이름을 바꿉니다.\n이미 등록된 '${t.label}' 휴가도 이름이 같이 바뀝니다.`
                    )
                  ) {
                    e.target.value = t.label;
                    return;
                  }
                  onChangeLeaveTypes?.(
                    leaveTypes.map((x) => (x.id === t.id ? { ...x, label: v } : x))
                  );
                }}
                placeholder="휴가 이름"
              />
              <label className="ap-toggle">
                <input
                  type="checkbox"
                  checked={!!t.onlyDay}
                  onChange={(e) =>
                    onChangeLeaveTypes?.(
                      leaveTypes.map((x) =>
                        x.id === t.id ? { ...x, onlyDay: e.target.checked } : x
                      )
                    )
                  }
                />
                <span className="ap-toggle-track" />
                <span className="ap-toggle-label">주간 전용</span>
              </label>
              <label className="ap-toggle">
                <input
                  type="checkbox"
                  checked={!!t.excludeFromCount}
                  onChange={(e) =>
                    onChangeLeaveTypes?.(
                      leaveTypes.map((x) =>
                        x.id === t.id
                          ? { ...x, excludeFromCount: e.target.checked }
                          : x
                      )
                    )
                  }
                />
                <span className="ap-toggle-track" />
                <span className="ap-toggle-label">정원 제외</span>
              </label>
              <button
                type="button"
                className="ap-delete-btn"
                onClick={() =>
                  onChangeLeaveTypes?.(leaveTypes.filter((x) => x.id !== t.id))
                }
              >
                🗑
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="ap-add-leave-btn"
          onClick={() =>
            onChangeLeaveTypes?.([
              ...leaveTypes,
              {
                id: `custom-${Date.now()}`,
                label: "새 휴가 종류",
                onlyDay: false,
                excludeFromCount: false,
              },
            ])
          }
        >
          + 휴가 종류 추가
        </button>
      </Section>

      {/* ══════════════════════════════════
          6. DIA·야간 규칙
      ══════════════════════════════════ */}
      <Section id="nightRule" icon="🌙" title="DIA · 야간 규칙">
        <div className="ap-info-box">
          야간 DIA({nightStart}D~{diaCount}D) 휴가 사용 시 다음 날에 비번이 자동
          생성됩니다.
        </div>

        <div className="ap-night-grid">
          <Field label="전체 DIA 개수" hint="예: 37이면 1D~37D">
            <Input
              type="number"
              min={1}
              value={editNight?.diaCount ?? ""}
              onChange={(e) =>
                setEditNight((p) => ({
                  ...p,
                  diaCount: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field
            label="야간 기준 DIA (이상)"
            hint={`현재: ${nightStart}D 이상이 야간`}
          >
            <Input
              type="number"
              min={1}
              value={editNight?.nightStartDia ?? ""}
              onChange={(e) =>
                setEditNight((p) => ({
                  ...p,
                  nightStartDia:
                    e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
            />
          </Field>
        </div>

        {previewNightList.length > 0 && (
          <div className="ap-night-preview">
            <span className="ap-night-preview-label">야간 비번 후보</span>
            <div className="ap-night-tags">
              {previewNightList.map((d) => (
                <span key={d} className="ap-night-tag">
                  {d}비번
                </span>
              ))}
            </div>
          </div>
        )}

        <SaveBtn onClick={handleSaveNight} loading={savingNight}>
          야간 규칙 저장
        </SaveBtn>
      </Section>

      {/* ══════════════════════════════════
          7. 수정·취소 제한
      ══════════════════════════════════ */}
      <Section id="lockRule" icon="🔒" title="휴가 수정·취소 제한">
        <div className="ap-info-box">
          일반 사용자가 휴가일 기준 <b>N일 전부터</b>는 수정·취소를 할 수
          없습니다. 0이면 제한 없음.
        </div>

        <div className="ap-lock-row">
          <Field label="제한 기준일">
            <div className="ap-lock-input-wrap">
              <Input
                type="number"
                min={0}
                value={lockDays}
                onChange={(e) => setLockDays(e.target.value)}
                style={{
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: "1.2rem",
                }}
              />
              <span className="ap-lock-unit">일 전부터 잠금</span>
            </div>
          </Field>

          <div className="ap-lock-examples">
            {[
              [0, "제한 없음 — 언제든 수정·취소 가능"],
              [1, "하루 전부터 잠금"],
              [3, "D-3부터 관리자만 수정 가능"],
            ].map(([n, desc]) => (
              <button
                key={n}
                type="button"
                className={
                  "ap-lock-preset" +
                  (Number(lockDays) === n ? " ap-lock-preset--active" : "")
                }
                onClick={() => setLockDays(n)}
              >
                <span className="ap-lock-preset-num">{n}일</span>
                <span className="ap-lock-preset-desc">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <SaveBtn onClick={handleSaveLock} loading={savingLock}>
          제한 규칙 저장
        </SaveBtn>
      </Section>

      {/* ── 교번 설정 ── */}
      <ShiftSection
        shiftConfig={shiftConfig}
        shiftRows={shiftRows}
        onSaveShiftConfig={onSaveShiftConfig}
        publicHolidays={shiftPublicHolidays}
        userList={userList}
        shiftLoaded={shiftLoaded}
      />

      {/* 인라인 스타일 */}
      <style>{AP_STYLES}</style>
    </div>
  );
}

/* ─────────────────── 교번 설정 섹션 (사용자 원본 그대로) ─────────────────── */
function ShiftSection({
  shiftConfig,
  shiftRows,
  onSaveShiftConfig,
  publicHolidays,
  userList,
  shiftLoaded = true,
}) {
  const DEFAULT_TSV = `순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근\t전화번호
1\t이창민\t4\t6:43\t15:23\t6:55\t16:37\tS4\t\t01088446414
2\t홍성민\t14\t9:13\t18:50\t9:29\t19:26\t8:50\t18:44\t01099672569
3\t이성철\t32\t19:39\t10:06\t20:13\t10:37\t20:40\t10:38\t01032056437
4\t강원희\t32~\t\t\t\t\t\t\t01044781268
5\t김치완\t휴1\t\t\t\t\t\t\t01088570055
6\t최병환\t9\t7:23\t18:45\t7:29\t17:41\t7:20\t16:12\t01034462081
7\t이기환\t24\t13:05\t21:41\t13:56\t21:43\t12:42\t21:16\t01048131425
8\t박재민\t대6\t18:00\t9:00\t18:00\t9:00\t18:00\t9:00\t01077512711
9\t박도현\t대6~\t\t\t\t\t\t\t01029254780
10\t오중구\t휴2\t\t\t\t\t\t\t01093900407
11\t유용우\t2\t06:35\t15:47\tS2\t\tS2\t\t01049322124
12\t김찬우\t12\t08:53\t19:33\t09:00\t18:37\t08:05\t17:24\t01067672073
13\t채준호\t26\t17:15\t08:05\t17:15\t08:04\t17:49\t08:05\t01025722496
14\t이상원\t26~\t\t\t\t\t\t\t01099854895
15\t박상현\t휴3\t\t\t\t\t\t\t01025339930
16\t김성탁\t휴4\t\t\t\t\t\t\t01038675423
17\t함일남\t대1\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00\t01025278827
18\t이원준\t16\t09:37\t19:53\t10:33\t20:47\t09:35\t19:19\t01063971886
19\t정운규\t35\t20:03\t10:23\t19:49\t09:34\t19:55\t09:17\t01074821005
20\t신동훈\t35~\t\t\t\t\t\t\t01043339188
21\t우진우\t휴5\t\t\t\t\t\t\t01063654296
22\t강동우\t1\t06:31\t14:03\tS1\t\tS1\t\t01023295336
23\t김호열\t17\t10:25\t20:29\t10:49\t20:55\t09:44\t18:37\t01025398512
24\t엄인철\t30\t19:23\t10:23\t19:17\t10:23\t19:46\t10:20\t01041703103
25\t최동현\t30~\t\t\t\t\t\t\t01025517399
26\t송기중\t휴6\t\t\t\t\t\t\t01025776526
27\t박경섭\t5\t06:50\t16:43\t06:58\t15:57\tS5\t\t01072204439
28\t김희준\t15\t09:21\t19:45\t09:45\t19:50\t09:08\t18:20\t01038032786
29\t강유덕\t29\t19:15\t08:53\t19:41\t10:17\t18:43\t09:53\t01088928087
30\t김상수\t29~\t\t\t\t\t\t\t01083465215
31\t권용록\t휴7\t\t\t\t\t\t\t01068253021
32\t김재곤\t휴8\t\t\t\t\t\t\t01028785214
33\t황병두\t대2\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00\t01030368003
34\t이상훈\t20\t11:21\t20:10\t11:37\t21:27\t11:05\t20:49\t01041669608
35\t김성열\t36\t20:11\t08:32\t20:05\t08:36\t20:13\t08:32\t01025043139
36\t허준석\t36~\t\t\t\t\t\t\t01028050211
37\t이상욱\t휴9\t\t\t\t\t\t\t01088513021
38\t김경구\t3\t06:41\t14:19\t06:50\t15:06\tS3\t\t01080002461
39\t임대기\t13\t09:06\t19:10\t09:07\t17:01\t08:23\t17:48\t01087030369
40\t조덕헌\t27\t17:20\t08:48\t18:53\t08:52\t18:07\t08:50\t01086080538
41\t권혁기\t27~\t\t\t\t\t\t\t01035557277
42\t조재훈\t휴10\t\t\t\t\t\t\t01044361192
43\t박형민\t11\t07:58\t19:22\t08:53\t19:00\t07:47\t17:32\t01085116297
44\t임병길\t18\t10:41\t21:01\t10:57\t20:21\t10:20\t19:37\t01035496802
45\t박종률\t31\t19:31\t08:58\t19:25\t08:44\t19:19\t08:41\t01065090157
46\t강병웅\t31~\t\t\t\t\t\t\t01025100292
47\t이성재\t휴11\t\t\t\t\t\t\t01034331298
48\t이재헌\t휴12\t\t\t\t\t\t\t01023389797
49\t이재구\t대3\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00\t01012345678
50\t문경주\t21\t11:29\t21:17\t11:40\t20:04\t11:22\t21:07\t01094112105
51\t윤영준\t37\t21:07\t07:47\t21:01\t07:47\t20:58\t07:47\t01083637575
52\t김종규\t37~\t\t\t\t\t\t\t01051524322
53\t한남권\t휴13\t\t\t\t\t\t\t01065975611
54\t임민우\t6\t06:56\t16:11\t07:06\t15:26\tS6\t\t01025982958
55\t김종훈\t23\t12:49\t21:33\t13:42\t21:11\t12:10\t21:25\t01022502670
56\t이근수\t25\t16:35\t08:26\t16:34\t08:28\t16:50\t09:35\t01035457880
57\t강근영\t25~\t\t\t\t\t\t\t01048408496
58\t이희한\t휴14\t\t\t\t\t\t\t01088518887
59\t이재문\t7\t07:02\t16:51\t07:14\t17:09\t06:53\t16:36\t01099445004
60\t강인구\t대4\t09:00\t18:00\t09:00\t18:00\t09:00\t18:00\t01059505001
61\t최우용\t19\t10:57\t20:45\t11:24\t20:23\t10:34\t20:13\t01056693554
62\t진위동\t34\t19:55\t08:13\t20:29\t08:12\t20:22\t08:14\t01092783582
63\t김병재\t34~\t\t\t\t\t\t\t01025190526
64\t이동혁\t휴15\t\t\t\t\t\t\t01057376690
65\t김우년\t10\t07:28\t17:31\t08:04\t18:45\t07:29\t17:24\t01038242384
66\t이원진\t22\t12:17\t21:09\t12:24\t21:35\t11:54\t19:55\t01035115184
67\t이동호\t33\t19:47\t09:28\t19:57\t08:59\t19:37\t08:59\t01020070858
68\t우진하\t33~\t\t\t\t\t\t\t01033055302
69\t왕진섭\t휴16\t\t\t\t\t\t\t01071070143
70\t정범철\t휴17\t\t\t\t\t\t\t01051122184
71\t정호창\t8\t07:18\t17:07\t07:22\t16:29\t07:11\t17:40\t01042433923
72\t김성규\t28\t18:59\t08:20\t17:56\t08:20\t18:25\t08:23\t01062553981
73\t권정진\t28~\t\t\t\t\t\t\t01035213178
74\t이상신\t휴18\t\t\t\t\t\t\t01033473953
75\t백상우\t휴19\t\t\t\t\t\t\t01029249202`;

  const DEFAULT_ANCHOR = "2025-10-01";

  // ✅ 서버 교번표를 못 불러왔을 때 코드에 박힌 옛 표(DEFAULT_TSV)로 대신하지 않음
  void DEFAULT_TSV;
  const baseTsv = shiftConfig?.tsvTable || "";
  const baseAnchor = shiftConfig?.anchorDate || DEFAULT_ANCHOR;

  const parseTsv = (text) => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const delim = "\t";
    const header = lines[0].split(delim).map((s) => s.trim());
    const idx = (k) =>
      header.findIndex((h) => h.replace(/\s/g, "") === k.replace(/\s/g, ""));
    const iName = idx("이름"),
      iDia = idx("dia"),
      iWdIn = idx("평일출근"),
      iWdOut = idx("평일퇴근"),
      iSaIn = idx("토요일출근"),
      iSaOut = idx("토요일퇴근"),
      iHoIn = idx("휴일출근"),
      iHoOut = idx("휴일퇴근"),
      iPhone = idx("전화번호");
    return lines
      .slice(1)
      .map((line) => {
        const c = line.split(delim);
        return {
          name: (c[iName] || "").trim(),
          dia: (c[iDia] || "").trim(),
          phone: iPhone >= 0 ? (c[iPhone] || "").trim() : "",
          weekday: {
            in: (c[iWdIn] || "").trim(),
            out: (c[iWdOut] || "").trim(),
          },
          saturday: {
            in: (c[iSaIn] || "").trim(),
            out: (c[iSaOut] || "").trim(),
          },
          holiday: {
            in: (c[iHoIn] || "").trim(),
            out: (c[iHoOut] || "").trim(),
          },
        };
      })
      .filter((r) => r.name);
  };

  const fixedRows = React.useMemo(() => parseTsv(baseTsv), [baseTsv]);
  const total = fixedRows.length;

  const todayStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const todayDayType = React.useMemo(() => {
    const hSet = new Set((publicHolidays || []).map((h) => h.date));
    if (hSet.has(todayStr)) return "holiday";
    const dow = new Date().getDay();
    if (dow === 0) return "holiday";
    if (dow === 6) return "saturday";
    return "weekday";
  }, [todayStr, publicHolidays]);

  const dayTypeLabel = {
    weekday: "평일",
    saturday: "토요일",
    holiday: "일요일/공휴일",
  }[todayDayType];

  const savedDiff = React.useMemo(() => {
    if (!total) return 0;
    const anchor = new Date(baseAnchor + "T00:00:00");
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const target = new Date(ty, tm - 1, td);
    return Math.floor((target - anchor) / 86400000);
  }, [baseAnchor, todayStr, total]);

  const initSlots = React.useMemo(() => {
    if (!total) return [];
    const arr = Array(total).fill("");
    for (let personIdx = 0; personIdx < total; personIdx++) {
      const todayPos = (((personIdx + savedDiff) % total) + total) % total;
      arr[todayPos] = fixedRows[personIdx]?.name || "";
    }
    return arr;
  }, [total, savedDiff, fixedRows]);

  const [slots, setSlots] = React.useState(initSlots);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const [showTsvEditor, setShowTsvEditor] = React.useState(false);
  const [editingTsv, setEditingTsv] = React.useState(baseTsv);
  const [editingAnchor, setEditingAnchor] = React.useState(baseAnchor);
  const [tsvPreviewRows, setTsvPreviewRows] = React.useState([]);
  const [savingTsv, setSavingTsv] = React.useState(false);

  // 편집을 시작한 시점의 서버 교번표 버전 (저장 때 그 사이 바뀌었는지 확인용)
  const editBaseRef = React.useRef(shiftConfig?.updatedAt || null);
  const [serverChanged, setServerChanged] = React.useState(false);

  React.useEffect(() => {
    // ✅ 바꾸는 중이면 다른 관리자 저장으로 내 초안을 몰래 지우지 않음 → 경고만
    if (dirty) {
      setServerChanged(true);
      return;
    }
    setSlots(initSlots);
    setDirty(false);
    setServerChanged(false);
    editBaseRef.current = shiftConfig?.updatedAt || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initSlots]);

  React.useEffect(() => {
    if (showTsvEditor) {
      setServerChanged(true);
      return;
    }
    setEditingTsv(baseTsv);
    setEditingAnchor(baseAnchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseTsv, baseAnchor]);

  React.useEffect(() => {
    if (!showTsvEditor) return;
    try {
      setTsvPreviewRows(parseTsv(editingTsv));
    } catch {
      setTsvPreviewRows([]);
    }
  }, [editingTsv, showTsvEditor]);

  const handleSaveTsv = async () => {
    const parsed = parseTsv(editingTsv);
    if (parsed.length < 1) {
      window.alert("올바른 TSV를 입력하세요.");
      return;
    }
    if (!editingAnchor) {
      window.alert("기준일을 입력하세요.");
      return;
    }
    // ✅ 같은 이름이 두 번 있으면 경고
    const dupNames = findDuplicates(parsed.map((r) => r.name));
    if (
      dupNames.length &&
      !window.confirm(
        `같은 이름이 두 번 이상 있습니다: ${dupNames.join(", ")}\n` +
          "이름이 같으면 앱이 두 사람을 구분하지 못합니다. (예: 박재민A, 박재민B)\n그래도 저장할까요?"
      )
    ) {
      return;
    }
    setSavingTsv(true);
    const ok = await onSaveShiftConfig?.({
      tsvTable: editingTsv,
      diaCount: shiftConfig?.diaCount ?? 37,
      nightStartDia: shiftConfig?.nightStartDia ?? 25,
      anchorDate: editingAnchor,
      expectedUpdatedAt: editBaseRef.current,
    });
    if (ok) setShowTsvEditor(false); // 실패하면 붙여넣은 내용 그대로 둠
    setSavingTsv(false);
  };

  const handleSlotChange = (slotIdx, newName) => {
    if (!dirty) editBaseRef.current = shiftConfig?.updatedAt || null;
    setSlots((prev) => {
      const next = [...prev];
      const isFixed = fixedRows.some((r) => r.name === newName);
      if (isFixed) {
        const oldSlotOfNew = next.indexOf(newName);
        const displaced = next[slotIdx];
        next[slotIdx] = newName;
        if (oldSlotOfNew >= 0 && oldSlotOfNew !== slotIdx) {
          next[oldSlotOfNew] = displaced;
        }
      } else {
        // 교번표에 없던 사람(외부 인원)을 넣으면 원래 사람은 교번표에서 빠짐
        next[slotIdx] = newName;
      }
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!slots.length || !dirty) return;

    // ✅ 저장 전 확인: 교번표에서 빠지는 사람 / 두 번 들어간 이름
    const missing = fixedRows.map((r) => r.name).filter((n) => !slots.includes(n));
    const dups = findDuplicates(slots);
    const warn = [];
    if (missing.length) warn.push(`교번표에서 빠지는 사람: ${missing.join(", ")}`);
    if (dups.length) warn.push(`두 자리에 들어간 이름: ${dups.join(", ")}`);
    if (
      warn.length &&
      !window.confirm(`${warn.join("\n")}\n\n이대로 저장할까요?`)
    ) {
      return;
    }

    setSaving(true);

    const headerLine =
      "순번\t이름\tdia\t평일출근\t평일퇴근\t토요일출근\t토요일퇴근\t휴일출근\t휴일퇴근\t전화번호";

    const dataLines = slots.map((name, slotIdx) => {
      const slotRow = fixedRows[slotIdx];
      const personRow = fixedRows.find((row) => row.name === name);
      return [
        slotIdx + 1,
        name,
        slotRow?.dia || "",
        slotRow?.weekday?.in || "",
        slotRow?.weekday?.out || "",
        slotRow?.saturday?.in || "",
        slotRow?.saturday?.out || "",
        slotRow?.holiday?.in || "",
        slotRow?.holiday?.out || "",
        personRow?.phone || "",
      ].join("\t");
    });

    const newTsv = [headerLine, ...dataLines].join("\n");

    const ok = await onSaveShiftConfig?.({
      tsvTable: newTsv,
      diaCount: shiftConfig?.diaCount ?? 37,
      nightStartDia: shiftConfig?.nightStartDia ?? 25,
      anchorDate: todayStr,
      expectedUpdatedAt: editBaseRef.current,
    });

    if (ok) setDirty(false); // 실패하면 바꾼 배치 그대로 남겨둠
    setSaving(false);
  };

  const handleReset = () => {
    setSlots(initSlots);
    setDirty(false);
    setServerChanged(false);
    editBaseRef.current = shiftConfig?.updatedAt || null;
  };

  const getTimesDisplay = (row) => {
    if (!row)
      return { dia: "-", inT: "-", outT: "-", isOff: false, isS: false };
    const times =
      todayDayType === "saturday"
        ? row.saturday
        : todayDayType === "holiday"
        ? row.holiday
        : row.weekday;
    const inRaw = times?.in || "";
    const isS = inRaw.toUpperCase().startsWith("S");
    const diaStr = String(row.dia || "");
    const isOff = diaStr.startsWith("휴") || diaStr.startsWith("대");
    return {
      dia: isS ? inRaw.toUpperCase() : diaStr,
      inT: isS ? "-" : inRaw || "-",
      outT: isS ? "-" : times?.out || "-",
      isOff,
      isS,
    };
  };

  const diaColor = (d) => {
    if (!d) return "#9ca3af";
    const s = String(d);
    if (s.startsWith("휴")) return "#9ca3af";
    if (s.startsWith("대")) return "#f59e0b";
    if (s.startsWith("S")) return "#f59e0b";
    if (s.endsWith("~")) return "#9ca3af";
    const n = parseInt(s);
    if (!isNaN(n))
      return n >= (shiftConfig?.nightStartDia || 25) ? "#7c3aed" : "#2563eb";
    return "#6b7280";
  };

  if (!shiftLoaded) {
    return (
      <Section id="shift" icon="🚌" title="교번 설정">
        <div className="ap-info-box" style={{ color: "#b91c1c" }}>
          교번표를 서버에서 아직 불러오지 못했습니다.
          <br />
          잘못된 교번표로 덮어쓰지 않도록 편집을 잠가 두었습니다. 위쪽 ↻ 버튼으로 다시 불러온 뒤 편집해 주세요.
        </div>
      </Section>
    );
  }

  return (
    <Section id="shift" icon="🚌" title="교번 설정">
      <div
        style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 12,
          fontSize: "0.78rem",
          color: "#1d4ed8",
          lineHeight: 1.6,
        }}
      >
        📋 오늘({todayStr} · {dayTypeLabel}) 기준 순번표입니다. 이름 칸에서
        등록된 사용자 중에 골라 오늘 교번 배치를 수정하고 저장하세요.
        (목록에 없는 사람은 먼저 사용자로 등록해 주세요.)
        <br />
      </div>

      {total > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="ap-shift-table" style={{ minWidth: 280 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>순번</th>
                <th>이름</th>
                <th style={{ width: 48 }}>dia</th>
                <th>출근</th>
                <th>퇴근</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((name, slotIdx) => {
                const slotRow = fixedRows[slotIdx];
                const { dia, inT, outT, isOff, isS } = getTimesDisplay(slotRow);
                const isExternal = !fixedRows.find((r) => r.name === name);
                return (
                  <tr
                    key={slotIdx}
                    style={
                      isOff || isS || isExternal
                        ? { background: "#fafafa" }
                        : {}
                    }
                  >
                    <td
                      style={{
                        fontWeight: 700,
                        color: "#6b7280",
                        textAlign: "center",
                      }}
                    >
                      {slotIdx + 1}
                    </td>
                    <td>
                      <select
                        style={{
                          width: "100%",
                          border:
                            "1px solid " + (isExternal ? "#fde68a" : "#e5e7eb"),
                          borderRadius: 6,
                          padding: "2px 4px",
                          fontSize: "0.75rem",
                          background: isExternal ? "#fffbeb" : "#fff",
                          fontWeight: 700,
                          color: "#111827",
                          outline: "none",
                          cursor: "pointer",
                        }}
                        value={name}
                        onChange={(e) =>
                          handleSlotChange(slotIdx, e.target.value)
                        }
                      >
                        <optgroup label="교번 인원">
                          {[...fixedRows]
                            .sort((a, b) =>
                              a.name.localeCompare(b.name, "ko-KR")
                            )
                            .map((r, i) => (
                              <option key={i} value={r.name}>
                                {r.name}
                              </option>
                            ))}
                        </optgroup>
                        {(userList || []).filter(
                          (u) => !fixedRows.some((r) => r.name === u.name)
                        ).length > 0 && (
                          <optgroup label="등록 사용자">
                            {(userList || [])
                              .filter(
                                (u) => !fixedRows.some((r) => r.name === u.name)
                              )
                              .sort((a, b) =>
                                a.name.localeCompare(b.name, "ko-KR")
                              )
                              .map((u) => (
                                <option key={u.id} value={u.name}>
                                  {u.name}
                                </option>
                              ))}
                          </optgroup>
                        )}
                        {name &&
                          !fixedRows.some((r) => r.name === name) &&
                          !(userList || []).some((u) => u.name === name) && (
                            <option value={name}>{name} (미등록)</option>
                          )}
                      </select>
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: diaColor(dia),
                        textAlign: "center",
                      }}
                    >
                      {dia}
                    </td>
                    <td style={{ color: isOff ? "#9ca3af" : "#111827" }}>
                      {inT}
                    </td>
                    <td style={{ color: isOff ? "#9ca3af" : "#111827" }}>
                      {outT}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            padding: "20px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: "0.84rem",
          }}
        >
          ✏️ 아래의 "고급: 교번표 전체 교체"를 눌러 교번 데이터를 먼저 입력하세요
        </div>
      )}

      {serverChanged && (
        <div className="ap-info-box" style={{ color: "#b45309", marginTop: 8 }}>
          ⚠️ 바꾸는 동안 다른 관리자가 교번표를 저장했습니다. 저장하면 막히니, 되돌리기 후 다시 바꿔 주세요.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <SaveBtn onClick={handleSave} loading={saving} disabled={!dirty}>
          {dirty ? "✅ 오늘 교번 저장" : "저장됨"}
        </SaveBtn>
        {dirty && (
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: "1.5px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: "0.84rem",
              fontWeight: 700,
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            되돌리기
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, marginTop: 18, paddingTop: 12, borderTop: "1px dashed #e5e7eb" }}>
        <button
          type="button"
          onClick={() => {
            setShowTsvEditor((v) => !v);
            setEditingTsv(baseTsv);
            setEditingAnchor(baseAnchor);
            editBaseRef.current = shiftConfig?.updatedAt || null;
            setServerChanged(false);
          }}
          style={{
            padding: "7px 14px",
            borderRadius: 10,
            border: "1.5px solid " + (showTsvEditor ? "#2563eb" : "#e5e7eb"),
            background: showTsvEditor ? "#eff6ff" : "#f9fafb",
            color: showTsvEditor ? "#1d4ed8" : "#374151",
            fontSize: "0.8rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {showTsvEditor ? "▲ 닫기" : "⚙️ 고급: 교번표 전체 교체 (평소엔 쓰지 않음)"}
        </button>
      </div>

      {showTsvEditor && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "#374151",
              marginBottom: 8,
            }}
          >
            교번표 전체 교체
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 400,
                color: "#9ca3af",
                marginLeft: 8,
              }}
            >
              엑셀에서 복사 후 붙여넣기 가능 · 헤더: 순번 이름 dia 평일출근
              평일퇴근 토요일출근 토요일퇴근 휴일출근 휴일퇴근
            </span>
          </div>
          <div
            style={{
              fontSize: "0.74rem",
              color: "#b45309",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              padding: "6px 10px",
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            ⚠️ 교번표가 새로 바뀔 때만 사용하세요. 저장하면 모든 사람의 교번,
            dia, 출퇴근 시간이 이 표로 바뀝니다.
          </div>
          <textarea
            style={{
              width: "100%",
              boxSizing: "border-box",
              minHeight: 160,
              border: "1.5px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 10px",
              fontFamily: "monospace",
              fontSize: "0.7rem",
              resize: "vertical",
              outline: "none",
            }}
            value={editingTsv}
            onChange={(e) => setEditingTsv(e.target.value)}
          />
          <div
            style={{ fontSize: "0.72rem", color: "#6b7280", margin: "6px 0" }}
          >
            {tsvPreviewRows.length > 0
              ? `✅ ${tsvPreviewRows.length}명 인식됨`
              : "⚠️ 이름을 인식하지 못했습니다"}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "8px 0",
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                fontSize: "0.76rem",
                fontWeight: 700,
                color: "#374151",
                whiteSpace: "nowrap",
              }}
            >
              기준일 <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="date"
              value={editingAnchor}
              onChange={(e) => setEditingAnchor(e.target.value)}
              style={{
                border: "1.5px solid #e5e7eb",
                borderRadius: 8,
                padding: "5px 10px",
                fontSize: "0.84rem",
                fontFamily: "inherit",
                outline: "none",
                color: "#111827",
              }}
            />
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                setEditingAnchor(
                  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
                    2,
                    "0"
                  )}-${String(d.getDate()).padStart(2, "0")}`
                );
              }}
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                color: "#374151",
              }}
            >
              오늘
            </button>
            <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
              이 날짜 기준으로 순번이 계산됩니다
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <SaveBtn onClick={handleSaveTsv} loading={savingTsv}>
              테이블 저장
            </SaveBtn>
            <button
              type="button"
              onClick={() => {
                setEditingTsv(DEFAULT_TSV);
                setEditingAnchor("2025-10-01");
              }}
              style={{
                padding: "9px 14px",
                borderRadius: 10,
                border: "1.5px solid #e5e7eb",
                background: "#fff",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              기본값으로
            </button>
          </div>
        </div>
      )}

    </Section>
  );
}

/* ─────────────────── 스타일 ─────────────────── */
const AP_STYLES = `
.ap-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 24px;
}

.ap-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border-radius: 16px;
  color: #fff;
}
.ap-top-title { font-size: 1rem; font-weight: 900; letter-spacing: -0.4px; }
.ap-top-sub { font-size: 0.75rem; opacity: 0.75; margin-top: 2px; }
.ap-refresh-btn {
  padding: 7px 14px; border-radius: 999px; border: 1.5px solid rgba(255,255,255,0.35);
  background: rgba(255,255,255,0.12); color: #fff;
  font-size: 0.78rem; font-weight: 700; cursor: pointer;
  transition: all 150ms; white-space: nowrap; display: flex; align-items: center; gap: 5px;
}
.ap-refresh-btn:hover { background: rgba(255,255,255,0.22); }
.ap-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.ap-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.ap-stat {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px 10px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.ap-stat--warn { border-color: #fca5a5; background: #fff5f5; }
.ap-stat--green { border-color: #86efac; background: #f0fdf4; }
.ap-stat-num { font-size: 1.5rem; font-weight: 900; letter-spacing: -0.5px; color: #111827; }
.ap-stat--warn .ap-stat-num { color: #dc2626; }
.ap-stat--green .ap-stat-num { color: #15803d; }
.ap-stat-label { font-size: 0.7rem; color: #6b7280; font-weight: 600; margin-top: 2px; }

.ap-section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.ap-section-header {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 13px 14px; border: none; background: #fff;
  cursor: pointer; transition: background 120ms; text-align: left;
}
.ap-section-header:hover { background: #f9fafb; }
.ap-section-header--open { background: linear-gradient(135deg, #f9fafb, #eff6ff); border-bottom: 1px solid #e5e7eb; }
.ap-section-icon { font-size: 1rem; flex-shrink: 0; }
.ap-section-title { flex: 1; font-size: 0.9rem; font-weight: 800; color: #111827; letter-spacing: -0.3px; }
.ap-badge {
  padding: 2px 9px; border-radius: 999px;
  background: #fee2e2; color: #dc2626;
  font-size: 0.69rem; font-weight: 800;
  border: 1px solid #fecaca;
}
.ap-section-arrow { font-size: 0.6rem; color: #9ca3af; }
.ap-section-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; }

.ap-sub-title { font-size: 0.8rem; font-weight: 800; color: #374151; letter-spacing: -0.2px; }

.ap-info-box {
  padding: 9px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  font-size: 0.78rem;
  color: #78350f;
  line-height: 1.5;
}

.ap-divider { height: 1px; background: #f3f4f6; margin: 2px 0; }

.ap-form-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.ap-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 100px; }
.ap-label { font-size: 0.73rem; font-weight: 700; color: #4b5563; }
.ap-hint { font-size: 0.68rem; color: #9ca3af; line-height: 1.4; }
.ap-input {
  border-radius: 10px; border: 1.5px solid #e5e7eb;
  padding: 8px 10px; font-size: 0.86rem; background: #fff;
  color: #111827; outline: none; transition: border-color 120ms, box-shadow 120ms;
  font-family: inherit; width: 100%;
}
.ap-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

.ap-add-btn {
  padding: 8px 16px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff; font-size: 0.82rem; font-weight: 800;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: all 150ms; box-shadow: 0 2px 8px rgba(37,99,235,0.25);
}
.ap-add-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,0.35); }
.ap-add-btn:active { transform: scale(0.97); }

.ap-save-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 20px; border-radius: 10px; border: none;
  font-size: 0.84rem; font-weight: 800; cursor: pointer;
  transition: all 150ms; align-self: flex-start;
}
.ap-save-btn--primary {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff; box-shadow: 0 3px 10px rgba(37,99,235,0.3);
}
.ap-save-btn--primary:hover { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(37,99,235,0.4); }
.ap-save-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
.ap-spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff; border-radius: 50%;
  animation: ap-spin 0.6s linear infinite;
}
@keyframes ap-spin { to { transform: rotate(360deg); } }

.ap-delete-btn {
  width: 30px; height: 30px; border-radius: 8px;
  border: 1px solid #fecaca; background: #fef2f2;
  color: #dc2626; font-size: 0.8rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 120ms; flex-shrink: 0;
}
.ap-delete-btn:hover { background: #fee2e2; transform: scale(1.05); }

.ap-filter-tabs {
  display: flex; gap: 4px; align-items: center; flex-wrap: wrap;
}
.ap-filter-tab {
  padding: 5px 12px; border-radius: 999px; border: 1px solid #e5e7eb;
  background: #f9fafb; color: #6b7280; font-size: 0.76rem; font-weight: 700;
  cursor: pointer; transition: all 120ms;
}
.ap-filter-tab:hover { background: #f3f4f6; }
.ap-filter-tab--active { background: #2563eb; border-color: #2563eb; color: #fff; }
.ap-search {
  flex: 1; min-width: 100px; padding: 5px 12px;
  border-radius: 999px; border: 1.5px solid #e5e7eb;
  font-size: 0.76rem; background: #fff; outline: none;
  transition: border-color 120ms; font-family: inherit;
}
.ap-search:focus { border-color: #3b82f6; }

/* ✅ 행 클릭 안내 */
.ap-row-hint {
  font-size: 0.72rem;
  color: #6b7280;
  padding: 4px 2px;
  line-height: 1.5;
}

.ap-table-wrap {
  border: 1px solid #e5e7eb; border-radius: 12px;
  overflow: hidden; max-height: 400px; overflow-y: auto;
}
.ap-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.ap-table thead { position: sticky; top: 0; z-index: 1; }
.ap-table thead tr { background: #f9fafb; }
.ap-table th {
  padding: 8px 10px; text-align: left; font-size: 0.7rem;
  font-weight: 700; color: #6b7280; border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}
.ap-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f9fafb;
  vertical-align: middle;
}
/* ✅ 행 클릭 가능 */
.ap-table tbody tr {
  cursor: pointer;
  transition: background 120ms;
}
.ap-table tbody tr:hover { background: #f9fafb; }

.ap-table-row--unconfirmed { background: #fffbeb; }
.ap-table-row--unconfirmed:hover { background: #fef3c7; }

.ap-load-more-btn {
  margin-top: 8px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  color: #374151;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 120ms;
  align-self: center;
}
.ap-load-more-btn:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.ap-table-row--past-unconfirmed {
  background: #fef2f2;
  border-left: 3px solid #dc2626;
}
.ap-table-row--past-unconfirmed:hover {
  background: #fee2e2;
}
.ap-table-row--past-unconfirmed td {
  font-weight: 700;
}

/* ✅ 선택된 행 */
.ap-table-row--selected {
  background: #dbeafe !important;
  box-shadow: inset 3px 0 0 #2563eb;
}
.ap-table-row--selected:hover {
  background: #bfdbfe !important;
}

.ap-past-badge {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 4px;
  border-radius: 6px;
  background: #dc2626;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 800;
  vertical-align: middle;
  white-space: nowrap;
}

/* ✅ D-day 뱃지 */
.ap-dday-badge {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 4px;
  border-radius: 6px;
  font-size: 0.62rem;
  font-weight: 800;
  vertical-align: middle;
  white-space: nowrap;
  letter-spacing: -0.2px;
}
.ap-dday--today {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  color: #fff;
  box-shadow: 0 1px 3px rgba(220, 38, 38, 0.4);
}
.ap-dday--soon {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}
.ap-dday--upcoming {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.ap-dday--far {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}
.ap-dday--past {
  color: #9ca3af;
}

.ap-date-text {
  display: inline-block;
  font-weight: 700;
  white-space: nowrap;
}

.ap-table-empty { padding: 24px; text-align: center; color: #9ca3af; font-size: 0.84rem; }
.ap-td-date {
  font-weight: 700;
  white-space: nowrap;
  color: #374151;
}

/* ✅ 신청자 이름 줄바꿈 방지 */
.ap-td-name {
  font-weight: 700;
  white-space: nowrap;
  word-break: keep-all;
}

.ap-confirmed-chip {
  display: inline-flex; padding: 2px 8px; border-radius: 999px;
  background: #dcfce7; color: #15803d; font-size: 0.69rem; font-weight: 700;
  border: 1px solid #bbf7d0;
  white-space: nowrap;
}
.ap-unconfirmed-chip {
  display: inline-flex; padding: 2px 8px; border-radius: 999px;
  background: #fef3c7; color: #92400e; font-size: 0.69rem; font-weight: 700;
  border: 1px solid #fde68a;
  white-space: nowrap;
}

.ap-user-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
  border: 1px solid #f3f4f6;
  border-radius: 12px;
  padding: 8px;
  background: #fafafa;
}
.ap-user-list::-webkit-scrollbar {
  width: 6px;
}
.ap-user-list::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 999px;
}
.ap-user-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 12px;
  border: 1px solid #e5e7eb; background: #f9fafb;
}
.ap-user-row--me { border-color: #bfdbfe; background: #eff6ff; }
.ap-user-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff; font-size: 0.78rem; font-weight: 900;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ap-user-info { flex: 1; min-width: 0; }
.ap-user-name {
  font-size: 0.86rem; font-weight: 700; color: #111827;
  display: flex; align-items: center; gap: 5px;
}
.ap-user-meta { font-size: 0.68rem; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-me-badge {
  display: inline-flex; padding: 1px 6px; border-radius: 999px;
  background: #dbeafe; color: #1d4ed8; font-size: 0.65rem; font-weight: 800;
  border: 1px solid #bfdbfe;
}
.ap-role-select {
  padding: 4px 8px; border-radius: 8px; border: 1px solid #e5e7eb;
  background: #fff; font-size: 0.74rem; font-weight: 600;
  outline: none; cursor: pointer; color: #374151; font-family: inherit;
}
.ap-role-badge {
  display: inline-flex; padding: 2px 8px; border-radius: 999px;
  font-size: 0.68rem; font-weight: 800; white-space: nowrap; flex-shrink: 0;
}
.ap-role-badge--admin { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.ap-role-badge--user  { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }

.ap-slot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@media (min-width: 480px) { .ap-slot-grid { grid-template-columns: repeat(4, 1fr); } }
.ap-slot-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px; border-radius: 12px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  text-align: center;
}
.ap-slot-icon { font-size: 1.2rem; }
.ap-slot-label { font-size: 0.72rem; font-weight: 700; color: #4b5563; }
.ap-slot-input {
  width: 60px; text-align: center; font-size: 1.2rem; font-weight: 900;
  border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 4px 6px;
  outline: none; transition: border-color 120ms; color: #111827; font-family: inherit;
}
.ap-slot-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.ap-slot-unit { font-size: 0.7rem; color: #9ca3af; font-weight: 600; }

.ap-override-list { display: flex; flex-direction: column; gap: 5px; }
.ap-override-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 10px; border-radius: 10px;
  border: 1px solid #e5e7eb; background: #fff;
}
.ap-override-info { display: flex; flex-direction: column; gap: 1px; }
.ap-override-date { font-size: 0.84rem; font-weight: 700; }
.ap-override-cap { font-size: 0.72rem; color: #6b7280; }

.ap-holiday-list {
  border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;
  max-height: 200px; overflow-y: auto;
}
.ap-holiday-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-bottom: 1px solid #f3f4f6;
}
.ap-holiday-row:last-child { border-bottom: none; }
.ap-holiday-date { font-size: 0.82rem; font-weight: 700; color: #374151; min-width: 90px; }
.ap-holiday-label { flex: 1; font-size: 0.8rem; color: #4b5563; }
.ap-empty-msg { padding: 16px; text-align: center; font-size: 0.8rem; color: #9ca3af; }

.ap-leave-list { display: flex; flex-direction: column; gap: 6px; }
.ap-leave-row {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 10px; border-radius: 10px;
  border: 1px solid #e5e7eb; background: #f9fafb;
  flex-wrap: wrap;
}
.ap-leave-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: #eff6ff; color: #1d4ed8;
  font-size: 0.69rem; font-weight: 900;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ap-leave-input {
  flex: 1; min-width: 90px; font-size: 0.84rem; font-weight: 600;
  border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 5px 9px;
  background: #fff; outline: none; transition: border-color 120ms; font-family: inherit;
}
.ap-leave-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.ap-toggle { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.ap-toggle input { display: none; }
.ap-toggle-track {
  width: 30px; height: 17px; border-radius: 999px;
  background: #d1d5db; transition: background 150ms; position: relative; flex-shrink: 0;
}
.ap-toggle input:checked + .ap-toggle-track { background: #2563eb; }
.ap-toggle-track::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 13px; height: 13px; border-radius: 50%; background: #fff;
  transition: transform 150ms; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.ap-toggle input:checked + .ap-toggle-track::after { transform: translateX(13px); }
.ap-toggle-label { font-size: 0.72rem; font-weight: 600; color: #374151; white-space: nowrap; }
.ap-add-leave-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 7px 14px; border-radius: 999px;
  border: 1.5px dashed #bfdbfe; background: #eff6ff;
  color: #1d4ed8; font-size: 0.78rem; font-weight: 700;
  cursor: pointer; transition: all 120ms;
}
.ap-add-leave-btn:hover { background: #dbeafe; border-color: #93c5fd; }

.ap-night-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ap-night-preview {
  padding: 12px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, #faf5ff, #f5f3ff);
  border: 1px solid #e9d5ff;
}
.ap-night-preview-label {
  font-size: 0.72rem;
  color: #7c3aed;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 9px;
  letter-spacing: -0.2px;
}
.ap-night-preview-label::before {
  content: "🌙";
  font-size: 0.85rem;
}
.ap-night-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.ap-night-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  background: #fff;
  color: #6d28d9;
  font-size: 0.72rem;
  font-weight: 800;
  border: 1.5px solid #ddd6fe;
  box-shadow: 0 1px 2px rgba(124, 58, 237, 0.08);
  letter-spacing: -0.2px;
}

.ap-lock-row { display: flex; flex-direction: column; gap: 12px; }
.ap-lock-input-wrap { display: flex; align-items: center; gap: 8px; }
.ap-lock-unit { font-size: 0.84rem; font-weight: 700; color: #374151; white-space: nowrap; }
.ap-lock-examples { display: flex; flex-direction: column; gap: 5px; }
.ap-lock-preset {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 10px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  cursor: pointer; transition: all 120ms; text-align: left; width: 100%;
}
.ap-lock-preset:hover { border-color: #bfdbfe; background: #eff6ff; }
.ap-lock-preset--active { border-color: #2563eb; background: #eff6ff; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
.ap-lock-preset-num { font-size: 0.88rem; font-weight: 900; color: #1d4ed8; min-width: 28px; }
.ap-lock-preset-desc { font-size: 0.76rem; color: #4b5563; }

.ap-shift-tsv {
  width: 100%; box-sizing: border-box;
  min-height: 110px;
}
.ap-shift-table {
  width: 100%; border-collapse: collapse;
  font-size: 0.68rem; white-space: nowrap;
}
.ap-shift-table th {
  background: #f1f5f9; color: #475569;
  padding: 4px 8px; border: 1px solid #e2e8f0;
  font-weight: 700; text-align: center;
}
.ap-shift-table td {
  padding: 3px 8px; border: 1px solid #e2e8f0;
  text-align: center; color: #1e293b;
}
.ap-shift-table tr:nth-child(even) td { background: #f8fafc; }
`;
