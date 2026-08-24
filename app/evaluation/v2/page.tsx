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
  deferred?: boolean;
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
  runtime?: {
    answerAttempts?: number;
    isolatedSession?: boolean;
    temporalGuardApplied?: boolean;
    compactFallbackUsed?: boolean;
    evidenceComposerVersion?: string;
    answerSynthesisVersion?: string;
  };
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
function rows(value: string) { return value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); }
function legacySdgInferenceCase(test: EvalCase) {
  return /\bSDG\s*\d+/i.test(`${test.name}\n${test.question}`) && /(建议分类|分类|哪些文章可能与)/i.test(`${test.name}\n${test.question}`);
}

export default function EvaluationV2Page() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [results, setResults] = useState<Record<string, EvalResult>>({});
  const [errors, setErrors] = useState<Record<string, RunError>>({});
  const [runningId, setRunningId] = useState("");
  const [runningAll, setRunningAll] = useState(false);
  const [editingId, setEditingId] = useState("");

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((data) => {
      const workspaceRows = Array.isArray(data.workspaces) ? data.workspaces.filter((x: Workspace) => x?.label && x?.slug) : [];
      setWorkspaces(workspaceRows);
      setWorkspaceSlug(workspaceRows[0]?.slug || "");
    }).catch(() => setWorkspaces([]));

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) {
        const migrated = saved.map((raw) => {
          const test = raw as EvalCase;
          const hasDeferred = Object.prototype.hasOwnProperty.call(test, "deferred");
          return { ...test, deferred: hasDeferred ? Boolean(test.deferred) : legacySdgInferenceCase(test) };
        });
        setCases(migrated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
    } catch {}
  }, []);

  function persist(next: EvalCase[]) {
    setCases(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function invalidate(id: string) {
    setResults((current) => { const next = { ...current }; delete next[id]; return next; });
    setErrors((current) => { const next = { ...current }; delete next[id]; return next; });
  }

  function updateCase(id: string, patch: Partial<EvalCase>) {
    persist(cases.map((test) => test.id === id ? { ...test, ...patch } : test));
    invalidate(id);
  }

  function setMode(id: string, mode: SourceMatchMode) {
    updateCase(id, { sourceMatchMode: mode });
  }

  async function runCase(test: EvalCase) {
    if (!workspaceSlug || test.deferred) return;
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
    const active = cases.filter((test) => !test.deferred);
    if (!workspaceSlug || !active.length) return;
    setRunningAll(true);
    for (const test of active) await runCase(test);
    setRunningAll(false);
  }

  const summary = useMemo(() => {
    const active = cases.filter((test) => !test.deferred);
    const completed = active.map((x) => results[x.id]).filter(Boolean);
    const activeErrors = active.filter((x) => errors[x.id]).length;
    const metricRate = (key: keyof EvalResult["metrics"]) => {
      const vals = completed.map((r) => r.metrics[key]).filter((v): v is boolean => typeof v === "boolean");
      return vals.length ? Math.round(vals.filter(Boolean).length / vals.length * 100) : null;
    };
    const scores = completed.map((r) => r.metrics.score).filter((v): v is number => typeof v === "number");
    return {
      active: active.length,
      deferred: cases.length - active.length,
      completed: completed.length,
      errors: activeErrors,
      average: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null,
      retrieval: metricRate("retrievalHit"),
      citation: metricRate("citationHit"),
      facts: metricRate("answerFactHit"),
      abstention: metricRate("abstentionHit"),
      evidence: metricRate("evidenceSupportHit"),
    };
  }, [cases, results, errors]);

  function downloadJson(payload: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportResults() {
    downloadJson(
      {
        exportedAt: new Date().toISOString(),
        evaluationVersion: 2,
        workspaceSlug,
        activeCaseCount: summary.active,
        deferredCaseCount: summary.deferred,
        cases,
        results,
        errors,
      },
      `xjtlu-rag-evaluation-v2-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }

  function exportSuite() {
    downloadJson(
      { exportedAt: new Date().toISOString(), benchmarkVersion: 2, cases },
      `xjtlu-rag-benchmark-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }

  return <main className="v2">
    <header><Link href="/evaluation">← Evaluation v1</Link><b>RAG EVALUATION 2.0</b></header>

    <section className="hero">
      <span>DETERMINISTIC BENCHMARK</span>
      <h1>区分检索、回答、数据覆盖与暂缓测试</h1>
      <p>当前核心 benchmark 只统计已经具备正式数据条件的测试。SDG“临时推断分类”测试自动标记为 Deferred；待每篇文章完成结构化 SDG 标签后，再改成 metadata/tag retrieval 测试并重新启用。</p>
      <div className="toolbar">
        <select value={workspaceSlug} onChange={(e) => setWorkspaceSlug(e.target.value)}>{workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.label}</option>)}</select>
        <button onClick={runAll} disabled={runningAll || !workspaceSlug || !summary.active}>{runningAll ? "运行中…" : `运行全部 ${summary.active} 条有效测试`}</button>
        <button className="ghost" onClick={exportResults} disabled={!Object.keys(results).length && !Object.keys(errors).length}>导出 v2 JSON</button>
        <button className="ghost" onClick={exportSuite} disabled={!cases.length}>导出测试集</button>
      </div>
    </section>

    <section className="metrics">
      <article><small>Completed</small><strong>{summary.completed}/{summary.active}</strong></article>
      <article><small>Deferred</small><strong>{summary.deferred}</strong></article>
      <article><small>ERROR</small><strong>{summary.errors}</strong></article>
      <article><small>Rule score</small><strong>{pct(summary.average)}</strong></article>
      <article><small>Retrieval</small><strong>{pct(summary.retrieval)}</strong></article>
      <article><small>Citation</small><strong>{pct(summary.citation)}</strong></article>
      <article><small>Facts</small><strong>{pct(summary.facts)}</strong></article>
      <article><small>Abstention</small><strong>{pct(summary.abstention)}</strong></article>
      <article><small>Evidence support</small><strong>{pct(summary.evidence)}</strong></article>
    </section>

    <section className="calibrationNote">
      <b>SDG benchmark policy</b>
      <p>当前不再用对话模型“现猜 SDG”作为正式指标。完成文章 SDG Goal/Target 结构化打标后，把测试改为“只检索带指定 SDG 标签的文章”，再取消 Deferred。这样测试的是标签过滤与检索，而不是临时分类能力。</p>
    </section>

    <section className="suite">
      <div className="suiteHead"><div><span>EXISTING TEST SUITE</span><h2>{summary.active} 条有效测试 + {summary.deferred} 条暂缓测试</h2></div><p>来源匹配默认 ALL；事实同义表达在同一行使用 <code>||</code>。Deferred 测试不会运行，也不会进入当前 Rule score。</p></div>
      <div className="cards">{cases.map((test, i) => {
        const result = results[test.id];
        const error = errors[test.id];
        const mode = test.sourceMatchMode || "all";
        const editing = editingId === test.id;
        const deferred = Boolean(test.deferred);
        return <article className={`card${deferred ? " deferred" : ""}`} key={test.id}>
          <div className="top">
            <em>{i + 1}</em>
            <div><strong>{test.name}</strong>{deferred && <i className="deferredBadge">DEFERRED · 等待结构化 SDG 标签</i>}<p>{test.question}</p></div>
            <div className="topActions">
              <button className="secondary" onClick={() => setEditingId(editing ? "" : test.id)}>{editing ? "完成编辑" : "编辑基准"}</button>
              <button onClick={() => runCase(test)} disabled={deferred || Boolean(runningId) || runningAll}>{deferred ? "暂缓" : runningId === test.id ? "运行中…" : "运行"}</button>
            </div>
          </div>

          <div className="expect">
            <span>来源：{test.expectedSourceTerms.join(" / ") || "未定义"}</span>
            <span>事实：{test.expectedAnswerTerms.join(" / ") || "未定义"}</span>
            <span>日期：{test.expectedDate || "未定义"}</span>
            <span>拒答：{test.expectAbstain ? "是" : "未要求"}</span>
          </div>

          {editing && <div className="editor">
            <label>测试名称<input value={test.name} onChange={(e) => updateCase(test.id, { name: e.target.value })} /></label>
            <label>问题<textarea value={test.question} onChange={(e) => updateCase(test.id, { question: e.target.value })} /></label>
            <label>期望来源（每行一个来源组；同义词用 ||）<textarea value={test.expectedSourceTerms.join("\n")} onChange={(e) => updateCase(test.id, { expectedSourceTerms: rows(e.target.value) })} /></label>
            <label>期望事实（每行一个事实组；同义词用 ||）<textarea value={test.expectedAnswerTerms.join("\n")} onChange={(e) => updateCase(test.id, { expectedAnswerTerms: rows(e.target.value) })} /></label>
            <div className="editorRow">
              <label>期望日期<input value={test.expectedDate} placeholder="YYYY-MM-DD 或留空" onChange={(e) => updateCase(test.id, { expectedDate: e.target.value.trim() })} /></label>
              <label className="check"><input type="checkbox" checked={test.expectAbstain} onChange={(e) => updateCase(test.id, { expectAbstain: e.target.checked })} />要求拒答</label>
              <label className="check"><input type="checkbox" checked={deferred} onChange={(e) => updateCase(test.id, { deferred: e.target.checked })} />暂缓，不计入当前 benchmark</label>
            </div>
            <small>后期完成 SDG metadata/tag 后，可把 SDG 测试问题改成标签检索问题，再取消“暂缓”。</small>
          </div>}

          <div className="mode"><b>来源规则</b><button className={mode === "all" ? "on" : ""} onClick={() => setMode(test.id, "all")}>ALL</button><button className={mode === "any" ? "on" : ""} onClick={() => setMode(test.id, "any")}>ANY</button><small>ALL = 每个期望来源组都需命中</small></div>

          {deferred && <div className="deferredNote"><b>暂缓原因</b><span>当前 SDG 测试依赖模型临时分类；产品最终方案将使用文章级结构化 SDG 标签进行过滤和检索，因此本题暂不计入当前 RAG Core 评分。</span></div>}
          {error && !deferred && <div className="runError"><b>ERROR · 不计入准确率</b><span>{error.message}</span>{error.retryable && <small>该错误可重试。</small>}</div>}

          {result && !deferred && <div className="result">
            <div className="score"><strong>{result.metrics.score === null ? "—" : `${result.metrics.score}%`}</strong><span>{result.metrics.passed}/{result.metrics.checked} checks</span>{result.runtime?.temporalGuardApplied && <i>Temporal guard</i>}{result.runtime?.compactFallbackUsed && <i>Compact fallback</i>}{result.runtime?.evidenceComposerVersion && <i>Grounding {result.runtime.evidenceComposerVersion}</i>}</div>
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
      .v2{min-height:100vh;background:#f7f8fb;color:#17202a;padding:0 28px 72px;font-family:"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif}.v2>header{height:64px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e7ed;max-width:1180px;margin:auto}.v2 header a{color:#5965df;text-decoration:none;font-weight:700}.v2 header b,.hero>span,.suiteHead span{font-size:11px;letter-spacing:.14em;color:#6874e5}.hero,.metrics,.suite,.calibrationNote{max-width:1180px;margin-left:auto;margin-right:auto}.hero{padding:44px 0 24px}.hero h1{font-size:34px;margin:8px 0 10px;letter-spacing:-.025em}.hero p{max-width:900px;color:#6f7986;line-height:1.65}.hero code,.suite code,.calibrationNote code{background:#eef0f5;padding:2px 5px;border-radius:5px}.toolbar{display:flex;gap:9px;margin-top:18px;flex-wrap:wrap}.toolbar select,.toolbar button,.top button,.mode button{border:1px solid #dfe3e9;background:#fff;border-radius:9px;padding:9px 13px}.toolbar button,.top button{background:#5d61df;color:#fff;border-color:#5d61df;font-weight:700}.toolbar button:disabled,.top button:disabled{opacity:.48;cursor:not-allowed}.toolbar .ghost,.top .secondary{background:#fff;color:#48515c;border-color:#dfe3e9}.metrics{display:grid;grid-template-columns:repeat(9,1fr);gap:9px;margin-bottom:16px}.metrics article{background:#fff;border:1px solid #e2e6ed;border-radius:13px;padding:14px}.metrics small{display:block;color:#7b8490;font-size:10px}.metrics strong{display:block;font-size:21px;margin-top:9px}.calibrationNote{box-sizing:border-box;margin-bottom:16px;background:#fffdf4;border:1px solid #eadfae;border-radius:13px;padding:14px 16px}.calibrationNote b{font-size:12px}.calibrationNote p{margin:5px 0 0;color:#786e47;font-size:12px;line-height:1.6}.suite{background:#fff;border:1px solid #e2e6ed;border-radius:18px;padding:24px}.suiteHead{display:flex;justify-content:space-between;gap:30px}.suiteHead h2{margin:5px 0;font-size:24px}.suiteHead p{max-width:560px;color:#78818c;font-size:12px;line-height:1.55}.cards{display:grid;gap:12px;margin-top:20px}.card{border:1px solid #e2e6ed;border-radius:14px;overflow:hidden}.card.deferred{border-style:dashed;background:#fffdf7}.top{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:start;padding:16px}.topActions{display:flex;gap:7px}.top em{font-style:normal;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#eef0ff;color:#5965df;font-weight:800}.top strong{font-size:15px}.top p{margin:5px 0 0;color:#64707d}.deferredBadge{display:inline-block;font-style:normal;font-size:9px;margin-left:8px;padding:4px 7px;border-radius:999px;background:#fff1c9;color:#8a6517;vertical-align:middle}.expect{display:flex;gap:8px;flex-wrap:wrap;padding:0 16px 12px}.expect span{font-size:10px;background:#f5f6f8;border-radius:999px;padding:6px 8px;color:#65707c}.editor{border-top:1px solid #edf0f4;background:#f8f9fc;padding:14px 16px;display:grid;gap:10px}.editor label{display:grid;gap:5px;font-size:10px;font-weight:700;color:#65707c}.editor input,.editor textarea{box-sizing:border-box;width:100%;border:1px solid #dfe3e9;background:#fff;border-radius:8px;padding:9px 10px;font:inherit;color:#29323d}.editor textarea{min-height:74px;resize:vertical;line-height:1.5}.editorRow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:end}.editor .check{display:flex;align-items:center;gap:7px;padding-bottom:10px;white-space:nowrap}.editor .check input{width:auto}.editor>small{font-size:10px;color:#8a7350}.mode{border-top:1px solid #edf0f4;padding:10px 16px;display:flex;align-items:center;gap:7px}.mode b,.mode small{font-size:10px;color:#78818c}.mode button{padding:5px 9px;font-size:10px}.mode button.on{background:#eef0ff;color:#505bda;border-color:#cfd4ff}.result{border-top:1px solid #e7eaf0;background:#fbfcfd;padding:16px}.score{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.score strong{font-size:24px}.score span,.score i{font-size:10px;color:#7d8792}.score i{font-style:normal;background:#eef7f2;color:#26704f;padding:4px 7px;border-radius:999px}.chips{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.chips span{font-size:10px;font-weight:700;padding:6px 8px;border-radius:999px}.chips .pass{background:#edf8f1;color:#24704c}.chips .fail{background:#fff0ed;color:#b54f42}.chips .neutral{background:#f0f2f5;color:#7e8791}.runError{border-top:1px solid #f1d7d2;background:#fff5f3;padding:14px 16px;color:#a64a3f;display:grid;gap:4px}.runError span,.runError small{font-size:11px}.deferredNote{border-top:1px solid #eadfae;background:#fffaf0;padding:13px 16px;color:#786e47;display:grid;gap:5px}.deferredNote b{font-size:11px}.deferredNote span{font-size:11px;line-height:1.6}.result details summary{cursor:pointer;color:#5965d9;font-size:12px}.detail{display:grid;gap:7px;padding-top:12px}.detail pre{white-space:pre-wrap;font-family:inherit;line-height:1.65;margin:0 0 8px}.detail small{color:#697480}.detail b{margin-top:6px;font-size:11px}@media(max-width:1100px){.metrics{grid-template-columns:repeat(5,1fr)}}@media(max-width:800px){.editorRow{grid-template-columns:1fr}.editor .check{padding-bottom:0}}@media(max-width:650px){.v2{padding:0 14px 50px}.metrics{grid-template-columns:repeat(2,1fr)}.suiteHead{display:block}.top{grid-template-columns:30px minmax(0,1fr)}.topActions{grid-column:2;flex-wrap:wrap}.hero h1{font-size:28px}}
    `}</style>
  </main>;
}
