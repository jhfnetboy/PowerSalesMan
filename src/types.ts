export type CompanyType =
  | "coworking"
  | "university"
  | "software_company"
  | "agency"
  | "community"
  | "other";

export type CompanyStatus =
  | "new"
  | "enriched"
  | "scored"
  | "contacted"
  | "won"
  | "lost";

export interface SeedCompany {
  name: string;
  type: CompanyType;
  area?: string; // Nimman / Old City / Maya ...
  address?: string;
  phone?: string;
  website?: string;
  description?: string;
  /** 数据可信度 0..1(种子清单里有些条目需要后续人工核实) */
  confidence: number;
}

export interface Company extends SeedCompany {
  id: number;
  source: string;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

export interface Assessment {
  id: number;
  company_id: number;
  budget_estimate: string;
  intent_score: number; // 0..100 购买意向
  success_probability: number; // 0..100 陌拜/触达成功率预测
  recommended_channel: "call" | "visit" | "line" | "email";
  reasoning: string;
  model: string;
  created_at: string;
}

export interface ScoreResult {
  budget_estimate: string;
  intent_score: number;
  success_probability: number;
  recommended_channel: Assessment["recommended_channel"];
  reasoning: string;
}
