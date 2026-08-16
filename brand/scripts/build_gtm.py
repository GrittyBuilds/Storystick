import sys,os,re; sys.path.insert(0,'/root/storystick')
from build_web import base, canvas, inline, FONTS
sys.path.insert(0,'/root/storystick/lib'); import sslogo as L
C=L.C
os.makedirs('gtm/social',exist_ok=True); os.makedirs('gtm/screenshots',exist_ok=True)
GRID = ("background-image:linear-gradient(#A9C7E5 1px,transparent 1px),"
        "linear-gradient(90deg,#A9C7E5 1px,transparent 1px);background-size:%dpx %dpx;opacity:.075")
HEAD = ("<style>"+FONTS+"""
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}
.brand{font-family:'Space Grotesk',sans-serif;font-weight:500;letter-spacing:-.03em}
.mono{font-family:'IBM Plex Mono',monospace}
.f{position:relative;overflow:hidden;background:#0F2338}
.gr{position:absolute;inset:0}
.ct{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center}
</style>""")

def page(w,h,body):
    return f"<!DOCTYPE html><html><head><meta charset='utf-8'>{HEAD}</head><body><div class='f' style='width:{w}px;height:{h}px'>{body}</div></body></html>"

def shots():
    out={}
    # OG image 1200x630
    out['og-image-1200x630']=(1200,630,
      f"<div class='gr' style='{GRID%(56,56)}'></div><div class='ct' style='padding:0 84px'>"
      f"<div style='width:300px;margin-bottom:40px'>{inline('lockup-horizontal-reverse')}</div>"
      f"<div class='brand' style='font-size:76px;line-height:1.03;color:#F7F4ED;max-width:15ch'>Draw it before you build it.</div>"
      f"<div style='font-size:25px;color:#A9C7E5;margin-top:26px;max-width:44ch;line-height:1.5'>Plans, elevations, materials, and cut lists — for anything you build.</div>"
      f"<div class='mono' style='position:absolute;bottom:56px;font-size:15px;letter-spacing:.16em;color:#8A97A3'>STORYSTICK.APP</div></div>")
    # X banner 1500x500
    out['banner-x-1500x500']=(1500,500,
      f"<div class='gr' style='{GRID%(50,50)}'></div><div class='ct' style='padding:0 90px'>"
      f"<div style='width:430px;margin-bottom:28px'>{inline('lockup-horizontal-reverse')}</div>"
      f"<div style='font-size:30px;color:#A9C7E5;max-width:46ch;line-height:1.45'>Draw it before you build it. Furniture, renovations, structures.</div></div>")
    # LinkedIn banner 1128x191
    out['banner-linkedin-1128x191']=(1128,191,
      f"<div class='gr' style='{GRID%(36,36)}'></div>"
      f"<div class='ct' style='padding:0 52px;flex-direction:row;align-items:center;gap:44px'>"
      f"<div style='width:300px'>{inline('lockup-horizontal-reverse')}</div>"
      f"<div style='font-size:20px;color:#A9C7E5;line-height:1.4'>Plans for anything you build.</div></div>")
    # YouTube banner 2560x1440 (safe 1546x423 centred)
    out['banner-youtube-2560x1440']=(2560,1440,
      f"<div class='gr' style='{GRID%(80,80)}'></div>"
      f"<div class='ct' style='align-items:center;text-align:center'>"
      f"<div style='width:560px;margin:0 auto 46px'>{inline('lockup-stacked-reverse')}</div>"
      f"<div style='font-size:52px;color:#A9C7E5;line-height:1.4'>Draw it before you build it.</div></div>")
    # Avatar 400
    out['avatar-400']=(400,400,
      f"<div class='gr' style='{GRID%(28,28)}'></div>"
      f"<div class='ct' style='align-items:center'><div style='width:212px'>{inline('mark-reverse')}</div></div>")
    # Avatar light 400
    out['avatar-light-400']=(400,400,
      f"<div class='f' style='position:absolute;inset:0;background:#F7F4ED'></div>"
      f"<div class='ct' style='align-items:center'><div style='width:212px'>{inline('mark')}</div></div>")
    return out

