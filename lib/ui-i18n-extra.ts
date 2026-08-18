const exact: Record<string, string> = {
  "页（请求": "slides (requested",
  "页） · 本次检索使用": "slides) · retrieved",
  "个来源。": "sources.",
  "本次主题已启用时效性校验。": "Validity checks are enabled for this time-sensitive topic.",
  "本次主题按一般证据规则生成。": "This topic uses the standard evidence rules.",
  "西交利物浦大学": "Xi'an Jiaotong-Liverpool University",
  "西交利物浦大学图书馆": "XJTLU Library",
  "西浦学生服务": "XJTLU Student Services",
  "生成结果": "Generated result",
  "来源证据": "Source evidence",
};

export function translateUiExtra(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return exact[trimmed] || trimmed;
}
