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

/** 제목에 임상병리 외 특정 직종만 적혀 있는 공고(의사·간호·약사 등) */
export const OTHER_JOB = /의사|전공의|레지던트|인턴|약사|약무|간호|방사선|물리치료|작업치료|치과|치위생|영양|조리|청소|미화|시설|전기|기계|전산|사무|행정|원무|보안|운전|경비|연구원|개방형|임원|비서|상담|심리|사회복지|응급구조|업무지원|교수|진료|전문의|체외순환/;
/** 본문에서 임상병리가 나온 부분 앞뒤를 짧게 잘라 보여 줌 */
export function snippet(t, word = '임상병리', span = 140) { const k = t.indexOf(word); if (k < 0) return ''; return (k > span ? '…' : '') + t.slice(Math.max(0, k - span), k + span).replace(/\s+/g, ' ').trim() + '…'; }

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
  const fullText = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''));
  return { fullText, degree: out['학력정보'] || '', career: out['채용구분'] || '', headcount: out['채용인원'] || '', salary: out['급여정보'] || '', period: out['채용기간'] || '', prefer: sec('우대내용'), qualification: sec('응시자격'), process: sec('전형절차/방법') };
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
  const m = t.match(/\((?:[^()]*\()?\s*((서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^)]*)\)/);
  return { qualification, region: m ? m[2] : '', location: m ? m[1] : '', relevant: /임상병리/.test(t) };
}

/* ── 공통: 랩패스 공고 형식으로 변환 ── */
export function makeItem(src, o, now = new Date()) {
  const d = dates(now);
  const dl = o.deadline !== undefined ? { deadline: o.deadline, label: o.deadlineLabel } : d.deadline(o.deadlineText || '');
  const multi = o.integrated || /,|，|\//.test(o.title.replace(/\[[^\]]*\]/g, '')) && /임상병리/.test(o.title) && /간호|원무|방사선|조무|시설|기계|전기|응급|사무/.test(o.title);
  let location = normLocation(o.location || o.region);
  if (!location.includes(' ')) location = knownPlace(o.org + ' ' + o.title) || location;
  const region = (location || clean(o.region)).split(' ')[0] || '지역 확인';
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
  if (location && location.includes(' ')) item.location = location;
  if (o.startDate) item.startDate = o.startDate;
  if (o.deadlineTime) item.deadlineTime = o.deadlineTime;
  if (!dl.deadline && dl.label) item.deadlineLabel = dl.label;
  return item;
}

/* ── 대학원: 연세대학교 대학원 일반전형 일정 페이지 ── */
const ymdStr = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** "2026. 10. 7.(수) 10:00 ~ 10. 14.(수) 17:00 마감" → 시작·마감 날짜와 시각 */
export function parseKoreanPeriod(t) {
  t = clean(t);
  const m = t.match(/(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*\([^)]*\))?\s*(\d{1,2}:\d{2})?\s*[~∼～-]\s*(?:(20\d{2})\.\s*)?(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*\([^)]*\))?\s*(\d{1,2}:\d{2})?/);
  if (!m) { const one = t.match(/(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})/); return one ? { date: ymdStr(+one[1], +one[2], +one[3]) } : {}; }
  const sy = +m[1], sm = +m[2], em = +m[6];
  const ey = m[5] ? +m[5] : (em < sm ? sy + 1 : sy);
  return { start: ymdStr(sy, sm, +m[3]), startTime: m[4] || '', end: ymdStr(ey, em, +m[7]), endTime: (m[8] || '').padStart(5, '0') === '00:00' ? '' : (m[8] ? m[8].padStart(5, '0') : '') };
}
export function parseYonseiSchedule(html, campus = '미래캠퍼스') {
  const head = text((html.match(/<th[^>]*>\s*(20\d{2}\s*(?:전기|후기)\s*입학전형[\s\S]*?)<\/th>/) || [])[1]);
  const hm = head.match(/(20\d{2})\s*(전기|후기)/);
  if (!hm) throw new Error('연세대 입시일정 표를 찾지 못했습니다');
  const rows = {};
  const tb = html.slice(html.indexOf(hm[0]));
  for (const tr of tb.slice(0, tb.indexOf('</table>')).split(/<tr[\s>]/).slice(1)) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => clean(m[1]));
    if (tds.length >= 3 && tds[1]) rows[tds[1]] = tds[2];
  }
  let guideUrl = '', guideLabel = '';
  for (const tr of html.split(/<tr[\s>]/)) {
    if (!tr.includes('(' + campus + ')')) continue;
    const href = (tr.match(/href="([^"]+\.pdf)"/i) || [])[1];
    if (!href) continue;
    guideUrl = new URL(href, 'https://graduate.yonsei.ac.kr').href;
    guideLabel = clean((tr.match(/<td[^>]*>([\s\S]*?)<\/td>/) || [])[1]);
    break;
  }
  const appKey = Object.keys(rows).find(k => /원서\s*접수|입학원서/.test(k) && !/바로가기/.test(k)) || '';
  return { year: +hm[1], term: hm[2], heading: head, rows, application: rows[appKey] || '', period: parseKoreanPeriod(rows[appKey] || ''), guideUrl, guideLabel };
}

