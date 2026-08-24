"use client";

export type EvidenceCitation = {
  title: string;
  text?: string;
  url?: string;
  source?: string;
  publishedDate?: string;
  score?: number;
};

export type RetrievalInspectorData = {
  query: string;
  workspace: string;
  topN: number;
  threshold: number;
  intent?: string;
  sourceHint?: string;
  queries?: string[];
  retrievedCount: number;
  usedCount: number;
  results: EvidenceCitation[];
  warning?: string;
  frozenVersion?: number | string;
};

export type GroundingInspectorData = {
  version?: string;
  answerSynthesisVersion?: string;
  answerMode?: string;
  slots?: {
    id?: string;
    label?: string;
    target?: string;
    evidenceCount?: number;
  }[];
  citationCount?: number;
  compactFallbackUsed?: boolean;
  warning?: string;
} | null;

type Props = {
  citations?: EvidenceCitation[];
  retrieval?: RetrievalInspectorData;
  grounding?: GroundingInspectorData;
  lang: "zh" | "en";
};

function scoreLabel(score?: number) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  // Different AnythingLLM vector providers may expose different score semantics.
  // Keep the raw numeric score instead of pretending it is a percentage.
  const abs = Math.abs(score);
  if (abs >= 100) return score.toFixed(0);
  if (abs >= 10) return score.toFixed(1);
  if (abs >= 1) return score.toFixed(2);
  return score.toFixed(3);
}

