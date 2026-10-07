// =============================================================================
// Visit classification — where a visit came from, and on what.
// =============================================================================
// Server-only. Turns the raw referrer + landing-page campaign parameters into a
// named SOURCE ("Google", "ChatGPT", "LinkedIn", "newsletter") and a CHANNEL
// (the bucket it belongs to), and a user-agent into device / browser / OS.
//
// Channel rules follow GA4's default channel grouping, so numbers line up with
// what marketing people expect, plus an "AI Assistants" channel — ChatGPT,
// Perplexity, Claude, Gemini and Copilot now send real traffic and would
// otherwise hide inside "Referral".
// =============================================================================

export type Channel =
  | 'Direct'
  | 'Organic Search'
  | 'Paid Search'
  | 'AI Assistants'
  | 'Organic Social'
  | 'Paid Social'
  | 'Email'
  | 'Referral'
  | 'Display'
  | 'Video'
  | 'Affiliate'
  | 'Other';

type Kind = 'search' | 'social' | 'ai' | 'email' | 'video';

interface KnownSite {
  name: string;
  kind: Kind;
}

/** Host suffix → source. Matched against the referrer host and its parents. */
const KNOWN_HOSTS: Record<string, KnownSite> = {
  // AI assistants (before search: gemini.google.com must not read as Google).
  'chatgpt.com': { name: 'ChatGPT', kind: 'ai' },
  'chat.openai.com': { name: 'ChatGPT', kind: 'ai' },
  'openai.com': { name: 'ChatGPT', kind: 'ai' },
  'perplexity.ai': { name: 'Perplexity', kind: 'ai' },
  'claude.ai': { name: 'Claude', kind: 'ai' },
  'gemini.google.com': { name: 'Gemini', kind: 'ai' },
  'bard.google.com': { name: 'Gemini', kind: 'ai' },
  'copilot.microsoft.com': { name: 'Copilot', kind: 'ai' },
  'copilot.cloud.microsoft': { name: 'Copilot', kind: 'ai' },
  'edgeservices.bing.com': { name: 'Copilot', kind: 'ai' },
  'meta.ai': { name: 'Meta AI', kind: 'ai' },
  'deepseek.com': { name: 'DeepSeek', kind: 'ai' },
  'grok.com': { name: 'Grok', kind: 'ai' },
  'chat.mistral.ai': { name: 'Mistral', kind: 'ai' },
  'poe.com': { name: 'Poe', kind: 'ai' },
  'you.com': { name: 'You.com', kind: 'ai' },
  'phind.com': { name: 'Phind', kind: 'ai' },
  // Search engines.
  'google': { name: 'Google', kind: 'search' }, // any google.<tld>, see hostSite()
  'bing.com': { name: 'Bing', kind: 'search' },
  'duckduckgo.com': { name: 'DuckDuckGo', kind: 'search' },
  'yahoo.com': { name: 'Yahoo', kind: 'search' },
  'yandex.ru': { name: 'Yandex', kind: 'search' },
  'yandex.com': { name: 'Yandex', kind: 'search' },
  'baidu.com': { name: 'Baidu', kind: 'search' },
  'ecosia.org': { name: 'Ecosia', kind: 'search' },
  'search.brave.com': { name: 'Brave Search', kind: 'search' },
  'startpage.com': { name: 'Startpage', kind: 'search' },
  'qwant.com': { name: 'Qwant', kind: 'search' },
  'kagi.com': { name: 'Kagi', kind: 'search' },
  'naver.com': { name: 'Naver', kind: 'search' },
  'seznam.cz': { name: 'Seznam', kind: 'search' },
  'aol.com': { name: 'AOL', kind: 'search' },
  'ask.com': { name: 'Ask', kind: 'search' },
  'mojeek.com': { name: 'Mojeek', kind: 'search' },
  // Email (webmail).
  'mail.google.com': { name: 'Gmail', kind: 'email' },
  'outlook.live.com': { name: 'Outlook', kind: 'email' },
  'outlook.office.com': { name: 'Outlook', kind: 'email' },
  'outlook.office365.com': { name: 'Outlook', kind: 'email' },
  'mail.yahoo.com': { name: 'Yahoo Mail', kind: 'email' },
  'mail.proton.me': { name: 'Proton Mail', kind: 'email' },
  // Video.
  'youtube.com': { name: 'YouTube', kind: 'video' },
  'youtu.be': { name: 'YouTube', kind: 'video' },
  'vimeo.com': { name: 'Vimeo', kind: 'video' },
  'twitch.tv': { name: 'Twitch', kind: 'video' },
  // Social.
  'facebook.com': { name: 'Facebook', kind: 'social' },
  'fb.com': { name: 'Facebook', kind: 'social' },
  'fb.me': { name: 'Facebook', kind: 'social' },
  'messenger.com': { name: 'Messenger', kind: 'social' },
  'instagram.com': { name: 'Instagram', kind: 'social' },
  'threads.net': { name: 'Threads', kind: 'social' },
  'threads.com': { name: 'Threads', kind: 'social' },
  'linkedin.com': { name: 'LinkedIn', kind: 'social' },
  'lnkd.in': { name: 'LinkedIn', kind: 'social' },
  'x.com': { name: 'X (Twitter)', kind: 'social' },
  'twitter.com': { name: 'X (Twitter)', kind: 'social' },
  't.co': { name: 'X (Twitter)', kind: 'social' },
  'reddit.com': { name: 'Reddit', kind: 'social' },
  'tiktok.com': { name: 'TikTok', kind: 'social' },
  'pinterest.com': { name: 'Pinterest', kind: 'social' },
  'bsky.app': { name: 'Bluesky', kind: 'social' },
  'quora.com': { name: 'Quora', kind: 'social' },
  'whatsapp.com': { name: 'WhatsApp', kind: 'social' },
  'wa.me': { name: 'WhatsApp', kind: 'social' },
  'l.wl.co': { name: 'WhatsApp', kind: 'social' },
  't.me': { name: 'Telegram', kind: 'social' },
  'telegram.org': { name: 'Telegram', kind: 'social' },
  'discord.com': { name: 'Discord', kind: 'social' },
  'news.ycombinator.com': { name: 'Hacker News', kind: 'social' },
  'producthunt.com': { name: 'Product Hunt', kind: 'social' },
  'tumblr.com': { name: 'Tumblr', kind: 'social' },
  'vk.com': { name: 'VK', kind: 'social' },
  'snapchat.com': { name: 'Snapchat', kind: 'social' },
};

