import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTENT_TYPE_DEFINITIONS,
  contentTypeCatalog,
} from "../lib/classification/content-types.ts";
import {
  KNOWLEDGE_DOMAIN_DEFINITIONS,
  knowledgeDomainCatalog,
} from "../lib/classification/knowledge-domains.ts";
import {
  ORGANIZATION_UNIT_DEFINITIONS,
  buildOrganizationAccountMap,
  organizationUnitCatalog,
  organizationUnitForAccount,
} from "../lib/classification/organization-units.ts";
import {
  ClassificationIndexRepository,
  FileSystemClassificationRepository,
} from "../lib/classification/repository.ts";
import {
  CLASSIFICATION_RULE_VERSION,
  classifyArticleMetadata,
} from "../lib/classification/rules.ts";
import type { ArticleClassificationRecord } from "../lib/classification/types.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "m6-classification-"),
);

function record(
  articleId: string,
  overrides: Partial<ArticleClassificationRecord> = {},
): ArticleClassificationRecord {
  return {
    version: 1,
    articleId,
    primaryDomain: "schools-research",
    secondaryDomains: ["careers-opportunities"],
    contentType: "opportunity",
    classifiedAt: "2026-08-18T00:00:00.000Z",
    classification: { method: "rule", version: "taxonomy-v1" },
    ...overrides,
  };
}

function classify(account: string, title: string, digest?: string) {
  return classifyArticleMetadata({ account, title, digest });
}

