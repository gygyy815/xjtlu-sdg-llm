"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Workspace = { label: string; slug: string };
type SourceMatchMode = "all" | "any";
type EvalCase = {
  id: string;
  name: string;
  question: string;
  expectedSourceTerms: string[];
  expectedAnswerTerms: string[];
  expectedDate: string;
  expectAbstain: boolean;
  sourceMatchMode?: SourceMatchMode;
};
type MetricValue = boolean | null;
type EvalResult = {
  runStatus?: "completed" | "error";
  question: string;
  workspaceSlug: string;
  answer: string;
  citations: { title: string; source?: string; publishedDate?: string; url?: string }[];
  retrieved: { title: string; source?: string; publishedDate?: string; score?: number }[];
  retrievalWarning?: string;
  runtime?: { answerAttempts?: number; isolatedSession?: boolean; temporalGuardApplied?: boolean };
  evaluation?: { version?: number; sourceMatchMode?: SourceMatchMode; evidenceSupportIsProxy?: boolean };
  metrics: {
    retrievalHit: MetricValue;
    retrievalCoverage?: number | null;
    citationHit: MetricValue;
    citationCoverage?: number | null;
    answerFactHit: MetricValue;
    factCoverage?: number | null;
    dateHit: MetricValue;
    abstentionHit: MetricValue;
    evidenceSupportHit?: MetricValue;
    evidenceSupportCoverage?: number | null;
    checked: number;
    passed: number;
    score: number | null;
  };
};

type RunError = { message: string; retryable?: boolean };
const STORAGE_KEY = "xjtlu-rag-evaluation-cases-v1";

function label(v: MetricValue) { return v === null ? "—" : v ? "PASS" : "FAIL"; }
function cls(v: MetricValue) { return v === null ? "neutral" : v ? "pass" : "fail"; }
function pct(v?: number | null) { return typeof v === "number" ? `${v}%` : "—"; }

