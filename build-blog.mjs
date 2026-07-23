/**
 * build-blog.mjs — מחולל הבלוג הסטטי של פריליו (ללא תלויות).
 *
 * קורא את content/blog/*.md (frontmatter + markdown), ומייצר:
 *   /blog/index.html                 — עמוד רשימה
 *   /blog/<slug>/index.html          — עמוד פוסט (RTL, OG, JSON-LD Article, שיתוף)
 * הפלט נשמר בריפו ומוגש כ-static (Vercel), בלי צורך ב-build בענן.
 * הרצה: node build-blog.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://prelio.work';
const OG_FALLBACK = `${SITE}/og-cover.png`;
const LOGO = 'https://prelio.work/og-cover.png';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* --- frontmatter --- */
const unquote = s => String(s).trim().replace(/^["'](.*)["']$/s, '$1');

function parseFront(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  let listKey = null;                       // open YAML block-list, e.g. `keywords:` + `- item` lines
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) { meta[listKey].push(unquote(item[1])); continue; }
    const mm = line.match(/^(\w+):\s*(.*)$/);
    if (!mm) continue;
    let [, k, v] = mm;
    v = v.trim();
    if (v === '') { listKey = k; meta[k] = []; continue; }   // bare key → block list follows
    listKey = null;
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map(s => unquote(s)).filter(Boolean);
    else v = unquote(v);
    meta[k] = v;
  }
  return { meta, body: m[2] };
}

/* --- markdown subset → HTML (h2/h3, ul, bold, links, paragraphs) --- */
function inline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [], list = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushL = () => { if (list.length) { out.push(`<ul>${list.map(li => `<li>${inline(li)}</li>`).join('')}</ul>`); list = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) { flushP(); flushL(); out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); }
    else if (/^##\s+/.test(line)) { flushP(); flushL(); out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); }
    else if (/^[-*]\s+/.test(line)) { flushP(); list.push(line.replace(/^[-*]\s+/, '')); }
    else if (line === '') { flushP(); flushL(); }
    else para.push(line);
  }
  flushP(); flushL();
  return out.join('\n');
}

