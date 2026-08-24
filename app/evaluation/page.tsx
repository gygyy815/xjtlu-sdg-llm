"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Workspace = { label: string; slug: string };
type EvalCase = {
  id: string;
  name: string;
  question: string;
  expectedSourceTerms: string[];
  expectedAnswerTerms: string[];
  expectedDate: string;
  expectAbstain: boolean;
};
type EvalResult = {
  question: string;
  workspaceSlug: string;
  answer: string;
  citations: { title: string; source?: string; publishedDate?: string; url?: string }[];
  retrieved: { title: string; source?: string; publishedDate?: string; score?: number }[];
  retrievalWarning?: string;
  metrics: {
    retrievalHit: boolean | null;
    citationHit: boolean | null;
    answerFactHit: boolean | null;
    dateHit: boolean | null;
    abstentionHit: boolean | null;
    checked: number;
    passed: number;
    score: number | null;
  };
};

const STORAGE_KEY = "xjtlu-rag-evaluation-cases-v1";

function splitTerms(value: string) {
  return value.split(/[\n,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function metricLabel(value: boolean | null) {
  if (value === null) return "—";
  return value ? "PASS" : "FAIL";
}

function metricClass(value: boolean | null) {
  if (value === null) return "neutral";
  return value ? "pass" : "fail";
}

export default function EvaluationPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [results, setResults] = useState<Record<string, EvalResult>>({});
  const [runningId, setRunningId] = useState("");
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [sourceTerms, setSourceTerms] = useState("");
  const [answerTerms, setAnswerTerms] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [expectAbstain, setExpectAbstain] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((data) => {
        const options = Array.isArray(data.workspaces) ? data.workspaces.filter((item: Workspace) => item?.label && item?.slug) : [];
        setWorkspaces(options);
        setWorkspaceSlug(options[0]?.slug || "");
      })
      .catch(() => setWorkspaces([]));

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) setCases(stored);
    } catch {}
  }, []);

  function saveCases(next: EvalCase[]) {
    setCases(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function addCase() {
    if (!question.trim()) return;
    const next: EvalCase = {
      id: crypto.randomUUID(),
      name: name.trim() || `Test ${cases.length + 1}`,
      question: question.trim(),
      expectedSourceTerms: splitTerms(sourceTerms),
      expectedAnswerTerms: splitTerms(answerTerms),
      expectedDate: expectedDate.trim(),
      expectAbstain,
    };
    saveCases([...cases, next]);
    setName("");
    setQuestion("");
    setSourceTerms("");
    setAnswerTerms("");
    setExpectedDate("");
    setExpectAbstain(false);
  }

  function removeCase(id: string) {
    saveCases(cases.filter((item) => item.id !== id));
    setResults((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function runCase(test: EvalCase) {
    if (!workspaceSlug) return null;
    setRunningId(test.id);
    setError("");
    try {
      const response = await fetch("/api/evaluation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...test, workspaceSlug }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Evaluation failed.");
      setResults((current) => ({ ...current, [test.id]: data }));
      return data as EvalResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed.");
      return null;
    } finally {
      setRunningId("");
    }
  }

  async function runAll() {
    if (!cases.length || !workspaceSlug) return;
    setRunningAll(true);
    setError("");
    for (const test of cases) {
      // Deliberately sequential to avoid flooding the local model / AnythingLLM.
      await runCase(test);
    }
    setRunningAll(false);
  }

  const summary = useMemo(() => {
    const completed = cases.map((item) => results[item.id]).filter(Boolean);
    const scored = completed.filter((item) => item.metrics.score !== null);
    const avg = scored.length ? scored.reduce((sum, item) => sum + Number(item.metrics.score || 0), 0) / scored.length : null;
    const metricRate = (key: keyof EvalResult["metrics"]) => {
      const values = completed.map((item) => item.metrics[key]).filter((value): value is boolean => typeof value === "boolean");
      return values.length ? Math.round((values.filter(Boolean).length / values.length) * 100) : null;
    };
    return {
      completed: completed.length,
      average: avg === null ? null : Number(avg.toFixed(1)),
      retrieval: metricRate("retrievalHit"),
      citation: metricRate("citationHit"),
      facts: metricRate("answerFactHit"),
      dates: metricRate("dateHit"),
      abstention: metricRate("abstentionHit"),
    };
  }, [cases, results]);

  function exportResults() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), workspaceSlug, cases, results }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `xjtlu-rag-evaluation-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="evalPage" data-no-ui-translate>
      <header className="evalTop"><Link href="/dashboard">← 返回数据看板</Link><span>RAG EVALUATION · BETA</span></header>

      <section className="evalHero">
        <span>RAG 质量评估</span>
        <h1>用固定测试集验证检索、引用、事实、日期与拒答</h1>
        <p>这里不使用“看起来不错”的主观分数。每个测试用例由你定义期望来源关键词、关键事实、日期或是否应该拒答，然后使用当前 AnythingLLM Workspace 实际运行。</p>
        <div className="evalToolbar">
          <label>Workspace<select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.length ? workspaces.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>) : <option value="">No Workspace</option>}</select></label>
          <button type="button" onClick={runAll} disabled={!cases.length || !workspaceSlug || runningAll}>{runningAll ? "正在运行…" : `运行全部 ${cases.length || ""}`}</button>
          <button type="button" className="secondary" onClick={exportResults} disabled={!Object.keys(results).length}>导出结果 JSON</button>
        </div>
      </section>

      <section className="evalMetrics">
        <article><small>已运行</small><strong>{summary.completed}/{cases.length}</strong><span>测试用例</span></article>
        <article><small>综合规则通过率</small><strong>{summary.average === null ? "—" : `${summary.average}%`}</strong><span>仅统计已定义期望的检查项</span></article>
        <article><small>Retrieval hit</small><strong>{summary.retrieval === null ? "—" : `${summary.retrieval}%`}</strong><span>Top-6 是否召回期望来源</span></article>
        <article><small>Citation hit</small><strong>{summary.citation === null ? "—" : `${summary.citation}%`}</strong><span>最终回答是否引用期望来源</span></article>
        <article><small>Fact accuracy</small><strong>{summary.facts === null ? "—" : `${summary.facts}%`}</strong><span>期望关键事实是否全部出现</span></article>
        <article><small>Date accuracy</small><strong>{summary.dates === null ? "—" : `${summary.dates}%`}</strong><span>明确日期是否原样出现</span></article>
        <article><small>Abstention</small><strong>{summary.abstention === null ? "—" : `${summary.abstention}%`}</strong><span>证据不足时是否正确拒答</span></article>
      </section>

      <section className="evalPanel">
        <div className="evalPanelHead"><div><span>ADD TEST CASE</span><h2>添加测试用例</h2></div><small>至少填写问题；其他字段用于产生可计算指标。</small></div>
        <div className="evalForm">
          <label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：近期活动有效性" /></label>
          <label className="wide">问题<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：最近有哪些校园活动？" /></label>
          <label>期望来源关键词<textarea value={sourceTerms} onChange={(event) => setSourceTerms(event.target.value)} placeholder="文章标题关键词、公众号名；逗号或换行分隔" /></label>
          <label>期望回答关键事实<textarea value={answerTerms} onChange={(event) => setAnswerTerms(event.target.value)} placeholder="例如：活动名称、地点、报名方式" /></label>
          <label>期望日期<input value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} placeholder="YYYY-MM-DD 或原文日期" /></label>
          <label className="checkLabel"><input type="checkbox" checked={expectAbstain} onChange={(event) => setExpectAbstain(event.target.checked)} /> 这个问题在证据不足时应该拒答</label>
        </div>
        <button type="button" className="addCase" onClick={addCase} disabled={!question.trim()}>＋ 添加到测试集</button>
      </section>

      <section className="evalPanel">
        <div className="evalPanelHead"><div><span>TEST SUITE</span><h2>固定测试集</h2></div><small>{cases.length ? "建议逐步积累 30–50 个真实校园问题。" : "还没有测试用例。先添加一个你已经知道正确答案的问题。"}</small></div>
        {error && <div className="evalError">{error}</div>}
        {!cases.length ? <div className="evalEmpty">没有测试用例。建议先从“活动有效性、原文来源、日期、报名信息、证据不足拒答”五类各添加 2–3 个问题。</div> : <div className="evalCases">
          {cases.map((test, index) => {
            const result = results[test.id];
            return <article className="evalCase" key={test.id}>
              <div className="caseTop"><span>{index + 1}</span><div><strong>{test.name}</strong><p>{test.question}</p></div><button type="button" onClick={() => runCase(test)} disabled={Boolean(runningId) || runningAll}>{runningId === test.id ? "运行中…" : "运行"}</button><button type="button" className="remove" onClick={() => removeCase(test.id)}>×</button></div>
              <div className="caseExpectations">
                <span>来源：{test.expectedSourceTerms.join(" / ") || "未定义"}</span>
                <span>事实：{test.expectedAnswerTerms.join(" / ") || "未定义"}</span>
                <span>日期：{test.expectedDate || "未定义"}</span>
                <span>拒答：{test.expectAbstain ? "是" : "未要求"}</span>
              </div>
              {result && <div className="caseResult">
                <div className="caseScore"><strong>{result.metrics.score === null ? "No score" : `${result.metrics.score}%`}</strong><span>{result.metrics.passed}/{result.metrics.checked} checks passed</span></div>
                <div className="metricChips">
                  <span className={metricClass(result.metrics.retrievalHit)}>Retrieval {metricLabel(result.metrics.retrievalHit)}</span>
                  <span className={metricClass(result.metrics.citationHit)}>Citation {metricLabel(result.metrics.citationHit)}</span>
                  <span className={metricClass(result.metrics.answerFactHit)}>Facts {metricLabel(result.metrics.answerFactHit)}</span>
                  <span className={metricClass(result.metrics.dateHit)}>Date {metricLabel(result.metrics.dateHit)}</span>
                  <span className={metricClass(result.metrics.abstentionHit)}>Abstention {metricLabel(result.metrics.abstentionHit)}</span>
                </div>
                <details><summary>查看本次回答与来源</summary><div className="resultDetail"><p>{result.answer}</p><strong>回答引用：{result.citations.length}</strong>{result.citations.map((source, i) => <small key={i}>{i + 1}. {source.title}{source.source ? ` · ${source.source}` : ""}{source.publishedDate ? ` · ${source.publishedDate}` : ""}</small>)}<strong>独立向量召回：{result.retrieved.length}</strong>{result.retrieved.map((source, i) => <small key={i}>{i + 1}. {source.title}</small>)}</div></details>
              </div>}
            </article>;
          })}
        </div>}
      </section>

      <style jsx global>{`
        .evalPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.evalTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.evalTop a{color:#5965d8;text-decoration:none;font-weight:700}.evalTop span,.evalHero>span,.evalPanelHead>div>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.evalHero,.evalMetrics,.evalPanel{max-width:1120px;margin-left:auto;margin-right:auto}.evalHero{margin-top:48px;margin-bottom:24px}.evalHero h1{font-size:34px;line-height:1.2;margin:8px 0 10px}.evalHero p{max-width:850px;color:#6f7a85;line-height:1.7}.evalToolbar{display:flex;gap:9px;align-items:end;flex-wrap:wrap;margin-top:18px}.evalToolbar label{display:grid;gap:5px;color:#717b86;font-size:11px}.evalToolbar select{min-width:220px;padding:9px 10px;border:1px solid #dfe3e9;border-radius:9px;background:white}.evalToolbar button,.addCase,.caseTop button{border:0;border-radius:9px;background:#5b66df;color:white;padding:10px 14px;font-weight:700;cursor:pointer}.evalToolbar button:disabled,.addCase:disabled,.caseTop button:disabled{opacity:.45}.evalToolbar .secondary{background:white;color:#5963cf;border:1px solid #dfe2ea}.evalMetrics{display:grid;grid-template-columns:repeat(7,1fr);gap:9px;margin-bottom:18px}.evalMetrics article{background:white;border:1px solid #e2e6ec;border-radius:13px;padding:14px}.evalMetrics small,.evalMetrics span{display:block;color:#7b8691}.evalMetrics strong{display:block;font-size:22px;margin:7px 0}.evalMetrics span{font-size:9.5px;line-height:1.4}.evalPanel{background:#fff;border:1px solid #e2e6ec;border-radius:16px;padding:22px;margin-bottom:18px}.evalPanelHead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.evalPanelHead h2{margin:5px 0 18px}.evalPanelHead small{color:#86909a}.evalForm{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}.evalForm label{display:grid;gap:6px;color:#59626d;font-size:11px;font-weight:700}.evalForm input,.evalForm textarea{width:100%;border:1px solid #dfe3e9;border-radius:9px;padding:10px;font:inherit;font-weight:400;resize:vertical}.evalForm textarea{min-height:72px}.evalForm .wide{grid-column:1/-1}.evalForm .checkLabel{display:flex;align-items:center;gap:8px}.evalForm .checkLabel input{width:auto}.addCase{margin-top:13px}.evalCases{display:grid;gap:11px}.evalCase{border:1px solid #e5e8ed;border-radius:13px;overflow:hidden}.caseTop{display:grid;grid-template-columns:28px minmax(0,1fr) auto 32px;gap:9px;align-items:start;padding:12px}.caseTop>span{width:25px;height:25px;border-radius:7px;background:#eef0ff;color:#5963cf;display:grid;place-items:center;font-size:10px;font-weight:800}.caseTop strong{font-size:13px}.caseTop p{margin:4px 0 0;color:#6b7580;font-size:12px}.caseTop button{padding:7px 11px;font-size:10px}.caseTop .remove{background:#f3f4f6;color:#8a929c;padding:6px 9px}.caseExpectations{display:flex;gap:7px;flex-wrap:wrap;padding:0 12px 11px}.caseExpectations span{font-size:9.5px;color:#77818c;background:#f5f6f8;border-radius:999px;padding:4px 7px}.caseResult{border-top:1px solid #e9ebef;background:#fafbfc;padding:11px 12px}.caseScore{display:flex;align-items:baseline;gap:8px}.caseScore strong{font-size:18px}.caseScore span{font-size:10px;color:#858e99}.metricChips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.metricChips span{font-size:9px;font-weight:700;padding:4px 7px;border-radius:999px}.metricChips .pass{background:#eaf7f1;color:#28715a}.metricChips .fail{background:#fff0f0;color:#ad4b4b}.metricChips .neutral{background:#f0f2f5;color:#8a929c}.caseResult details{border-top:1px solid #eceef1;padding-top:8px}.caseResult summary{cursor:pointer;color:#5c66cf;font-size:10.5px;font-weight:700}.resultDetail{display:grid;gap:4px;padding:9px 2px 2px}.resultDetail p{white-space:pre-wrap;color:#59636e;font-size:11px;line-height:1.65}.resultDetail strong{font-size:10px;margin-top:5px}.resultDetail small{color:#7e8791;font-size:9.5px}.evalEmpty,.evalError{padding:18px;border-radius:10px}.evalEmpty{background:#f7f8fa;color:#7d8791}.evalError{background:#fff1f1;color:#a64a4a;margin-bottom:10px}@media(max-width:1050px){.evalMetrics{grid-template-columns:repeat(4,1fr)}}@media(max-width:760px){.evalPage{padding-inline:14px}.evalMetrics{grid-template-columns:1fr 1fr}.evalForm{grid-template-columns:1fr}.evalForm .wide{grid-column:auto}.evalPanelHead{flex-direction:column}.caseTop{grid-template-columns:28px minmax(0,1fr) auto}.caseTop .remove{grid-column:3}}
      `}</style>
    </main>
  );
}
