// 랩패스 수집기 — 사이트별 HTML 해석 (순수 함수, 외부 패키지 없음)
export const RELEVANT = /임상병리|진단검사|병리|검사실|임상검사|분자진단|생리기능|뇌파|심전도/;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
export const decode = s => String(s || '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
export const text = s => decode(String(s || '').replace(/\r/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
export const clean = s => text(s).replace(/\s+/g, ' ').trim();

export function kstToday(now = new Date()) { const k = new Date(now.getTime() + 9 * 3600000); return { Y: k.getUTCFullYear(), M: k.getUTCMonth() + 1, D: k.getUTCDate() }; }
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function dates(now = new Date()) {
  const { Y, M, D } = kstToday(now);
  const today = ymd(Y, M, D);
  const addDays = n => { const t = new Date(Date.UTC(Y, M - 1, D + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const futureMD = (m, d) => ymd(m < M - 2 ? Y + 1 : Y, m, d);
  const pastMD = (m, d) => ymd(m > M + 1 ? Y - 1 : Y, m, d);
  function deadline(t) {
    t = clean(t);
    if (/오늘\s*마감/.test(t)) return { deadline: today, label: '오늘마감' };
    if (/내일\s*마감/.test(t)) return { deadline: addDays(1), label: '내일마감' };
    let m = t.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/); if (m) return { deadline: ymd(+m[1], +m[2], +m[3]) };
    m = t.match(/(?:^|\D)(\d{2})\.(\d{1,2})\.(\d{1,2})(?!\d)/); if (m) return { deadline: ymd(2000 + +m[1], +m[2], +m[3]) };
    m = t.match(/(\d{1,2})\/(\d{1,2})/); if (m) return { deadline: futureMD(+m[1], +m[2]) };
    m = t.match(/D\s*-\s*(\d+)/i); if (m) return { deadline: addDays(+m[1]) };
    m = t.match(/채용\s*시|상시\s*채용|상시/); if (m) return { deadline: '', label: m[0] };
    return { deadline: '', label: t };
  }
  function posted(t) {
    t = clean(t);
    let m = t.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/); if (m) return ymd(+m[1], +m[2], +m[3]);
    m = t.match(/(\d{2})\/(\d{1,2})\/(\d{1,2})/); if (m) return ymd(2000 + +m[1], +m[2], +m[3]);
    m = t.match(/(\d{1,2})\/(\d{1,2})/); if (m) return pastMD(+m[1], +m[2]);
    if (/시간\s*전|분\s*전|오늘/.test(t)) return today;
    return '';
  }
  return { today, deadline, posted };
}
export function inferField(t) {
  if (/혈액원|수혈|혈액/.test(t)) return '수혈·혈액';
  if (/분자|유전|PCR|NGS/i.test(t)) return '분자진단';
  if (/뇌파|신경생리|심전도|생리기능|기능검사|초음파|폐기능|수면다원/.test(t)) return '생리기능검사';
  if (/(조직|세포)병리|병리과|(?<!임상)병리팀/.test(t)) return '병리';
  return '임상병리';
}
export function classify(parts) {
  const o = { career: '', degree: '', condition: '', salary: '' };
  for (let p of parts) {
    p = clean(p); if (!p) continue;
    if (!o.career && /경력|신입/.test(p)) o.career = p;
    else if (!o.degree && /학력|대졸|초대졸|고졸|대학원|석사|박사/.test(p)) o.degree = p;
    else if (!o.condition && /정규직|계약직|인턴|파견|아르바이트|프리랜서|위촉|기간제|파트|비정규|무기계약|전일제|교육생/.test(p)) o.condition = p;
    else if (!o.salary && /만원|원$|면접\s*후|회사\s*내규|연봉|월급|시급/.test(p)) o.salary = p;
  }
  return o;
}
/** 관련도: 제목에 임상병리 관련 단어가 있거나, 직종(sector)에만 있고 제목이 다른 직종 모집이 아닐 때 */
export function relevance(title, sector = '') {
  if (RELEVANT.test(title)) return 'strong';
  if (RELEVANT.test(sector) && /채용|모집|직원|공고|검사|검진|진단|수면/.test(title) && !/간호|조무|BD|CRA|영업|마케팅|코디|원무|사무|어시스트|상담|약사|치위생|치과|물리치료|방사선/i.test(title)) return 'sector';
  return '';
}

/* ── 잡알리오 ── */
export function parseAlioList(html) {
  const i = html.indexOf('tbl type_03'); if (i < 0) throw new Error('잡알리오 목록 표를 찾지 못했습니다');
  const table = html.slice(i, html.indexOf('</table>', i));
  return table.split(/<tr[\s>]/).slice(1).map(tr => {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    const idx = (tr.match(/recruitview\.do\?idx=(\d+)/) || [])[1];
    if (!idx || tds.length < 9) return null;
    return { key: idx, title: clean(tds[2]), org: clean(tds[3]), region: clean(tds[4]), condition: clean(tds[5]), postedText: clean(tds[6]), deadlineText: clean(tds[7]), state: clean(tds[8]), url: 'https://job.alio.go.kr/recruitview.do?idx=' + idx };
  }).filter(Boolean);
}
export function parseAlioDetail(html) {
  const out = {};
  for (const m of html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) out[clean(m[1])] = text(m[2]);
  const sec = name => { const m = html.match(new RegExp('<h4>\\s*' + name + '\\s*</h4>\\s*<p>([\\s\\S]*?)</p>')); return m ? text(m[1]) : ''; };
  return { degree: out['학력정보'] || '', career: out['채용구분'] || '', headcount: out['채용인원'] || '', salary: out['급여정보'] || '', period: out['채용기간'] || '', prefer: sec('우대내용'), qualification: sec('응시자격'), process: sec('전형절차/방법') };
}

/* ── 사람인 검색 결과 ── */
export function parseSaramin(html) {
  const parts = html.split('class="item_recruit"').slice(1);
  if (!parts.length) throw new Error('사람인 검색 결과를 찾지 못했습니다');
  return parts.map(p => {
    const key = (p.match(/^\s*value="(\d+)"/) || p.match(/rec_idx=(\d+)/) || [])[1]; if (!key) return null;
    const tit = p.match(/<h2 class="job_tit">[\s\S]*?<a[^>]*title="([^"]*)"/);
    const cond = (p.match(/<div class="job_condition">([\s\S]*?)<\/div>/) || [])[1] || '';
    const spans = [...cond.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(m => clean(m[1]));
    const sector = clean((p.match(/<div class="job_sector">([\s\S]*?)<\/div>/) || [])[1]);
    const hasRegion = spans[0] && !/경력|신입|학력|대졸|고졸|정규직|계약직|만원|원$/.test(spans[0]);
    return { key, title: decode(tit ? tit[1] : ''), org: clean((p.match(/<strong class="corp_name">([\s\S]*?)<\/strong>/) || [])[1]), region: hasRegion ? spans[0] : '', ...classify(hasRegion ? spans.slice(1) : spans), sector, postedText: (sector.match(/(등록|수정)일\s*([\d/]+)/) || [])[2] || '', deadlineText: clean((p.match(/<span class="date">([\s\S]*?)<\/span>/) || [])[1]), url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=' + key };
  }).filter(Boolean);
}

/* ── 잡코리아 검색 결과: 카드(HTML) + 페이지에 함께 실린 공고 데이터(접수 기간·등록일) ── */
export function parseJobkorea(html) {
  const meta = {};
  const u = html.replace(/\\"/g, '"');
  for (const m of u.matchAll(/"id":"(\d+)","legacyJobNo":"?\d*"?,"title":"((?:[^"\\]|\\.)*)","createdAt":"([^"]*)"[\s\S]*?"applicationPeriod":(\{[^}]*\}|null)/g)) {
    if (meta[m[1]]) continue; let p = null; try { p = JSON.parse(m[4]); } catch { /* 형식이 바뀌면 날짜 없이 진행 */ }
    meta[m[1]] = { created: m[3], end: p && p.end };
  }
  const parts = html.split('shadow-list').slice(1);
  const seen = new Set(), rows = [];
  for (const p of parts) {
    const key = (p.match(/GI_Read\/(\d+)/) || [])[1]; if (!key || seen.has(key)) continue; seen.add(key);
    const leaves = [...p.matchAll(/<span class="([^"]*)"[^>]*>((?:[^<]|<!--[\s\S]*?-->)+)<\/span>/g)].map(m => ({ c: m[1], t: clean(m[2]) })).filter(l => l.t && !/sr-only/.test(l.c));
    const pick = re => leaves.filter(l => re.test(l.c)).map(l => l.t);
    const b4 = pick(/b4-14/), c1 = pick(/c1-13/), mt = meta[key] || {};
    const end = typeof mt.end === 'string' ? mt.end : '';
    rows.push({ key, title: pick(/b1-18/)[0] || '', org: pick(/b2-16/)[0] || '', region: b4[0] || '', sector: b4[1] || '', ...classify(c1.concat(b4.slice(2))), salary: b4.find(t => /만원|연봉|월급|시급/.test(t)) || '', benefit: c1.find(t => /보험|퇴직금|지원|연차|복지/.test(t)) || '',
      posted: (mt.created || '').slice(0, 10), deadline: end.slice(0, 10), deadlineTime: /T(\d{2}:\d{2})/.test(end) && !/T23:59/.test(end) ? end.match(/T(\d{2}:\d{2})/)[1] : '', deadlineLabel: end ? '' : (mt.created ? '상시 채용' : '접수 마감 원문 확인'),
      url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/' + key });
  }
  if (!rows.length) throw new Error('잡코리아 검색 결과를 찾지 못했습니다');
  return rows;
}

/* ── 이화의료원 (진행중 목록) ── */
export function parseEumc(html) {
  const rows = [...html.matchAll(/<a href="\.\/view\.do\?bbs_no=(\d+)[^"]*"[^>]*>[\s\S]*?<strong class="title">([\s\S]*?)<\/strong>\s*<div class="card-foot">([\s\S]*?)<\/div>/g)]
    .map(m => ({ key: m[1], title: clean(m[2].replace(/<span[^>]*>[\s\S]*?<\/span>/, '')), period: clean(m[3]), url: 'https://www.eumc.ac.kr/intro/recrut/view.do?bbs_no=' + m[1] }));
  if (!rows.length && !/card-list/.test(html)) throw new Error('이화의료원 목록을 찾지 못했습니다');
  return rows;
}

/* ── 씨젠의료재단 ── */
export function parseSeegeneList(html) {
  const i = html.indexOf('recruit_table'); if (i < 0) throw new Error('씨젠의료재단 목록 표를 찾지 못했습니다');
  const body = html.slice(i, html.indexOf('</table>', i));
  return body.split(/<tr[\s>]/).slice(1).map(tr => {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    const seq = (tr.match(/data-seq="(\d+)"/) || [])[1]; if (!seq || tds.length < 5) return null;
    return { key: seq, state: clean(tds[1]), career: clean(tds[2]), title: clean(tds[3]), period: clean(tds[4]), url: `https://pr.seegenemedical.com/board/recruit/${seq}.view` };
  }).filter(Boolean);
}
export function parseSeegeneDetail(html) {
  const t = text(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''));
  const a = t.indexOf('[필수요건]'), b = t.indexOf('처우', a);
  const qualification = a >= 0 ? t.slice(a, b > a ? Math.min(b, a + 900) : a + 600).replace(/\s*\d\.\s*$/, '').trim() : '';
  const region = (t.match(/\((?:[^()]*\()?\s*(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^)]*\)/) || [])[1] || '';
  return { qualification, region, relevant: /임상병리/.test(t) };
}

/* ── 공통: 랩패스 공고 형식으로 변환 ── */
export function makeItem(src, o, now = new Date()) {
  const d = dates(now);
  const dl = o.deadline !== undefined ? { deadline: o.deadline, label: o.deadlineLabel } : d.deadline(o.deadlineText || '');
  const multi = /,|，|\//.test(o.title.replace(/\[[^\]]*\]/g, '')) && /임상병리/.test(o.title) && /간호|원무|방사선|조무|시설|기계|전기|응급|사무/.test(o.title);
  const region = clean(o.region).replace(/\s.*$/, '') || '지역 확인';
  const bits = [o.org, region, o.career, o.degree, o.condition, dl.deadline ? '접수 마감 ' + dl.deadline : (dl.label || '접수 마감 원문 확인')].filter(Boolean);
  const item = {
    id: src.prefix + o.key, type: 'job', org: clean(o.org) || '기관명 확인', title: clean(o.title), region,
    field: inferField(o.title + ' ' + (o.sector || '')), condition: clean(o.condition) || '고용형태 원문 확인',
    career: clean(o.career) || '경력 원문 확인', degree: clean(o.degree) || '학력 확인',
    deadline: dl.deadline || '', posted: o.posted || (o.postedText ? d.posted(o.postedText) : ''), kind: '채용 공고',
    tags: [src.label, '자동 수집'].concat(multi ? ['여러 직종 통합 공고'] : [], o.official ? ['기관 공식 채용'] : [], o.salary ? [clean(o.salary).slice(0, 30)] : [], o.relevance === 'sector' ? ['직종 확인 필요'] : []),
    summary: (o.relevance === 'sector' ? '여러 직종 공고일 수 있어요. 임상병리 모집 여부를 원문에서 확인하세요. ' : multi ? '임상병리사를 포함한 통합 채용 공고입니다. 직종별 조건은 원문에서 확인하세요. ' : '') + bits.join(' · '),
    qualification: o.qualification || '임상병리사 면허 등 세부 지원 자격은 원문에서 확인하세요.',
    benefit: o.benefit || (o.salary ? '급여 ' + clean(o.salary) + ' · 근무 조건은 원문 확인' : '급여·근무시간은 원문 확인 필요'),
    documents: o.documents || '제출 서류와 양식은 원문에서 확인',
    source: src.label + (o.sourceOrg ? ' · ' + o.sourceOrg : ''), url: o.url, checked: d.today,
    sourceId: src.id, status: 'listed', lastVerifiedAt: now.toISOString()
  };
  if (o.startDate) item.startDate = o.startDate;
  if (o.deadlineTime) item.deadlineTime = o.deadlineTime;
  if (!dl.deadline && dl.label) item.deadlineLabel = dl.label;
  return item;
}
