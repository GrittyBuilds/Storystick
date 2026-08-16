import sys,os,re,base64; sys.path.insert(0,'/root/storystick/lib')
import sslogo as L
C=dict(L.C); C['ember']='#EFA860'; C['cedar_deep']='#9E5813'; C['green_deep']='#177C54'
FONTS=open(os.path.join(os.path.dirname(__file__),'..','web','fonts.css')).read()

def inline(name):
    s=open(f'logo/svg/{name}.svg').read()
    s=re.sub(r'\swidth="[\d.]+"','',s,count=1); s=re.sub(r'\sheight="[\d.]+"','',s,count=1)
    s=re.sub(r'<rect width="[\d.]+" height="[\d.]+" fill="#[0-9A-Fa-f]{6}"/>','',s,count=1)
    return s

def base(src):
    src=src.replace('/*FONTS*/',FONTS)
    for m in set(re.findall(r'\{\{svg:([a-z0-9\-]+)-nobg\}\}', src)):
        src=src.replace('{{svg:%s-nobg}}'%m, inline(m))
    return src

# ---------- canvas renderer ----------
def canvas(w=760,h=430,dark=True):
    bg   = '#0B1A2B' if dark else C['vellum']
    gl   = '#A9C7E5' if dark else '#0F2338'
    geo  = '#A9C7E5' if dark else '#0F2338'
    dim  = '#3E86CE' if dark else '#1B5FA6'
    dtx  = '#A9C7E5' if dark else '#46525E'
    sel  = C['cedar']; snap = '#3FCB95' if dark else C['green_deep'] if 'green_deep' in C else '#177C54'
    gmin = .055 if dark else .07; gmaj=.12 if dark else .16
    g=[]
    for x in range(0,w,14):
        g.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{h}" stroke="{gl}" stroke-width="1" opacity="{gmaj if x%70==0 else gmin}"/>')
    for y in range(0,h,14):
        g.append(f'<line x1="0" y1="{y}" x2="{w}" y2="{y}" stroke="{gl}" stroke-width="1" opacity="{gmaj if y%70==0 else gmin}"/>')
    plan=(f'<g fill="none" stroke="{geo}" stroke-width="1.6">'
          f'<rect x="126" y="70" width="420" height="266"/>'
          f'<path d="M126 210h182M308 210v126"/>'
          f'<path d="M420 70v56M420 154v56"/>'   # window opening in top wall region
          f'</g>'
          f'<g fill="none" stroke="{sel}" stroke-width="2.6"><path d="M308 70v140"/></g>'
          # door swing
          f'<g fill="none" stroke="{geo}" stroke-width="1.2" opacity=".75"><path d="M154 336v-46a46 46 0 0 1 46 46" /></g>'
          # fixtures
          f'<g fill="none" stroke="{geo}" stroke-width="1.2" opacity=".8">'
          f'<rect x="336" y="238" width="70" height="42" rx="6"/><circle cx="470" cy="112" r="22"/>'
          f'<rect x="448" y="240" width="76" height="76" rx="8"/></g>'
          # dimension strings
          f'<g stroke="{dim}" stroke-width="1" stroke-dasharray="3 2">'
          f'<path d="M126 372h420M126 364v16M546 364v16M308 364v16"/>'
          f'<path d="M582 70v266M574 70h16M574 336h16"/></g>'
          f'<rect x="304" y="66" width="8" height="8" fill="{snap}"/>'
          f'<rect x="542" y="332" width="8" height="8" fill="{snap}"/>'
          f'<rect x="122" y="66" width="8" height="8" fill="{snap}"/>')
    tx=(f'<text x="217" y="390" font-family="IBM Plex Mono" font-size="11.5" fill="{dtx}" text-anchor="middle">12\'-4 1/2"</text>'
        f'<text x="427" y="390" font-family="IBM Plex Mono" font-size="11.5" fill="{dtx}" text-anchor="middle">9\'-8"</text>'
        f'<text x="596" y="207" font-family="IBM Plex Mono" font-size="11.5" fill="{dtx}">8\'-2"</text>'
        f'<text x="318" y="132" font-family="IBM Plex Mono" font-size="11.5" fill="{C["ember"] if dark else C["cedar_deep"]}">SELECTED</text>'
        f'<text x="628" y="46" font-family="IBM Plex Mono" font-size="10.5" fill="{"#8A97A3" if dark else "#65717C"}">SNAP 16 O.C.</text>')
    return (f'<svg viewBox="0 0 {w} {h}" style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid slice">'
            f'<rect width="{w}" height="{h}" fill="{bg}"/>{"".join(g)}{plan}{tx}</svg>')

