#!/usr/bin/env python3
"""Bundle src/ into one self-contained index.html (plus an artifact variant without the document skeleton)."""
import pathlib
root = pathlib.Path(__file__).parent
src = root / 'src'
css = (src / 'style.css').read_text()
shell = (src / 'shell.html').read_text()
js = '\n'.join(p.read_text() for p in sorted((src / 'js').glob('*.js')))
script = '(function(){\n' + js + '\n})();'
fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Figtree:wght@400;500;600;700;800&display=swap">'
title = 'Covers Host Trainer'
full = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="Practice running a restaurant host stand: floor plans, reservations, waitlist and simulated shifts.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Covers">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#8E2A3B">
{fonts}
<style>
html {{ padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }}
{css}
</style>
</head>
<body>
{shell}
<script>
{script}
</script>
</body>
</html>
'''
(root / 'index.html').write_text(full)
art = f'''<title>{title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
{fonts}
<style>
{css}
</style>
{shell}
<script>
{script}
</script>
'''
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'artifact.html').write_text(art)
print('index.html', len(full) // 1024, 'KB')
