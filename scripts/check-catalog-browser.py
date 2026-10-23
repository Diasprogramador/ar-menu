"""All demo products: real GLB renderer and simulated camera, not physical AR."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path('artifacts/catalog-browser')
OUT.mkdir(parents=True, exist_ok=True)
BASE_URL = os.environ.get('BASE_URL', 'http://localhost:5187').rstrip('/')
catalog = json.loads(Path('artifacts/model-validation/catalog.json').read_text(encoding='utf-8'))
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=[
        '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
        '--enable-unsafe-swiftshader',
    ])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    for product in catalog:
        slug = product['slug']
        page = context.new_page()
        errors, assets = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: assets.append({'url': response.url, 'status': response.status})
                if '.glb' in response.url else None)
        try:
            page.goto(f'{BASE_URL}/r/brasa-e-mesa/produto/{slug}')
            page.wait_for_load_state('networkidle')
            page.get_by_role('button', name='Ver na minha mesa').last.click()
            page.get_by_role('button', name='Iniciar realidade aumentada', exact=True).click()
            hint = page.get_by_text('Aponte para a mesa e toque onde o prato deve ficar')
            expect(hint).to_be_visible(timeout=60000)
            page.evaluate("""() => {
                window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',
                    {alpha: 0, beta: 30, gamma: 0}));
                window.testStream = document.querySelector('video').srcObject;
            }""")
            # Let the render loop apply the simulated sensor orientation before tapping.
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            page.mouse.click(195, 422)
            expect(hint).not_to_be_visible(timeout=5000)
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            page.screenshot(path=str(OUT / f'{slug}.png'))
            page.get_by_role('button', name='Ajustar escala', exact=True).click()
            expect(page.get_by_label('Distância do celular até a mesa')).to_be_visible()
            page.get_by_role('button', name='Posicionar em outro lugar', exact=True).click()
            expect(hint).to_be_visible()
            page.get_by_role('button', name='Fechar realidade aumentada').click()
            assert page.evaluate("window.testStream.getTracks().every(t => t.readyState === 'ended')")
            assert assets and all(asset['status'] == 200 for asset in assets), assets
            assert not errors, errors
            results.append({'slug': slug, 'camera': 'simulated', 'placement': 'passed',
                            'reposition': 'passed', 'scalePanel': 'passed', 'cameraStopped': True,
                            'assets': assets, 'errors': errors})
            print(f'PASS {slug}', flush=True)
        except Exception:
            page.screenshot(path=str(OUT / f'{slug}-failure.png'))
            raise
        finally:
            page.close()
            (OUT / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    browser.close()
assert len(results) == len(catalog)
