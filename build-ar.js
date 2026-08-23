/**
 * Generates ar/index.html from index.html + i18n/ar.json.
 *
 * Arabic used to be a runtime toggle: click the button, JavaScript swapped the
 * strings, the URL never changed. That meant one indexable page in one
 * language — the Arabic copy existed only in the visitor's browser, so Google
 * had nothing to rank and nothing to hreflang against. This bakes it into a
 * real page instead.
 *
 * Run after editing index.html:   node build-ar.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'index.html');
const OUT_DIR = path.join(__dirname, 'ar');
const OUT = path.join(OUT_DIR, 'index.html');
const AR = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'ar.json'), 'utf8'));

const ORIGIN = 'https://miladjamalityres.ae';

// Written to mirror the English title and description. Flagged for a native
// speaker to review before this is treated as final copy.
const AR_TITLE = 'ميلاد جمالي للإطارات — خدمة إطارات في القوز، دبي · مفتوح حتى وقت متأخر';
const AR_DESC = 'ميلاد جمالي للإطارات — إصلاح وتركيب الإطارات، ترصيص العجلات وإطارات جديدة في القوز، دبي. مفتوح يوميًا ٧ ص – ٢:٣٠ ص. اتصل ٠٥٠ ٣٩٤ ٥٢٨٥.';

let html = fs.readFileSync(SRC, 'utf8');

/**
 * Replaces the inner HTML of the element carrying a given attribute match.
 * Written by hand rather than with a regex because several translated
 * elements contain nested markup (the h1 wraps a <span class="hl">), and a
 * lazy match would stop at the first closing tag it found.
 */
function replaceInner(source, attrMatchIndex) {
  // walk back to the '<' that opens this element, and read its tag name
  const open = source.lastIndexOf('<', attrMatchIndex);
  const tag = source.slice(open + 1).match(/^[a-zA-Z][a-zA-Z0-9]*/)[0];

  // find the end of the opening tag, ignoring '>' inside attribute values
  let i = open, quote = null;
  while (i < source.length) {
    const c = source[i];
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') break;
    i++;
  }
  const innerStart = i + 1;

  // scan for the matching close tag, counting nested opens of the same tag
  const openRe = new RegExp('<' + tag + '[\\s>]', 'gi');
  const closeRe = new RegExp('</' + tag + '\\s*>', 'gi');
  let depth = 1, cursor = innerStart;
  while (depth > 0) {
    closeRe.lastIndex = cursor;
    const close = closeRe.exec(source);
    if (!close) throw new Error('unclosed <' + tag + '> near index ' + open);
    openRe.lastIndex = cursor;
    let nested = openRe.exec(source);
    while (nested && nested.index < close.index) {
      depth++;
      openRe.lastIndex = nested.index + 1;
      nested = openRe.exec(source);
    }
    depth--;
    cursor = close.index + close[0].length;
    if (depth === 0) return { innerStart, innerEnd: close.index };
  }
}

let translated = 0, missing = [];

function applyKeys(source, attr, apply) {
  const re = new RegExp(attr + '="([^"]+)"', 'g');
  const hits = [];
  let m;
  while ((m = re.exec(source))) hits.push({ index: m.index, key: m[1] });
  // right to left so earlier indices stay valid
  for (let i = hits.length - 1; i >= 0; i--) {
    const { index, key } = hits[i];
    const value = AR[key];
    if (value === undefined) { missing.push(key); continue; }
    source = apply(source, index, value);
    translated++;
  }
  return source;
}

html = applyKeys(html, 'data-i18n', (source, index, value) => {
  const { innerStart, innerEnd } = replaceInner(source, index);
  return source.slice(0, innerStart) + value + source.slice(innerEnd);
});

html = applyKeys(html, 'data-i18n-ph', (source, index, value) => {
  // rewrite the placeholder attribute on the same element
  const tagEnd = source.indexOf('>', index);
  const tagStart = source.lastIndexOf('<', index);
  const tagText = source.slice(tagStart, tagEnd);
  const rewritten = tagText.replace(/placeholder="[^"]*"/, 'placeholder="' + value + '"');
  return source.slice(0, tagStart) + rewritten + source.slice(tagEnd);
});

// document language and direction
html = html.replace('<html lang="en">', '<html lang="ar" dir="rtl">');

// head: title, description, canonical, social, language switcher
html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + AR_TITLE + '</title>');
html = html.replace(/(<meta name="description" content=")[^"]*(")/, '$1' + AR_DESC + '$2');
html = html.replace('<link rel="canonical" href="' + ORIGIN + '/" />',
                    '<link rel="canonical" href="' + ORIGIN + '/ar/" />');
html = html.replace('<meta property="og:url" content="' + ORIGIN + '/" />',
                    '<meta property="og:url" content="' + ORIGIN + '/ar/" />');
html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + AR_TITLE + '$2');
html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + AR_DESC + '$2');
html = html.replace('<meta property="og:locale" content="en_AE" />', '<meta property="og:locale" content="ar_AE" />');
html = html.replace('<meta property="og:locale:alternate" content="ar_AE" />', '<meta property="og:locale:alternate" content="en_AE" />');

// the switcher points back to English
html = html.replace(
  '<a class="tgl" id="langBtn" href="/ar/" hreflang="ar" lang="ar" aria-label="العربية">ع</a>',
  '<a class="tgl" id="langBtn" href="/" hreflang="en" lang="en" aria-label="English">EN</a>'
);

// structured data: this page is the Arabic one, and its FAQ markup has to
// match the Arabic the visitor actually reads — English Q&A on an Arabic page
// is a mismatch Google will hold against the rich result.
html = html.replace('"inLanguage": "en"', '"inLanguage": "ar"');

const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (ld) {
  const graph = JSON.parse(ld[1]);
  const faq = graph['@graph'].find(n => n['@type'] === 'FAQPage');
  if (faq) {
    faq.mainEntity.forEach((q, i) => {
      const qKey = 'faq' + (i + 1) + '.q', aKey = 'faq' + (i + 1) + '.a';
      if (AR[qKey]) q.name = stripTags(AR[qKey]);
      if (AR[aKey]) q.acceptedAnswer.text = stripTags(AR[aKey]);
    });
  }
  const biz = graph['@graph'].find(n => n['@type'] === 'AutoRepair');
  if (biz) {
    biz.description = AR_DESC;
    biz['@id'] = ORIGIN + '/ar/#business';
    if (biz.hasOfferCatalog) {
      biz.hasOfferCatalog.itemListElement.forEach((o, i) => {
        const key = 'serv' + (i + 1) + '.t';
        if (AR[key]) o.itemOffered.name = stripTags(AR[key]);
      });
    }
  }
  const site = graph['@graph'].find(n => n['@type'] === 'WebSite');
  if (site) {
    site['@id'] = ORIGIN + '/ar/#website';
    site.url = ORIGIN + '/ar/';
    if (biz) site.publisher = { '@id': biz['@id'] };
  }
  html = html.slice(0, ld.index) +
    '<script type="application/ld+json">\n' + JSON.stringify(graph, null, 2) + '\n</script>' +
    html.slice(ld.index + ld[0].length);
}

// several dictionary entries carry inline markup for the page; structured data
// wants the words only
function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

const unique = [...new Set(missing)];
console.log('translated ' + translated + ' nodes → ar/index.html');
if (unique.length) console.log('no Arabic for ' + unique.length + ' key(s): ' + unique.join(', '));