# ---------- toolbar ----------
ICONS = {
 'select':'<path d="M4 3l7.5 15 2.2-6.3L20 9.5z"/>',
 'wall':'<path d="M3 8h18M3 16h18M3 8v8M21 8v8M9 8v8M15 8v8"/>',
 'rect':'<rect x="4" y="5" width="16" height="14" rx="1"/>',
 'line':'<path d="M4 20L20 4"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/>',
 'arc':'<path d="M4 20a16 16 0 0 1 16-16"/><circle cx="4" cy="20" r="1.6"/>',
 'door':'<path d="M5 20V5h8v15M13 20a8 8 0 0 0-8-8"/>',
 'window':'<rect x="3" y="8" width="18" height="8"/><path d="M12 8v8"/>',
 'dim':'<path d="M3 12h18M3 8v8M21 8v8M8 10l-2 2 2 2M16 10l2 2-2 2"/>',
 'text':'<path d="M5 6h14M12 6v13M9 19h6"/>',
 'measure':'<rect x="2" y="9" width="20" height="7" rx="1"/><path d="M6 9v3M10 9v4M14 9v3M18 9v4"/>',
 'layers':'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
}
def toolbar():
    order=[('select',0),('wall',1),('rect',0),('line',0),('arc',0),'sep',('door',0),('window',0),'sep',
           ('dim',0),('text',0),('measure',0),'sep',('layers',0)]
    out=[]
    for it in order:
        if it=='sep': out.append('<div class="sep"></div>'); continue
        k,on=it
        out.append(f'<button class="{"on" if on else ""}" title="{k}"><svg viewBox="0 0 24 24">{ICONS[k]}</svg></button>')
    return f'<div class="toolbar">{"".join(out)}</div>'

# ---------- token table ----------
TOK=[("--blueprint","#0F2338","Canvas chrome, headers, reverse fields"),
     ("--canvas","#0B1A2B","The drawing surface in Blueprint mode"),
     ("--panel","#132B44","Side panels and the toolbar body"),
     ("--blue","#1B5FA6","Primary actions, links, active tools"),
     ("--sky","#3E86CE","Hover on blue, dimension lines on dark"),
     ("--chalk","#A9C7E5","Geometry and grid on dark, secondary text on dark"),
     ("--cedar","#D98235","Selection, active tool, the one primary CTA"),
     ("--ember","#EFA860","Cedar for dark surfaces"),
     ("--cedar-deep","#9E5813","Cedar that carries text on light"),
     ("--vellum","#F7F4ED","Default light background, Paper-mode canvas"),
     ("--paper","#FFFFFF","Cards, inputs, elevated surfaces"),
     ("--graphite","#46525E","Body copy on light"),
     ("--slate","#65717C","Secondary text, labels, captions"),
     ("--slate-40","#8A97A3","Disabled, placeholder, decorative"),
     ("--mist","#E4E9EE","Borders, dividers, rules"),
     ("--green / --green-deep","#1F9D6B / #177C54","Snapped, square, in tolerance"),
     ("--red / --red-deep","#D14343 / #B93636","Out of tolerance, conflict, destructive")]
def tokrows():
    r=[]
    for n,h,u in TOK:
        dots=''.join(f'<span class="swdot" style="background:{x.strip()}"></span>' for x in h.split('/'))
        r.append(f'<tr><td class="mono">{n}</td><td><div class="swrow">{dots}<span class="mono" style="font-size:11.5px">{h}</span></div>'
                 f'<div class="small muted" style="margin-top:3px">{u}</div></td></tr>')
    return ''.join(r)

if __name__=='__main__':
    s=base(open('ui/uikit.src.html').read())
    s=s.replace('{{TOOLBAR}}', toolbar())
    s=s.replace('{{TOKENS_COLOR}}', tokrows())
    s=s.replace('{{CANVAS_DARK}}', canvas(760,430,True))
    s=s.replace('{{CANVAS_LIGHT}}', canvas(760,430,False))
    open('ui/storystick-ui-kit.html','w').write(s)
    print('uikit KB', round(os.path.getsize('ui/storystick-ui-kit.html')/1024), 'left:', re.findall(r'\{\{[^}]+\}\}', s)[:4])