/** android-app://<package> referrers (links opened from Android apps). */
const ANDROID_APPS: Record<string, KnownSite> = {
  'com.google.android.gm': { name: 'Gmail', kind: 'email' },
  'com.google.android.googlequicksearchbox': { name: 'Google', kind: 'search' },
  'com.google.android.youtube': { name: 'YouTube', kind: 'video' },
  'com.microsoft.office.outlook': { name: 'Outlook', kind: 'email' },
  'com.facebook.katana': { name: 'Facebook', kind: 'social' },
  'com.facebook.orca': { name: 'Messenger', kind: 'social' },
  'com.instagram.android': { name: 'Instagram', kind: 'social' },
  'com.linkedin.android': { name: 'LinkedIn', kind: 'social' },
  'com.twitter.android': { name: 'X (Twitter)', kind: 'social' },
  'com.reddit.frontpage': { name: 'Reddit', kind: 'social' },
  'com.whatsapp': { name: 'WhatsApp', kind: 'social' },
  'org.telegram.messenger': { name: 'Telegram', kind: 'social' },
  'com.slack': { name: 'Slack', kind: 'social' },
  'com.openai.chatgpt': { name: 'ChatGPT', kind: 'ai' },
};

/** Common utm_source spellings → the same name a referrer would produce. */
const SOURCE_ALIASES: Record<string, string> = {
  google: 'Google', 'google.com': 'Google', adwords: 'Google', googleads: 'Google',
  bing: 'Bing', microsoft: 'Bing', duckduckgo: 'DuckDuckGo', yahoo: 'Yahoo',
  facebook: 'Facebook', fb: 'Facebook', meta: 'Facebook', 'facebook.com': 'Facebook',
  instagram: 'Instagram', ig: 'Instagram', linkedin: 'LinkedIn', li: 'LinkedIn',
  twitter: 'X (Twitter)', x: 'X (Twitter)', tiktok: 'TikTok', reddit: 'Reddit',
  youtube: 'YouTube', yt: 'YouTube', whatsapp: 'WhatsApp', wa: 'WhatsApp',
  telegram: 'Telegram', pinterest: 'Pinterest', threads: 'Threads',
  chatgpt: 'ChatGPT', 'chatgpt.com': 'ChatGPT', openai: 'ChatGPT',
  perplexity: 'Perplexity', 'perplexity.ai': 'Perplexity', claude: 'Claude',
  'claude.ai': 'Claude', gemini: 'Gemini', copilot: 'Copilot',
  newsletter: 'Newsletter', email: 'Email', gmail: 'Gmail', outlook: 'Outlook',
};

