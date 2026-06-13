import { http } from './http';

export interface RequirementNumberRule {
  id: number;
  enabled: boolean;
  prefix: string;
}

export interface RequirementSeqCounterItem {
  id: number;
  categoryId: number;
  reqTypeId: number;
  /** 不含 seq 的编码前缀，如 HD-RM-1001-F */
  segmentKey: string;
  categoryPath: string;
  reqTypeCode: string;
  reqTypeName: string;
  typeLetter: string;
  currentSeq: number;
  nextSeq: string;
}

export async function getNumberRule(reqType: string): Promise<RequirementNumberRule> {
  return http.get(`/req-number-rule?reqType=${encodeURIComponent(reqType)}`);
}

export async function listSeqCounters(reqType: string): Promise<RequirementSeqCounterItem[]> {
  return http.get(`/req-number-rule/counters?reqType=${encodeURIComponent(reqType)}`);
}

export async function updateNumberRule(
  reqType: string,
  input: { enabled: boolean; prefix: string }
): Promise<RequirementNumberRule> {
  return http.put(`/req-number-rule?reqType=${encodeURIComponent(reqType)}`, input);
}
