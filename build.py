# Rebuilds index.html from src/ and data/.  Usage: python3 build.py
import json, os
AUTHOR   = "@saffirephire"
SITE_URL = ""          # e.g. "https://yourname.github.io/xpresence/"
UPDATED  = "Sep 26, 2026"

H = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(H, *p), encoding='utf-8').read()
head, body, script = rd('src', 'head.html'), rd('src', 'body.html'), rd('src', 'script.html')
bt = json.loads(rd('data', 'backtest3.json'))
bt[0]['label'] = bt[0]['label'].replace('16.13–16.15', '16.14–16.15'); bt[1]['label'] = bt[1]['label'].replace('16.13–16.16', '16.14–16.16')
for o in bt:
    for r in o['rows']:
        for k in ('ll', 'gain', 'beta', 'rho'): r[k] = round(r[k], 5)
rep = {'/*DATA*/': 'data3.json', '/*SNAP*/': 'snapshot5.json', '/*SNAPPREV*/': 'snapshot3.json', '/*INIT*/': 'init5.json',
       '/*MSI*/': 'msi3.json', '/*ROLL*/': 'rolling_dash.json', '/*PADJ*/': 'adjust_dash.json', '/*PATCH*/': 'patch_adj.json',
       '/*CAL*/': 'calib5.json', '/*ROLES*/': 'roles_summer.json', '/*ROLEX*/': 'role_dash.json'}
vals = {k: rd('data', v).strip() for k, v in rep.items()}
vals['/*BACKTEST*/'] = json.dumps(bt, ensure_ascii=False)
vals['/*ENGINE*/'] = rd('src', 'engine.js')
shell = rd('src', 'shell.html')   # doctype, meta tags and footer, with {{...}} slots
img = (SITE_URL.rstrip('/') + '/og.png') if SITE_URL else 'og.png'
i = body.rstrip().rfind('</div>')
page = (shell.replace('{{HEAD}}', head).replace('{{BODY}}', body[:i]).replace('{{SCRIPT}}', script)
        .replace('{{AUTHOR}}', AUTHOR).replace('{{UPDATED}}', UPDATED).replace('{{IMG}}', img)
        .replace('{{OGURL}}', f'<meta property="og:url" content="{SITE_URL}">' if SITE_URL else ''))
for k, v in vals.items():
    assert k in page, k
    page = page.replace(k, v)
open(os.path.join(H, 'index.html'), 'w', encoding='utf-8').write(page)
print('wrote index.html', len(page), 'bytes')