def phone(headline, sub, inner, tone='dark'):
    W,H=1290,2796
    bg = '#0F2338' if tone=='dark' else '#F7F4ED'
    hc = '#F7F4ED' if tone=='dark' else '#0F2338'
    sc = '#A9C7E5' if tone=='dark' else '#65717C'
    return (W,H,
      f"<div class='f' style='position:absolute;inset:0;background:{bg}'></div>"
      + (f"<div class='gr' style='{GRID%(72,72)}'></div>" if tone=='dark' else '')
      + f"<div class='ct' style='padding:150px 96px;justify-content:flex-start'>"
        f"<div class='brand' style='font-size:96px;line-height:1.05;color:{hc};max-width:15ch'>{headline}</div>"
        f"<div style='font-size:38px;color:{sc};margin-top:34px;line-height:1.5;max-width:32ch'>{sub}</div>"
        f"<div style='margin-top:96px;border-radius:40px;overflow:hidden;border:2px solid {'#23405E' if tone=='dark' else '#E4E9EE'};box-shadow:0 40px 100px rgba(0,0,0,.4)'>{inner}</div>"
        f"</div>")

def cutlist_panel(dark=True):
    bg='#0B1A2B' if dark else '#FFFFFF'; tc='#A9C7E5' if dark else '#46525E'; hc='#EFA860' if dark else '#9E5813'
    rows=[("2","SIDE",'72"','11-1/4"','3/4"'),("4","SHELF",'33-1/2"','11"','3/4"'),
          ("1","BACK",'71-1/4"','34"','1/4"'),("2","RAIL",'33-1/2"','2-1/2"','3/4"'),
          ("4","CLEAT",'10-1/2"','1-1/2"','3/4"')]
    body=''.join(f"<tr><td style='color:{hc}'>{a}</td><td>{b}</td><td style='text-align:right'>{c}</td>"
                 f"<td style='text-align:right'>{d}</td><td style='text-align:right'>{e}</td></tr>" for a,b,c,d,e in rows)
    return (f"<div style='background:{bg};padding:52px 56px;font-family:\"IBM Plex Mono\",monospace;font-size:34px;color:{tc};line-height:2.1'>"
            f"<div style='color:{hc};letter-spacing:.09em;margin-bottom:22px'>CUT LIST — SHELF UNIT</div>"
            f"<table style='width:100%;border-collapse:collapse'>{body}</table>"
            f"<div style='color:#8A97A3;margin-top:26px;font-size:30px'>14.2 bd-ft · 0.9 waste at 1/8\" kerf</div></div>")

def dims_panel():
    return ("<div style='background:#FFFFFF;padding:54px 56px'>"
      "<div style='font-family:Inter;font-size:28px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#65717C;margin-bottom:16px'>Wall length</div>"
      "<div style='font-family:\"IBM Plex Mono\",monospace;font-size:52px;color:#0F2338;border:3px solid #1B5FA6;border-radius:18px;padding:24px 28px'>12&#39;-4 1/2&quot;</div>"
      "<div style='display:flex;gap:0;margin-top:34px;border:3px solid #C9D4DE;border-radius:18px;overflow:hidden;font-family:\"IBM Plex Mono\",monospace;font-size:34px'>"
      "<div style='flex:1;background:#0F2338;color:#fff;padding:24px;text-align:center'>FT-IN</div>"
      "<div style='flex:1;color:#65717C;padding:24px;text-align:center'>IN</div>"
      "<div style='flex:1;color:#65717C;padding:24px;text-align:center'>MM</div></div>"
      "<div style='font-family:Inter;font-size:30px;color:#177C54;margin-top:30px'>&#10003; Snapped to 16&quot; on-center</div></div>")

def screens():
    s={}
    s['01-hero']=phone("Draw it before you build it.","A real, dimensioned plan — from a bookshelf to a whole addition.",
        canvas(1100,1000,True))
    s['02-cutlist']=phone("The cut list writes itself.","Move a shelf, three lines change. Kerf-aware, grain-aware.",
        cutlist_panel(True))
    s['03-units']=phone("Feet-and-inches. Or millimeters.","Type it the way you say it. Switch the whole project either way.",
        dims_panel(),'light')
    s['04-paper']=phone("A set a contractor will accept.","Title block, scale bar, sheet numbers. Print it or send it.",
        canvas(1100,1000,False),'light')
    return s

if __name__=='__main__':
    from playwright.sync_api import sync_playwright
    jobs=[]
    for n,(w,h,b) in shots().items(): jobs.append(('gtm/social/'+n+'.png',w,h,page(w,h,b)))
    for n,(w,h,b) in screens().items(): jobs.append(('gtm/screenshots/'+n+'-1290x2796.png',w,h,page(w,h,b)))
    with sync_playwright() as p:
        br=p.chromium.launch()
        for path,w,h,html in jobs:
            pg=br.new_page(viewport={'width':w,'height':h}, device_scale_factor=1)
            pg.set_content(html); pg.wait_for_timeout(700)
            pg.screenshot(path=path, clip={'x':0,'y':0,'width':w,'height':h}); pg.close()
            print('wrote', path)
        br.close()