function readingTime(md) {
  const words = md.replace(/[#*\-\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return d; }
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;800&family=Assistant:wght@400;600;700&display=swap"><link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;800&family=Assistant:wght@400;600;700&display=swap" rel="stylesheet">`;

const CSS = `<style>
:root{--bg:#f9f7fd;--ink:#2d2438;--muted:#6b6178;--brand:#9270fc;--brand-dark:#7d55f0;--grad:linear-gradient(135deg,#f52ac9 0%,#b263f7 55%,#9270fc 100%);--brand-soft:#f8f1fe;--line:#ece6f2;--card:#fff}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--ink);font-family:'Assistant',-apple-system,'Segoe UI',Arial,sans-serif;line-height:1.75}
.wrap{max-width:760px;margin:0 auto;padding-inline:22px}
.wrap-wide{max-width:1000px}
h1,h2,h3{font-family:'Rubik','Assistant',sans-serif;letter-spacing:-.3px;line-height:1.25}
a{color:var(--brand-dark);text-decoration:none}a:hover{text-decoration:underline}
nav{position:sticky;top:0;z-index:20;background:rgba(251,250,255,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav-in{display:flex;align-items:center;gap:20px;padding:13px 0}
.logo{font-family:'Rubik';font-weight:800;font-size:20px;color:var(--ink)}
.nav-links{margin-inline-start:auto;display:flex;gap:18px;align-items:center;font-weight:600;font-size:14.5px}
.nav-links a{color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:7px;font-family:'Rubik';font-weight:600;font-size:14.5px;padding:9px 18px;border-radius:11px;border:1px solid transparent}
.btn-brand{background:var(--grad);color:#fff}
/* list */
.blog-hd{padding:44px 0 8px;text-align:center}
.blog-hd h1{font-size:clamp(28px,4vw,40px)}
.blog-hd p{color:var(--muted);margin-top:10px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px;padding:28px 0 60px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:transform .15s,box-shadow .15s}
.card:hover{transform:translateY(-3px);box-shadow:0 18px 40px -18px rgba(104,76,190,.3)}
.card a{text-decoration:none;color:inherit;display:flex;flex-direction:column;height:100%}
/* full 1200x630, never cropped: contain + matching ratio, no fixed height */
.card-cover{aspect-ratio:1200/630;background:var(--brand-soft) center/contain no-repeat}
.card-body{padding:16px 18px;display:flex;flex-direction:column;gap:8px;flex:1}
.card-body h2{font-size:19px}
.card-body p{color:var(--muted);font-size:14.5px;flex:1}
.card-meta{color:#a79db5;font-size:12.5px;font-weight:600}
/* article */
article{padding:34px 0 40px}
.post-meta{color:#a79db5;font-size:13.5px;font-weight:600;margin-bottom:10px}
article h1{font-size:clamp(26px,4vw,38px);margin-bottom:24px}
.post-body>*{margin-bottom:16px}
.post-body h2{font-size:24px;margin-top:30px}
.post-body h3{font-size:19px;margin-top:22px;color:var(--brand-dark)}
.post-body ul{padding-inline-start:22px}
.post-body li{margin-bottom:7px}
.post-body a{text-decoration:underline}
.share{position:sticky;bottom:16px;display:flex;gap:10px;justify-content:center;margin-top:34px;padding:12px;background:rgba(255,255,255,.9);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px -12px rgba(104,76,190,.25)}
.share a,.share button{cursor:pointer;font-family:inherit;font-weight:600;font-size:13.5px;padding:8px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--ink);text-decoration:none;display:inline-flex;gap:6px;align-items:center}
.share a:hover,.share button:hover{border-color:var(--brand);background:var(--brand-soft)}
.back{display:inline-block;margin:26px 0 0;color:var(--muted);font-weight:600}
footer{border-top:1px solid var(--line);padding:26px 0;text-align:center;color:var(--muted);font-size:13.5px}
footer a{margin-inline:8px}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>`;

const NAV = `<nav><div class="wrap wrap-wide nav-in"><a class="logo" href="/">Prelio</a><div class="nav-links"><a href="/#features">יכולות</a><a href="/#pricing">מחירים</a><a href="/blog/">בלוג</a><a class="btn btn-brand" href="https://app.prelio.work/">כניסה למערכת</a></div></div></nav>`;
const FOOT = `<footer><div class="wrap wrap-wide"><a href="/">פריליו</a><a href="/blog/">בלוג</a><a href="/privacy.html">פרטיות</a><a href="/terms.html">תנאים</a><span>· Prelio © 2026</span></div></footer>`;

function page({ title, description, canonical, ogImage, head = '', bodyClass = '', content }) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="${bodyClass === 'post' ? 'article' : 'website'}">
<meta property="og:site_name" content="Prelio">
<meta property="og:locale" content="he_IL">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:secure_url" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(ogImage)}">
${FONTS}
${CSS}
${head}
</head>
<body>
${NAV}
${content}
${FOOT}
</body>
</html>`;
}

/* --- ogImage → absolute URL (frontmatter `ogImage`, legacy `cover`, else fallback) --- */
function ogUrl(meta) {
  const v = meta.ogImage || meta.cover;
  if (!v) return OG_FALLBACK;
  return String(v).startsWith('http') ? String(v) : SITE + (String(v).startsWith('/') ? v : '/' + v);
}

/* --- collect posts --- */
/* frontmatter: title, description, slug, date, author, keywords[], ogImage, published
   `slug` overrides the filename; `published: false` keeps a draft out of the build. */
const dir = join(ROOT, 'content', 'blog');
const posts = readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
  const { meta, body } = parseFront(readFileSync(join(dir, f), 'utf8'));
  /* normalise: accept `slug`, `/blog/slug`, `slug/` — always emit the bare segment,
     so canonical / og:url / sitemap stay in ONE trailing-slash form. */
  const slug = String(meta.slug || f.replace(/\.md$/, ''))
    .trim().replace(/^\/+/, '').replace(/^blog\//, '').replace(/\/+$/, '');
  return { slug, meta, body, html: mdToHtml(body), rt: readingTime(body) };
})
  .filter(p => String(p.meta.published ?? 'true').toLowerCase() !== 'false')
  .sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)));

/* --- post pages --- */
for (const p of posts) {
  const url = `${SITE}/blog/${p.slug}/`;
  const cover = ogUrl(p.meta);
  const canonical = p.meta.canonical || url;
  const author = String(p.meta.author || 'Prelio').trim();
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: p.meta.title, description: p.meta.description,
    datePublished: p.meta.date, dateModified: p.meta.date,
    image: cover, inLanguage: 'he',
    author: author === 'Prelio'
      ? { '@type': 'Organization', name: 'Prelio' }
      : { '@type': 'Person', name: author },
    publisher: { '@type': 'Organization', name: 'Prelio', logo: { '@type': 'ImageObject', url: LOGO } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    keywords: Array.isArray(p.meta.keywords) ? p.meta.keywords.join(', ') : (p.meta.keywords || ''),
  };
  const shareText = encodeURIComponent(p.meta.title + ' — Prelio');
  const content = `<main class="wrap"><article>
  <a class="back" href="/blog/">← חזרה לבלוג</a>
  <div class="post-meta">${fmtDate(p.meta.date)} · ${p.rt} דק׳ קריאה</div>
  <h1>${esc(p.meta.title)}</h1>
  <!-- OG card is metadata only: it has text baked in at fixed positions, so any
       on-page crop destroys it. The H1 above already states the same headline. -->
  <div class="post-body">${p.html}</div>
  <div class="share" aria-label="שיתוף">
    <a href="https://wa.me/?text=${shareText}%20${encodeURIComponent(url)}" target="_blank" rel="noopener">וואטסאפ</a>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener">LinkedIn</a>
    <button type="button" onclick="navigator.clipboard&amp;&amp;navigator.clipboard.writeText('${url}').then(()=>{this.textContent='הועתק ✓'})">העתקת קישור</button>
  </div>
  </article></main>
  <script type="application/ld+json">${JSON.stringify(ld)}</script>`;
  const outDir = join(ROOT, 'blog', p.slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), page({ title: `${p.meta.title} | בלוג פריליו`, description: p.meta.description, canonical, ogImage: cover, bodyClass: 'post', content }));
  console.log('post:', p.slug);
}

/* --- index page --- */
const cards = posts.map(p => {
  const cover = ogUrl(p.meta);
  return `<div class="card"><a href="/blog/${p.slug}/">
    <div class="card-cover" style="background-image:url('${esc(cover)}')"></div>
    <div class="card-body"><div class="card-meta">${fmtDate(p.meta.date)} · ${p.rt} דק׳</div><h2>${esc(p.meta.title)}</h2><p>${esc(p.meta.description)}</p></div>
  </a></div>`;
}).join('\n');
const indexContent = `<main class="wrap wrap-wide">
  <div class="blog-hd"><h1>הבלוג של פריליו</h1><p>טיפים, מדריכים ותובנות לסוכני גיוס והשמה — על ניהול מועמדים, וואטסאפ ואוטומציה בגיוס.</p></div>
  <div class="cards">${cards}</div>
</main>`;
const indexLd = { '@context': 'https://schema.org', '@type': 'Blog', name: 'הבלוג של פריליו', url: `${SITE}/blog/`, inLanguage: 'he' };
writeFileSync(join(ROOT, 'blog', 'index.html'), page({
  title: 'בלוג פריליו — טיפים ומדריכים לסוכני גיוס והשמה',
  description: 'מדריכים וטיפים לסוכני גיוס והשמה: ניהול מועמדים, תבניות וואטסאפ, אוטומציה בגיוס ומעבר מאקסל למערכת CRM לגיוס.',
  canonical: `${SITE}/blog/`, ogImage: OG_FALLBACK,
  head: `<script type="application/ld+json">${JSON.stringify(indexLd)}</script>`,
  content: indexContent,
}));
console.log('index: /blog/  · total posts:', posts.length);

/* --- sitemap.xml — static pages + /blog + every published post (lastmod = post date) --- */
const newest = posts.length ? String(posts[0].meta.date) : '';
const STATIC = [
  { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/blog/`, changefreq: 'weekly', priority: '0.8', lastmod: newest },
  { loc: `${SITE}/privacy.html`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITE}/terms.html`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITE}/accessibility.html`, changefreq: 'yearly', priority: '0.3' },
];
const entries = [
  ...STATIC.slice(0, 2),
  ...posts.map(p => ({ loc: `${SITE}/blog/${p.slug}/`, changefreq: 'monthly', priority: '0.7', lastmod: String(p.meta.date || '') })),
  ...STATIC.slice(2),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}<changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
console.log('sitemap: /sitemap.xml ·', entries.length, 'urls');
