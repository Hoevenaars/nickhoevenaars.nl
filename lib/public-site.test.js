import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const missing = readFileSync(new URL('../404.html', import.meta.url), 'utf8')
const robots = readFileSync(new URL('../robots.txt', import.meta.url), 'utf8')
const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8')
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('homepage publishes canonical metadata and visible-copy description', () => {
  assert.match(home, /<title>Nick Hoevenaars<\/title>/)
  assert.match(home, /<meta name="description" content="Nick Hoevenaars\. Vind me op LinkedIn\.">/)
  assert.match(home, /<link rel="canonical" href="https:\/\/www\.nickhoevenaars\.nl\/">/)
  assert.match(home, /<meta property="og:url" content="https:\/\/www\.nickhoevenaars\.nl\/">/)
  assert.match(home, /<meta name="twitter:card" content="summary">/)
  assert.doesNotMatch(home, /og:image/)
  const jsonLd = home.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)
  assert.ok(jsonLd)
  const data = JSON.parse(jsonLd[1])
  assert.equal(data['@type'], 'Person')
  assert.equal(data.name, 'Nick Hoevenaars')
  assert.equal(data.url, 'https://www.nickhoevenaars.nl/')
  assert.deepEqual(data.sameAs, ['https://www.linkedin.com/in/nickhoevenaars'])
})

test('homepage does not load an unused Inter weight', () => {
  assert.match(home, /family=Inter:wght@300&display=swap/)
  assert.doesNotMatch(home, /Inter:wght@300;500/)
  assert.match(home, /fonts\.gstatic\.com" crossorigin/)
})

test('decorative icons are hidden from assistive tech', () => {
  assert.match(home, /<svg[^>]*aria-hidden="true"/)
  assert.match(home, /opent in een nieuw tabblad/)
  assert.match(missing, /<svg[^>]*aria-hidden="true"/)
  assert.match(missing, /<meta name="robots" content="noindex">/)
  assert.match(missing, /fonts\.gstatic\.com" crossorigin/)
})

test('robots allows the homepage and keeps private areas out of the crawl', () => {
  assert.match(robots, /^User-agent: \*$/m)
  assert.match(robots, /^Disallow: \/admin$/m)
  assert.match(robots, /^Disallow: \/finance$/m)
  assert.match(robots, /^Disallow: \/api$/m)
  assert.match(robots, /^Sitemap: https:\/\/www\.nickhoevenaars\.nl\/sitemap\.xml$/m)
  assert.doesNotMatch(robots, /^Disallow: \/$/m)
})

test('sitemap lists only the canonical homepage', () => {
  assert.match(sitemap, /<loc>https:\/\/www\.nickhoevenaars\.nl\/<\/loc>/)
  assert.doesNotMatch(sitemap, /\/admin|\/finance|\/api|vercel\.app/)
})

test('private routes send noindex even when the path has no extra segment', () => {
  const rules = vercel.headers.filter((rule) =>
    ['/admin', '/admin/(.*)', '/api/(.*)', '/finance', '/finance/(.*)'].includes(rule.source)
  )
  assert.equal(rules.length, 5)
  for (const rule of rules) {
    assert.deepEqual(rule.headers, [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }])
  }
})
