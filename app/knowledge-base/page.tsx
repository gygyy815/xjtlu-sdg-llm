import Link from "next/link";

export default function KnowledgeBasePage() {
  return <main style={{maxWidth:960,margin:"0 auto",padding:"40px 24px 80px",fontFamily:'Inter,"Microsoft YaHei",sans-serif'}}>
    <Link href="/" style={{color:"#5369ef",textDecoration:"none"}}>← 返回助手</Link>
    <p style={{marginTop:36,color:"#6071dd",fontWeight:800,letterSpacing:".12em",fontSize:12}}>KNOWLEDGE BASE</p>
    <h1>服务器文章仓库</h1>
    <p style={{color:"#667680",lineHeight:1.8}}>当前数据链路不依赖 Obsidian。Phase 1 使用服务器目录 + SQLite 状态库管理新增、更新、重复与失败文章；AnythingLLM 增量导入属于下一阶段。</p>
    <section style={{marginTop:28,padding:24,border:"1px solid #dfe6ef",borderRadius:16,background:"#fff"}}>
      <h2 style={{marginTop:0}}>Phase 1 已加入仓库</h2>
      <pre style={{whiteSpace:"pre-wrap",lineHeight:1.8,background:"#f7f9fb",padding:16,borderRadius:10}}>{`/mnt/sdd/xjtlu-content/\n├── incoming/\n├── raw/\n├── processed/\n├── assets/\n├── state/articles.db\n├── logs/\n└── failed/`}</pre>
      <p>服务器执行：</p>
      <pre style={{whiteSpace:"pre-wrap",lineHeight:1.8,background:"#f7f9fb",padding:16,borderRadius:10}}>{`npm run sync:server:init\nnpm run sync:server\nnpm run sync:server:status`}</pre>
      <p style={{color:"#7a8791"}}>正式同步看板与 AnythingLLM 自动导入将在 Phase 2 接入。当前页面用于确认新的数据架构与服务器命令。</p>
    </section>
  </main>;
}
