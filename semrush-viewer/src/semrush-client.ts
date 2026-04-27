/** Semrush API client. Global API key auth, read-only, CSV-to-JSON shaping. */

const DEFAULT_TIMEOUT_MS = 45_000;

const SEO_BASE = "https://api.semrush.com/";
const BACKLINKS_BASE = "https://api.semrush.com/analytics/v1/";

function getApiKey(): string {
  const key = process.env.SEMRUSH_API_KEY || "";
  if (!key) {
    throw new Error("Missing SEMRUSH_API_KEY. Set it as a global env var.");
  }
  return key;
}

// Column code → human-readable field name mapping.
// Covers the codes used in our exposed reports.
const COLUMN_MAP: Record<string, string> = {
  // Domain / shared
  Dn: "domain",
  Db: "database",
  Rk: "rank",
  Or: "organic_keywords",
  Ot: "organic_traffic",
  Oc: "organic_cost",
  Ad: "adwords_keywords",
  At: "adwords_traffic",
  Ac: "adwords_cost",
  Sh: "pla_keywords",
  Sv: "pla_uniques",
  Dt: "date",
  // Keyword reports
  Ph: "keyword",
  Po: "position",
  Pp: "previous_position",
  Pd: "position_difference",
  Nq: "search_volume",
  Cp: "cpc",
  Ur: "url",
  Tr: "traffic_percent",
  Tc: "traffic_cost_percent",
  Co: "competition",
  Nr: "number_of_results",
  Td: "trends",
  Ab: "adwords_block",
  Kd: "keyword_difficulty",
  // Competitor reports
  Np: "common_keywords",
  Cr: "competition_level",
  // Backlinks
  total: "total",
  domains_num: "referring_domains",
  urls_num: "referring_urls",
  ips_num: "referring_ips",
  follows_num: "followed_backlinks",
  nofollows_num: "nofollowed_backlinks",
  texts_num: "text_backlinks",
  images_num: "image_backlinks",
  forms_num: "form_backlinks",
  frames_num: "frame_backlinks",
  // Referring domains
  domain: "domain",
  ascore: "authority_score",
  backlinks_num: "backlinks",
  ip: "ip",
  country: "country",
  first_seen: "first_seen",
  last_seen: "last_seen",
};

function humanize(code: string): string {
  return COLUMN_MAP[code] ?? code;
}

/** Parse a Semrush CSV (semicolon delimited) into an array of objects. */
function parseCsv(raw: string): Record<string, string>[] {
  const text = raw.trim();
  if (!text) return [];

  // Semrush returns errors as plain text starting with "ERROR" or "NOTHING FOUND"
  if (/^(ERROR|NOTHING FOUND)/i.test(text)) {
    if (/^NOTHING FOUND/i.test(text)) return [];
    throw new Error(`Semrush API error: ${text}`);
  }

  const lines = text.split(/\r?\n/);
  if (lines.length < 1) return [];

  const header = lines[0]!.split(";").map(humanize);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(";");
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]!] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

interface ReportOptions {
  type: string;
  export_columns: string;
  params: Record<string, string | number | undefined>;
  baseUrl?: string;
  timeoutMs?: number;
}

async function fetchReport(opts: ReportOptions): Promise<Record<string, string>[]> {
  const base = opts.baseUrl ?? SEO_BASE;
  const url = new URL(base);
  url.searchParams.set("type", opts.type);
  url.searchParams.set("key", getApiKey());
  url.searchParams.set("export_columns", opts.export_columns);
  for (const [k, v] of Object.entries(opts.params)) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await res.text();

  if (!res.ok) {
    const truncated = body.length > 500 ? body.slice(0, 500) + "..." : body;
    throw new Error(`Semrush API ${res.status}: ${truncated || res.statusText}`);
  }

  return parseCsv(body);
}

// ─── Domain reports ────────────────────────────────────────────────────────

export async function domainOverviewAll(params: {
  domain: string;
  display_limit?: number;
}) {
  return fetchReport({
    type: "domain_ranks",
    export_columns: "Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac,Sh,Sv",
    params: { domain: params.domain, display_limit: params.display_limit },
  });
}

export async function domainOverviewSingle(params: {
  domain: string;
  database: string;
}) {
  return fetchReport({
    type: "domain_rank",
    export_columns: "Dn,Rk,Or,Ot,Oc,Ad,At,Ac",
    params: { domain: params.domain, database: params.database },
  });
}

export async function domainOrganicKeywords(params: {
  domain: string;
  database: string;
  display_limit?: number;
  display_sort?: string;
  display_filter?: string;
}) {
  return fetchReport({
    type: "domain_organic",
    export_columns: "Ph,Po,Pp,Pd,Nq,Cp,Ur,Tr,Tc,Co,Nr,Td",
    params,
  });
}

export async function domainPaidKeywords(params: {
  domain: string;
  database: string;
  display_limit?: number;
  display_sort?: string;
  display_filter?: string;
}) {
  return fetchReport({
    type: "domain_adwords",
    export_columns: "Ph,Po,Pp,Pd,Ab,Nq,Cp,Tr,Tc,Co,Nr,Td",
    params,
  });
}

export async function domainOrganicCompetitors(params: {
  domain: string;
  database: string;
  display_limit?: number;
}) {
  return fetchReport({
    type: "domain_organic_organic",
    export_columns: "Dn,Cr,Np,Or,Ot,Oc,Ad",
    params,
  });
}

// ─── Keyword reports ───────────────────────────────────────────────────────

export async function keywordOverview(params: {
  phrase: string;
  database: string;
}) {
  return fetchReport({
    type: "phrase_this",
    export_columns: "Ph,Nq,Cp,Co,Nr,Td",
    params,
  });
}

export async function keywordRelated(params: {
  phrase: string;
  database: string;
  display_limit?: number;
  display_sort?: string;
  display_filter?: string;
}) {
  return fetchReport({
    type: "phrase_related",
    export_columns: "Ph,Nq,Cp,Co,Nr,Td",
    params,
  });
}

export async function keywordQuestions(params: {
  phrase: string;
  database: string;
  display_limit?: number;
}) {
  return fetchReport({
    type: "phrase_questions",
    export_columns: "Ph,Nq,Cp,Co,Nr,Td",
    params,
  });
}

// ─── Backlinks ─────────────────────────────────────────────────────────────

export async function backlinksOverview(params: {
  target: string;
  target_type: "root_domain" | "domain" | "url";
}) {
  return fetchReport({
    type: "backlinks_overview",
    export_columns: "total,domains_num,urls_num,ips_num,follows_num,nofollows_num,texts_num,images_num,forms_num,frames_num",
    params,
    baseUrl: BACKLINKS_BASE,
  });
}

export async function referringDomains(params: {
  target: string;
  target_type: "root_domain" | "domain" | "url";
  display_limit?: number;
}) {
  return fetchReport({
    type: "backlinks_refdomains",
    export_columns: "domain,ascore,backlinks_num,ip,country,first_seen,last_seen",
    params,
    baseUrl: BACKLINKS_BASE,
  });
}

// ─── API units balance ─────────────────────────────────────────────────────

export async function apiUnitsBalance(): Promise<{ units: number }> {
  const url = new URL("https://www.semrush.com/users/countapiunits.html");
  url.searchParams.set("key", getApiKey());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(`Semrush units balance ${res.status}: ${text || res.statusText}`);
  }
  const units = parseInt(text, 10);
  if (!Number.isFinite(units)) {
    throw new Error(`Unexpected units response: ${text}`);
  }
  return { units };
}
