"""Check public links and USDZ delivery on WebKit with an active production service worker."""
import os
from urllib.parse import urljoin

from playwright.sync_api import Error, expect, sync_playwright

base = os.environ.get("BASE_URL", "http://localhost:4173").rstrip("/")
menu = base + "/r/brasa-e-mesa"
with sync_playwright() as playwright:
    browser = playwright.webkit.launch()
    page = browser.new_page(**playwright.devices["iPhone 13"])
    page.goto(menu + "/mesa/07")
    page.locator('a[href$="/produto/smash-bacon"]').first.click()
    expect(page.get_by_role("heading", name="Smash Bacon", exact=True, level=1)).to_be_visible()
    # Exercise a return visit after the initial precache finishes, including on slower networks.
    page.wait_for_function("async () => !!(await navigator.serviceWorker.getRegistration())?.active", timeout=90000)
    page.reload()
    page.wait_for_function("!!navigator.serviceWorker.controller")
    for slug in ("Smash%20Bacon", "smash%E2%80%91bacon", "smash-bacon.", "smash-bacon?origem=qr"):
        page.goto(menu + "/produto/" + slug)
        expect(page.get_by_role("heading", name="Smash Bacon", exact=True)).to_be_visible()
    page.goto(menu + "/produto/prato-inexistente")
    expect(page.get_by_text("Prato não encontrado")).to_be_visible()

    page.goto(menu + "/produto/smash-bacon")
    page.get_by_role("button", name="Ver na minha mesa").last.click()
    link = page.get_by_role("link", name="Abrir em realidade aumentada")
    expect(link).to_be_visible()
    assert link.evaluate("a => a.rel === 'ar' && a.childNodes.length === 1 && a.firstChild.tagName === 'IMG'")
    url = urljoin(page.url, link.get_attribute("href"))
    assert url.endswith("#allowsContentScaling=0")
    # Windows WebKit can verify the document request but cannot launch Apple's native viewer.
    with page.expect_response(lambda r: r.request.is_navigation_request() and ".usdz" in r.url) as pending:
        try:
            page.goto(url, wait_until="commit")
        except Error as error:
            # When the engine hands off a binary download it cancels the page navigation.
            if not any(s in str(error).lower() for s in ("download", "aborted", "cancelled", "will download")):
                raise
    response = pending.value
    mime = response.headers.get("content-type", "").split(";")[0]
    assert response.status == 200 and mime != "text/html", (response.status, mime)
    if base.startswith("https://"):  # The production host sets the Quick Look MIME header.
        assert mime == "model/vnd.usdz+zip", mime
    binary = page.request.get(url)
    assert binary.ok and binary.body()[:4] == b"PK\x03\x04"
    browser.close()
    print("WebKit: table QR route, shared links, missing dish and USDZ navigation passed.")
