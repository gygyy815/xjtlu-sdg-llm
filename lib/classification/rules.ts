import type { ArticleSummary } from "../knowledge-base/types";
import type { ContentTypeKey } from "./content-types";
import type { KnowledgeDomainKey } from "./knowledge-domains";
import {
  ACADEMIC_ORGANIZATION_UNITS,
  organizationUnitForAccount,
  type OrganizationUnitKey,
} from "./organization-units.ts";

export const CLASSIFICATION_RULE_VERSION = "taxonomy-v3-semantic-templates";

const PRIMARY_DOMAIN_BY_ORGANIZATION: Partial<
  Record<OrganizationUnitKey, KnowledgeDomainKey>
> = {
  "career-centre": "careers-opportunities",
  admissions: "admissions-study",
  "student-services": "student-services-campus-life",
  library: "library-academic-support",
  university: "university-affairs",
  "alumni-association": "alumni-community",
  "graduate-school": "admissions-study",
};

for (const organizationUnit of ACADEMIC_ORGANIZATION_UNITS) {
  PRIMARY_DOMAIN_BY_ORGANIZATION[organizationUnit] = "schools-research";
}

const SECONDARY_CAREER_PATTERNS = [
  /招聘/u,
  /实习(?:生|岗位|机会)?/u,
  /科研助理/u,
  /(?:^|\W)RA(?:\W|$)/iu,
  /奖学金/u,
  /招募/u,
  /征集(?:作品|项目|申请)/u,
  /申请机会/u,
  /call for applications?/iu,
  /internships?/iu,
  /recruit(?:ment|ing)/iu,
  /research assistants?/iu,
  /job (?:opening|opportunit)/iu,
  /vacanc(?:y|ies)/iu,
];

const SECONDARY_ADMISSIONS_PATTERNS = [
  /招生/u,
  /报考/u,
  /入学申请/u,
  /(?:本科|研究生|硕士|博士).*申请/u,
  /申请.*(?:本科|研究生|硕士|博士|专业|项目)/u,
  /admissions?/iu,
  /apply .*programme/iu,
  /programme application/iu,
];

type ScoredContentType = ContentTypeKey;
type ScoreContribution = Partial<Record<ScoredContentType, number>>;
type EvidenceDimension =
  | "opportunity"
  | "event"
  | "future"
  | "completed"
  | "procedural"
  | "administrative"
  | "editorial"
  | "ceremonial";

type EvidenceSignal = {
  id: string;
  dimension: EvidenceDimension;
  pattern: RegExp;
  title: ScoreContribution;
  digest?: ScoreContribution;
  domains?: readonly KnowledgeDomainKey[];
  organizations?: readonly OrganizationUnitKey[];
  exclude?: RegExp;
};