function hostSite(host: string): KnownSite | null {
  // Walk up the labels: "lm.facebook.com" → "facebook.com" → "com".
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const hit = KNOWN_HOSTS[labels.slice(i).join('.')];
    if (hit) return hit;
  }
  // google.com, google.com.mt, google.co.uk, www.google.de …
  if (/(^|\.)google\.[a-z.]{2,7}$/.test(host)) return KNOWN_HOSTS.google;
  if (/(^|\.)yandex\.[a-z.]{2,7}$/.test(host)) return KNOWN_HOSTS['yandex.com'];
  if (/(^|\.)pinterest\.[a-z.]{2,7}$/.test(host)) return KNOWN_HOSTS['pinterest.com'];
  if (/(^|\.)search\.yahoo\./.test(host)) return KNOWN_HOSTS['yahoo.com'];
  return null;
}

function kindOfName(name: string): Kind | null {
  for (const site of [...Object.values(KNOWN_HOSTS), ...Object.values(ANDROID_APPS)]) {
    if (site.name === name) return site.kind;
  }
  return null;
}

const KIND_CHANNEL: Record<Kind, Channel> = {
  search: 'Organic Search',
  social: 'Organic Social',
  ai: 'AI Assistants',
  email: 'Email',
  video: 'Video',
};

export interface Acquisition {
  source: string;
  channel: Channel;
  /** host + path of the referring page (never its query string), if external. */
  referrer: string | null;
  referrerHost: string | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
}

const clip = (v: string | null | undefined, n: number) => {
  const t = (v ?? '').trim();
  return t ? t.slice(0, n) : null;
};

/**
 * Classify a landing: the document.referrer and the landing URL's campaign
 * parameters (already filtered to CAMPAIGN_PARAMS by the browser).
 */
export function classifyAcquisition(
  rawReferrer: string | null | undefined,
  params: Record<string, string>,
  siteHost: string,
): Acquisition {
  const utm = {
    source: clip(params.utm_source ?? params.ref ?? params.source, 120),
    medium: clip(params.utm_medium, 120),
    campaign: clip(params.utm_campaign, 160),
    term: clip(params.utm_term, 160),
    content: clip(params.utm_content, 160),
  };

  // ── Referrer → host / known site ──
  let referrer: string | null = null;
  let referrerHost: string | null = null;
  let site: KnownSite | null = null;
  const ref = (rawReferrer ?? '').trim();
  if (ref.startsWith('android-app://')) {
    const pkg = ref.slice('android-app://'.length).split('/')[0].toLowerCase();
    site = ANDROID_APPS[pkg] ?? null;
    referrerHost = pkg.slice(0, 120);
    referrer = referrerHost;
  } else if (ref) {
    try {
      const u = new URL(ref);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const own = siteHost.toLowerCase().replace(/^www\./, '');
      if (host && host !== own && (u.protocol === 'http:' || u.protocol === 'https:')) {
        referrerHost = host.slice(0, 120);
        referrer = (host + (u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, ''))).slice(0, 300);
        site = hostSite(host);
      }
    } catch {
      /* not a URL — treat as no referrer */
    }
  }

  // ── Paid click ids (set by ad platforms on the landing URL) ──
  const paid =
    params.gclid || params.gbraid || params.wbraid
      ? { source: 'Google Ads', channel: 'Paid Search' as Channel }
      : params.dclid
        ? { source: 'Google Ads', channel: 'Display' as Channel }
        : params.msclkid
          ? { source: 'Microsoft Ads', channel: 'Paid Search' as Channel }
          : params.ttclid
            ? { source: 'TikTok Ads', channel: 'Paid Social' as Channel }
            : params.li_fat_id
              ? { source: 'LinkedIn Ads', channel: 'Paid Social' as Channel }
              : params.twclid
                ? { source: 'X Ads', channel: 'Paid Social' as Channel }
                : params.sccid
                  ? { source: 'Snapchat Ads', channel: 'Paid Social' as Channel }
                  : params.epik
                    ? { source: 'Pinterest Ads', channel: 'Paid Social' as Channel }
                    : null;

  // ── UTM-tagged links win: someone deliberately labelled this traffic ──
  if (utm.source || utm.medium) {
    const rawSrc = (utm.source ?? '').toLowerCase();
    const source = SOURCE_ALIASES[rawSrc] ?? (utm.source ? utm.source : site?.name ?? 'Other');
    const kind = kindOfName(source) ?? site?.kind ?? null;
    const medium = (utm.medium ?? '').toLowerCase();
    let channel: Channel;
    if (/^(.*cp.*|ppc|retargeting|paid.*)$/.test(medium)) {
      channel = kind === 'social' || /social/.test(medium) ? 'Paid Social' : kind === 'video' ? 'Video' : 'Paid Search';
    } else if (/^(display|banner|expandable|interstitial|cpm)$/.test(medium)) {
      channel = 'Display';
    } else if (/(^|[-_ ])(e[-_ ]?mail|newsletter)($|[-_ ])/.test(medium) || /e[-_ ]?mail|newsletter/.test(rawSrc)) {
      channel = 'Email';
    } else if (/^(social|social[-_ ]?(network|media)|sm|organic[-_ ]?social)$/.test(medium)) {
      channel = 'Organic Social';
    } else if (medium === 'organic') {
      channel = kind === 'ai' ? 'AI Assistants' : 'Organic Search';
    } else if (/affiliate/.test(medium)) {
      channel = 'Affiliate';
    } else if (medium === 'referral') {
      channel = kind ? KIND_CHANNEL[kind] : 'Referral';
    } else if (/video/.test(medium)) {
      channel = 'Video';
    } else if (kind) {
      channel = KIND_CHANNEL[kind];
    } else if (paid) {
      channel = paid.channel;
    } else {
      channel = 'Other';
    }
    return { source: source.slice(0, 80), channel, referrer, referrerHost, utm };
  }

  if (paid) return { ...paid, referrer, referrerHost, utm };

  // Facebook tags every outbound link with fbclid — organic posts included —
  // so on its own it only tells us the visit came from Facebook.
  if (!site && params.fbclid) site = KNOWN_HOSTS['facebook.com'];

  if (site) return { source: site.name, channel: KIND_CHANNEL[site.kind], referrer, referrerHost, utm };
  if (referrerHost) return { source: referrerHost, channel: 'Referral', referrer, referrerHost, utm };
  return { source: 'Direct', channel: 'Direct', referrer: null, referrerHost: null, utm };
}

