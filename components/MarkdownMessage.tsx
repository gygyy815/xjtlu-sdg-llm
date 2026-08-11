import { Fragment, ReactNode } from "react";

function cleanMarkdown(value: string) {
  return value
    .replace(/(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))\s*\n?\s*\(\2\)/g, "$1")
    .replace(/(https?:\/\/[^\s)]+)\s*\n?\s*\(\1\)/g, "$1");
}

function inline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MarkdownMessage({ text }: { text: string }) {
  const lines = cleanMarkdown(text).split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`list-${blocks.length}`}>{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    list = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) { list.push(bullet[1]); return; }
    flushList();
    if (!trimmed) return;
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length + 2}` as "h3" | "h4" | "h5";
      blocks.push(<Tag key={blocks.length}>{inline(heading[2])}</Tag>);
    } else {
      blocks.push(<p key={blocks.length}>{inline(trimmed)}</p>);
    }
  });
  flushList();

  return <div className="markdownMessage">{blocks}</div>;
}
