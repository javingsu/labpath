#!/usr/bin/env node
// 랩패스 자동 수집기 — Node 20 이상, 외부 패키지 없음.
// 사용: node collector/collect.mjs            (feed.json 갱신)
//       node collector/collect.mjs --dry-run  (저장하지 않고 결과만 출력)
import { readFile, writeFile } from 'node:fs/promises';
import { parseAlioList, parseAlioDetail, parseSaramin, parseJobkorea, parseEumc, parseSeegeneList, parseSeegeneDetail, makeItem, relevance, dates } from './parsers.mjs';

const FEED = new URL('../feed.json', import.meta.url);
const CONFIG = new URL('./config.json', import.meta.url);
const DRY = process.argv.includes('--dry-run');
const REPO = process.env.GITHUB_REPOSITORY || '';
// 정직하게 자신을 밝히는 User-Agent (사이트 정책을 우회하지 않음)
const UA = `Mozilla/5.0 (compatible; LabpathCollector/1.0; personal job alert${REPO ? '; +https://github.com/' + REPO : ''})`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`원문 응답 오류 (${res.status})`);
  return res.text();
}

const URLS = {
  alio: 'https://job.alio.go.kr/recruit.do?search_type=title&keyword=%EC%9E%84%EC%83%81%EB%B3%91%EB%A6%AC&pageSet=50',
  saramin: 'https://www.saramin.co.kr/zf_user/search/recruit?searchword=%EC%9E%84%EC%83%81%EB%B3%91%EB%A6%AC&recruitPageCount=100&recruitSort=reg_dt',
  jobkorea: 'https://www.jobkorea.co.kr/Search/?stext=%EC%9E%84%EC%83%81%EB%B3%91%EB%A6%AC&tabType=recruit',
  eumc: 'https://www.eumc.ac.kr/intro/recrut/list.do?bid_status=I',
  seegene: 'https://pr.seegenemedical.com/board/recruit/index.do'
};
const keep = (rows, src) => rows.map(o => ({ ...o, relevance: relevance(o.title, o.sector) })).filter(o => o.relevance).map(o => makeItem(src, o));
const periodDates = p => { const m = [...String(p).matchAll(/(20\d{2})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/g)]; return m.length ? { startDate: `${m[0][1]}-${m[0][2]}-${m[0][3]}`, deadline: m[1] ? `${m[1][1]}-${m[1][2]}-${m[1][3]}` : '', deadlineTime: m[1] && m[1][4] && !(m[1][4] === '00' && m[1][5] === '00') ? `${m[1][4]}:${m[1][5]}` : '' } : {}; };

const COLLECTORS = {
  async alio() {
    const src = { id: 'alio', label: '잡알리오', prefix: 'alio' };
    const rows = parseAlioList(await get(URLS.alio)).filter(r => !/마감|취소/.test(r.state));
    const out = [];
    for (const r of rows.slice(0, 25)) {
      if (!relevance(r.title)) continue;
      let d = {};
      try { await sleep(700); d = parseAlioDetail(await get(r.url)); } catch { /* 상세 실패 시 목록 정보만 사용 */ }
      out.push(makeItem(src, { ...r, sourceOrg: r.org, relevance: 'strong', degree: d.degree, career: d.career, qualification: [d.qualification, d.prefer && '우대: ' + d.prefer].filter(Boolean).join('\n').slice(0, 1500) || undefined, benefit: d.salary && !/^[^/]*\/\s*평균$/.test(d.salary) ? '급여 정보: ' + d.salary + (d.headcount ? ' · 채용 인원 ' + d.headcount : '') + ' · 세부 조건은 원문 확인' : undefined, documents: d.process ? '전형 절차: ' + d.process.slice(0, 400) : undefined }));
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
  const enabled = config.sources || { alio: true, saramin: true, jobkorea: true, eumc: true, seegene: true };
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
      for (const n of items) { const old = byId.get(n.id); const m = merge(old, n, nowIso); if (!old) added++; else if (m.changedAt === nowIso) changed++; byId.set(n.id, m); }
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
  const items = [...byId.values()].filter(x => x.type !== 'job' || (x.deadline ? x.deadline >= cutoff : (x.lastVerifiedAt || x.firstSeenAt || nowIso).slice(0, 10) >= cutoff));

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
