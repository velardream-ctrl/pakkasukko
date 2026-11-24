from playwright.sync_api import sync_playwright
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory='docs'))
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=getattr(p,sys.argv[1]).launch()
 page=b.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort());page.route('**/api/**',lambda r:r.fulfill(json={'site':{}} if 'public-config' in r.request.url else {},status=401 if '/admin/' in r.request.url else 200))
 page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
 for w,h in [(390,844),(844,390),(768,1024),(1024,768),(1440,900)]:
  page.set_viewport_size(dict(width=w,height=h));page.wait_for_timeout(220)
  assert page.locator('canvas.snow').is_visible()
  a=page.locator('canvas').evaluate('c=>c.toDataURL()')
  page.wait_for_timeout(160)
  assert a!=page.locator('canvas').evaluate('c=>c.toDataURL()')
  assert page.locator('.pk-toolbar').count()==0
 page.emulate_media(reduced_motion='reduce');assert page.locator('canvas').is_hidden()
 page.emulate_media(reduced_motion='no-preference')
 page.route('**/api/admin/editor',lambda r:r.fulfill(json={'history':[],'media':[],'model':{},'id':0}))
 page.reload(wait_until='domcontentloaded');page.get_by_role('button',name='Настроить снег').click()
 panel=page.locator('.pk-panel')
 for el in panel.locator('input[type=range]').all():
  el.fill('78');el.dispatch_event('input')
 panel.get_by_label('Включить снег').uncheck();assert page.locator('canvas').is_hidden()
 panel.get_by_role('button',name='Сбросить настройки снега').click();assert page.locator('canvas').is_visible()
 assert not errors,errors
 print(sys.argv[1], ' 5 viewports, changing frames, guest isolation, owner panel, 7 sliders, disable/reset, reduced motion passed')