/* ── 대학원: 남서울대학교 모집요강 화면(pdfViewer) ── */
export function parseNsuAdmissions(html) {
  const blocks = html.split('class="pdf_down').slice(1);
  if (!blocks.length) throw new Error('남서울대 모집요강 화면을 찾지 못했습니다');
  return blocks.map(b => {
    const title = clean((b.match(/<strong class="titles">([\s\S]*?)<\/strong>/) || [])[1]);
    const guide = b.match(/<a href="([^"]+)"[^>]*>\s*모집요강/);
    return title ? { title, guideUrl: guide ? new URL(decode(guide[1]), 'https://gr.nsu.ac.kr').href : '', applyOpen: /apply_btn/.test(b.slice(0, 1500)) } : null;
  }).filter(Boolean);
}
/* ── 대학원: 남서울대학교 공지사항 검색 결과 ── */
export function parseNsuNotice(html) {
  if (!/notice_list/.test(html)) throw new Error('남서울대 공지사항 목록을 찾지 못했습니다');
  return html.split(/<li[\s>]/).filter(s => s.includes('article.view')).map(s => ({
    key: (s.match(/article\.view\('(\d+)'/) || [])[1], title: clean((s.match(/<strong>\s*([\s\S]*?)\s*<\/strong>/) || [])[1]),
    posted: ((s.match(/class="date"[^>]*>\s*([^<]*)/) || [])[1] || '').trim(), pinned: /^\s*class="notice"/.test(s)
  })).filter(r => r.key && r.title);
}
/* ── 대학원: 서영대학교 입학관련 게시판 ── */
export function parseSeoyeongList(html) {
  const i = html.indexOf('<tbody'); if (i < 0) throw new Error('서영대 게시판 목록을 찾지 못했습니다');
  return html.slice(i, html.indexOf('</tbody>', i)).split(/<tr[\s>]/).slice(1).map(tr => {
    const a = tr.match(/selectNttInfo\.do\?nttSn=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/); if (!a) return null;
    const date = (tr.match(/<td>\s*(20\d{2})\.(\d{2})\.(\d{2})\s*<\/td>/) || []);
    return { key: a[1], title: clean(a[2]), posted: date[1] ? `${date[1]}-${date[2]}-${date[3]}` : '', url: `https://jspjchild.seoyeong.ac.kr/grad/na/ntt/selectNttInfo.do?nttSn=${a[1]}&mi=4146` };
  }).filter(Boolean);
}

/** 대학원 항목 공통 형식 */
export function makeGradItem(o, now = new Date()) {
  const { today } = dates(now);
  const item = {
    id: o.id, type: 'grad', org: o.org, title: o.title, region: o.region, field: o.field || '대학원 진학',
    condition: o.condition || '학위과정 확인', career: o.career || '입학 자격 확인', degree: o.degree || '학위과정 확인',
    deadline: o.deadline || '', posted: o.posted || '', kind: o.kind || '대학원 모집요강', tags: o.tags || [],
    summary: o.summary, qualification: o.qualification || '전공별 지원 자격은 해당 모집요강에서 확인',
    benefit: o.benefit || '등록금·장학금·수업 시간 원문 확인 필요', documents: o.documents || '해당 연도 전형 서류는 공식 요강에서 확인',
    source: o.source, url: o.url, checked: today, sourceId: o.sourceId, status: 'listed', lastVerifiedAt: now.toISOString()
  };
  for (const k of ['startDate', 'deadlineTime', 'guideUrl', 'guideLabel', 'admissionSchedule', 'location']) if (o[k]) item[k] = o[k];
  return item;
}

/* ── 나라일터(인사혁신처): 공고명 검색 결과 ── */
export function parseGojobsList(html) {
  const tb = [...html.matchAll(/<tbody[\s\S]*?<\/tbody>/g)].map(m => m[0]).find(t => /fn_apmView/.test(t));
  if (!tb) { if (/공고명/.test(html)) return []; throw new Error('나라일터 목록을 찾지 못했습니다'); }
  return tb.split(/<tr[\s>]/).slice(1).map(tr => {
    const v = tr.match(/fn_apmView\('(\d+)',\s*'(\d+)'\)/); if (!v) return null;
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => clean(m[1]));
    return { key: v[2], kind: (tr.match(/alt="([^"]+)"/) || [])[1] || '', title: tds[1] || '', org: tds[2] || '', posted: tds[3] || '', deadline: /^\d{4}-\d{2}-\d{2}$/.test(tds[4] || '') ? tds[4] : '', url: `https://www.gojobs.go.kr/apmView.do?empmnsn=${v[2]}&searchJobsecode=${v[1]}&menuNo=401&selMenuNo=400&upperMenuNo=` };
  }).filter(Boolean);
}
export function parseGojobsDetail(html) {
  const t = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''));
  const g = re => (t.match(re) || [])[1] || '';
  const body = t.slice(Math.max(0, t.search(/접수시작일\s*\d{4}/))); // 표 설명(caption)에 같은 낱말이 있어 본문부터 찾음
  const b = re => (body.match(re) || [])[1] || '';
  return { startDate: g(/접수시작일\s*(\d{4}-\d{2}-\d{2})/), deadline: g(/접수마감일\s*(\d{4}-\d{2}-\d{2})/), grade: b(/채용직급\s*([^,][^]*?)\s*근무지역/), workplace: b(/근무지역\s*([^,][^]*?)\s*장애인/), fullText: t };
}
/** 주소·기관명에서 광역 지역 추출 */
export function regionOf(s) {
  s = String(s || '');
  const pairs = [['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'], ['광주', '광주'], ['대전', '대전'], ['울산', '울산'], ['세종', '세종'], ['경기', '경기'], ['강원', '강원'], ['충청북', '충북'], ['충북', '충북'], ['충청남', '충남'], ['충남', '충남'], ['전북', '전북'], ['전라북', '전북'], ['전남', '전남'], ['전라남', '전남'], ['경북', '경북'], ['경상북', '경북'], ['경남', '경남'], ['경상남', '경남'], ['제주', '제주'], ['수원', '경기'], ['성남', '경기'], ['군포', '경기'], ['고양', '경기'], ['용인', '경기'], ['춘천', '강원'], ['원주', '강원'], ['청주', '충북'], ['천안', '충남'], ['전주', '전북'], ['고흥', '전남'], ['순천', '전남'], ['목포', '전남'], ['포항', '경북'], ['창원', '경남'], ['양산', '경남'], ['경인', '경기']];
  const hit = pairs.map(([w, r]) => [s.indexOf(w), r]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0])[0];
  return hit ? hit[1] : '';
}

