// api/holidays.js — Vercel 서버 함수
//
// 한국천문연구원 특일정보 API(공공데이터포털)의 "공휴일 정보 조회"를
// 서버에서 대신 호출해서 앱에 넘겨준다.
//  · API 키는 Vercel 환경변수 KASI_SERVICE_KEY 에만 둔다 (앱 코드·브라우저에 노출 X)
//  · 브라우저에서 공공데이터포털을 직접 부르면 CORS 로 막히기 때문에 이 경유가 필요
//
// 호출: GET /api/holidays?year=2026
// 응답: { year, source: "kasi", dates: ["2026-01-01", ...], names: { "2026-01-01": "1월1일", ... } }

const ENDPOINT =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

// 공공데이터포털 키는 "인코딩" / "디코딩" 두 가지가 있음.
//  디코딩 키(+,/,= 포함) → 한 번 인코딩해서 보냄
//  인코딩 키(%2B 등 포함) → 이미 인코딩돼 있으니 그대로 보냄
function keyParam(raw) {
  const k = String(raw || "").trim();
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
}

export function parseKasiItems(json) {
  const header = json?.response?.header;
  if (header && header.resultCode && header.resultCode !== "00") {
    throw new Error(`KASI ${header.resultCode} ${header.resultMsg || ""}`.trim());
  }
  let items = json?.response?.body?.items?.item;
  if (!items) return [];
  if (!Array.isArray(items)) items = [items]; // 1건이면 배열이 아니라 객체로 옴
  return items
    .filter((it) => String(it?.isHoliday || "Y").toUpperCase() === "Y")
    .map((it) => {
      const s = String(it.locdate || "");
      return {
        date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
        name: String(it.dateName || "").trim(),
      };
    })
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
}

export default async function handler(req, res) {
  const year = Number(req.query?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "year 파라미터가 필요합니다 (예: ?year=2026)" });
    return;
  }
  const key = process.env.KASI_SERVICE_KEY;
  if (!key) {
    res.status(500).json({ error: "서버에 KASI_SERVICE_KEY 환경변수가 없습니다" });
    return;
  }

  const url =
    `${ENDPOINT}?serviceKey=${keyParam(key)}` +
    `&solYear=${year}&numOfRows=100&pageNo=1&_type=json`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // 키 오류 등은 JSON 요청이어도 XML 로 옴
      const code = (text.match(/<returnAuthMsg>([^<]+)</) ||
        text.match(/<resultMsg>([^<]+)</) || [])[1];
      throw new Error(code || `응답 해석 실패 (HTTP ${r.status})`);
    }
    const list = parseKasiItems(json);
    const names = {};
    for (const { date, name } of list) {
      names[date] = names[date] ? `${names[date]}, ${name}` : name;
    }
    const dates = Object.keys(names).sort();
    // 발표 전인 연도는 빈 목록 → 앱이 다른 출처로 넘어가도록 그대로 전달
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=43200, stale-while-revalidate=86400"
    );
    res.status(200).json({ year, source: "kasi", dates, names });
  } catch (e) {
    res.status(502).json({ error: `특일정보 API 호출 실패: ${e.message || e}` });
  }
}
