"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function EvaluationShortcut() {
  const pathname = usePathname();
  if (pathname !== "/dashboard") return null;

  return (
    <Link className="evaluationShortcut" href="/evaluation/v2" data-no-ui-translate>
      <span>◎</span>
      <div><strong>RAG Evaluation 2.0</strong><small>Retrieval · Citation · Facts · Evidence</small></div>
      <b>→</b>
      <style jsx global>{`
        .evaluationShortcut{position:fixed;right:24px;top:88px;z-index:25;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;width:250px;padding:10px 11px;border:1px solid #dfe3ef;border-radius:12px;background:rgba(255,255,255,.96);box-shadow:0 12px 34px rgba(37,46,78,.10);text-decoration:none;color:#303744;backdrop-filter:blur(12px)}.evaluationShortcut>span{width:29px;height:29px;display:grid;place-items:center;border-radius:8px;background:#eef0ff;color:#5965dc;font-weight:800}.evaluationShortcut strong,.evaluationShortcut small{display:block}.evaluationShortcut strong{font-size:11.5px}.evaluationShortcut small{margin-top:2px;color:#858e99;font-size:8.5px}.evaluationShortcut>b{color:#6570dc}.evaluationShortcut:hover{border-color:#cbd1ec;transform:translateY(-1px);box-shadow:0 16px 38px rgba(37,46,78,.13)}@media(max-width:760px){.evaluationShortcut{position:static;width:auto;margin:12px 14px 0}}
      `}</style>
    </Link>
  );
}
