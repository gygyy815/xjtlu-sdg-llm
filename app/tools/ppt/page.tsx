"use client";

import { useEffect, useRef, useState } from "react";
import { createClientId } from "@/lib/client-id";
import { useProductLanguage } from "@/lib/product-language";

type WorkspaceOption = { label: string; slug: string };
type GeneratedFile = { url: string; name: string; slides: number; requestedSlides: number; sources: number; timeSensitive: boolean };

export default function PptToolPage() {
  const { lang, t } = useProductLanguage();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(7);
  const [outputLanguage, setOutputLanguage] = useState("zh");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedFile | null>(null);
  const [sessionId] = useState(() => createClientId());
  const urls = useRef<string[]>([]);

  const selected = workspaces.find((item) => item.slug === workspaceSlug);

  useEffect(() => {
    fetch("/api/config").then((response) => response.json()).then((data) => {
      const options = Array.isArray(data.workspaces) ? data.workspaces.filter((item: WorkspaceOption) => item?.slug && item?.label) : [];
      setWorkspaces(options);
      setWorkspaceSlug(options[0]?.slug || "");
    }).catch(() => setError(t("无法读取当前 AnythingLLM Workspace。", "Unable to load the current AnythingLLM Workspace.")));

    return () => urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    setOutputLanguage((current) => current === "bilingual" ? current : lang);
  }, [lang]);

  async function generate() {
    if (!topic.trim() || !workspaceSlug || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/skills/ppt-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: topic.trim(), account: selected?.label || "", workspaceSlug, sessionId, slideCount, language: outputLanguage }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("PPT 生成失败。", "PPT generation failed."));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const name = match ? decodeURIComponent(match[1]) : "xjtlu-briefing.pptx";
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setResult({
        url,
        name,
        slides: Number(response.headers.get("X-Generated-Slides") || 0),
        requestedSlides: Number(response.headers.get("X-Requested-Slides") || slideCount),
        sources: Number(response.headers.get("X-Source-Count") || 0),
        timeSensitive: response.headers.get("X-Time-Sensitive") === "1",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("PPT 生成失败。", "PPT generation failed."));
    } finally {
      setBusy(false);
    }
  }

  return <main className="pptPage cleanPage">
    <section className="pptHero cleanPageHeader">
      <span>PPT BUILDER</span>
      <h1>{t("基于知识库证据生成可编辑演示文稿", "Build an editable presentation from knowledge-base evidence")}</h1>
      <p>{t("先检索多个证据来源，再生成逐页结构并输出标准 .pptx。对于近期活动等时效主题，会检查活动日期和报名截止日期。", "The tool retrieves multiple evidence sources, creates a slide-by-slide structure and exports a standard .pptx. For time-sensitive topics such as upcoming events, it checks event dates and registration deadlines.")}</p>
    </section>

    <section className="pptBuilder cleanCard">
      <div className="builderGrid">
        <label><span>{t("知识库", "Knowledge base")}</span><select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
        <label><span>{t("总页数", "Total slides")}</span><input type="number" min={4} max={12} value={slideCount} onChange={(event) => setSlideCount(Math.max(4, Math.min(12, Number(event.target.value) || 7)))} /></label>
        <label><span>{t("输出语言", "Output language")}</span><select value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value)}><option value="zh">中文</option><option value="en">English</option><option value="bilingual">{t("中英双语", "Bilingual")}</option></select></label>
      </div>
      <label className="topicLabel"><span>{t("汇报主题 / 要求", "Presentation topic / requirements")}</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t("例如：近期校园活动。只展示当前仍可参加或可明确确认有效的活动，并标注日期、地点、对象与来源。", "For example: upcoming campus events. Show only events that are still open or clearly valid, with date, place, audience and sources.")} /></label>
      <button className="generateButton" disabled={!topic.trim() || !workspaceSlug || busy} onClick={generate}>{busy ? t("正在检索、校验并生成 PPT…", "Retrieving, validating and generating PPT…") : t("生成 PPTX", "Generate PPTX")}</button>
      <p className="builderNote">{t("填写的是最终总页数，已经包含封面和参考来源页。", "The number above is the final total slide count, including the cover and source slides.")}</p>
    </section>

    {error && <section className="pptError"><strong>{t("暂时无法生成", "Unable to generate right now")}</strong><p>{error}</p></section>}

    {result && <section className="pptResult cleanCard">
      <div className="resultIcon">PPT</div>
      <div><span>GENERATED FILE</span><h2 data-no-ui-translate>{result.name}</h2><p>{t(
        `${result.slides || "—"} 页（请求 ${result.requestedSlides || "—"} 页） · 使用 ${result.sources || 0} 个来源。${result.timeSensitive ? "本次主题已启用时效性校验。" : "本次主题按一般证据规则生成。"}`,
        `${result.slides || "—"} slides (requested ${result.requestedSlides || "—"}) · ${result.sources || 0} sources used. ${result.timeSensitive ? "Time-sensitive validation was applied." : "Standard evidence rules were applied."}`,
      )}</p><a href={result.url} download={result.name}>{t("下载 PPTX", "Download PPTX")}</a></div>
    </section>}

    <section className="pptTips">
      <div><span>1</span><strong>{t("多路检索证据", "Retrieve multiple sources")}</strong><p>{t("先扩大来源覆盖，避免整份 PPT 被单一文章主导。", "Broaden evidence coverage so one article does not dominate the whole deck.")}</p></div>
      <div><span>2</span><strong>{t("日期有效性检查", "Check date validity")}</strong><p>{t("近期主题会区分发布日期、活动日期和报名截止日期。", "Time-sensitive topics distinguish publication dates, event dates and registration deadlines.")}</p></div>
      <div><span>3</span><strong>{t("自动选择页面布局", "Choose layouts automatically")}</strong><p>{t("根据内容选择项目符号、双栏、时间线或核心结论布局。", "Choose bullets, two-column, timeline or key-takeaway layouts based on content.")}</p></div>
      <div><span>4</span><strong>{t("固定总页数", "Respect the requested slide count")}</strong><p>{t("封面与来源页已经包含在你填写的总页数中。", "Cover and source slides are already included in the requested total.")}</p></div>
    </section>

    <style jsx>{`
      .pptBuilder{padding:22px}.builderGrid{display:grid;grid-template-columns:1.25fr .7fr .8fr;gap:12px}.pptBuilder label span{display:block;margin-bottom:6px;color:#65756d;font-size:13px;font-weight:750}.pptBuilder select,.pptBuilder input,.pptBuilder textarea{width:100%;padding:10px 11px;border:1px solid var(--ui-line);border-radius:9px;background:#fff;font:inherit}.topicLabel{display:block;margin-top:14px}.pptBuilder textarea{min-height:150px;resize:vertical}.generateButton{width:100%;min-height:44px;margin-top:14px;border:0;border-radius:9px;background:var(--ui-green);color:#fff;font-weight:800;cursor:pointer}.generateButton:disabled{opacity:.45}.builderNote{margin:10px 0 0;color:var(--ui-muted);font-size:12px}.pptError{margin-top:16px;padding:14px 16px;border-radius:10px;background:#fff3f1;color:var(--ui-danger)}.pptError p{margin-bottom:0}.pptResult{margin-top:16px;padding:20px;display:grid;grid-template-columns:82px minmax(0,1fr);gap:18px;align-items:center}.resultIcon{width:74px;height:74px;border-radius:17px;background:#fff2e5;color:#c56b29;display:grid;place-items:center;font-weight:900}.pptResult>div>span{font-size:12px;letter-spacing:.1em;color:var(--ui-green-dark);font-weight:850}.pptResult h2{margin:5px 0;font-size:20px}.pptResult p{color:var(--ui-muted);font-size:13px;line-height:1.65}.pptResult a{display:inline-block;padding:9px 13px;border-radius:9px;background:var(--ui-green);color:#fff;text-decoration:none;font-size:13px;font-weight:750}.pptTips{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.pptTips>div{padding:15px}.pptTips span{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:var(--ui-green-soft);color:var(--ui-green-dark);font-size:12px;font-weight:850;margin-bottom:9px}.pptTips strong{font-size:14px}.pptTips p{margin-bottom:0;color:var(--ui-muted);font-size:12px;line-height:1.55}@media(max-width:900px){.builderGrid,.pptTips{grid-template-columns:1fr 1fr}}@media(max-width:620px){.builderGrid,.pptTips,.pptResult{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
