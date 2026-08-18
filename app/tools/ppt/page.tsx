"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClientId } from "@/lib/client-id";

type WorkspaceOption = { label: string; slug: string };

type GeneratedFile = { url: string; name: string; slides: number; sources: number };

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
    return () => urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function generate() {
    if (!topic.trim() || !workspaceSlug || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/skills/ppt", {
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
      setResult({ url, name, slides: Number(response.headers.get("X-Generated-Slides") || 0), sources: Number(response.headers.get("X-Source-Count") || 0) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PPT 生成失败。");
    } finally {
      setBusy(false);
    }
  }

  return <main className="pptPage">
    <header className="pptTop"><Link href="/">← 返回助手</Link><span>PPT SKILL · DOWNLOADABLE PPTX</span></header>
    <section className="pptHero"><span>PPT 制作</span><h1>基于知识库证据生成可下载的演示文稿</h1><p>这一版会真正生成 .pptx 文件，而不只是返回逐页文字方案。内容仍由当前 AnythingLLM Workspace 检索结果约束，缺少证据时不补写事实。</p></section>

    <section className="pptBuilder">
      <div className="builderGrid">
        <label><span>知识库</span><select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
        <label><span>内容页数量</span><input type="number" min={4} max={12} value={slideCount} onChange={(event) => setSlideCount(Math.max(4, Math.min(12, Number(event.target.value) || 7)))} /></label>
        <label><span>语言</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="zh">中文</option><option value="en">English</option><option value="bilingual">中英双语</option></select></label>
      </div>
      <label className="topicLabel"><span>汇报主题 / 要求</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：请为老师准备一份关于近期校园可持续发展活动的 7 页汇报，突出活动、部门、时间、受众与来源。" /></label>
      <button className="generateButton" disabled={!topic.trim() || !workspaceSlug || busy} onClick={generate}>{busy ? "正在检索并生成 PPT…" : "生成 PPTX"}</button>
      <p className="builderNote">默认会自动增加封面页，所以最终页数通常为“内容页 + 1”。生成后请人工核对日期、数字、名称和来源。</p>
    </section>

    {error && <section className="pptError"><strong>暂时无法生成</strong><p>{error}</p></section>}
    {result && <section className="pptResult">
      <div className="resultIcon">PPT</div>
      <div><span>GENERATED FILE</span><h2>{result.name}</h2><p>{result.slides || "—"} 页 · 本次检索返回 {result.sources || 0} 个来源。文件为标准 Open XML .pptx，可继续在 PowerPoint / WPS 中编辑。</p><a href={result.url} download={result.name}>下载 PPTX</a></div>
    </section>}

    <section className="pptTips"><div><span>1</span><strong>检索证据</strong><p>先用 AnythingLLM 在当前 Workspace 中检索。</p></div><div><span>2</span><strong>生成逐页结构</strong><p>模型只整理证据，不引入外部事实。</p></div><div><span>3</span><strong>生成 PPTX</strong><p>服务器使用现有 JSZip 依赖直接构建可编辑文件。</p></div><div><span>4</span><strong>人工复核</strong><p>正式展示前检查日期、数字、链接与措辞。</p></div></section>

    <style jsx>{`
      .pptPage{min-height:100vh;background:#f6f7fa;color:#19232d;padding:0 28px 80px}.pptTop{height:70px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e1e6eb}.pptTop a,.pptResult a{color:#5862d9;text-decoration:none;font-weight:800}.pptTop span,.pptHero>span,.pptResult>div>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.pptHero,.pptBuilder,.pptResult,.pptError,.pptTips{max-width:980px;margin-left:auto;margin-right:auto}.pptHero{margin-top:48px}.pptHero h1{font-size:34px;margin:8px 0}.pptHero p{color:#6f7a85;line-height:1.7}.pptBuilder{margin-top:22px;background:#fff;border:1px solid #e0e5eb;border-radius:18px;padding:22px}.builderGrid{display:grid;grid-template-columns:1.3fr .6fr .7fr;gap:12px}.pptBuilder label span{display:block;font-size:12px;color:#65707a;font-weight:800;margin-bottom:6px}.pptBuilder select,.pptBuilder input,.pptBuilder textarea{width:100%;border:1px solid #d9dfe7;border-radius:10px;padding:10px 11px;background:#fff;font:inherit}.topicLabel{display:block;margin-top:14px}.pptBuilder textarea{min-height:150px;resize:vertical}.generateButton{width:100%;margin-top:14px;border:0;border-radius:11px;background:#5b61e9;color:#fff;padding:12px 16px;font-weight:800;cursor:pointer}.generateButton:disabled{opacity:.45}.builderNote{font-size:11px;color:#8a949e;margin:10px 0 0;line-height:1.6}.pptError{margin-top:18px;background:#fff1f0;color:#8d4c47;border-radius:13px;padding:16px}.pptError p{margin-bottom:0}.pptResult{margin-top:18px;background:#fff;border:1px solid #dfe4eb;border-radius:18px;padding:22px;display:grid;grid-template-columns:82px minmax(0,1fr);gap:18px;align-items:center}.resultIcon{width:74px;height:74px;border-radius:18px;background:#fff0e0;color:#d06c24;display:grid;place-items:center;font-weight:900}.pptResult h2{font-size:20px;margin:5px 0}.pptResult p{color:#6c7781;line-height:1.65}.pptResult a{display:inline-block;background:#5b61e9;color:#fff;border-radius:10px;padding:9px 14px}.pptTips{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.pptTips>div{background:#fff;border:1px solid #e3e7ed;border-radius:14px;padding:16px}.pptTips span{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#eff0ff;color:#5660d3;font-weight:800;margin-bottom:9px}.pptTips strong{font-size:13px}.pptTips p{font-size:12px;color:#7a8590;line-height:1.55;margin-bottom:0}@media(max-width:760px){.builderGrid,.pptTips{grid-template-columns:1fr 1fr}.pptResult{grid-template-columns:1fr}}@media(max-width:520px){.pptPage{padding-inline:14px}.builderGrid,.pptTips{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
