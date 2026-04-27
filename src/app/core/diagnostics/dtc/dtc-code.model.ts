export interface DtcCode {
  code: string;
  description: string;
  category?: string;
  manufacturerSpecific?: boolean;
  source?: 'generic' | 'manufacturer' | 'unknown';
}
