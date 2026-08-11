import articlesData from "@/data/articles.json";

export type Article = {
  id: string;
  title: string;
  knowledgeBase: string;
  source: string;
  publishedDate?: string;
  sourceUrl?: string;
  category: string;
  status: "需核查截止日期" | "需核查活动日期" | "无法确定" | "长期信息";
  deadline?: string;
  eventDate?: string;
  excerpt: string;
  content: string;
};

export const articles = articlesData as Article[];

export function getArticle(id: string) {
  return articles.find(article => article.id === id);
}

export function statusTone(status: Article["status"]) {
  if (status === "需核查截止日期") return "urgent";
  if (status === "需核查活动日期") return "active";
  if (status === "长期信息") return "evergreen";
  return "unknown";
}