// Signals may support more than one type. This makes boundary cases explicit:
// an event noun is weak evidence, while future/completed/procedural/admin
// structure supplies the intent and lifecycle evidence needed for a decision.
const CONTENT_TYPE_EVIDENCE: readonly EvidenceSignal[] = [
  // V3 templates model an object together with lifecycle or reader intent.
  // These are intentionally stronger than single nouns such as 活动, 申请 or 通知.
  {
    id: "admissions-administrative-schedule",
    dimension: "administrative",
    pattern:
      /(?:录取|考试|面试|报到|注册|资格审核|材料提交).{0,18}(?:时间|日程|安排|截止|结果|名单|公示)|(?:时间|日程|安排|截止|结果|名单|公示).{0,18}(?:录取|考试|面试|报到|注册|资格审核|材料提交)/u,
    title: { notice: 9, opportunity: -2 },
    digest: { notice: 4 },
  },
  {
    id: "admissions-programme-explainer",
    dimension: "procedural",
    pattern:
      /(?:本科|研究生|硕士|博士|专业|项目|课程).{0,20}(?:详解|介绍|解读|要求|申请材料|常见问题|答疑汇总)|(?:详解|介绍|解读|要求|申请材料|常见问题|答疑汇总).{0,20}(?:本科|研究生|硕士|博士|专业|项目|课程)/u,
    title: { guide: 8, opportunity: -1 },
    digest: { guide: 4 },
    domains: ["admissions-study", "schools-research", "university-affairs"],
  },
  {
    id: "admissions-participation-event",
    dimension: "event",
    pattern:
      /(?:招生|升学|专业|项目).{0,24}(?:直播|线上宣讲|宣讲会|开放日|一对一答疑|咨询会)|(?:直播|线上宣讲|宣讲会|开放日|一对一答疑|咨询会).{0,24}(?:招生|升学|专业|项目)/u,
    title: { activity: 9, opportunity: -1 },
    digest: { activity: 4 },
    domains: ["admissions-study", "schools-research", "careers-opportunities"],
    exclude: /回顾|实录|精彩瞬间|圆满|成功举办/u,
  },
  {
    id: "admissions-open-day-event",
    dimension: "event",
    pattern: /开放日|open day/iu,
    title: { activity: 8 },
    digest: { activity: 3 },
    domains: ["admissions-study", "schools-research"],
    exclude: /回顾|实录|精彩瞬间|圆满|成功举办|这场|搬进现实/u,
  },
  {
    id: "event-notice-wrapper",
    dimension: "event",
    pattern:
      /关于(?:举办|召开|开展).{0,36}(?:讲座|论坛|会议|研讨会|工作坊|培训|开放日|宣讲会|活动).{0,8}(?:的)?通知/u,
    title: { activity: 10, notice: -2 },
    digest: { activity: 4 },
    exclude: /延期|取消|调整|变更|暂停/u,
  },
  {
    id: "career-participation-event",
    dimension: "event",
    pattern:
      /(?:升学|就业|职业|简历|面试|行业).{0,24}(?:讲座|会议|论坛|宣讲|分享会|直播|训练营)|(?:讲座|会议|论坛|宣讲|分享会|直播|训练营).{0,24}(?:升学|就业|职业|简历|面试|行业)/u,
    title: { activity: 9, opportunity: -1 },
    digest: { activity: 4 },
    domains: ["careers-opportunities", "schools-research"],
    exclude: /回顾|实录|圆满|成功举办|顺利举行/u,
  },
  {
    id: "alumni-participation-event",
    dimension: "event",
    pattern: /citywalk|homecoming|校友返校|校友聚会|校友活动邀请/iu,
    title: { activity: 8 },
    digest: { activity: 3 },
    domains: ["alumni-community"],
    exclude: /回顾|实录|圆满|成功举办/u,
  },
  {
    id: "library-participation-event",
    dimension: "event",
    pattern:
      /^(?:培训|讲座|工作坊)\s*[|丨｜:：]|(?:数据库|信息素养|检索|学术资源).{0,20}(?:培训|讲座|工作坊)/u,
    title: { activity: 9, guide: -1 },
    digest: { activity: 4 },
    domains: ["library-academic-support"],
    exclude: /回顾|实录|录播|资料|指南/u,
  },
  {
    id: "programme-application-opening",
    dimension: "opportunity",
    pattern:
      /(?:博士招生|欢迎申请|申请(?:已|现已|现正|正在|通道)?[^。；，,？?]{0,12}(?:开放(?!日)|开始|启动)|申请通道.{0,8}(?:开放|开启)|加入.{0,18}(?:团队|项目组)|join (?:the |our )?.{0,24}(?:team|programme))/iu,
    title: { opportunity: 9, activity: -1 },
    digest: { opportunity: 4 },
  },
  {
    id: "job-announcement-opportunity",
    dimension: "opportunity",
    pattern:
      /招聘.{0,28}(?:公告|通知)|(?:公告|通知).{0,28}招聘|join us.{0,28}(?:招聘|faculty|position)/iu,
    title: { opportunity: 10, notice: -2 },
    digest: { opportunity: 4 },
  },
  {
    id: "selective-programme-application",
    dimension: "opportunity",
    pattern:
      /(?:冬令营|夏令营|训练营|实训项目).{0,18}(?:申请|选拔|招募|报名通道)|(?:申请|选拔|招募|报名通道).{0,18}(?:冬令营|夏令营|训练营|实训项目)/u,
    title: { opportunity: 8, activity: 2 },
    digest: { opportunity: 4, activity: 1 },
  },
  {
    id: "explicit-event-invitation",
    dimension: "future",
    pattern:
      /活动邀约|邀你参加|邀您参加|邀您共赴|快来预约|欢迎预约|预约.{0,12}(?:答疑|参观|活动)|homecoming invitation|you(?:'re| are) invited/iu,
    title: { activity: 9, opportunity: 1 },
    digest: { activity: 4 },
  },
  {
    id: "dated-event-object",
    dimension: "future",
    pattern:
      /(?:精彩提前知|活动预告|\d{1,2}月\d{1,2}日|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))[\s\S]{0,48}(?:会议|直播|讲座|论坛|研讨|宣讲|开放日|答疑|体验课|seminar|conference|livestream)|(?:会议|直播|讲座|论坛|研讨|宣讲|开放日|答疑|体验课|seminar|conference|livestream)[\s\S]{0,48}(?:\d{1,2}月\d{1,2}日|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/iu,
    title: { activity: 9 },
    digest: { activity: 4 },
    exclude: /回顾|实录|圆满|成功举办|顺利举行/u,
  },
  {
    id: "trial-class-or-livestream",
    dimension: "event",
    pattern: /体验课|招生直播|硕士直播|livestream for|live webinar/iu,
    title: { activity: 7 },
    digest: { activity: 3 },
    exclude: /回顾|实录|录播|精彩瞬间/u,
  },
  {
    id: "service-contact-guide",
    dimension: "procedural",
    pattern:
      /(?:office hours?|办公时间).{0,24}(?:联络方式|联系方式|contact)|(?:联络方式|联系方式).{0,24}(?:office hours?|办公时间)|小程序.{0,16}(?:了解|使用|查询)|实用干货/iu,
    title: { guide: 8 },
    digest: { guide: 3 },
    exclude: /调整|变更|暂停|临时|恢复/u,
  },
  {
    id: "general-service-reminder",
    dimension: "administrative",
    pattern:
      /(?:学生证|注册章|报到|选课|缴费|材料提交|系统服务).{0,18}(?:提醒|安排|截止|调整)|(?:提醒|安排|截止|调整).{0,18}(?:学生证|注册章|报到|选课|缴费|材料提交|系统服务)/u,
    title: { notice: 8 },
    digest: { notice: 3 },
  },
  {
    id: "completed-programme-or-event",
    dimension: "completed",
    pattern:
      /顺利开班|正式开班|活动实录|跨年实录|大事记(?:回顾|盘点)|这场.{0,24}(?:搬进现实|圆满|落幕)|直播回顾|参访.{0,18}(?:公司|企业|机构)|师生参访/u,
    title: { news: 10, activity: -2 },
    digest: { news: 5 },
  },
  {
    id: "completed-series-recap",
    dimension: "completed",
    pattern: /(?:讲座|研讨会|论坛|活动|系列).{0,16}回顾/u,
    title: { news: 10, activity: -2 },
    digest: { news: 5 },
  },
  {
    id: "research-result-report",
    dimension: "completed",
    pattern:
      /研究.{0,16}(?:揭示|发现|表明)|(?:发表|发布).{0,16}(?:论文|综述|研究成果)|(?:论文|综述|研究成果).{0,16}(?:发表|刊发|发布)|project selected for .{0,24}program/iu,
    title: { news: 9 },
    digest: { news: 4 },
    domains: ["schools-research", "university-affairs"],
  },
  {
    id: "submission-or-material-call",
    dimension: "opportunity",
    pattern:
      /(?:论文|作品|素材|项目|方案).{0,12}(?:征集|征稿|征文|投稿)|(?:征集|征稿|征文|投稿).{0,12}(?:论文|作品|素材|项目|方案)/u,
    title: { opportunity: 9, activity: -1 },
    digest: { opportunity: 4 },
  },
  {
    id: "institutional-outcome-report",
    dimension: "completed",
    pattern:
      /正式(?:启航|发布|上线)|成功(?:接待|申请|入选|启动)|成为.{0,16}(?:会员|成员单位)|脱颖而出|亮相.{0,18}(?:展|双年展|博览会)|set foot at|new building|facility preview/iu,
    title: { news: 9 },
    digest: { news: 4 },
  },
  {
    id: "person-or-project-showcase",
    dimension: "editorial",
    pattern:
      /学子故事|学生故事|校友故事|导师\s*[|丨｜∣]|在读生篇|毕业生.{0,20}[：:]|毕业季特辑|国奖风采录|毕业设计项目|毕设项目|成果展示|[他她].{0,16}从西浦到|(?:alc |staff )?spotlight|来认识.{0,12}(?:老师|教授)|student stor(?:y|ies)|graduate profile/iu,
    title: { news: 9 },
    digest: { news: 4 },
  },
  {
    id: "student-growth-profile",
    dimension: "editorial",
    pattern:
      /成长心路|在西浦.{0,24}[他她].{0,30}|^[\p{Script=Han}]{2,4}[：:].{0,28}(?:offer|直博|录取|升学)|(?:暑期研学|社会实践).{0,36}(?:一线|青春|他们|纪行|记录)/iu,
    title: { news: 8 },
    digest: { news: 3 },
  },
  {
    id: "institutional-retrospective-english",
    dimension: "completed",
    pattern: /(?:two decades|20 years).{0,40}(?:prologue|future|together|journey)/iu,
    title: { news: 8 },
    digest: { news: 3 },
  },
  {
    id: "past-speaker-or-visit-report",
    dimension: "completed",
    pattern:
      /(?:院长|教授|嘉宾|学者).{0,18}(?:分享|发表见解)|成功接待|代表团|走进.{0,18}(?:产业|企业)前沿|师生.{0,8}参访/u,
    title: { news: 8 },
    digest: { news: 4 },
    domains: ["schools-research", "university-affairs"],
  },
  {
    id: "positive-holiday-or-ceremonial-other",
    dimension: "ceremonial",
    pattern:
      /节日祝福|毕业快乐|喜迎元旦|端午祝|教师节快乐|中秋节快乐|双节快乐|祝.{0,20}(?:新年|春节|元旦|端午|中秋|国庆|教师节).{0,12}(?:快乐|安康|祝福)?|happy (?:mid-autumn|(?:chinese )?new year|national day)/iu,
    title: { other: 10 },
  },
  {
    id: "positive-editorial-series-other",
    dimension: "editorial",
    pattern:
      /^(?:一书|西浦朗读者|二十四节气|老吴杂谈)\s*[|丨｜]|top\s+\d+\s+.{0,24}(?:films?|books?)\b/iu,
    title: { other: 9 },
  },
  {
    id: "positive-editorial-format-other",
    dimension: "editorial",
    pattern:
      /\d+位.{0,14}(?:专家|学者|管理学家)谈.+【转载】|投票(?:已|正式)?开启|vote now|美食.{0,18}(?:故事|记忆)/iu,
    title: { other: 9 },
  },
  {
    id: "competition-registration",
    dimension: "opportunity",
    pattern: /(?:竞赛|比赛|大赛).{0,30}(?:报名|招募|征集|申请)|(?:报名|招募|征集|申请).{0,30}(?:竞赛|比赛|大赛)/u,
    title: { opportunity: 9, activity: 1 },
    digest: { opportunity: 5, activity: 1 },
  },
  {
    id: "job-recruitment",
    dimension: "opportunity",
    pattern: /招聘|招募|岗位|职位|就业机会|校招|春招|秋招|join us|vacanc(?:y|ies)|recruit(?:ment|ing)/iu,
    title: { opportunity: 7 },
    digest: { opportunity: 4 },
  },
  {
    id: "internship-ra",
    dimension: "opportunity",
    pattern: /实习(?:生|岗位|机会)?|科研助理|(?:^|\W)RA(?:\W|$)|internships?|research assistants?/iu,
    title: { opportunity: 7 },
    digest: { opportunity: 4 },
  },
  {
    id: "scholarship-call",
    dimension: "opportunity",
    pattern: /奖学金|助学金|征集(?:作品|项目|申请)|申请机会|call for (?:applications?|papers?|proposals?)/iu,
    title: { opportunity: 6 },
    digest: { opportunity: 3 },
  },
  {
    id: "application-selection",
    dimension: "opportunity",
    pattern: /开放申请|申请开放|报名通道|申请通道|选拔|遴选|招新|纳新|征稿|征文|征集令/u,
    title: { opportunity: 6 },
    digest: { opportunity: 3 },
  },
  {
    id: "event-form",
    dimension: "event",
    pattern: /讲座|论坛|会议|研讨会|工作坊|沙龙|开放日|宣讲会|线上宣讲|分享会|交流会|训练营|培训|大师课|峰会|展览|音乐会|毕业典礼|直播|体验课|答疑活动|workshop|seminar|webinar|lecture|forum|open day|conference|masterclass|livestream/iu,
    title: { activity: 4, news: 1 },
    digest: { activity: 2, news: 1 },
  },
  {
    id: "participation-invitation",
    dimension: "future",
    pattern: /报名(?:参加|开启|开始|进行中)?|欢迎(?:报名|参加|参与|观赛)|敬请(?:参与|关注)|诚邀|邀请函|邀你(?:参加|参与)|邀您(?:参加|参与|共赴)|等你来|join us|register now/iu,
    title: { activity: 6, opportunity: 2 },
    digest: { activity: 3, opportunity: 1 },
  },
  {
    id: "future-scheduled",
    dimension: "future",
    pattern: /即将|将于|预告|活动时间|日程安排|本周(?:活动|讲座|预告)|下周(?:活动|讲座|预告)|敬请期待|save the date|upcoming/iu,
    title: { activity: 5, notice: 1 },
    digest: { activity: 3 },
  },
  {
    id: "future-calendar-date",
    dimension: "future",
    pattern: /(?:^|[|丨｜:：])\s*\d{1,2}月\d{1,2}日/u,
    title: { activity: 2, notice: 1 },
  },
  {
    id: "competition-scheduled",
    dimension: "future",
    pattern: /(?:竞赛|比赛|决赛|大赛).{0,20}(?:将于|举行|举办|开赛|观赛)|(?:将于|举行|举办|开赛).{0,20}(?:竞赛|比赛|决赛|大赛)/u,
    title: { activity: 8 },
    digest: { activity: 4 },
    exclude: /成功|圆满|顺利|回顾|落幕|收官|获奖|荣获/u,
  },
  {
    id: "completed-event",
    dimension: "completed",
    pattern: /成功举办|顺利举办|顺利举行|圆满举行|圆满举办|圆满落幕|落下帷幕|圆满收官|活动回顾|赛事回顾|精彩回顾|直播回顾|纪实|实录|回眸|大事记回顾|was held|successfully held|recap|look back/iu,
    title: { news: 10 },
    digest: { news: 5 },
  },
  {
    id: "completed-milestone",
    dimension: "completed",
    pattern: /结课|授证(?:仪式)?|颁奖(?:典礼|仪式)?|闭幕|高光时刻|年度盘点|年度回顾/u,
    title: { news: 8 },
    digest: { news: 4 },
  },
  {
    id: "achievement-result",
    dimension: "completed",
    pattern: /荣获|获奖|斩获|喜获|入选|获批|获评|获誉|夺冠|一等奖|二等奖|三等奖|特等奖|脱颖而出|榜单|成绩揭晓|has won|awarded|selected for/iu,
    title: { news: 7 },
    digest: { news: 4 },
  },
  {
    id: "institutional-development",
    dimension: "completed",
    pattern: /签约|揭牌|成立|发布会|正式启用|正式启动|正式发布|正式启航|来访|访问西浦|调研西浦|成功接待|达成合作|签署.{0,8}(?:协议|备忘录)/u,
    title: { news: 6 },
    digest: { news: 3 },
    exclude: /招聘|招募|申请|报名|征集/u,
  },
  {
    id: "procedural-guide",
    dimension: "procedural",
    pattern: /指南|攻略|操作说明|使用说明|办事流程|申请流程|办理流程|操作流程|手册|须知|一图读懂|使用方法|步骤/u,
    title: { guide: 7 },
    digest: { guide: 4 },
  },
  {
    id: "procedural-help",
    dimension: "procedural",
    pattern: /(?:^|[|丨｜:：])\s*(?:如何|怎样|怎么|FAQ|Q&A|答疑)|怎么办理|怎样申请|常见问题|答疑(?:汇总|解答)|how to|step[- ]by[- ]step/iu,
    title: { guide: 6 },
    digest: { guide: 3 },
  },
  {
    id: "tips-explainer",
    dimension: "procedural",
    pattern: /(?:^|[|丨｜:：])\s*(?:贴士|提示|必备|收藏|解读|科普)|政策解读|申请详解|项目详解|实用干货/u,
    title: { guide: 5 },
    digest: { guide: 2 },
  },
  {
    id: "administrative-title",
    dimension: "administrative",
    pattern: /(?:^|[|丨｜:：])\s*(?:关于.{0,24})?(?:通知|公告|通告|公示)|(?:通知|公告|通告|公示)(?:\s*[|丨｜:：]|$)|重要通知|紧急通知|notice|announcement/iu,
    title: { notice: 7 },
    digest: { notice: 3 },
  },
  {
    id: "administrative-change",
    dimension: "administrative",
    pattern: /截止(?:日期|时间)?|延期|调整|变更|暂停服务|恢复服务|闭馆|开放时间|系统维护|缴费|选课|注册安排|服务安排|deadline|service update/iu,
    title: { notice: 6 },
    digest: { notice: 3 },
  },
  {
    id: "administrative-reminder",
    dimension: "administrative",
    pattern: /(?:^|[|丨｜:：])\s*(?:提醒|温馨提示)|请注意|特别提醒|.{0,20}(?:办理|加盖|提交|注册).{0,12}提醒/u,
    title: { notice: 6 },
    digest: { notice: 2 },
  },
  {
    id: "administrative-result-list",
    dimension: "administrative",
    pattern: /名单(?:公布|公示|发布)|录取结果|审核结果|评审结果|结果公示/u,
    title: { notice: 5, news: 2 },
    digest: { notice: 3, news: 1 },
  },
  {
    id: "profile-interview",
    dimension: "editorial",
    pattern: /采访|访谈|专访|人物故事|校友故事|师生故事|人物志|人物专栏|profile|interview/iu,
    title: { news: 6 },
    digest: { news: 3 },
  },
  {
    id: "news-release",
    dimension: "editorial",
    pattern: /新闻|要闻|快讯|媒体聚焦|媒体报道|热点聚焦/u,
    title: { news: 6 },
    digest: { news: 2 },
  },
] as const;

const DOMAIN_PRIORS: Partial<
  Record<KnowledgeDomainKey, ScoreContribution>
> = {
  "careers-opportunities": { opportunity: 1 },
  "admissions-study": { opportunity: 1, notice: 1 },
  "student-services-campus-life": { guide: 1, notice: 1 },
  "library-academic-support": { guide: 1, notice: 1 },
  "university-affairs": { news: 1, notice: 1 },
  "schools-research": { news: 1, activity: 1 },
  "alumni-community": { news: 1, activity: 1 },
};

const ORGANIZATION_PRIORS: Partial<
  Record<OrganizationUnitKey, ScoreContribution>
> = {
  "career-centre": { opportunity: 1 },
  admissions: { opportunity: 1, notice: 1 },
  "graduate-school": { guide: 1, notice: 1 },
  library: { guide: 1 },
  "student-services": { guide: 1, notice: 1 },
  university: { news: 1, notice: 1 },
  "alumni-association": { news: 1, activity: 1 },
};

export type ContentTypeScore = {
  type: ScoredContentType;
  score: number;
  evidenceScore: number;
  priorScore: number;
  evidence: string[];
};

function matchingPatternIds(text: string, patterns: readonly RegExp[]) {
  return patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

function normalizeClassifierText(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&nbsp;", " ")
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .trim();
}

function signalApplies(
  signal: EvidenceSignal,
  organizationUnit: OrganizationUnitKey | undefined,
  domains: readonly KnowledgeDomainKey[],
) {
  if (
    signal.organizations &&
    (!organizationUnit || !signal.organizations.includes(organizationUnit))
  ) {
    return false;
  }
  return !signal.domains || signal.domains.some((domain) => domains.includes(domain));
}

function signalMatches(signal: EvidenceSignal, text: string) {
  return !signal.exclude?.test(text) && signal.pattern.test(text);
}

function addContributions(
  scores: Map<ScoredContentType, ContentTypeScore>,
  contribution: ScoreContribution | undefined,
  evidence: string,
  kind: "evidence" | "prior",
) {
  if (!contribution) return;
  for (const [type, points] of Object.entries(contribution) as Array<
    [ScoredContentType, number]
  >) {
    const score = scores.get(type);
    if (!score || points === 0) continue;
    score.score += points;
    if (kind === "evidence") score.evidenceScore += points;
    else score.priorScore += points;
    score.evidence.push(`${evidence}:${type}+${points}`);
  }
}

function scoreContentType(
  title: string,
  digest: string | undefined,
  organizationUnit: OrganizationUnitKey | undefined,
  primaryDomain: KnowledgeDomainKey | undefined,
  secondaryDomains: readonly KnowledgeDomainKey[],
) {
  const types: ScoredContentType[] = [
    "activity",
    "guide",
    "news",
    "notice",
    "opportunity",
    "other",
  ];
  const scores = new Map<ScoredContentType, ContentTypeScore>(
    types.map((type) => [
      type,
      { type, score: 0, evidenceScore: 0, priorScore: 0, evidence: [] },
    ]),
  );

  const normalizedTitle = normalizeClassifierText(title);
  const normalizedDigest = digest ? normalizeClassifierText(digest) : undefined;
  const domains = primaryDomain
    ? [primaryDomain, ...secondaryDomains]
    : [...secondaryDomains];

  for (const signal of CONTENT_TYPE_EVIDENCE) {
    if (!signalApplies(signal, organizationUnit, domains)) continue;
    if (signalMatches(signal, normalizedTitle)) {
      addContributions(
        scores,
        signal.title,
        `title:${signal.dimension}:${signal.id}`,
        "evidence",
      );
    }
    if (normalizedDigest && signalMatches(signal, normalizedDigest)) {
      addContributions(
        scores,
        signal.digest,
        `digest:${signal.dimension}:${signal.id}`,
        "evidence",
      );
    }
  }

  // Priors are deliberately gated by observed content evidence. With no title
  // or digest signal they contribute nothing and therefore cannot assign type.
  const hasObservedEvidence = [...scores.values()].some(
    ({ evidenceScore }) => evidenceScore > 0,
  );
  if (hasObservedEvidence) {
    if (primaryDomain) {
      addContributions(
        scores,
        DOMAIN_PRIORS[primaryDomain],
        `prior:domain:${primaryDomain}`,
        "prior",
      );
    }
    if (organizationUnit) {
      addContributions(
        scores,
        ORGANIZATION_PRIORS[organizationUnit],
        `prior:account:${organizationUnit}`,
        "prior",
      );
    }
  }

  return [...scores.values()].sort(
    (left, right) =>
      right.score - left.score || left.type.localeCompare(right.type, "en"),
  );
}

export type RuleClassificationResult = {
  organizationUnit?: OrganizationUnitKey;
  primaryDomain?: KnowledgeDomainKey;
  secondaryDomains: KnowledgeDomainKey[];
  contentType?: ContentTypeKey;
  contentTypeStatus: "classified" | "ambiguous" | "unresolved";
  contentTypeScores: ContentTypeScore[];
  conflicts: string[];
  evidence: string[];
  classification: {
    method: "rule";
    version: typeof CLASSIFICATION_RULE_VERSION;
  };
};

export function classifyArticleMetadata(
  article: Pick<ArticleSummary, "account" | "title" | "digest">,
): RuleClassificationResult {
  const organizationUnit = organizationUnitForAccount(article.account);
  const primaryDomain = organizationUnit
    ? PRIMARY_DOMAIN_BY_ORGANIZATION[organizationUnit]
    : undefined;
  const searchableText = normalizeClassifierText(
    `${article.title}\n${article.digest ?? ""}`,
  );
  const careerEvidence = matchingPatternIds(
    searchableText,
    SECONDARY_CAREER_PATTERNS,
  );
  const admissionsEvidence = matchingPatternIds(
    searchableText,
    SECONDARY_ADMISSIONS_PATTERNS,
  );
  const secondaryCandidates: Array<{
    domain: KnowledgeDomainKey;
    evidence: string[];
  }> = [];

  if (
    careerEvidence.length > 0 &&
    (primaryDomain === "schools-research" || primaryDomain === "alumni-community")
  ) {
    secondaryCandidates.push({
      domain: "careers-opportunities",
      evidence: careerEvidence,
    });
  }
  if (
    admissionsEvidence.length > 0 &&
    (primaryDomain === "schools-research" || primaryDomain === "university-affairs")
  ) {
    secondaryCandidates.push({
      domain: "admissions-study",
      evidence: admissionsEvidence,
    });
  }

  const conflicts: string[] = [];
  const secondaryDomains: KnowledgeDomainKey[] = [];
  const evidence =
    primaryDomain && organizationUnit
      ? [`organization:${organizationUnit}->${primaryDomain}`]
      : [];
  if (secondaryCandidates.length === 1) {
    secondaryDomains.push(secondaryCandidates[0].domain);
    evidence.push(
      `secondary:${secondaryCandidates[0].domain}:${secondaryCandidates[0].evidence.join("|")}`,
    );
  } else if (secondaryCandidates.length > 1) {
    conflicts.push(
      `secondary_domain:${secondaryCandidates.map((item) => item.domain).join("|")}`,
    );
  }

  const contentTypeScores = scoreContentType(
    article.title,
    article.digest,
    organizationUnit,
    primaryDomain,
    secondaryDomains,
  );
  const [top, second] = contentTypeScores;
  let contentType: ContentTypeKey | undefined;
  let contentTypeStatus: RuleClassificationResult["contentTypeStatus"] =
    "unresolved";
  if (top.score >= 6 && top.evidenceScore > 0) {
    if (second.score >= 6 && top.score - second.score <= 2) {
      contentTypeStatus = "ambiguous";
      conflicts.push(`content_type:${top.type}|${second.type}`);
      evidence.push(...top.evidence, ...second.evidence);
    } else {
      contentType = top.type;
      contentTypeStatus = "classified";
      evidence.push(...top.evidence);
    }
  }

  return {
    ...(organizationUnit ? { organizationUnit } : {}),
    ...(primaryDomain ? { primaryDomain } : {}),
    secondaryDomains,
    ...(contentType ? { contentType } : {}),
    contentTypeStatus,
    contentTypeScores,
    conflicts,
    evidence,
    classification: { method: "rule", version: CLASSIFICATION_RULE_VERSION },
  };
}
