"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const KEY = "xjtlu-feedback-v1";

type Feedback = { id: string; type: string; message: string; createdAt: string };

export default function FeedbackPage() {
  const [type, setType] = useState("功能建议");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const count = useMemo(() => {
    try { const parsed = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(parsed) ? parsed.length : 0; } catch { return 0; }
  }, [saved]);

  function submit() {
    if (!message.trim()) return;
    let list: Feedback[] = [];
    try { const parsed = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(parsed)) list = parsed; } catch {}
    list.unshift({ id: `feedback-${Date.now()}`, type, message: message.trim(), createdAt: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(list));
    setMessage(""); setSaved((v) => !v);
  }

  function exportFeedback() {
    const text = localStorage.getItem(KEY) || "[]";
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "xjtlu-feedback.json"; a.click(); URL.revokeObjectURL(url);
  }

  return <main className="feedbackPage">
    <header><Link href="/">← 返回助手</Link><span>FEEDBACK · {count} 条本地记录</span></header>
    <section className="feedbackHero"><span>反馈与建议</span><h1>记录问题、需求和演示反馈</h1><p>当前 Beta 版先保存在浏览器本地，便于演示期间快速收集；后续可以接 GitHub Issues、数据库或校内表单。</p></section>
    <section className="feedbackCard">
      <label>反馈类型<select value={type} onChange={(e) => setType(e.target.value)}><option>功能建议</option><option>知识库问题</option><option>回答质量</option><option>界面体验</option><option>Bug</option></select></label>
      <label>具体内容<textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例如：知识图谱全屏后希望支持按活动类型筛选…" /></label>
      <div className="feedbackActions"><button disabled={!message.trim()} onClick={submit}>保存反馈</button><button className="secondary" onClick={exportFeedback}>导出 JSON</button></div>
    </section>
    <section className="feedbackTips"><strong>建议记录的信息</strong><p>问题发生页面、所选知识库、所用技能、期望结果、实际结果；若是错误，再附 PowerShell 日志截图。</p></section>
    <style jsx>{`
      .feedbackPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.feedbackPage header{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.feedbackPage header a{color:#5965d8;text-decoration:none;font-weight:700}.feedbackPage header span,.feedbackHero>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.feedbackHero,.feedbackCard,.feedbackTips{max-width:820px;margin-left:auto;margin-right:auto}.feedbackHero{margin-top:54px}.feedbackHero h1{font-size:34px;margin:9px 0}.feedbackHero p,.feedbackTips p{color:#6f7a85;line-height:1.7}.feedbackCard,.feedbackTips{margin-top:22px;background:#fff;border:1px solid #e1e6ec;border-radius:16px;padding:24px}.feedbackCard label{display:block;font-size:13px;font-weight:700;margin-bottom:16px}.feedbackCard select,.feedbackCard textarea{display:block;width:100%;max-width:none;margin-top:7px;border:1px solid #d9dfe7;border-radius:11px;padding:11px 12px;background:white;font:inherit}.feedbackCard textarea{min-height:180px;resize:vertical}.feedbackActions{display:flex;gap:10px}.feedbackActions button{border:0;border-radius:10px;background:#5b61e9;color:#fff;padding:10px 16px;font-weight:700;cursor:pointer}.feedbackActions button:disabled{opacity:.45}.feedbackActions .secondary{background:#f1f2f7;color:#4d5965}.feedbackTips strong{display:block;margin-bottom:5px}
    `}</style>
  </main>;
}
