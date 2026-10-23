"""Browser regression: real renderer with a simulated camera, not physical AR."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path('artifacts/camera-check')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=[
        '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
        '--enable-unsafe-swiftshader',
    ])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://localhost:5187/r/brasa-e-mesa/produto/smash-bacon')
    page.wait_for_load_state('networkidle')
    (OUT / 'initial.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
    page.get_by_role('button', name='Ver na minha mesa').last.click()
    page.get_by_role('button', name='Iniciar realidade aumentada', exact=True).click()
    expect(page.get_by_text('Aponte para a mesa e toque onde o prato deve ficar')).to_be_visible(timeout=60000)
    page.evaluate("""() => {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',
            {alpha: 0, beta: 30, gamma: 0}));
        window.testStream = document.querySelector('video').srcObject;
    }""")
    page.wait_for_timeout(500)
    target = page.evaluate('document.elementFromPoint(195, 422).tagName')
    page.mouse.click(195, 422)
    page.screenshot(path=str(OUT / 'camera.png'))
    expect(page.get_by_text('Aponte para a mesa e toque onde o prato deve ficar')).not_to_be_visible(timeout=5000)
    page.get_by_role('button', name='Ajustar escala', exact=True).click()
    expect(page.get_by_label('Distância do celular até a mesa')).to_be_visible()
    page.get_by_role('button', name='Posicionar em outro lugar', exact=True).click()
    expect(page.get_by_text('Aponte para a mesa e toque onde o prato deve ficar')).to_be_visible()
    page.get_by_role('button', name='Fechar realidade aumentada').click()
    assert page.evaluate("window.testStream.getTracks().every(t => t.readyState === 'ended')")
    assert not errors, errors
    (OUT / 'result.json').write_text(json.dumps({'camera': 'simulated', 'placement': 'passed', 'reposition': 'passed', 'cameraStopped': True, 'tapTarget': target, 'errors': errors}, indent=2))
    browser.close()
