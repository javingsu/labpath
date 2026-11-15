#!/usr/bin/env node
// 랩패스 자동 수집기 — Node 20 이상, 외부 패키지 없음.
// 사용: node collector/collect.mjs            (feed.json 갱신)
//       node collector/collect.mjs --dry-run  (저장하지 않고 결과만 출력)
import { readFile, writeFile } from 'node:fs/promises';
import { parseAlioList, parseAlioDetail, parseSaramin, parseJobkorea, parseEumc, parseSeegeneList, parseSeegeneDetail, makeItem, relevance, dates, OTHER_JOB, snippet, parseYonseiSchedule, parseNsuAdmissions, parseNsuNotice, parseSeoyeongList, makeGradItem, parseGojobsList, parseGojobsDetail, regionOf, parseWork24, parseDeuGuide, parseEuljiMain } from './parsers.mjs';

const FEED = new URL('../feed.json', import.meta.url);
const CONFIG = new URL('./config.json', import.meta.url);
const DRY = process.argv.includes('--dry-run');
const REPO = process.env.GITHUB_REPOSITORY || '';
// 정직하게 자신을 밝히는 User-Agent (사이트 정책을 우회하지 않음)
const UA = `Mozilla/5.0 (compatible; LabpathCollector/1.0; personal job alert${REPO ? '; +https://github.com/' + REPO : ''})`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 2, opts = {}) {
  for (let i = 1; ; i++) {
    try { return await getOnce(url, opts); }
    catch (e) { if (i >= tries || /응답 오류 \((4\d\d)\)/.test(e.message)) throw e; await sleep(4000); } // 일시적인 연결 실패만 한 번 더
  }
}
async function getOnce(url, opts = {}) {
  const res = await fetch(url, { method: opts.method || 'GET', body: opts.body, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9', ...(opts.body ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`원문 응답 오류 (${res.status})`);
  return res.text();
}

const URLS = {
  alio: 'https://job.alio.go.kr/recruit.do?search_type=title&keyword=%EC%9E%84%EC%83%81%EB%B3%91%EB%A6%AC&pageSet=50',
  saramin: 'https://www.saramin.co.kr/zf_user/search/recruit?searchword=%EC%9E%84%EC%83%81%EB%B3%91%EB%A6%AC&recruitPageCount=100&recruitSort=reg_dt',
  jobkorea: 'https://www.jobkorea.co.kr/Search/?stext=%EC%9E%84%EC%83%81%EB%B3%91%EB%A6%AC&tabType=recruit',
  eumc: 'https://www.eumc.ac.kr/intro/recrut/list.do?bid_status=I',
  seegene: 'https://pr.seegenemedical.com/board/recruit/index.do',
  'yonsei-spring': 'https://graduate.yonsei.ac.kr/graduate/admission/general_schedule.do',
  'yonsei-fall': 'https://graduate.yonsei.ac.kr/graduate/admission/general_fall_schedule.do',
  nsu: 'https://gr.nsu.ac.kr/kor/article/notice?searchCondition=1&searchKeyword=%EB%AA%A8%EC%A7%91',
  'nsu-admissions': 'https://gr.nsu.ac.kr/kor/21/pdfViewer/CAT006',
  seoyeong: 'https://jspjchild.seoyeong.ac.kr/grad/na/ntt/selectNttList.do?bbsId=781&mi=4146',
  gojobs: 'https://www.gojobs.go.kr/apmList.do?menuNo=401&mngrMenuYn=N&selMenuNo=400&searchKeyword=%EC%9E%84%EC%83%81%EB%B3%91%EB%A6%AC',
  work24: 'https://www.work24.go.kr/wk/a/b/1200/retriveDtlEmpSrchListInPost.do',
  eulji: 'https://grad.eulji.ac.kr/',
  deu: 'https://grd.deu.ac.kr/grd/sub02_01.do',
  kyungwoon: 'https://www.ikw.ac.kr/resources/templates/front/assets/file/uni_grad/grad/graduate_guide_new.pdf'
};
// 대학원 출처: 이번에 보이지 않은 기존 항목은 '다음 전형으로 교체됨'으로 닫음, 서영대는 게시글 주소로 기존 id 재사용
const GRAD_CLOSE_MISSING = new Set(['yonsei-spring', 'yonsei-fall', 'nsu', 'nsu-admissions', 'seoyeong', 'eulji', 'deu', 'kyungwoon']);
const REUSE_ID_BY_URL = new Set(['seoyeong']);

async function yonsei(id, termName) {
  const s = parseYonseiSchedule(await get(URLS[id]));
  const p = s.period;
  const guideYear = (s.guideLabel.match(/(20\d{2})학년도/) || [])[1];
  const oldGuide = guideYear && +guideYear !== s.year;
  const pick = re => { const k = Object.keys(s.rows).find(x => re.test(x)); return k ? s.rows[k] : ''; };
  return [makeGradItem({
    id: `yonsei-mirae-${s.year}-${s.term === '전기' ? 'spring' : 'fall'}`, sourceId: id,
    org: '연세대학교 일반대학원 · 미래캠퍼스', title: `${s.year}학년도 ${s.term} 일반전형 모집 · 미래캠퍼스`, region: '강원',
    field: '대학원 진학', condition: '일반대학원', career: '과정별 지원 자격 확인', degree: '석사·박사·통합 과정별 확인', kind: '대학원 모집요강',
    tags: ['미래캠퍼스', '일반전형', s.term, p.end ? '공식 접수 일정' : '접수 일정 원문 확인'].concat(oldGuide ? ['요강은 이전 학년도(참고용)'] : []),
    startDate: p.start, deadline: p.end, deadlineTime: p.endTime,
    summary: `미래캠퍼스용 일반대학원 ${s.term} 모집입니다. ${p.end ? `원서접수 ${p.start} ~ ${p.end}${p.endTime ? ' ' + p.endTime : ''}.` : '접수 일정은 원문에서 확인하세요.'} ${oldGuide ? '올해 요강이 아직 올라오지 않아 이전 학년도 요강(참고용)을 연결했어요. ' : ''}지원 학과·학위과정의 모집 여부는 미래캠퍼스 PDF에서 확인하세요.`,
    qualification: '석사·통합 및 박사 지원 자격과 전공별 제한은 미래캠퍼스 모집요강 확인 필요. 임상병리 관련 전공의 이번 전형 모집 여부는 별도 확인하세요.',
    benefit: '일반대학원 주간 과정. 등록금·장학금·수업 세부 조건은 해당 모집요강 확인 필요.',
    documents: '학업·연구계획서와 과정별 제출 서류는 공식 요강 및 원서접수 안내에서 확인.',
    source: `연세대 미래캠퍼스 · ${termName} 일반전형`, url: URLS[id], guideUrl: s.guideUrl, guideLabel: s.guideLabel,
    admissionSchedule: { application: s.application, '구술시험 대상자 발표': pick(/대상자\s*발표/), interview: pick(/구술시험\s*및|면접/), result: pick(/최종\s*합격/) }
  })];
}
const keep = (rows, src) => rows.map(o => ({ ...o, relevance: relevance(o.title, o.sector) })).filter(o => o.relevance).map(o => makeItem(src, o));
const periodDates = p => { const m = [...String(p).matchAll(/(20\d{2})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/g)]; return m.length ? { startDate: `${m[0][1]}-${m[0][2]}-${m[0][3]}`, deadline: m[1] ? `${m[1][1]}-${m[1][2]}-${m[1][3]}` : '', deadlineTime: m[1] && m[1][4] && !(m[1][4] === '00' && m[1][5] === '00') ? `${m[1][4]}:${m[1][5]}` : '' } : {}; };

const COLLECTORS = {
  async gojobs() {
    // 나라일터: 국가·지자체·공공기관 공무원(의료기술직 등) 임상병리 채용. 합격자 발표·안내 글은 제외
    const src = { id: 'gojobs', label: '나라일터', prefix: 'gojobs-' };
    const { today } = dates();
    const rows = parseGojobsList(await get(URLS.gojobs)).filter(r => !/합격자|면접\s*시험\s*안내|결과|명단|연기|취소/.test(r.title) && (!r.deadline || r.deadline >= today));
    const out = [];
    for (const r of rows.slice(0, 15)) {
      let d = {}; try { await sleep(600); d = parseGojobsDetail(await get(r.url)); } catch { /* 목록 정보만 사용 */ }
      const kindTag = r.kind === '국가' ? '국가직 공무원' : r.kind === '지자체' ? '지방직·지자체' : r.kind === '공공' ? '공공기관' : '';
      out.push(makeItem(src, { ...r, region: regionOf(d.workplace || r.org + ' ' + r.title), deadline: d.deadline || r.deadline, startDate: d.startDate,
        condition: /임기제|기간제|대체|한시/.test(r.title) ? '임기제·기간제' : /청년인턴/.test(r.title) ? '인턴' : '공무원·공공 채용', career: /경력/.test(r.title) ? '경력' : '', degree: '공고문 확인',
        relevance: 'strong', official: true, integrated: /,|，/.test(r.title.replace(/\([^)]*임상병리[^)]*\)/, '')),
        qualification: [d.grade && '채용 직급: ' + d.grade, d.workplace && '근무지: ' + d.workplace, '응시 자격(면허·경력 연수)은 공고문 첨부파일에서 확인하세요.'].filter(Boolean).join('\n'),
        sourceOrg: kindTag }));
    }
    return out;
  },
  async work24() {
    // 고용24 공개 검색(최신순). 사람인·잡코리아에서 온 공고는 이미 따로 모으므로 제외하고, 고용24 직접 등록·인크루트 등만 사용
    const src = { id: 'work24', label: '고용24', prefix: 'work24-' };
    const html = await get(URLS.work24, 2, { method: 'POST', body: new URLSearchParams({ keyword: '임상병리', srcKeyword: '임상병리', searchMode: 'Y', resultCnt: '50', pageIndex: '1', sortField: 'DATE', sortOrderBy: 'DESC' }) });
    const PROVIDER = { VALIDATION: '고용24 직접 등록', CIN: '인크루트 제공', CMD: '메디잡 제공' };
    return parseWork24(html).filter(r => !['CSI', 'CJK'].includes(r.type)).map(r => ({ ...r, relevance: relevance(r.title) || (/임상병리/.test(r.title) ? 'strong' : '') })).filter(r => r.relevance)
      .map(r => makeItem(src, { ...r, region: regionOf(r.address), condition: '', sourceOrg: PROVIDER[r.type] || '', benefit: [r.salary && '급여 ' + r.salary, r.hours, r.address && '근무지 ' + r.address].filter(Boolean).join(' · ') || undefined }));
  },
  async eulji() {
    const { today } = dates(); const year = +today.slice(0, 4);
    return parseEuljiMain(await get(URLS.eulji)).filter(r => /(신입생|편입생|입학|입시).*(모집|요강|면접|전형)|모집요강/.test(r.title) && +((r.title.match(/(20\d{2})학년도/) || [])[1] || 0) >= year)
      .map(r => makeGradItem({ id: 'eulji-' + r.key, sourceId: 'eulji', org: '을지대학교 일반대학원', title: r.title, region: '경기', posted: r.posted,
        field: '임상병리 관련 진학', degree: '석사·박사·석박사통합', kind: /면접|장소/.test(r.title) ? '대학원 입시 안내' : '대학원 모집 안내',
        tags: ['공식 사이트 자동 수집', '임상병리학과 개설', '모집 일정 별도 확인'],
        summary: '을지대학교 일반대학원 공지입니다. 일반대학원에 임상병리학과(석사·박사·석박사통합)가 있어요. 접수 기간과 모집 학과는 공지 첨부 요강과 원서접수 사이트에서 확인하세요.',
        source: '을지대학교 일반대학원 · 통합공지', url: r.url }));
  },
  async deu() {
    const g = parseDeuGuide(await get(URLS.deu));
    return [makeGradItem({ id: 'deu-guide-' + g.title.replace(/\s/g, ''), sourceId: 'deu', org: '동의대학교 대학원', title: g.title, region: '부산',
      field: '임상병리 관련 진학', degree: '석사·박사', kind: '대학원 모집요강', tags: ['공식 사이트 자동 수집', '임상병리학과 개설', '모집 일정 별도 확인'],
      summary: '동의대학교 대학원 모집요강 화면에 게시된 요강입니다. 대학원에 임상병리학과가 있어요. 원서접수·면접 일정과 모집 인원은 요강 PDF에서 확인하세요.',
      source: '동의대학교 대학원 · 모집요강', url: URLS.deu, guideUrl: g.guideUrl, guideLabel: g.guideUrl ? g.title + ' (원본 파일)' : '' })];
  },
  async kyungwoon() {
    const res = await fetch(URLS.kyungwoon, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`원문 응답 오류 (${res.status})`);
    const lm = res.headers.get('last-modified'); const updated = lm ? new Date(lm).toISOString().slice(0, 10) : '';
    return [makeGradItem({ id: 'kyungwoon-guide', sourceId: 'kyungwoon', org: '경운대학교 일반대학원', title: '경운대학교 일반대학원 신입생 모집요강', region: '경북', posted: updated,
      field: '임상병리 관련 진학', degree: '석사', kind: '대학원 모집요강', tags: ['공식 사이트 자동 수집', '임상병리학과 개설', '모집 일정 별도 확인'],
      summary: `경운대 일반대학원 모집학과에 임상병리학과가 포함돼 있어요.${updated ? ' 요강 파일 최종 수정일 ' + updated + '.' : ''} 해당 학기 요강인지와 접수 일정을 PDF에서 확인하세요.`,
      source: '경운대학교 일반대학원 · 모집요강', url: URLS.kyungwoon, guideUrl: URLS.kyungwoon, guideLabel: '모집요강 PDF' })];
  },
  'yonsei-spring': () => yonsei('yonsei-spring', '전기'),
  'yonsei-fall': () => yonsei('yonsei-fall', '후기'),
  async 'nsu-admissions'() {
    return parseNsuAdmissions(await get(URLS['nsu-admissions'])).map(b => makeGradItem({
      id: 'nsu-guide-' + b.title.replace(/\s/g, ''), sourceId: 'nsu-admissions', org: '남서울대학교 대학원', title: b.title, region: '충남',
      field: '임상병리 관련 진학', condition: '학위과정 확인', degree: '모집요강 확인', kind: '대학원 모집요강',
      tags: ['공식 사이트 자동 수집', b.applyOpen ? '원서접수 링크 열림' : '모집학과·접수 일정 확인 필요'],
      summary: '대학원 홈페이지에 게시된 모집요강입니다. ' + (b.applyOpen ? '원서접수 버튼이 열려 있어요. ' : '현재 접수 중임을 뜻하지 않으며 ') + '임상병리학과 모집 여부와 접수 일정은 요강 PDF의 ‘모집일정 및 모집학과’에서 확인하세요.',
      qualification: '전공별 지원 자격은 해당 모집요강 PDF에서 확인', documents: '해당 연도 전형 서류 및 PDF 요강 확인',
      source: '남서울대학교 대학원 · 모집요강', url: URLS['nsu-admissions'], guideUrl: b.guideUrl, guideLabel: b.guideUrl ? b.title + ' (PDF)' : ''
    }));
  },
  async nsu() {
    const { today } = dates();
    const cutoff = new Date(Date.parse(today) - 150 * 86400000).toISOString().slice(0, 10);
    return parseNsuNotice(await get(URLS.nsu))
      .filter(r => /모집요강|(신입생|신·편입생|신편입생|입학).*(모집|전형)/.test(r.title) && !/논문|장학|교육생|공모|참가|기숙사|IBEC|학생증|연구원|베트남어|외국인/.test(r.title) && r.posted >= cutoff)
      .map(r => makeGradItem({ id: 'nsu-notice-' + r.key, sourceId: 'nsu', org: '남서울대학교 대학원', title: r.title, region: '충남', posted: r.posted,
        field: '임상병리 관련 진학', kind: '대학원 모집 공지', tags: ['공식 사이트 자동 수집', '모집 일정 별도 확인'],
        summary: '남서울대학교 대학원 공지사항에 올라온 모집 관련 글입니다. 공지 목록에서 제목으로 찾아 확인하세요.', source: '남서울대학교 대학원 · 공지사항', url: URLS.nsu }));
  },
  async seoyeong() {
    const { today } = dates();
    const year = +today.slice(0, 4);
    return parseSeoyeongList(await get(URLS.seoyeong)).filter(r => +((r.title.match(/(20\d{2})학년도/) || [])[1] || 0) >= year).map(r => makeGradItem({
      id: 'seoyeong-' + r.key, sourceId: 'seoyeong', org: '서영대학교 대학원', title: r.title, region: '광주', posted: r.posted,
      field: '스마트진단검사', condition: '전문기술석사', degree: '전문기술석사', kind: /양식|서식/.test(r.title) ? '입학 서류 안내' : '대학원 모집 안내',
      tags: ['공식 사이트 자동 수집', '모집 일정 별도 확인'], summary: '해당 연도 입학 서류 안내입니다. 접수 기간과 전공별 지원 자격은 모집요강에서 별도로 확인하세요.',
      qualification: '학력·경력·전공별 자격은 해당 연도 공식 모집요강 확인 필요', documents: '입학 서류 양식은 공식 게시글 첨부파일에서 확인',
      source: '서영대학교 대학원 · 입학 안내', url: r.url
    }));
  },
  async alio() {
    // 제목 검색 + 보건·의료 직무 전체(진행중) → 제목이 모호한 통합 공고는 상세 본문에 '임상병리'가 있을 때만 포함
    const src = { id: 'alio', label: '잡알리오', prefix: 'alio' };
    const rows = new Map();
    for (const u of [URLS.alio, ...[1, 2].map(p => `https://job.alio.go.kr/recruit.do?pageNo=${p}&pageSet=100&detail_code=R600006&ing=2`)]) {
      try { for (const r of parseAlioList(await get(u))) if (!rows.has(r.key)) rows.set(r.key, r); }
      catch (e) { if (u === URLS.alio) throw e; }
      await sleep(500);
    }
    const out = []; let details = 0;
    for (const r of rows.values()) {
      if (/마감|취소/.test(r.state)) continue;
      const strong = !!relevance(r.title);
      if (!strong && OTHER_JOB.test(r.title)) continue;
      if (details >= 50) break;
      let d = {}; details++;
      try { await sleep(700); d = parseAlioDetail(await get(r.url)); } catch { if (!strong) continue; }
      const found = strong ? '' : snippet(d.fullText || '');
      if (!strong && !found) continue;
      out.push(makeItem(src, { ...r, sourceOrg: r.org, relevance: 'strong', integrated: !strong, degree: d.degree, career: d.career,
        qualification: [found && '본문 중 임상병리 관련: ' + found, d.qualification, d.prefer && '우대: ' + d.prefer].filter(Boolean).join('\n').slice(0, 1500) || undefined,
        benefit: d.salary && !/^[^/]*\/\s*평균$/.test(d.salary) ? '급여 정보: ' + d.salary + (d.headcount ? ' · 채용 인원 ' + d.headcount : '') + ' · 세부 조건은 원문 확인' : undefined,
        documents: d.process ? '전형 절차: ' + d.process.slice(0, 400) : undefined }));
    }
    return out;
  },
  async saramin() { return keep(parseSaramin(await get(URLS.saramin)), { id: 'saramin', label: '사람인', prefix: 'saramin-' }); },
  async jobkorea() { return keep(parseJobkorea(await get(URLS.jobkorea)), { id: 'jobkorea', label: '잡코리아', prefix: 'jobkorea-' }); },
  async eumc() {
    const src = { id: 'eumc', label: '이화의료원', prefix: 'eumc-' };
    return parseEumc(await get(URLS.eumc)).filter(r => /임상병리/.test(r.title)).map(r => makeItem(src, {
      ...r, ...periodDates(r.period), official: true, relevance: 'strong', condition: (r.title.match(/정규직|계약직|임시직|기간제/) || [''])[0], career: (r.title.match(/신입|경력/) || [''])[0],
      org: /목동/.test(r.title) ? '이대목동병원' : /서울병원/.test(r.title) ? '이대서울병원' : '이화의료원', region: '서울'
    }));
  },
  async seegene() {
    const src = { id: 'seegene', label: '씨젠의료재단', prefix: 'seegene-' };
    const rows = parseSeegeneList(await get(URLS.seegene)).filter(r => /진행/.test(r.state) && /병리|검사|분자|미생물|진단|검체|임상/.test(r.title));
    const out = [];
    for (const r of rows.slice(0, 10)) {
      await sleep(700);
      let d; try { d = parseSeegeneDetail(await get(r.url)); } catch { continue; }
      if (!d.relevant) continue; // 상세에 임상병리 자격이 있는 공고만
      out.push(makeItem(src, { ...r, ...periodDates(r.period), org: '씨젠의료재단', region: d.region || '서울', official: true, relevance: 'strong', condition: (r.title.match(/계약직|정규직/) || [''])[0], qualification: d.qualification }));
    }
    return out;
  }
};

