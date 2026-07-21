import type { SeedCompany } from "../types.js";

/**
 * 清迈(Chiang Mai / CNX)科技生态种子清单。
 *
 * 原则:
 *  - 只到「机构级」。不编造联系人姓名/电话/Line —— 那些留给富集阶段人工或联网核实。
 *  - confidence = 对「这条数据本身准确度」的把握(0..1),不是购买意向。
 *  - 不确定的公司:website 留空、confidence 调低,标记待核实。
 *
 * 为什么 coworking 是头号目标:清迈的开发团队、数字游民、外包小队大量
 * 坐在这些空间里 —— 一个空间 = 一堆潜在用户,且运营方本身就是天然的
 * "介绍人",符合泰国关系型销售。
 */
export const SEED_COMPANIES: SeedCompany[] = [
  // ---- Coworking / Startup spaces(核心目标,高可信) ----
  { name: "Punspace Nimman", type: "coworking", area: "Nimman", website: "https://www.punspace.com", description: "清迈最知名的 coworking 之一,数字游民与开发者密集", confidence: 0.9 },
  { name: "Punspace Tha Phae", type: "coworking", area: "Old City", website: "https://www.punspace.com", description: "Punspace 古城店,靠近 Tha Phae Gate", confidence: 0.9 },
  { name: "Punspace Wiang Kaew", type: "coworking", area: "Old City", website: "https://www.punspace.com", description: "Punspace 古城 Wiang Kaew 店", confidence: 0.8 },
  { name: "CAMP - Creative and Startup Village", type: "coworking", area: "Maya Mall", website: "https://www.campchiangmai.com", description: "Maya 商场内 24h 空间,学生/创业者/开发者聚集", confidence: 0.85 },
  { name: "Alt_ChiangMai", type: "coworking", area: "Santitham", website: undefined, description: "开发者取向的 coworking / community 空间", confidence: 0.6 },
  { name: "Yellow Coworking Space", type: "coworking", area: "Nimman", website: "https://www.yellowcoworking.com", description: "Nimman 区 coworking + startup 活动", confidence: 0.75 },
  { name: "The Brick Startup Space", type: "coworking", area: "Nimman", website: undefined, description: "startup 取向空间,常办活动", confidence: 0.5 },
  { name: "Heartwork Coworking Space", type: "coworking", area: "Nimman", website: undefined, description: "安静型 coworking,远程工作者多", confidence: 0.6 },
  { name: "Mana Coworking", type: "coworking", area: "Old City", website: undefined, description: "古城区 coworking", confidence: 0.5 },
  { name: "Hub53 Coworking & Cafe", type: "coworking", area: "Nimman", website: undefined, description: "coworking + cafe", confidence: 0.5 },
  { name: "Wecosystem", type: "coworking", area: "Nimman", website: undefined, description: "coworking / 社群空间(待核实)", confidence: 0.4 },

  // ---- 大学 / 计算机院系(有 CS 学生 = 早期采用者 + 未来团队) ----
  { name: "Chiang Mai University - CAMT", type: "university", area: "CMU", website: "https://www.camt.cmu.ac.th", description: "College of Arts, Media and Technology,清迈大学软件工程/数字创新学院,最对口", confidence: 0.9 },
  { name: "Chiang Mai University - Faculty of Engineering (Computer Eng.)", type: "university", area: "CMU", website: "https://eng.cmu.ac.th", description: "清迈大学工程学院计算机工程系", confidence: 0.85 },
  { name: "Payap University - IT / International College", type: "university", area: "Mae Khao", website: "https://www.payap.ac.th", description: "国际化私立大学,英文授课,IT 专业", confidence: 0.8 },
  { name: "Maejo University - Information Technology", type: "university", area: "Sansai", website: "https://www.mju.ac.th", description: "แม่โจ้ 大学,信息技术相关院系", confidence: 0.75 },
  { name: "Rajamangala University of Technology Lanna (RMUTL)", type: "university", area: "Old City", website: "https://www.rmutl.ac.th", description: "技术类大学,工程与计算机相关专业", confidence: 0.8 },
  { name: "Chiang Mai Rajabhat University - Computer Science", type: "university", area: "Chang Phueak", website: "https://www.cmru.ac.th", description: "清迈皇家大学计算机科学系", confidence: 0.75 },

  // ---- 社群 / 组织(天然介绍人 + 活动触达点) ----
  { name: "Chiang Mai Entrepreneurship Association (CMEA)", type: "community", area: "Chiang Mai", website: undefined, description: "本地创业者协会,活动多,适合混脸熟", confidence: 0.55 },
  { name: "Startup Chiang Mai", type: "community", area: "Chiang Mai", website: undefined, description: "清迈 startup 社群/活动组织者", confidence: 0.5 },
  { name: "Chiang Mai Maker Club", type: "community", area: "Chiang Mai", website: undefined, description: "创客/硬件社群,含技术人群", confidence: 0.5 },
  { name: "Nomad Coffee Club Chiang Mai", type: "community", area: "Nimman", website: undefined, description: "数字游民线下聚会,大量远程开发者", confidence: 0.5 },

  // ---- 软件公司 / 外包(待核实 CNX 具体存在与规模,confidence 偏低) ----
  { name: "Codustry", type: "software_company", area: "Chiang Mai", website: undefined, description: "泰国 dev shop,是否清迈设点待核实", confidence: 0.35 },
  { name: "Wisesight (Chiang Mai office?)", type: "software_company", area: "Chiang Mai", website: undefined, description: "社媒数据公司,清迈是否有办公室待核实", confidence: 0.3 },
  { name: "Local software / web agencies (Nimman cluster)", type: "agency", area: "Nimman", website: undefined, description: "占位:Nimman 一带的小型网站/软件外包,需联网逐个补全", confidence: 0.3 },
];
