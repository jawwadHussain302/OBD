export interface DtcCode {
  code: string;
  title: string;
  description: string;
  category?: 'Powertrain' | 'Body' | 'Chassis' | 'Network' | 'Unknown';
  subsystem?: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown';
  manufacturer?: string;
  possibleCauses?: string[];
  recommendedChecks?: string[];
  source: 'generic' | 'manufacturer' | 'unknown';
}