// ── Device / browser / OS ─────────────────────────────────────────────────────

export interface Tech {
  device: 'Desktop' | 'Mobile' | 'Tablet';
  browser: string;
  os: string;
}

/**
 * @param touchPoints navigator.maxTouchPoints from the browser — iPads report a
 *        desktop-Mac user agent, so touch is the only way to tell them apart.
 */
export function parseUserAgent(ua: string, touchPoints = 0, screenWidth = 0): Tech {
  const s = ua || '';

  let os = 'Other';
  if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(s)) os = touchPoints > 1 ? 'iPadOS' : 'macOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/CrOS/i.test(s)) os = 'ChromeOS';
  else if (/HarmonyOS/i.test(s)) os = 'HarmonyOS';
  else if (/Linux/i.test(s)) os = 'Linux';
  if (/iPad/i.test(s)) os = 'iPadOS';

  let browser = 'Other';
  if (/FBAN|FBAV|FB_IAB/i.test(s)) browser = 'Facebook app';
  else if (/Instagram/i.test(s)) browser = 'Instagram app';
  else if (/LinkedInApp/i.test(s)) browser = 'LinkedIn app';
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(s)) browser = 'TikTok app';
  else if (/Edg(e|A|iOS)?\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera|OPT\//i.test(s)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet';
  else if (/YaBrowser/i.test(s)) browser = 'Yandex';
  else if (/Vivaldi/i.test(s)) browser = 'Vivaldi';
  else if (/UCBrowser/i.test(s)) browser = 'UC Browser';
  else if (/Firefox|FxiOS/i.test(s)) browser = 'Firefox';
  else if (/Chrome|CriOS|Chromium/i.test(s)) browser = 'Chrome';
  else if (/Safari/i.test(s) && /Version\//i.test(s)) browser = 'Safari';
  else if (/AppleWebKit/i.test(s) && /iPhone|iPad/i.test(s)) browser = 'Safari (in-app)';

  let device: Tech['device'] = 'Desktop';
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(s) || os === 'iPadOS') device = 'Tablet';
  else if (/Android/i.test(s) && !/Mobile/i.test(s)) device = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(s)) device = 'Mobile';
  else if (touchPoints > 0 && screenWidth > 0 && screenWidth < 600) device = 'Mobile';

  return { device, browser, os };
}

/** Crawlers, link previews, monitoring and headless browsers. ("Cubot" is a
 *  phone brand, hence the lookbehind.) */
const BOT_RE =
  /(?<!cu)bot(\b|[/;)_-])|crawl|spider|slurp|scrape|mediapartners|facebookexternalhit|facebot|embedly|preview|prerender|rendertron|headless|phantomjs|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|pingdom|uptime|statuscake|site24x7|monitor|python|curl|wget|axios|node-fetch|undici|go-http|java\/|okhttp|libwww|httpclient|scrapy|postman|insomnia|whatsapp\/|telegrambot|discordbot|slackbot|skypeuripreview|bytespider|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|ccbot|amazonbot|applebot|petalbot|semrush|ahrefs|mj12|dotbot|yandex(bot|images)|baiduspider|duckduckbot|bingpreview/i;

export function isBot(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20) return true;
  return BOT_RE.test(ua);
}
