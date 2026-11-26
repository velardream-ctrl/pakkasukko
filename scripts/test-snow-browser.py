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
        page.wait_for_function("""() => {
            const width = selector => document.querySelector(selector).getBoundingClientRect().width;
            return Math.abs(width('.header .brand small') - width('.header .brand-name')) < 2;
        }""")
        frame = canvas.evaluate("c => c.toDataURL()")
        page.wait_for_function("previous => document.querySelector('canvas').toDataURL() !== previous", arg=frame)
        expect(page.locator(".pk-toolbar")).to_have_count(0)
    city = page.get_by_role("combobox", name="Город праздника")
    city.select_option("Tohmajärvi")
    page.locator("#service").select_option("gift")
    expect(page.locator(".fare-summary strong")).to_contain_text("58,80")
    city.select_option("Kitee")
    expect(page.locator(".fare-summary strong")).to_contain_text("50,00")
    page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
    page.emulate_media(reduced_motion="reduce")
    expect(canvas).to_be_hidden()
    page.emulate_media(reduced_motion="no-preference")
    page.route("**/api/admin/editor", lambda route: route.fulfill(json={"history": [], "media": [], "model": {}, "id": 0}))
    page.reload(wait_until="domcontentloaded")
    page.locator('.pk-pin-text[aria-label*="PAKKASUKKO"]').first.dispatch_event("click")
    inline_size = page.locator('.pk-panel').get_by_role("slider", name="Размер подписи", exact=False)
    expect(inline_size).to_have_value("100")
    inline_size.press("ArrowRight")
    expect(inline_size).to_have_value("101")
    page.get_by_role("button", name="Закрыть панель").click()
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
    # Editing a headline must keep independent color, font and line breaks.
    page.get_by_role("button", name="Закрыть панель").click()
    page.locator('#intro-title').scroll_into_view_if_needed()
    page.locator('.pk-pin-text[aria-label*="Не просто вручить"]').first.dispatch_event("click")
    panel = page.locator(".pk-panel")
    expect(panel.get_by_label("Строка 1", exact=True)).to_have_value("Не просто вручить подарок,")
    panel.get_by_label("Строка 2", exact=True).fill("а подарить новые воспоминания.")
    panel.get_by_label("Цвет текста", exact=True).nth(0).select_option("ink")
    panel.get_by_label("Цвет текста", exact=True).nth(1).select_option("gold")
    panel.get_by_label("Начертание", exact=True).nth(1).select_option("italic")
    title = page.locator("#intro-title")
    expect(title.locator("br")).to_have_count(1)
    expect(title.locator("span").nth(1)).to_have_text("а подарить новые воспоминания.")
    expect(title.locator("span").nth(1)).to_have_css("color", "rgb(151, 107, 50)")
    expect(title.locator("span").nth(1)).to_have_css("font-style", "italic")
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
    page.locator("#section").select_option("header")
    slider = page.get_by_role("slider", name="Размер подписи", exact=False)
    expect(slider).to_have_value("100")
    slider.press("Home")
    expect(slider).to_have_value("70")
    page.wait_for_function("""() => {
        const header = document.querySelector('iframe').contentDocument.querySelector('.header .brand');
        const ratio = header.querySelector('small').offsetWidth / header.querySelector('.brand-name').offsetWidth;
        return Math.abs(ratio - 0.7) < 0.025;
    }""")
    # Public calendar: pick later time first, then add an earlier address.
    page.unroute("**/api/admin/editor")
    page.route("**/api/public-config", lambda r: r.fulfill(json={"bookingsEnabled": True, "turnstileSiteKey": "test", "site": {}}))
    times = ["10:00", "11:00"]
    page.route("**/api/slots", lambda r: r.fulfill(json={"slots": [
        {"id": "slot-" + str(i), "start_at": "2099-12-24T" + t, "end_at": "2099-12-24T" + t[:3] + "30", "status": "open"}
        for i, t in enumerate(times)
    ]}))
    page.goto(f"http://127.0.0.1:{server.server_port}/", wait_until="domcontentloaded")
    page.get_by_role("button", name="11:00–11:30").click()
    page.get_by_label("Адрес на 11:00").fill("Road 2")
    page.get_by_role("button", name="10:00–10:30").click()
    page.get_by_label("Адрес на 10:00").fill("Road 1")
    expect(page.get_by_label("Адрес на 11:00")).to_have_value("Road 2")
    page.get_by_role("combobox", name="Город праздника").select_option("Tohmajärvi")
    page.locator("#service").select_option("gift")
    expect(page.locator(".fare-summary strong")).to_contain_text("108,80")
    page.get_by_role("button", name="10:00–10:30").click()
    expect(page.get_by_label("Адрес на 10:00")).to_have_count(0)
    expect(page.get_by_label("Адрес на 11:00")).to_have_value("Road 2")
    assert not errors, errors
    browser.close()
