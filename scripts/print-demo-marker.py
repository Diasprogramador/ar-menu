"""Export the demo restaurant's real-size print sheet from the same UI used by restaurants."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page()
    page.goto(os.environ.get("DEV_URL", "http://localhost:5187") + "/r/brasa-e-mesa")
    with page.expect_popup() as popup:
        page.evaluate("""async () => {
          const { env } = await import('/src/lib/env.ts');
          env.appUrl = 'https://ar-menu-tau-opal.vercel.app';
          const { printQrSheet } = await import('/src/features/qrcodes/qrService.ts');
          const open = window.open.bind(window);
          window.open = (...args) => { const w=open(...args);w.print=()=>{};return w; };
          await printQrSheet('Brasa & Mesa',[{label:'Cardápio',path:'/r/brasa-e-mesa'}]);
        }""")
    sheet = popup.value
    sheet.locator("svg").wait_for()
    assert abs(sheet.locator("svg").bounding_box()["width"] - 50 * 96 / 25.4) < .1
    sheet.pdf(path=str(Path("public/demo/cartao-brasa-e-mesa.pdf")),prefer_css_page_size=True,print_background=True)
    browser.close()