/* ── 고용24 채용정보 검색(공개 화면) ── 고용24 직접 등록·인크루트 등 다른 출처 공고 포함 */
export function parseWork24(html) {
  const parts = html.split(/<tr id="list\d+">/).slice(1);
  if (!parts.length) { if (/검색결과가 없|조회된 데이터가 없/.test(html)) return []; throw new Error('고용24 검색 결과를 찾지 못했습니다'); }
  return parts.map(p => {
    const v = p.match(/id="chkboxWantedAuthNo\d+"\s+value="([^"]+)"/); if (!v) return null;
    const [key, type, org, ...t] = decode(v[1]).split('|');
    const href = (p.match(/href="(\/wk\/a\/b\/1500\/empDetailAuthView\.do\?[^"]+)"/) || [])[1];
    const spans = sel => [...(p.match(new RegExp('<li class="' + sel + '">([\\s\\S]*?)</li>')) || ['', ''])[1].matchAll(/<span class="item[^"]*">([\s\S]*?)<\/span>/g)].map(m => clean(m[1]));
    const date = (p.match(/var\s+date\s*=\s*'([\d-]*)'/) || [])[1] || (p.match(/마감일\s*:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    const wanted = /var\s+wantedYn\s*=\s*'Y'/.test(p) || /^2099/.test(date);
    return { key, type, org: clean(org), title: clean(t.join('|')), salary: spans('dollar')[0] || '', career: spans('member')[0] || '', degree: spans('member')[1] || '', hours: spans('time').join(' · '),
      address: clean((p.match(/<li class="site">([\s\S]*?)<\/li>/) || [])[1]), deadline: wanted ? '' : date, deadlineLabel: wanted ? '채용시' : '',
      posted: (p.match(/등록일\s*:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '', url: href ? 'https://www.work24.go.kr' + decode(href) : '' };
  }).filter(Boolean);
}

/* ── 대학원: 동의대학교 모집요강 화면 ── */
export function parseDeuGuide(html) {
  const title = clean((html.match(/(20\d{2}학년도\s*(?:전기|후기)[^<]{0,40}모집요강)/) || [])[1]);
  if (!title) throw new Error('동의대 모집요강 제목을 찾지 못했습니다');
  const dl = (html.match(/href="(\?mode=download&(?:amp;)?articleNo=\d+&(?:amp;)?attachNo=\d+)"/) || [])[1];
  return { title, guideUrl: dl ? 'https://grd.deu.ac.kr/grd/sub02_01.do' + decode(dl) : '' };
}
/* ── 대학원: 을지대학교 일반대학원 첫 화면의 공지 목록 ── */
export function parseEuljiMain(html) {
  const rows = [...html.matchAll(/<a[^>]+href="([^"]*bbsno=(\d+)[^"]*boardno=(1270|852)[^"]*act=view[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({
    key: m[3] + '-' + m[2], title: clean((m[4].match(/<span class="text">([\s\S]*?)<\/span>/) || [])[1]),
    posted: ((m[4].match(/(20\d{2})\.(\d{2})\.(\d{2})/) || []).slice(1).join('-')), url: new URL(decode(m[1]), 'https://grad.eulji.ac.kr/').href
  })).filter(r => r.title);
  if (!rows.length) throw new Error('을지대 대학원 공지 목록을 찾지 못했습니다');
  return [...new Map(rows.map(r => [r.key, r])).values()];
}

/* ── 근무지 상세(시·군·구) ── */
const PROVINCE = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 세종시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주도: '제주', 제주특별자치도: '제주', 전남광주통합특별시: '전남광주' };
const PROVINCES = new Set(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전남광주']);
/** "경기도 수원시 팔달구 …" → "경기 수원시 팔달구" (광역 + 시·군·구 + 구·읍·면까지) */
export function normLocation(s) {
  const toks = clean(s).replace(/[()[\]]/g, ' ').split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return '';
  const first = PROVINCE[toks[0]] || toks[0];
  if (!PROVINCES.has(first)) return '';
  const out = [first];
  for (const t of toks.slice(1)) { if (out.length >= 3 || !/^[가-힣]+(시|군|구|읍|면)$/.test(t)) break; out.push(t); }
  return out.join(' ');
}
/** 기관 소재지(자주 나오는 공공·대형 병원). 더 구체적인 이름을 먼저 둔다 */
const KNOWN_PLACES = [
  ['칠곡경북대', '대구 북구'], ['경북대학교병원', '대구 중구'], ['화순전남대', '전남 화순군'], ['전남대학교병원', '광주 동구'],
  ['분당서울대', '경기 성남시 분당구'], ['서울대학교병원', '서울 종로구'], ['보라매병원', '서울 동작구'], ['국립중앙의료원', '서울 중구'],
  ['국립암센터', '경기 고양시 일산동구'], ['일산병원', '경기 고양시 일산동구'], ['이대목동', '서울 양천구'], ['목동병원', '서울 양천구'], ['이대서울', '서울 강서구'],
  ['강동성심', '서울 강동구'], ['한양대학교병원', '서울 성동구'], ['세종충남대', '세종'], ['충남대학교병원', '대전 중구'], ['충북대학교병원', '충북 청주시 서원구'],
  ['제주대학교병원', '제주 제주시'], ['양산부산대', '경남 양산시'], ['부산대학교병원', '부산 서구'], ['전북대학교병원', '전북 전주시 덕진구'], ['강원대학교병원', '강원 춘천시'],
  ['경상국립대학교병원', '경남 진주시'], ['동아대학교', '부산 서구'], ['대구동산병원', '대구 중구'], ['대구파티마', '대구 동구'], ['강릉아산', '강원 강릉시'], ['원광대학교병원', '전북 익산시'],
  ['대전을지', '대전 서구'], ['중앙보훈', '서울 강동구'], ['광주보훈', '광주 광산구'], ['대전보훈', '대전 대덕구'], ['부산보훈', '부산 사상구'], ['대구보훈', '대구 달서구'],
  ['창원병원', '경남 창원시 성산구'], ['인천적십자병원', '인천 연수구'], ['원자력의학원', '서울 노원구'], ['GCLabs', '경기 용인시 기흥구'], ['녹십자의료재단', '경기 용인시 기흥구'], ['서울의과학연구소', '경기 용인시 기흥구']
];
export function knownPlace(text) {
  text = String(text || '');
  if (/\[세종\]/.test(text)) return '세종';
  const hit = KNOWN_PLACES.find(([k]) => text.includes(k));
  return hit ? hit[1] : '';
}