export default function EvaluationV2Page() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [results, setResults] = useState<Record<string, EvalResult>>({});
  const [errors, setErrors] = useState<Record<string, RunError>>({});
  const [runningId, setRunningId] = useState("");
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((data) => {
      const rows = Array.isArray(data.workspaces) ? data.workspaces.filter((x: Workspace) => x?.label && x?.slug) : [];
      setWorkspaces(rows);
      setWorkspaceSlug(rows[0]?.slug || "");
    }).catch(() => setWorkspaces([]));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setCases(saved);
    } catch {}
  }, []);

  function persist(next: EvalCase[]) {
    setCases(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function setMode(id: string, mode: SourceMatchMode) {
    persist(cases.map((test) => test.id === id ? { ...test, sourceMatchMode: mode } : test));
    setResults((current) => { const next = { ...current }; delete next[id]; return next; });
  }

  async function runCase(test: EvalCase) {
    if (!workspaceSlug) return;
    setRunningId(test.id);
    setErrors((current) => { const next = { ...current }; delete next[test.id]; return next; });
    try {
      const response = await fetch("/api/evaluation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...test, sourceMatchMode: test.sourceMatchMode || "all", workspaceSlug }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrors((current) => ({ ...current, [test.id]: { message: data.error || "Evaluation failed.", retryable: data.retryable } }));
        return;
      }
      setResults((current) => ({ ...current, [test.id]: data }));
    } catch (error) {
      setErrors((current) => ({ ...current, [test.id]: { message: error instanceof Error ? error.message : "Evaluation failed." } }));
    } finally {
      setRunningId("");
    }
  }

  async function runAll() {
    if (!workspaceSlug || !cases.length) return;
    setRunningAll(true);
    for (const test of cases) await runCase(test);
    setRunningAll(false);
  }

  const summary = useMemo(() => {
    const completed = cases.map((x) => results[x.id]).filter(Boolean);
    const metricRate = (key: keyof EvalResult["metrics"]) => {
      const vals = completed.map((r) => r.metrics[key]).filter((v): v is boolean => typeof v === "boolean");
      return vals.length ? Math.round(vals.filter(Boolean).length / vals.length * 100) : null;
    };
    const scores = completed.map((r) => r.metrics.score).filter((v): v is number => typeof v === "number");
    return {
      completed: completed.length,
      errors: Object.keys(errors).length,
      average: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null,
      retrieval: metricRate("retrievalHit"),
      citation: metricRate("citationHit"),
      facts: metricRate("answerFactHit"),
      abstention: metricRate("abstentionHit"),
      evidence: metricRate("evidenceSupportHit"),
    };
  }, [cases, results, errors]);

  function exportResults() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), evaluationVersion: 2, workspaceSlug, cases, results, errors }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xjtlu-rag-evaluation-v2-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return <main className="v2">
    <header><Link href="/evaluation">← Evaluation v1</Link><b>RAG EVALUATION 2.0</b></header>
    <section className="hero">
      <span>DETERMINISTIC BENCHMARK</span>
      <h1>区分检索失败、回答失败与运行错误</h1>
      <p>v2 默认要求全部期望来源命中（ALL）；同一事实允许用 <code>||</code> 写同义表达。Evidence support 是基于引用片段的确定性代理指标，不冒充 LLM 主观评分。</p>
      <div className="toolbar">
        <select value={workspaceSlug} onChange={(e) => setWorkspaceSlug(e.target.value)}>{workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.label}</option>)}</select>
        <button onClick={runAll} disabled={runningAll || !workspaceSlug || !cases.length}>{runningAll ? "运行中…" : `运行全部 ${cases.length}`}</button>
        <button className="ghost" onClick={exportResults} disabled={!Object.keys(results).length && !Object.keys(errors).length}>导出 v2 JSON</button>
      </div>
    </section>

    <section className="metrics">
      <article><small>Completed</small><strong>{summary.completed}/{cases.length}</strong></article>
      <article><small>ERROR</small><strong>{summary.errors}</strong></article>
      <article><small>Rule score</small><strong>{pct(summary.average)}</strong></article>
      <article><small>Retrieval</small><strong>{pct(summary.retrieval)}</strong></article>
      <article><small>Citation</small><strong>{pct(summary.citation)}</strong></article>
      <article><small>Facts</small><strong>{pct(summary.facts)}</strong></article>
      <article><small>Abstention</small><strong>{pct(summary.abstention)}</strong></article>
      <article><small>Evidence support</small><strong>{pct(summary.evidence)}</strong></article>
    </section>

    <section className="suite">
      <div className="suiteHead"><div><span>EXISTING TEST SUITE</span><h2>沿用你现有的 {cases.length} 个测试用例</h2></div><p>来源匹配默认 ALL。若某字段只是多个可接受别名，可切换 ANY；事实同义表达请在单个字段中用 <code>||</code>。</p></div>
      <div className="cards">{cases.map((test, i) => {
        const result = results[test.id];
        const error = errors[test.id];
        const mode = test.sourceMatchMode || "all";
        return <article className="card" key={test.id}>
          <div className="top"><em>{i + 1}</em><div><strong>{test.name}</strong><p>{test.question}</p></div><button onClick={() => runCase(test)} disabled={Boolean(runningId) || runningAll}>{runningId === test.id ? "运行中…" : "运行"}</button></div>
          <div className="expect">
            <span>来源：{test.expectedSourceTerms.join(" / ") || "未定义"}</span>
            <span>事实：{test.expectedAnswerTerms.join(" / ") || "未定义"}</span>
            <span>日期：{test.expectedDate || "未定义"}</span>
            <span>拒答：{test.expectAbstain ? "是" : "未要求"}</span>
          </div>
          <div className="mode"><b>来源规则</b><button className={mode === "all" ? "on" : ""} onClick={() => setMode(test.id, "all")}>ALL</button><button className={mode === "any" ? "on" : ""} onClick={() => setMode(test.id, "any")}>ANY</button><small>ALL = 每个期望来源组都需命中</small></div>
          {error && <div className="runError"><b>ERROR · 不计入准确率</b><span>{error.message}</span>{error.retryable && <small>该错误可重试。</small>}</div>}
          {result && <div className="result">
            <div className="score"><strong>{result.metrics.score === null ? "—" : `${result.metrics.score}%`}</strong><span>{result.metrics.passed}/{result.metrics.checked} checks</span>{result.runtime?.temporalGuardApplied && <i>Temporal guard</i>}</div>
            <div className="chips">
              <span className={cls(result.metrics.retrievalHit)}>Retrieval {label(result.metrics.retrievalHit)} · {pct(result.metrics.retrievalCoverage)}</span>
              <span className={cls(result.metrics.citationHit)}>Citation {label(result.metrics.citationHit)} · {pct(result.metrics.citationCoverage)}</span>
              <span className={cls(result.metrics.answerFactHit)}>Facts {label(result.metrics.answerFactHit)} · {pct(result.metrics.factCoverage)}</span>
              <span className={cls(result.metrics.dateHit)}>Date {label(result.metrics.dateHit)}</span>
              <span className={cls(result.metrics.abstentionHit)}>Abstention {label(result.metrics.abstentionHit)}</span>
              <span className={cls(result.metrics.evidenceSupportHit ?? null)}>Evidence {label(result.metrics.evidenceSupportHit ?? null)} · {pct(result.metrics.evidenceSupportCoverage)}</span>
            </div>
            <details><summary>查看回答、引用与召回</summary><div className="detail"><pre>{result.answer}</pre><b>回答引用 {result.citations.length}</b>{result.citations.map((s, n) => <small key={`c${n}`}>{n + 1}. {s.title}{s.source ? ` · ${s.source}` : ""}</small>)}<b>独立召回 {result.retrieved.length}</b>{result.retrieved.map((s, n) => <small key={`r${n}`}>{n + 1}. {s.title}</small>)}</div></details>
          </div>}
        </article>;
      })}</div>
    </section>

    <style jsx global>{`
      .v2{min-height:100vh;background:#f7f8fb;color:#17202a;padding:0 28px 72px;font-family:"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif}.v2>header{height:64px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e7ed;max-width:1180px;margin:auto}.v2 header a{color:#5965df;text-decoration:none;font-weight:700}.v2 header b,.hero>span,.suiteHead span{font-size:11px;letter-spacing:.14em;color:#6874e5}.hero,.metrics,.suite{max-width:1180px;margin-left:auto;margin-right:auto}.hero{padding:44px 0 24px}.hero h1{font-size:34px;margin:8px 0 10px;letter-spacing:-.025em}.hero p{max-width:900px;color:#6f7986;line-height:1.65}.hero code,.suite code{background:#eef0f5;padding:2px 5px;border-radius:5px}.toolbar{display:flex;gap:9px;margin-top:18px}.toolbar select,.toolbar button,.top button,.mode button{border:1px solid #dfe3e9;background:#fff;border-radius:9px;padding:9px 13px}.toolbar button,.top button{background:#5d61df;color:#fff;border-color:#5d61df;font-weight:700}.toolbar .ghost{background:#fff;color:#48515c}.metrics{display:grid;grid-template-columns:repeat(8,1fr);gap:9px;margin-bottom:22px}.metrics article{background:#fff;border:1px solid #e2e6ed;border-radius:13px;padding:14px}.metrics small{display:block;color:#7b8490;font-size:10px}.metrics strong{display:block;font-size:21px;margin-top:9px}.suite{background:#fff;border:1px solid #e2e6ed;border-radius:18px;padding:24px}.suiteHead{display:flex;justify-content:space-between;gap:30px}.suiteHead h2{margin:5px 0;font-size:24px}.suiteHead p{max-width:560px;color:#78818c;font-size:12px;line-height:1.55}.cards{display:grid;gap:12px;margin-top:20px}.card{border:1px solid #e2e6ed;border-radius:14px;overflow:hidden}.top{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:start;padding:16px}.top em{font-style:normal;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#eef0ff;color:#5965df;font-weight:800}.top strong{font-size:15px}.top p{margin:5px 0 0;color:#64707d}.expect{display:flex;gap:8px;flex-wrap:wrap;padding:0 16px 12px}.expect span{font-size:10px;background:#f5f6f8;border-radius:999px;padding:6px 8px;color:#65707c}.mode{border-top:1px solid #edf0f4;padding:10px 16px;display:flex;align-items:center;gap:7px}.mode b,.mode small{font-size:10px;color:#78818c}.mode button{padding:5px 9px;font-size:10px}.mode button.on{background:#eef0ff;color:#505bda;border-color:#cfd4ff}.result{border-top:1px solid #e7eaf0;background:#fbfcfd;padding:16px}.score{display:flex;gap:10px;align-items:center}.score strong{font-size:24px}.score span,.score i{font-size:10px;color:#7d8792}.score i{font-style:normal;background:#eef7f2;color:#26704f;padding:4px 7px;border-radius:999px}.chips{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.chips span{font-size:10px;font-weight:700;padding:6px 8px;border-radius:999px}.chips .pass{background:#edf8f1;color:#24704c}.chips .fail{background:#fff0ed;color:#b54f42}.chips .neutral{background:#f0f2f5;color:#7e8791}.runError{border-top:1px solid #f1d7d2;background:#fff5f3;padding:14px 16px;color:#a64a3f;display:grid;gap:4px}.runError span,.runError small{font-size:11px}.result details summary{cursor:pointer;color:#5965d9;font-size:12px}.detail{display:grid;gap:7px;padding-top:12px}.detail pre{white-space:pre-wrap;font-family:inherit;line-height:1.65;margin:0 0 8px}.detail small{color:#697480}.detail b{margin-top:6px;font-size:11px}@media(max-width:1000px){.metrics{grid-template-columns:repeat(4,1fr)}}@media(max-width:650px){.v2{padding:0 14px 50px}.metrics{grid-template-columns:repeat(2,1fr)}.suiteHead{display:block}.toolbar{flex-wrap:wrap}.top{grid-template-columns:30px minmax(0,1fr)}.top>button{grid-column:2}.hero h1{font-size:28px}}
    `}</style>
  </main>;
}