try {
  assert.deepEqual(
    KNOWLEDGE_DOMAIN_DEFINITIONS.map(({ key, labelZh, labelEn }) => ({
      key,
      labelZh,
      labelEn,
    })),
    [
      { key: "careers-opportunities", labelZh: "就业与机会", labelEn: "Careers & Opportunities" },
      { key: "admissions-study", labelZh: "招生与学业", labelEn: "Admissions & Study" },
      { key: "student-services-campus-life", labelZh: "学生服务与校园生活", labelEn: "Student Services & Campus Life" },
      { key: "library-academic-support", labelZh: "图书馆与学术支持", labelEn: "Library & Academic Support" },
      { key: "university-affairs", labelZh: "学校综合事务", labelEn: "University-wide Information" },
      { key: "schools-research", labelZh: "学院与科研动态", labelEn: "Schools & Research" },
      { key: "alumni-community", labelZh: "校友与社区", labelEn: "Alumni & Community" },
    ],
  );
  assert.equal(knowledgeDomainCatalog(), KNOWLEDGE_DOMAIN_DEFINITIONS);
  assert.deepEqual(
    CONTENT_TYPE_DEFINITIONS.map(({ key, labelZh }) => ({ key, labelZh })),
    [
      { key: "activity", labelZh: "活动" },
      { key: "notice", labelZh: "通知" },
      { key: "guide", labelZh: "指南" },
      { key: "opportunity", labelZh: "机会" },
      { key: "news", labelZh: "新闻" },
      { key: "other", labelZh: "其他" },
    ],
  );
  assert.equal(contentTypeCatalog(), CONTENT_TYPE_DEFINITIONS);
  assert.equal(CLASSIFICATION_RULE_VERSION, "taxonomy-v3-semantic-templates");
  assert.equal(organizationUnitCatalog(), ORGANIZATION_UNIT_DEFINITIONS);

  for (const definition of ORGANIZATION_UNIT_DEFINITIONS) {
    for (const account of definition.accounts) {
      assert.equal(
        organizationUnitForAccount(account),
        definition.key,
        `exact account mapping failed for ${account}`,
      );
    }
  }
  assert.equal(organizationUnitForAccount("西浦AI学院"), undefined);
  assert.equal(organizationUnitForAccount("不明确的机构品牌"), undefined);
  const aliasMap = buildOrganizationAccountMap([
    {
      key: "fixture-unit",
      labelZh: "测试组织",
      labelEn: "Fixture Unit",
      accounts: ["历史账号", "当前账号"],
    },
  ]);
  assert.equal(aliasMap.get("历史账号"), "fixture-unit");
  assert.equal(aliasMap.get("当前账号"), "fixture-unit");

  assert.equal(
    classify("西浦就业CareerCentre", "职业发展资讯").primaryDomain,
    "careers-opportunities",
  );
  assert.equal(
    classify("西浦招生", "本科招生信息").primaryDomain,
    "admissions-study",
  );
  assert.equal(
    classify("西浦学生服务", "学生服务安排").primaryDomain,
    "student-services-campus-life",
  );
  assert.equal(
    classify("西交利物浦大学图书馆", "数据库使用说明").primaryDomain,
    "library-academic-support",
  );
  assert.equal(
    classify("西交利物浦大学", "学校综合事务").primaryDomain,
    "university-affairs",
  );
  assert.equal(
    classify("西交利物浦大学校友会", "校友故事").primaryDomain,
    "alumni-community",
  );
  assert.equal(
    classify("西浦AI学院 AOA", "学院科研动态").primaryDomain,
    "schools-research",
  );
  assert.equal(
    classify("西交利物浦大学研究生院", "研究生信息").primaryDomain,
    "admissions-study",
  );

  const schoolRecruitment = classify(
    "西浦AI学院 AOA",
    "科研助理RA招聘",
  );
  assert.deepEqual(schoolRecruitment.secondaryDomains, [
    "careers-opportunities",
  ]);
  assert.equal(schoolRecruitment.secondaryDomains.length, 1);
  assert.deepEqual(
    classify("西交利物浦大学设计学院", "2027硕士项目招生").secondaryDomains,
    ["admissions-study"],
  );
  assert.deepEqual(
    classify("西交利物浦大学", "本科招生申请指南").secondaryDomains,
    ["admissions-study"],
  );
  assert.deepEqual(
    classify("西交利物浦大学校友会", "校友企业实习招聘").secondaryDomains,
    ["careers-opportunities"],
  );
  const secondaryConflict = classify(
    "西浦AI学院 AOA",
    "硕士项目招生与科研助理招聘",
  );
  assert.deepEqual(secondaryConflict.secondaryDomains, []);
  assert.match(secondaryConflict.conflicts.join(" "), /secondary_domain/);
  const unresolved = classify("未知机构", "一般信息");
  assert.equal(unresolved.organizationUnit, undefined);
  assert.equal(unresolved.primaryDomain, undefined);
  assert.equal(unresolved.contentType, undefined);

  assert.equal(classify("未知机构", "校园讲座欢迎参加").contentType, "activity");
  assert.equal(classify("未知机构", "重要通知：截止日期调整").contentType, "notice");
  assert.equal(classify("未知机构", "图书馆数据库使用指南").contentType, "guide");
  assert.equal(classify("未知机构", "科研助理招聘申请机会").contentType, "opportunity");
  assert.equal(classify("未知机构", "活动回顾：论坛圆满举行").contentType, "news");
  assert.equal(classify("未知机构", "无法判断的普通标题").contentType, undefined);
  assert.notEqual(classify("未知机构", "无法判断的普通标题").contentType, "other");
  assert.equal(
    classify("西交利物浦大学研究生院", "西浦研究生院节日祝福 | 仲夏逢良辰，端午祝夏安")
      .contentType,
    "other",
  );
  assert.equal(
    classify("西交利物浦大学图书馆", "西浦朗读者 | 《飞鸟集》").contentType,
    "other",
  );
  assert.equal(
    classify("西交利物浦大学数学物理学院", "数学物理学院ICON投票已开启！Pick Our Icon – Vote Now!")
      .contentType,
    "other",
  );
  assert.equal(
    classify("西浦就业CareerCentre", "没有类型证据的一般信息").contentType,
    undefined,
    "account/domain priors must never determine content type alone",
  );
  assert.equal(
    classify("西交利物浦大学", "活动预告：本周学术讲座即将举行").contentType,
    "activity",
  );
  assert.equal(
    classify("西交利物浦大学设计学院", "学院年度论坛圆满收官").contentType,
    "news",
  );
  assert.equal(
    classify("西交利物浦大学西浦国际商学院", "采访 | 教授浅谈大数据应用")
      .contentType,
    "news",
  );
  assert.equal(
    classify("西交利物浦大学研究生院", "4月19日 | IMBA上海大师课")
      .contentType,
    "activity",
  );
  assert.equal(
    classify("西浦学生服务", "新生注册办理流程与操作步骤").contentType,
    "guide",
  );
  assert.equal(
    classify("西交利物浦大学图书馆", "重要通知：暑期开放时间调整").contentType,
    "notice",
  );
  assert.equal(
    classify("未知机构", "在诚品书店，听董功讲述建筑如何唤醒场地")
      .contentType,
    undefined,
    "embedded 如何 must not be treated as a procedural guide",
  );
  const contentConflict = classify("未知机构", "招聘通知");
  assert.equal(contentConflict.contentTypeStatus, "classified");
  assert.equal(contentConflict.contentType, "opportunity");

  assert.equal(
    classify("未知机构", "创新竞赛报名并征集作品").contentType,
    "opportunity",
  );
  assert.equal(
    classify("未知机构", "决赛将在周五举行，欢迎观赛").contentType,
    "activity",
  );
  assert.equal(
    classify("未知机构", "我校团队在竞赛中荣获一等奖").contentType,
    "news",
  );

  const v3Fixtures: Array<{
    account: string;
    title: string;
    expected: "activity" | "guide" | "news" | "notice" | "opportunity";
  }> = [
    {
      account: "西交利物浦大学",
      title: "2026年西交利物浦大学本科录取时间安排",
      expected: "notice",
    },
    {
      account: "西交利物浦大学数学物理学院",
      title: "招生 | 西浦数学物理学院全日制硕士研究生项目详解",
      expected: "guide",
    },
    {
      account: "西交利物浦大学西浦国际商学院",
      title: "精彩提前知 | 6月30日西浦国际商学院就业能力与技能发展会议",
      expected: "activity",
    },
    {
      account: "西浦太仓产金融合学院",
      title: "【活动邀约】羽光掠影·燃动产金！第二届产金杯羽毛球赛邀你参加！",
      expected: "activity",
    },
    {
      account: "西浦就业CareerCentre",
      title: "升学 | 帝国理工商学院22Fall 申请已全部开放！",
      expected: "opportunity",
    },
    {
      account: "西浦智能机器人",
      title: "快来预约机器人工程本科专业线上一对一答疑活动！",
      expected: "activity",
    },
    {
      account: "西浦集萃学院",
      title: "博士招生｜多传感器融合、机器视觉、深度学习方向",
      expected: "opportunity",
    },
    {
      account: "西交利物浦大学",
      title: "获特等奖！西浦学子在教育部中国智能制造挑战赛中脱颖而出",
      expected: "news",
    },
    {
      account: "西交利物浦大学校友会",
      title: "ALA| 毕业季素材征集令",
      expected: "opportunity",
    },
    {
      account: "西交利物浦大学设计学院",
      title: "论文征集｜第三届可持续建筑与结构会议 ICSBS 2023",
      expected: "opportunity",
    },
    {
      account: "西交利物浦大学西浦国际商学院",
      title: "IBSS徐澄博士研究揭示ESG声誉风险对企业期限错配的影响",
      expected: "news",
    },
    {
      account: "西浦太仓人工智能与先进计算学院",
      title: "人工智能与先进计算学院成功接待马来西亚理工大学学术交流代表团",
      expected: "news",
    },
    {
      account: "西浦学生服务",
      title: "小站贴士丨学生证注册章加盖提醒",
      expected: "notice",
    },
    {
      account: "西浦太仓人工智能与先进计算学院",
      title: "【官宣】Office Hour 及学院其他联络方式",
      expected: "guide",
    },
    {
      account: "西浦就业CareerCentre",
      title: "西浦创业家学院（太仓） | 升学指导及简历指导讲座",
      expected: "activity",
    },
    {
      account: "西浦招生",
      title: "北京 | 2022年西交利物浦大学本科招生线上宣讲",
      expected: "activity",
    },
    {
      account: "西浦影视与创意科技学院",
      title: "想申请西浦研究生？开放日&小程序带你乘风破浪！",
      expected: "activity",
    },
    {
      account: "西浦慧湖药学院",
      title: "关于举办药物安全专题国际研讨会的通知",
      expected: "activity",
    },
    {
      account: "西交利物浦大学图书馆",
      title: "培训 | AI素养：如何了解并有效利用AI工具",
      expected: "activity",
    },
    {
      account: "西浦未来教育学院",
      title: "2025毕设项目 | 仿生钢板的离散元建模与磨损优化设计",
      expected: "news",
    },
    {
      account: "西交利物浦大学图书馆",
      title: "图书馆实用干货铺",
      expected: "guide",
    },
    {
      account: "西交利物浦大学校友会",
      title: "西浦上海校友会 | 12.24 Citywalk·全城抓捕最可爱的圣诞老人",
      expected: "activity",
    },
    {
      account: "西浦AI学院 AOA",
      title: "人工智能冬令营申请开始！解锁三大科技名企实训项目",
      expected: "opportunity",
    },
    {
      account: "西浦未来教育学院",
      title: "博士招生｜欢迎申请教育博士项目，申请通道开放中",
      expected: "opportunity",
    },
    {
      account: "西浦智能机器人",
      title: "西浦20周年校庆视觉标识系统、校庆专题网站正式发布！",
      expected: "news",
    },
    {
      account: "西浦人文社科学院HSS",
      title: "2024西浦口译大赛成功举办：探索人工智能与口笔译行业发展",
      expected: "news",
    },
    {
      account: "西浦物联网工程",
      title: "物联网学院成功申请为中国电子学会会员",
      expected: "news",
    },
    {
      account: "产业家学院与和谐管理研究中心",
      title: "Dr. Chenyang He’s Project Selected for the ESG30 Program",
      expected: "news",
    },
    {
      account: "西交利物浦大学",
      title: "超好用！西浦微信小程序带你全方位了解西浦",
      expected: "guide",
    },
    {
      account: "西交利物浦大学西浦国际商学院",
      title: "走进新能源产业前沿｜西浦国际商学院师生参访能源科技有限公司",
      expected: "news",
    },
    {
      account: "西浦影视与创意科技学院",
      title: "视频〡西浦创新实验班：36位花样少年的成长心路",
      expected: "news",
    },
    {
      account: "西浦人文社科学院HSS",
      title: "暑期研学｜当青春扎根乡土：乡村振兴一线的他们",
      expected: "news",
    },
    {
      account: "西浦物联网工程",
      title: "AIoT+X学术研讨会系列第二期回顾：当机器主动求助",
      expected: "news",
    },
    {
      account: "西浦影视与创意科技学院",
      title: "影视艺术学院助教招聘公告",
      expected: "opportunity",
    },
    {
      account: "西交利物浦大学设计学院",
      title: "致敬现代主义建筑大师 西浦设计作品亮相苏州金鸡湖双年展",
      expected: "news",
    },
  ];
  for (const fixture of v3Fixtures) {
    assert.equal(
      classify(fixture.account, fixture.title).contentType,
      fixture.expected,
      fixture.title,
    );
  }

  assert.equal(
    classify("西浦智能机器人", "2025 XJTLU Unmanned Robotics Boat Challenge (URBX)")
      .contentType,
    undefined,
    "a competition name without lifecycle or reader action must remain unresolved",
  );
  assert.equal(
    classify("西交利物浦大学智能工程学院", "智能机电系实验室参观").contentType,
    undefined,
    "a tour title without invitation or completed lifecycle needs an excerpt",
  );

  const sourceRepository = new FileSystemClassificationRepository(temporaryRoot);
  assert.equal(await sourceRepository.get("unknown"), undefined);
  const known = record("known");
  await sourceRepository.save(known);
  assert.deepEqual(await sourceRepository.get("known"), known);
  const contentOnly = record("content-only", {
    primaryDomain: undefined,
    secondaryDomains: [],
    contentType: "guide",
  });
  await sourceRepository.save(contentOnly);
  const { primaryDomain: _omittedPrimaryDomain, ...storedContentOnly } =
    contentOnly;
  assert.deepEqual(
    await sourceRepository.get("content-only"),
    storedContentOnly,
  );
  await assert.rejects(
    () =>
      sourceRepository.save(
        record("empty", {
          primaryDomain: undefined,
          secondaryDomains: [],
          contentType: undefined,
        }),
      ),
    /unsupported schema/,
  );
  await assert.rejects(
    () =>
      sourceRepository.save(
        record("too-many", {
          secondaryDomains: [
            "careers-opportunities",
            "admissions-study",
          ] as never,
        }),
      ),
    /unsupported schema/,
  );

  const malformedPath = sourceRepository.classificationPath("malformed");
  await writeFile(malformedPath, "{ broken JSON", "utf8");
  await assert.rejects(
    () => sourceRepository.get("malformed"),
    /Could not read classification/,
  );
  const missingIndex = new ClassificationIndexRepository(
    path.join(temporaryRoot, "classification", "not-generated.json"),
  );
  assert.deepEqual(await missingIndex.get("unknown"), { secondaryDomains: [] });

  await writeFile(
    path.join(temporaryRoot, "classification", "a-source.json"),
    `${JSON.stringify(record("duplicate", { contentType: "notice" }), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(temporaryRoot, "classification", "z-duplicate.json"),
    `${JSON.stringify(record("duplicate", { contentType: "news" }), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(temporaryRoot, "classification", "invalid-schema.json"),
    JSON.stringify({ version: 1, articleId: "bad", secondaryDomains: [] }),
    "utf8",
  );
  await writeFile(
    path.join(temporaryRoot, "classification", "unknown-domain.json"),
    JSON.stringify(record("unknown-domain", { primaryDomain: "unknown" as never })),
    "utf8",
  );
  await writeFile(
    path.join(temporaryRoot, "classification", "unknown-type.json"),
    JSON.stringify(record("unknown-type", { contentType: "training" as never })),
    "utf8",
  );

  const builderOutput = execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "scripts/build-classification-index.mts",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, KB_ENRICHMENT_ROOT: temporaryRoot },
    },
  );
  assert.match(builderOutput, /3 indexed; 4 malformed; 1 duplicate/);
  const indexPath = path.join(temporaryRoot, "classification", "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.deepEqual(Object.keys(index.articles), [
    "content-only",
    "duplicate",
    "known",
  ]);
  assert.deepEqual(index.articles.known, {
    primaryDomain: "schools-research",
    secondaryDomains: ["careers-opportunities"],
    contentType: "opportunity",
  });
  assert.deepEqual(index.articles["content-only"], {
    secondaryDomains: [],
    contentType: "guide",
  });
  const indexRepository = new ClassificationIndexRepository(indexPath);
  assert.deepEqual(await indexRepository.get("known"), index.articles.known);

  const builderReport = JSON.parse(
    await readFile(
      path.join(temporaryRoot, "reports", "classification", "index-build.json"),
      "utf8",
    ),
  );
  assert.match(
    builderReport.malformed.find(
      (item: { file: string }) => item.file === "unknown-domain.json",
    ).error,
    /unknown knowledge domain/,
  );
  assert.match(
    builderReport.malformed.find(
      (item: { file: string }) => item.file === "unknown-type.json",
    ).error,
    /unknown content type/,
  );

  const dryRunRoot = path.join(temporaryRoot, "dry-run");
  const dryIndexPath = path.join(temporaryRoot, "dry-index.json");
  await writeFile(
    dryIndexPath,
    JSON.stringify([
      { id: "dry-1", title: "科研助理招聘", account: "西浦AI学院 AOA", publishedAt: "2026-01-01" },
      { id: "dry-2", title: "数据库使用指南", account: "西交利物浦大学图书馆", publishedAt: "2022-01-01" },
      { id: "dry-3", title: "招聘通知", account: "未知机构" },
    ]),
    "utf8",
  );
  const dryOutput = execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "scripts/classify-articles.mts",
      "--dry-run",
      "--index",
      dryIndexPath,
      "--report-dir",
      dryRunRoot,
      "--run-id",
      "fixture",
      "--sample-size",
      "3",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.match(dryOutput, /SAFE DRY RUN: 3 metadata articles/);
  const dryReport = JSON.parse(
    await readFile(path.join(dryRunRoot, "fixture-report.json"), "utf8"),
  );
  assert.deepEqual(dryReport.safety, {
    articleBodiesRead: false,
    classificationRecordsWritten: false,
    classificationIndexReplaced: false,
    llmCalled: false,
  });
  assert.equal(dryReport.reviewSample.generated, 3);
  assert.equal(dryReport.unresolvedDiagnostics.total, 0);
  assert.equal(dryReport.unresolvedDiagnostics.digestAvailability.available, 0);
  await access(path.join(dryRunRoot, "fixture-review-sample.csv"));
  await access(path.join(dryRunRoot, "fixture-review-sample.json"));
  await access(path.join(dryRunRoot, "fixture-unresolved-sample.csv"));
  await access(path.join(dryRunRoot, "fixture-unresolved-sample.json"));
  await assert.rejects(
    () => access(path.join(dryRunRoot, "classification")),
    /ENOENT/,
  );
  const prohibitedWrite = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "scripts/classify-articles.mts",
      "--write",
      "--index",
      dryIndexPath,
      "--report-dir",
      dryRunRoot,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.notEqual(prohibitedWrite.status, 0);
  assert.match(prohibitedWrite.stderr, /intentionally unsupported/);

  console.log(
    "M6-A rule, organization, schema, index and dry-run tests passed.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