function cleanTitle(value: string) {
  return String(value || "Knowledge-base source")
    .replace(/\.md$/i, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function excerpt(value?: string) {
  return (value || "").replace(/<document_metadata>[\s\S]*?<\/document_metadata>/gi, " ").replace(/\s+/g, " ").trim();
}

function intentLabel(intent: string | undefined, en: boolean) {
  const labels: Record<string, [string, string]> = {
    single: ["单文档问答", "Single-document"],
    aggregate: ["多文档 / 多实体", "Multi-document / multi-entity"],
    "source-filtered": ["来源限定", "Source-filtered"],
    "document-detail": ["文档详情抽取", "Document detail"],
  };
  const row = intent ? labels[intent] : undefined;
  return row ? row[en ? 1 : 0] : (intent || (en ? "General" : "通用"));
}

export function EvidenceInspector({ citations = [], retrieval, grounding, lang }: Props) {
  if (!citations.length && !retrieval) return null;

  const en = lang === "en";
  const retrieved = retrieval?.results || [];
  const slots = grounding?.slots || [];
  const queryCount = retrieval?.queries?.length || (retrieval ? 1 : 0);
  const retrievalVersion = retrieval?.frozenVersion ? `Retrieval ${retrieval.frozenVersion}` : "Retrieval";
  const groundingVersion = grounding?.version ? `Grounding ${grounding.version}` : null;
  const synthesisVersion = grounding?.answerSynthesisVersion ? `Synthesis ${grounding.answerSynthesisVersion}` : null;

  return (
    <section className="evidenceInspector" data-no-ui-translate>
      {citations.length > 0 && (
        <details className="evidenceSection">
          <summary>
            <span className="evidenceSummaryIcon">✓</span>
            <span>
              <strong>{en ? "Source evidence" : "来源证据"}</strong>
              <small>{en ? `${citations.length} source${citations.length === 1 ? "" : "s"} used in this answer` : `本次回答使用 ${citations.length} 个来源，可展开逐条核查`}</small>
            </span>
            <b>{en ? "Inspect" : "核查"}</b>
          </summary>

          <div className="evidenceCards">
            {citations.map((source, index) => {
              const score = scoreLabel(source.score);
              const text = excerpt(source.text);
              return (
                <article className="evidenceCard" key={`${source.url || source.title}-${index}`}>
                  <div className="evidenceRank">{index + 1}</div>
                  <div className="evidenceBody">
                    <div className="evidenceTitleRow">
                      <strong>{cleanTitle(source.title)}</strong>
                      {score && <span className="evidenceScore" title={en ? "Raw retrieval score returned by the knowledge-base API; scale depends on the vector provider" : "知识库 API 返回的原始检索分数；不同向量数据库的分数尺度可能不同"}>score {score}</span>}
                    </div>
                    <div className="evidenceMeta">
                      {source.source && <span>{source.source}</span>}
                      {source.publishedDate && <span>{en ? "Published" : "发布日期"}: {source.publishedDate}</span>}
                    </div>

                    {text && (
                      <details className="evidenceContext">
                        <summary>{en ? "View evidence excerpt" : "查看证据片段"}</summary>
                        <p>{text}</p>
                      </details>
                    )}

                    <div className="evidenceActions">
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">{en ? "Open original source ↗" : "查看原文 ↗"}</a>
                      ) : (
                        <span>{en ? "No original URL stored" : "知识库未保存原文链接"}</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      )}

      {retrieval && (
        <details className="evidenceSection retrievalSection">
          <summary>
            <span className="evidenceSummaryIcon retrieval">⌕</span>
            <span>
              <strong>{en ? "Retrieval inspector" : "检索过程"}</strong>
              <small>{en
                ? `${retrieval.retrievedCount} candidates → ${slots.length || "—"} evidence slots → ${retrieval.usedCount} cited sources`
                : `${retrieval.retrievedCount} 个候选 → ${slots.length || "—"} 个证据槽位 → ${retrieval.usedCount} 个回答引用`}</small>
            </span>
            <b>{en ? "Details" : "详情"}</b>
          </summary>

          <div className="retrievalBody">
            <div className="pipelineVersions">
              <span>{retrievalVersion}</span>
              {groundingVersion && <span>{groundingVersion}</span>}
              {synthesisVersion && <span>{synthesisVersion}</span>}
              {grounding?.compactFallbackUsed && <span className="pipelineWarn">Compact fallback</span>}
            </div>

            <div className="retrievalPipeline" aria-label={en ? "Retrieval pipeline" : "检索流程"}>
              <span>{en ? "Question" : "问题"}</span><i>→</i>
              <span>{intentLabel(retrieval.intent, en)}</span><i>→</i>
              <span>{en ? `${queryCount} retrieval quer${queryCount === 1 ? "y" : "ies"}` : `${queryCount} 条检索子查询`}</span><i>→</i>
              <span>{en ? `${retrieval.retrievedCount} candidates` : `${retrieval.retrievedCount} 个候选`}</span><i>→</i>
              <span>{en ? `${slots.length || 0} evidence slots` : `${slots.length || 0} 个证据槽位`}</span><i>→</i>
              <span>{en ? `${retrieval.usedCount} citations` : `${retrieval.usedCount} 个引用`}</span>
            </div>

            <dl className="retrievalFacts">
              <div><dt>{en ? "Workspace" : "知识库"}</dt><dd>{retrieval.workspace}</dd></div>
              <div><dt>{en ? "Intent" : "检索意图"}</dt><dd>{intentLabel(retrieval.intent, en)}</dd></div>
              {retrieval.sourceHint && <div><dt>{en ? "Source filter" : "来源限定"}</dt><dd>{retrieval.sourceHint}</dd></div>}
              <div><dt>{en ? "Question" : "原始问题"}</dt><dd>{retrieval.query}</dd></div>
              <div><dt>{en ? "Top N / threshold" : "Top N / 阈值"}</dt><dd>{retrieval.topN} / {retrieval.threshold}</dd></div>
            </dl>

            {retrieval.queries?.length ? (
              <details className="retrievalQueries">
                <summary>{en ? `View ${retrieval.queries.length} retrieval queries` : `查看 ${retrieval.queries.length} 条检索子查询`}</summary>
                <ol>{retrieval.queries.map((query, index) => <li key={`${query}-${index}`}>{query}</li>)}</ol>
              </details>
            ) : null}

            {slots.length ? (
              <div className="slotBlock">
                <div className="slotHeading"><strong>{en ? "Evidence slots" : "证据槽位"}</strong><small>{en ? "Evidence selected before answer synthesis" : "回答生成前实际选入的证据组"}</small></div>
                <div className="slotList">{slots.map((slot, index) => (
                  <div className="slotRow" key={slot.id || `${slot.label}-${index}`}>
                    <span>{index + 1}</span>
                    <div><strong>{slot.label || slot.target || (en ? "Evidence slot" : "证据槽位")}</strong>{slot.target && slot.label !== slot.target && <small>{slot.target}</small>}</div>
                    <b>{slot.evidenceCount ?? 0}</b>
                  </div>
                ))}</div>
              </div>
            ) : null}

            <p className="retrievalNote">{en
              ? "This panel shows the same application-side Retrieval and Evidence Composer path used to prepare the answer. Raw vector scores are displayed as returned by the provider and are not percentages. AnythingLLM agent mode may perform additional internal retrieval that is not represented here."
              : "这里展示的是本次回答实际经过的应用侧 Retrieval 与 Evidence Composer 路径。向量分数按供应商原值展示，不换算成百分比；若启用 AnythingLLM Agent 模式，Agent 内部可能还有额外检索，不在此面板中表示。"}</p>

            {(retrieval.warning || grounding?.warning) && <div className="retrievalWarning">{en ? "Pipeline warning: " : "检索提示："}{[retrieval.warning, grounding?.warning].filter(Boolean).join(" · ")}</div>}

            {retrieved.length ? (
              <details className="candidateDetails">
                <summary>{en ? `View ${retrieved.length} retrieved candidates` : `查看 ${retrieved.length} 个召回候选`}</summary>
                <div className="retrievalList">
                  {retrieved.map((item, index) => {
                    const score = scoreLabel(item.score);
                    return (
                      <div className="retrievalRow" key={`${item.url || item.title}-${index}`}>
                        <span className="retrievalIndex">{index + 1}</span>
                        <div>
                          <strong>{cleanTitle(item.title)}</strong>
                          <small>{[item.source, item.publishedDate].filter(Boolean).join(" · ") || (en ? "Knowledge-base chunk" : "知识库片段")}</small>
                        </div>
                        <b title={en ? "Raw vector API score" : "向量 API 原始分数"}>{score ? `score ${score}` : "—"}</b>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : (
              <div className="retrievalEmpty">{en ? "No retrieval candidates were returned." : "本次检索未返回可展示的候选结果。"}</div>
            )}
          </div>
        </details>
      )}

      <style jsx global>{`
        .evidenceInspector{display:grid;gap:9px;margin-top:15px;color:#353c47}.evidenceSection{border:1px solid #e2e5eb;border-radius:13px;background:#fbfcfd;overflow:hidden}.evidenceSection>summary{list-style:none;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;padding:11px 12px;cursor:pointer;user-select:none}.evidenceSection>summary::-webkit-details-marker{display:none}.evidenceSection>summary:hover{background:#f7f8fb}.evidenceSection>summary>span:nth-child(2) strong,.evidenceSection>summary>span:nth-child(2) small{display:block}.evidenceSection>summary>span:nth-child(2) strong{font-size:12.5px;color:#2a3039;font-weight:680}.evidenceSection>summary>span:nth-child(2) small{margin-top:2px;color:#838c98;font-size:10.5px}.evidenceSection>summary>b{font-size:10px;color:#6772d7;font-weight:650}.evidenceSummaryIcon{width:27px;height:27px;border-radius:8px;display:grid;place-items:center;background:#edf7f3;color:#23846d;font-size:12px;font-weight:800}.evidenceSummaryIcon.retrieval{background:#eef0ff;color:#5965dc}.evidenceCards{display:grid;gap:8px;padding:0 10px 10px}.evidenceCard{display:grid;grid-template-columns:26px minmax(0,1fr);gap:9px;padding:10px;background:#fff;border:1px solid #e6e8ed;border-radius:11px}.evidenceRank{width:23px;height:23px;border-radius:7px;display:grid;place-items:center;background:#f0f2ff;color:#5c66d7;font-size:10px;font-weight:750}.evidenceTitleRow{display:flex;align-items:flex-start;gap:8px}.evidenceTitleRow>strong{min-width:0;flex:1;color:#303641;font-size:11.5px;line-height:1.45;font-weight:650}.evidenceScore{flex:none;border-radius:999px;padding:2px 6px;background:#eef7f3;color:#267b68;font-size:9px;font-weight:700;white-space:nowrap}.evidenceMeta{display:flex;gap:7px;flex-wrap:wrap;margin-top:4px}.evidenceMeta span{font-size:9.5px;color:#7f8894}.evidenceContext{margin-top:7px;border-top:1px solid #eef0f3;padding-top:6px}.evidenceContext>summary,.retrievalQueries>summary,.candidateDetails>summary{width:max-content;max-width:100%;color:#5965ce;font-size:10px;font-weight:620;cursor:pointer}.evidenceContext p{margin:7px 0 0;padding:9px 10px;border-radius:8px;background:#f7f8fa;color:#59616d;font-size:10.5px;line-height:1.65;white-space:pre-wrap}.evidenceActions{margin-top:7px}.evidenceActions a,.evidenceActions span{font-size:10px}.evidenceActions a{color:#5260d4;text-decoration:none;font-weight:650}.evidenceActions span{color:#98a0aa}.retrievalBody{padding:0 11px 11px}.pipelineVersions{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}.pipelineVersions span{padding:4px 7px;border-radius:999px;background:#eef0ff;color:#5965d4;font-size:9px;font-weight:700}.pipelineVersions .pipelineWarn{background:#fff4df;color:#8d671f}.retrievalPipeline{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:9px;border:1px solid #e8eaf0;background:#fff;border-radius:10px}.retrievalPipeline span{padding:4px 7px;border-radius:7px;background:#f3f4f7;color:#59616c;font-size:9.5px;font-weight:620}.retrievalPipeline i{color:#abb2bd;font-style:normal;font-size:10px}.retrievalFacts{display:grid;gap:5px;margin:9px 0 0}.retrievalFacts>div{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;padding:5px 1px;border-bottom:1px solid #eef0f3}.retrievalFacts dt{color:#8b939e;font-size:9.5px}.retrievalFacts dd{margin:0;color:#555d68;font-size:10px;overflow-wrap:anywhere}.retrievalQueries{margin-top:9px;padding:8px 9px;border:1px solid #e8eaf0;border-radius:9px;background:#fff}.retrievalQueries ol{display:grid;gap:5px;margin:8px 0 0;padding-left:22px}.retrievalQueries li{color:#6b7380;font-size:9.5px;line-height:1.5;overflow-wrap:anywhere}.slotBlock{margin-top:9px}.slotHeading{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}.slotHeading strong{font-size:10.5px;color:#4d5560}.slotHeading small{color:#949ba5;font-size:9px}.slotList{display:grid;gap:5px}.slotRow{display:grid;grid-template-columns:22px minmax(0,1fr) 32px;gap:8px;align-items:center;padding:8px 7px;border:1px solid #e8eaf0;border-radius:9px;background:#fff}.slotRow>span{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#eef0ff;color:#5965d4;font-size:9px;font-weight:700}.slotRow strong,.slotRow small{display:block}.slotRow strong{color:#454c57;font-size:10px;font-weight:650}.slotRow small{margin-top:2px;color:#9299a3;font-size:9px}.slotRow>b{text-align:center;color:#267b68;font-size:10px}.retrievalNote{margin:9px 0;color:#8a929d;font-size:9.5px;line-height:1.55}.retrievalWarning{margin:8px 0;padding:8px 9px;border-radius:8px;background:#fff7e8;color:#8d671f;font-size:9.5px}.candidateDetails{margin-top:8px}.retrievalList{display:grid;gap:5px;margin-top:7px}.retrievalRow{display:grid;grid-template-columns:22px minmax(0,1fr) 74px;gap:8px;align-items:center;padding:8px 7px;background:#fff;border:1px solid #e8eaf0;border-radius:9px}.retrievalIndex{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#f2f3f6;color:#79818d;font-size:9px;font-weight:700}.retrievalRow strong,.retrievalRow small{display:block}.retrievalRow strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#404752;font-size:10.5px;font-weight:630}.retrievalRow small{margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9299a3;font-size:9px}.retrievalRow>b{text-align:right;color:#6772d4;font-size:9.5px;white-space:nowrap}.retrievalEmpty{padding:12px;text-align:center;border-radius:9px;background:#f7f8fa;color:#939ba5;font-size:10px}@media(max-width:620px){.evidenceSection>summary{grid-template-columns:28px minmax(0,1fr)}.evidenceSection>summary>b{display:none}.retrievalFacts>div{grid-template-columns:1fr}.retrievalRow{grid-template-columns:22px minmax(0,1fr) 65px}.slotHeading{display:block}.slotHeading small{display:block;margin-top:2px}}
      `}</style>
    </section>
  );
}
