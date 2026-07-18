#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()
CONFIG = ROOT / 'docs/support-config.js'
PAGE = ROOT / 'docs/id/dukung.html'
SITEMAP = ROOT / 'docs/sitemap.xml'
IMAGE = ROOT / 'docs/assets/qris-arsonkupik.svg'
PAYLOAD = '00020101021126610014COM.GO-JEK.WWW01189360091439191940880210G9191940880303UMI51440014ID.CO.QRIS.WWW0215ID10265514017750303UMI5204899953033605802ID5925Sonkupik, Audio Developer6005BOGOR61051692362140703A0111036216304F498'

if not IMAGE.is_file():
    raise FileNotFoundError(IMAGE)

svg = IMAGE.read_text(encoding='utf-8')
metadata = f'<metadata id="verified-emv-payload">{PAYLOAD}</metadata>'
if PAYLOAD not in svg:
    svg = svg.replace('<rect width="61" height="61" fill="#fff"/>', metadata + '<rect width="61" height="61" fill="#fff"/>', 1)
IMAGE.write_text(svg, encoding='utf-8')

CONFIG.write_text("""globalThis.ARSONKUPIK_SUPPORT_CONFIG = Object.freeze({
  qrisEnabled: true,
  qrisImage: '../assets/qris-arsonkupik.svg',
  merchantName: 'SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF',
  merchantCity: 'Bogor',
  lastVerified: '2026-07-18',
  suggestedAmounts: [10000, 25000, 50000]
});
""", encoding='utf-8')

page = PAGE.read_text(encoding='utf-8')
page = page.replace('<meta name="robots" content="noindex,follow">', '<meta name="robots" content="index,follow,max-image-preview:large">')
page = page.replace('<strong data-merchant-name>ArSonKuPik</strong>', '<strong data-merchant-name>SONKUPIK, AUDIO DEVELOPER, DIGITAL &amp; KREATIF</strong>\n              <small class="qris-nmid">NMID: ID1026551401775</small>')
page = page.replace('QRIS merchant sedang disiapkan', 'QRIS merchant belum tersedia')
PAGE.write_text(page, encoding='utf-8')

sitemap = SITEMAP.read_text(encoding='utf-8')
url = 'https://masarray.github.io/arsonkupik-extension/id/dukung.html'
if url not in sitemap:
    block = f'''  <url>\n    <loc>{url}</loc>\n    <lastmod>2026-07-18</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n'''
    sitemap = sitemap.replace('</urlset>', block + '</urlset>')
SITEMAP.write_text(sitemap, encoding='utf-8')

print('Official QRIS support page activated with verified EMV payload.')