// ── 병합: 상세 정보가 더 풍부한 기존 값은 유지, 마감일·고용형태가 바뀌면 changedAt 기록 ──
const GENERIC = /원문\s*확인|확인\s*필요|확인하세요|^지역 확인$|^학력 확인$|^기관명 확인$/;
function merge(old, n, nowIso) {
  if (!old) return { ...n, firstSeenAt: nowIso };
  if (n.type === 'grad') { // 대학원은 수집기가 만든 설명이 기준: 새 값으로 덮어쓰고 변경만 기록
    const out = { ...old, ...n, firstSeenAt: old.firstSeenAt || nowIso };
    delete out.closedReason;
    if ((old.deadline || '') !== (n.deadline || '') && old.deadline) out.changedAt = nowIso;
    return out;
  }
  const out = { ...old }; let changed = false;
  for (const [k, v] of Object.entries(n)) {
    const ov = old[k];
    if (k === 'tags') { if (!(ov || []).length) out.tags = v; continue; }
    if (typeof v === 'string' && GENERIC.test(v) && ov && !GENERIC.test(String(ov))) continue;
    if (['summary', 'qualification', 'benefit', 'documents', 'field', 'kind', 'career', 'degree'].includes(k) && ov && !GENERIC.test(String(ov)) && !(k === 'qualification' && String(v).length > String(ov).length)) continue;
    if (['deadline', 'condition'].includes(k) && ov && v && ov !== v) changed = true;
    out[k] = v;
  }
  if (old.deadline && n.deadline && old.deadline !== n.deadline && typeof out.summary === 'string') out.summary = out.summary.split(old.deadline).join(n.deadline);
  if (old.status === 'closed' && old.closedReason !== 'deadline') { out.status = 'listed'; delete out.closedReason; }
  if (changed) out.changedAt = nowIso;
  return out;
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG, 'utf8').catch(() => '{}'));
  const enabled = { ...Object.fromEntries(Object.keys(COLLECTORS).map(k => [k, true])), ...(config.sources || {}) };
  const feed = JSON.parse(await readFile(FEED, 'utf8'));
  const now = new Date(), nowIso = now.toISOString();
  const byId = new Map(feed.items.map(x => [x.id, x]));
  const prevStatus = new Map((feed.sources || []).map(s => [s.id, s]));
  let added = 0, changed = 0, ok = 0, fail = 0;
  const statuses = [];
  for (const [id, run] of Object.entries(COLLECTORS)) {
    const prev = prevStatus.get(id) || { id };
    if (!enabled[id]) { statuses.push({ ...prev, id, status: 'skipped', checkedAt: nowIso, count: 0, message: '설정에서 자동 수집을 끈 출처입니다' }); continue; }
    try {
      const items = await run();
      if (REUSE_ID_BY_URL.has(id)) for (const n of items) if (!byId.has(n.id)) { const same = [...byId.values()].filter(x => x.sourceId === id && x.url === n.url); if (same.length === 1) n.id = same[0].id; }
      for (const n of items) { const old = byId.get(n.id); const m = merge(old, n, nowIso); if (!old) added++; else if (m.changedAt === nowIso) changed++; byId.set(n.id, m); }
      if (GRAD_CLOSE_MISSING.has(id)) { const seen = new Set(items.map(n => n.id)); for (const x of byId.values()) if (x.sourceId === id && !seen.has(x.id) && x.status !== 'closed') byId.set(x.id, { ...x, status: 'closed', closedReason: 'replaced', changedAt: nowIso }); }
      statuses.push({ ...prev, id, status: 'success', checkedAt: nowIso, count: items.length, message: '공개 페이지 확인 완료', lastSuccessAt: nowIso });
      ok++; console.log(`✓ ${id}: ${items.length}건`);
    } catch (e) {
      statuses.push({ ...prev, id, status: 'failed', checkedAt: nowIso, count: 0, message: String(e?.message || e).slice(0, 200) });
      fail++; console.log(`✗ ${id}: ${e?.message || e}`);
    }
  }
  // 자동 수집하지 않는 출처(대학원·널스넷 등)는 기존 자료를 유지
  for (const s of feed.sources || []) if (!COLLECTORS[s.id] && s.status !== 'manual') statuses.push({ ...s, status: 'skipped', message: '자동 수집 대상이 아니어서 기존 자료를 유지합니다' });
  for (const s of feed.sources || []) if (s.status === 'manual') statuses.push(s);

  // 오래된 자료 정리: 마감 60일 경과, 또는 마감일 없이 60일 넘게 다시 확인되지 않은 채용 공고
  const { today } = dates(now);
  const cutoff = new Date(Date.parse(today + 'T00:00:00+09:00') - 60 * 86400000).toISOString().slice(0, 10);
  const items = [...byId.values()].filter(x => x.type === 'grad' ? !(x.status === 'closed' && x.closedReason === 'replaced' && (x.changedAt || nowIso).slice(0, 10) < cutoff) : x.type !== 'job' || (x.deadline ? x.deadline >= cutoff : (x.lastVerifiedAt || x.firstSeenAt || nowIso).slice(0, 10) >= cutoff));

  const next = {
    ...feed, schemaVersion: feed.schemaVersion || 1, collectorVersion: 'labpath-gh-1', revision: globalThis.crypto.randomUUID(),
    items, sources: statuses, lastAttemptAt: nowIso, lastSuccessAt: ok ? nowIso : feed.lastSuccessAt,
    previousSuccessAt: ok ? feed.lastSuccessAt : feed.previousSuccessAt,
    status: fail === 0 ? 'success' : ok ? 'partial' : 'failed', added, changed,
    schedule: { enabled: true, time: '08:23', timezone: 'Asia/Seoul', via: 'github-actions', repo: REPO }
  };
  delete next.snapshotNote;
  console.log(`결과: ${next.status} · 신규 ${added}건 · 변경 ${changed}건 · 전체 ${items.length}건`);
  if (DRY) return;
  await writeFile(FEED, JSON.stringify(next, null, 1) + '\n', 'utf8');
  if (!ok) process.exitCode = 1; // 모든 출처 실패 시 Actions에 실패로 표시(이메일 알림)
}
main().catch(e => { console.error(e); process.exitCode = 1; });
