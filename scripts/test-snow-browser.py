import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import expect, sync_playwright


def config(route):
    path = route.request.url.split("/api/")[1]
    body = {"site": {}} if path == "public-config" else {}
    route.fulfill(json=body, status=401 if path.startswith("admin/") else 200)


server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory="docs"))
Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as playwright:
    browser = getattr(playwright, sys.argv[1]).launch()
    page = browser.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("https://**/*", lambda route: route.abort())
    page.route("**/api/**", config)
    page.goto(f"http://127.0.0.1:{server.server_port}", wait_until="domcontentloaded")
    canvas = page.locator("canvas.snow")
    for width, height in [(390, 844), (844, 390), (768, 1024), (1024, 768), (1440, 900)]:
        page.set_viewport_size({"width": width, "height": height})
        expect(canvas).to_be_visible()
        frame = canvas.evaluate("c => c.toDataURL()")
        page.wait_for_function("previous => document.querySelector('canvas').toDataURL() !== previous", arg=frame)
        expect(page.locator(".pk-toolbar")).to_have_count(0)
    page.emulate_media(reduced_motion="reduce")
    expect(canvas).to_be_hidden()
    page.emulate_media(reduced_motion="no-preference")
    page.route("**/api/admin/editor", lambda route: route.fulfill(json={"history": [], "media": [], "model": {}, "id": 0}))
    page.reload(wait_until="domcontentloaded")
    page.get_by_role("button", name="Настроить снег").click()
    panel = page.locator(".pk-panel")
    sliders = panel.get_by_role("slider")
    expect(sliders).to_have_count(7)
    for slider in sliders.all():
        slider.press("End")
        expect(slider).to_have_value("100")
        slider.press("ArrowLeft")
    panel.get_by_label("Включить снег").uncheck()
    expect(canvas).to_be_hidden()
    panel.get_by_role("button", name="Сбросить настройки снега").click()
    expect(canvas).to_be_visible()
    panel.get_by_label("Компьютеры").uncheck()
    expect(canvas).to_be_hidden()
    panel.get_by_label("Компьютеры").check()
    panel.get_by_label("Область снегопада").select_option("hero")
    page.evaluate("window.scrollTo({top:document.body.scrollHeight,behavior:'instant'})")
    expect(canvas).to_be_hidden()
    panel.get_by_label("Область снегопада").select_option("site")
    expect(canvas).to_be_visible()
    panel.get_by_label("Сезонность").select_option("period")
    expect(canvas).to_be_hidden()
    panel.get_by_label("С даты").fill("2000-01-01")
    panel.get_by_label("По дату").fill("2099-12-31")
    expect(canvas).to_be_visible()
    # Exercise the same revision returned to the owner after saving a draft.
    logo = "12345678-1234-1234-1234-123456789abc"
    page.route("**/api/admin/editor", lambda route: route.fulfill(json={
        "history": [], "media": [{"id": logo, "mime": "image/png", "caption": "Test logo"}],
        "model": {"logo": logo}, "id": 1
    }))
    page.goto(f"http://127.0.0.1:{server.server_port}/editor.html", wait_until="domcontentloaded")
    choice = page.locator("#logo")
    expect(choice).to_have_value(logo)
    draft_url = "/api/admin/media/" + logo
    expect(page.locator('link[rel="icon"]')).to_have_attribute("href", draft_url)
    header = page.frame_locator("iframe").locator("header .brand")
    expect(header.locator("img")).to_have_count(1)
    expect(header.locator("img")).to_have_attribute("src", draft_url)
    expect(header.locator(".brand-flake")).to_be_hidden()
    choice.select_option("")
    expect(header.locator("img")).to_have_attribute("src", "./assets/pakkasukko-medallion.png")
    expect(page.locator('link[rel="icon"]')).to_have_attribute("href", "./assets/pakkasukko-medallion.png")
    assert not errors, errors
    browser.close()
