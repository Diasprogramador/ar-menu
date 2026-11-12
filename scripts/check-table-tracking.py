"""Exercise the actual decoder, WebGL camera and controls with a moving camera fixture."""
import base64
import os
import re
import subprocess
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:5187").rstrip("/")
MENU = BASE + "/r/brasa-e-mesa"
QR = subprocess.check_output([
    "node", "-e",
    "require('qrcode').toBuffer(process.argv[1],{margin:0,width:300},(e,b)=>process.stdout.write(b))",
    MENU + "#ar-menu-50mm",
])

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=["--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(MENU + "/produto/smash-bacon")
    page.evaluate("""async (src) => {
      const qr = new Image(); qr.src=src; await qr.decode();
      const canvas=document.createElement('canvas'); canvas.width=640;canvas.height=480;
      const ctx=canvas.getContext('2d');
      const grain=document.createElement('canvas');grain.width=640;grain.height=480;
      const g=grain.getContext('2d');let seed=84;
      for(let y=0;y<480;y+=4)for(let x=0;x<640;x+=4){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        g.fillStyle='hsl(29 30% '+(10+(seed%75))+'%)';g.fillRect(x,y,4,4);
      }
      window.tableFixture={qr:true,grain:false,edge:130,shift:0};
      setInterval(()=>{
        const s=window.tableFixture;ctx.fillStyle='#fafafa';ctx.fillRect(0,0,640,480);
        ctx.imageSmoothingEnabled=false;
        if(s.grain)ctx.drawImage(grain,s.shift,0);
        if(s.qr)ctx.drawImage(qr,320-s.edge/2+s.shift,240-s.edge/2,s.edge,s.edge);
      },45);
      navigator.mediaDevices.getUserMedia=async()=>window.tableStream=canvas.captureStream(20);
    }""", "data:image/png;base64," + base64.b64encode(QR).decode())
    page.get_by_role("button", name="Ver na minha mesa").last.click()
    page.get_by_role("button", name="Iniciar realidade aumentada", exact=True).click()
    expect(page.get_by_text("Mesa localizada pelo QR", exact=False)).to_be_visible(timeout=90000)
    page.mouse.click(195, 422)
    expect(page.get_by_text("Mova o celular mantendo o QR visível")).to_be_visible(timeout=10000)
    readout = page.get_by_text("Distância estimada", exact=False)
    expect(readout).to_contain_text("altura pelo QR")
    near = int(re.search(r"≈ (\d+)", readout.inner_text())[1])
    page.evaluate("Object.assign(tableFixture,{edge:82,shift:18})")
    expect(readout).not_to_contain_text(f"≈ {near} cm",timeout=10000)
    far = int(re.search(r"≈ (\d+)", readout.inner_text())[1])
    assert far >= near + 6, (near, far)
    page.evaluate("tableFixture.qr=false")
    expect(page.get_by_text("O QR saiu de vista.",exact=False)).to_be_visible()
    expect(readout).not_to_be_visible()
    page.evaluate("tableFixture.qr=true")
    expect(page.get_by_text("Mova o celular mantendo o QR visível")).to_be_visible()
    page.evaluate("Object.assign(tableFixture,{qr:false,grain:true})")
    page.get_by_role("button",name="Continuar sem o QR").click()
    page.mouse.click(195,422)
    texture = page.get_by_text("Mesa em foco",exact=False)
    expect(texture).to_be_visible(timeout=15000)
    for shift in (4,8,12,16):
        page.evaluate("(dx)=>tableFixture.shift=dx",shift)
        page.wait_for_timeout(200)
    expect(texture).to_be_visible()
    page.evaluate("tableFixture.grain=false")
    expect(page.get_by_text("Referência perdida.",exact=False)).to_be_visible()
    page.get_by_role("button",name="Fechar realidade aumentada").click()
    assert page.evaluate("tableStream.getTracks().every(t=>t.readyState==='ended')")
    assert not errors, errors
    print(f"Moving video: QR {near} -> {far} cm, loss/reacquisition, texture tracking and cleanup passed.")
    browser.close()
