"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClientId } from "@/lib/client-id";

type WorkspaceOption = { label: string; slug: string };
type GeneratedFile = { url: string; name: string; slides: number; requestedSlides: number; sources: number; timeSensitive: boolean };

export default function PptToolPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(7);
  const [language, setLanguage] = useState("zh");
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
    }).catch(() => setError("无法读取当前 AnythingLLM Workspace。"));

    try {
      if (localStorage.getItem("xjtlu-ui-language") === "en") setLanguage("en");
    } catch {}

    return () => urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function generate() {
    if (!topic.trim() || !workspaceSlug || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/skills/ppt-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: topic.trim(), account: selected?.label || "", workspaceSlug, sessionId, slideCount, language }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "PPT 生成失败。");
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
      setError(err instanceof Error ? err.message : "PPT 生成失败。");
    } finally {
      setBusy(false);
    }
  }

  return <main className="pptPage">
    <header className="pptTop"><Link href="/">← 返回助手</Link><span>PPT SKILL · PPTXGENJS V2</span></header>
    <section className="pptHero"><span>PPT 制作</span><h1>基于知识库证据生成可下载的演示文稿</h1><p>新版先独立检索多个证据来源，再生成逐页结构，并用 PptxGenJS 输出标准 .pptx。对于“近期 / 可参加”等时效主题，会按照当前日期检查活动日期与报名截止日期，避免把已结束活动包装成当前机会。</p></section>

    <section className="pptBuilder">
      <div className="builderGrid">
        <label><span>知识库</span><select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
        <label><span>总页数（含封面与来源）</span><input type="number" min={4} max={12} value={slideCount} onChange={(event) => setSlideCount(Math.max(4, Math.min(12, Number(event.target.value) || 7)))} /></label>
        <label><span>语言</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="zh">中文</option><option value="en">English</option><option value="bilingual">中英双语</option></select></label>
      </div>
      <label className="topicLabel"><span>汇报主题 / 要求</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：近期校园活动。请只展示当前仍可参加或可明确确认有效的活动，并标注日期、地点、对象与来源。" /></label>
      <button className="generateButton" disabled={!topic.trim() || !workspaceSlug || busy} onClick={generate}>{busy ? "正在检索、校验时效并生成 PPT…" : "生成 PPTX"}</button>
      <p className="builderNote">这里填写的是最终总页数。例如输入 4，系统会生成 1 页封面 + 2 页内容 + 1 页参考来源，共 4 页，不会再额外增加页数。</p>
    </section>

    {error && <section className="pptError"><strong>暂时无法生成</strong><p>{error}</p></section>}
    {result && <section className="pptResult" data-no-ui-translate>
      <div className="resultIcon">PPT</div>
      <div><span>GENERATED FILE</span><h2>{result.name}</h2><p>{result.slides || "—"} 页（请求 {result.requestedSlides || "—"} 页） · 本次检索使用 {result.sources || 0} 个来源。{result.timeSensitive ? "本次主题已启用时效性校验。" : "本次主题按一般证据规则生成。"}</p><a href={result.url} download={result.name}>下载 PPTX</a></div>
    </section>}

    <section className="pptTips"><div><span>1</span><strong>多路检索证据</strong><p>先用 AnythingLLM Vector Search 扩大来源覆盖，避免整份 PPT 被单一文章主导。</p></div><div><span>2</span><strong>日期有效性检查</strong><p>“近期 / 可参加”主题会区分发布日期、活动日期与报名截止日期。</p></div><div><span>3</span><strong>PptxGenJS 排版</strong><p>根据内容选择项目符号、双栏、时间线或核心结论等布局。</p></div><div><span>4</span><strong>固定总页数</strong><p>封面与来源页已经包含在你填写的总页数中。</p></div></section>

    <style jsx>{`
      .pptPage{min-height:100vh;background:#f6f7fa;color:#19232d;padding:0 28px 80px}.pptTop{height:70px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e1e6eb}.pptTop a,.pptResult a{color:#5862d9;text-decoration:none;font-weight:800}.pptTop span,.pptHero>span,.pptResult>div>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.pptHero,.pptBuilder,.pptResult,.pptError,.pptTips{max-width:980px;margin-left:auto;margin-right:auto}.pptHero{margin-top:48px}.pptHero h1{font-size:34px;margin:8px 0}.pptHero p{color:#6f7a85;line-height:1.7}.pptBuilder{margin-top:22px;background:#fff;border:1px solid #e0e5eb;border-radius:18px;padding:22px}.builderGrid{display:grid;grid-template-columns:1.25fr .72fr .75fr;gap:12px}.pptBuilder label span{display:block;font-size:12px;color:#65707a;font-weight:800;margin-bottom:6px}.pptBuilder select,.pptBuilder input,.pptBuilder textarea{width:100%;border:1px solid #d9dfe7;border-radius:10px;padding:10px 11px;background:#fff;font:inherit}.topicLabel{display:block;margin-top:14px}.pptBuilder textarea{min-height:150px;resize:vertical}.generateButton{width:100%;margin-top:14px;border:0;border-radius:11px;background:#5b61e9;color:#fff;padding:12px 16px;font-weight:800;cursor:pointer}.generateButton:disabled{opacity:.45}.builderNote{font-size:11px;color:#8a949e;margin:10px 0 0;line-height:1.6}.pptError{margin-top:18px;background:#fff1f0;color:#8d4c47;border-radius:13px;padding:16px}.pptError p{margin-bottom:0}.pptResult{margin-top:18px;background:#fff;border:1px solid #dfe4eb;border-radius:18px;padding:22px;display:grid;grid-template-columns:82px minmax(0,1fr);gap:18px;align-items:center}.resultIcon{width:74px;height:74px;border-radius:18px;background:#fff0e0;color:#d06c24;display:grid;place-items:center;font-weight:900}.pptResult h2{font-size:20px;margin:5px 0}.pptResult p{color:#6c7781;line-height:1.65}.pptResult a{display:inline-block;background:#5b61e9;color:#fff;border-radius:10px;padding:9px 14px}.pptTips{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.pptTips>div{background:#fff;border:1px solid #e3e7ed;border-radius:14px;padding:16px}.pptTips span{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#eff0ff;color:#5660d3;font-weight:800;margin-bottom:9px}.pptTips strong{font-size:13px}.pptTips p{font-size:12px;color:#7a8590;line-height:1.55;margin-bottom:0}@media(max-width:760px){.builderGrid,.pptTips{grid-template-columns:1fr 1fr}.pptResult{grid-template-columns:1fr}}@media(max-width:520px){.pptPage{padding-inline:14px}.builderGrid,.pptTips{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
