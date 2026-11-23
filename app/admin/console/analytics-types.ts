// =============================================================================
// Admin Console → Analytics: the shape of /api/admin/analytics (mirrors
// analytics_dashboard / analytics_realtime in 20261007_web_analytics.sql).
// =============================================================================

export interface Row {
  name: string;
  extra?: string;
  visitors: number;
  visits: number;
  bounces?: number;
  engaged_ms?: number;
  signups?: number;
  leads?: number;
}
export interface PageRow { name: string; visitors: number; pageviews: number; avg_engaged_ms: number; avg_scroll: number }
export interface EventRow { name: string; label: string | null; visitors: number; count: number }
export interface Totals { visitors: number; visits: number; pageviews: number; bounces: number; engaged_ms: number; signups: number; leads: number }
export type SeriesValues = Pick<Totals, 'visitors' | 'visits' | 'pageviews' | 'signups' | 'leads'>;
export interface SeriesPoint extends SeriesValues { t: string; prev: (SeriesValues & { t: string }) | null }
export interface Conversion {
  at: string;
  type: 'Signup' | 'Lead';
  props: { org_id?: string; plan?: string; heard?: string | null; form?: string; topic?: string; fleet_size?: string | null; demo?: boolean };
  consented: boolean;
  tracked: boolean;
  channel: string | null;
  source: string | null;
  referrer: string | null;
  campaign: string | null;
  entry: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  first_at: string | null;
  first_channel: string | null;
  first_source: string | null;
  first_campaign: string | null;
  first_entry: string | null;
  visits_before: number;
  pageviews_before: number;
}
export interface Dashboard {
  kpis: { current: Totals; previous: Totals };
  series: SeriesPoint[];
  channel_series?: { t: string; name: string; visitors: number }[];
  channels: Row[];
  sources: Row[];
  referrers: Row[];
  campaigns: Row[];
  pages: PageRow[];
  entry_pages: Row[];
  exit_pages: Row[];
  countries: Row[];
  regions: Row[];
  cities: Row[];
  devices: Row[];
  browsers: Row[];
  os: Row[];
  languages: Row[];
  events: EventRow[];
  funnel: { key: 'visited' | 'pricing' | 'started' | 'signed_up'; visitors: number }[];
  heatmap: { dow: number; hour: number; visitors: number }[];
  loyalty: { consented_visitors: number; returning: number };
  consent: { granted: number; denied: number };
  conversions: Conversion[];
  has_data: boolean;
  bucket: Bucket;
  orgs: Record<string, { name: string; plan: string | null; status: string | null }>;
  ignored: boolean;
}
export interface Live { visitors: number; pages: { name: string; visitors: number }[]; sources: { name: string; visitors: number }[]; countries: { name: string; visitors: number }[]; minutes: number[] }

export type Bucket = 'hour' | 'day' | 'week' | 'month';
export type Metric = 'visitors' | 'visits' | 'pageviews' | 'signups' | 'leads';
export type Filters = Record<string, string>;
