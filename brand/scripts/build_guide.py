import sys,os,re,json,base64; sys.path.insert(0,'/root/storystick/lib')
import sslogo as L, cairosvg
C=L.C
src=open('brand/guide.src.html').read()
src=src.replace('/*FONTS*/', open('web/fonts.css').read())

def inline(name, cls=''):
    s=open(f'logo/svg/{name}.svg').read()
    s=re.sub(r'\swidth="[\d.]+"','',s,count=1); s=re.sub(r'\sheight="[\d.]+"','',s,count=1)
    s=s.replace('<svg ', f'<svg preserveAspectRatio="xMidYMid meet" ',1)
    # drop opaque background rects so lockups sit on the card colour
    s=re.sub(r'<rect width="[\d.]+" height="[\d.]+" fill="#[0-9A-Fa-f]{6}"/>','',s,count=1)
    return s
for m in set(re.findall(r'\{\{svg:([a-z0-9\-]+)-nobg\}\}', src)):
    src=src.replace('{{svg:%s-nobg}}'%m, inline(m))

# raw inner for the clear-space diagram
b,W,H = None,None,None
import importlib.util
spec=importlib.util.spec_from_file_location('bl','/root/storystick/build_logo.py')
mk,_=L.mark(C['blue'],None,C['cedar'],size=100)
ws=100*0.555; wm,ww=L.wordmark(size=ws, fill=C['blueprint'])
ct=100*8/120; cb=100*110/120; base=ct+(cb-ct)/2+ws*0.70/2
src=src.replace('{{raw:lockup-horizontal-inner}}', f'{mk}<g transform="translate({100+26},{base:.2f})">{wm}</g>')

# ---------- swatches ----------
def sw(nm, hexv, use, textc=None):
    tc = textc or ('#FFFFFF' if nm in ('Blueprint','Drafting Blue','Ink','Canvas') else C['blueprint'])
    h=hexv.lstrip('#'); r,g,bb=[int(h[i:i+2],16) for i in (0,2,4)]
    return (f'<div class="sw"><div class="chip" style="background:{hexv}"></div><div class="info">'
            f'<div class="nm">{nm}</div><div class="hx">{hexv} &middot; {r} {g} {bb}</div>'
            f'<div class="use">{use}</div></div></div>')
core=[("Blueprint","#0F2338","Primary dark. Canvas, headers, reverse fields, the app icon ground."),
      ("Drafting Blue","#1B5FA6","Primary brand. The mark, primary buttons, links, active tools."),
      ("Cedar","#D98235","The accent. The transfer line, selection, one CTA per screen. 5% of any layout."),
      ("Vellum","#F7F4ED","Paper. The default light background — warmer than white, easier at length.")]
supp=[("Sky","#3E86CE","Hover and focus on blue. Dimension lines on dark canvas."),
      ("Chalk","#A9C7E5","Blueprint line work, grid, secondary text on dark."),
      ("Ember","#EFA860","Cedar for dark backgrounds. 7.92:1 on Blueprint."),
      ("Cedar Deep","#9E5813","Cedar that can carry text on light. 4.95:1 on Vellum."),
      ("Graphite","#46525E","Body copy on light. 7.27:1 on Vellum."),
      ("Slate","#65717C","Secondary text, captions, labels. 4.54:1 on Vellum."),
      ("Slate 40","#8A97A3","Disabled states, placeholder text, decorative rules only."),
      ("Mist","#E4E9EE","Borders, dividers, table rules, inactive fills.")]
func=[("Level Green","#1F9D6B","Snapped, square, in tolerance. Shapes and icons on light."),
      ("Level Green Deep","#177C54","The text-safe green. 4.72:1 on Vellum."),
      ("Plumb Red","#D14343","Out of tolerance, conflict, destructive action."),
      ("Plumb Red Deep","#B93636","The text-safe red. 5.25:1 on Vellum.")]
for tok,rows in [('{{SW_CORE}}',core),('{{SW_SUPPORT}}',supp),('{{SW_FUNC}}',func)]:
    src=src.replace(tok, ''.join(sw(*r) for r in rows))

# ---------- contrast table ----------
def lin(c):
    c=c/255; return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def Lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16) for i in (0,2,4)]
    return .2126*lin(r)+.7152*lin(g)+.0722*lin(b)
def cr(a,b):
    la,lb=Lum(a),Lum(b); return round((max(la,lb)+.05)/(min(la,lb)+.05),2)
pairs=[("Blueprint","#0F2338","Vellum","#F7F4ED"),("Graphite","#46525E","Vellum","#F7F4ED"),
       ("Slate","#65717C","Vellum","#F7F4ED"),("Drafting Blue","#1B5FA6","Vellum","#F7F4ED"),
       ("Cedar","#D98235","Vellum","#F7F4ED"),("Cedar Deep","#9E5813","Vellum","#F7F4ED"),
       ("Vellum","#F7F4ED","Drafting Blue","#1B5FA6"),("Chalk","#A9C7E5","Blueprint","#0F2338"),
       ("Cedar","#D98235","Blueprint","#0F2338"),("Ember","#EFA860","Blueprint","#0F2338"),
       ("Sky","#3E86CE","Blueprint","#0F2338"),("Chalk","#A9C7E5","Canvas","#0B1A2B")]
rows=[]
for fn,fh,bn,bh in pairs:
    r=cr(fh,bh)
    p1='<span class="pill pass">PASS</span>' if r>=4.5 else '<span class="pill fail">FAIL</span>'
    p2='<span class="pill pass">PASS</span>' if r>=3 else '<span class="pill fail">FAIL</span>'
    rows.append(f'<tr><td>{fn} <span class="mono muted" style="font-size:11px">{fh}</span></td>'
                f'<td>{bn}</td><td class="mono">{r}:1</td><td>{p1}</td><td>{p2}</td></tr>')
src=src.replace('{{CONTRAST}}', ''.join(rows))

# ---------- type scale ----------
scale=[("Display","Space Grotesk Medium","64 / 66 / -3%","var(--brand)",64,500,"Draw it before you build it."),
       ("H1","Space Grotesk Medium","44 / 48 / -2.5%","var(--brand)",44,500,"Plans for anything you build"),
       ("H2","Space Grotesk Medium","32 / 38 / -1.5%","var(--brand)",32,500,"Every build starts on the stick"),
       ("H3","Space Grotesk Medium","21 / 28 / -1%","var(--brand)",21,500,"Set the wall height"),
       ("Body Large","Inter Regular","18 / 30 / 0","var(--sans)",18,400,"Capture a dimension once and it carries through every drawing."),
       ("Body","Inter Regular","16 / 26 / 0","var(--sans)",16,400,"Draw a wall, then set its height. Storystick keeps the cut list current."),
       ("Small","Inter Regular","14 / 21 / 0","var(--sans)",14,400,"Feet-and-inches or millimeters. Switch anytime."),
       ("Label","Inter SemiBold","12 / 16 / +8%","var(--sans)",12,600,"WALL HEIGHT"),
       ("Dimension","IBM Plex Mono Medium","13 / 18 / +1%","var(--mono)",13,500,'96-1/4"  ×  33-1/2"  ×  3/4"'),
       ("Code / Data","IBM Plex Mono Regular","12 / 20 / +1%","var(--mono)",12,400,"SKU 04-WAL-072  QTY 2  KERF 0.125")]
ts=[]
for nm,face,spec,fam,size,wt,demo in scale:
    lsp = '.08em' if nm=='Label' else ('.01em' if 'Mono' in face else '-0.02em')
    tf='uppercase' if nm=='Label' else 'none'
    ts.append(f'<div class="tsample"><div class="demo" style="font-family:{fam};font-size:{size}px;'
              f'font-weight:{wt};letter-spacing:{lsp};text-transform:{tf}">{demo}</div>'
              f'<div class="spec"><span>{nm}</span><span>{face}</span><span>{spec}</span></div></div>')
src=src.replace('{{TYPESCALE}}', ''.join(ts))

# ---------- misuse ----------
def dd(label, body, ok=False):
    cls='yes' if ok else 'no'; tag='DO' if ok else "DON'T"
    return (f'<div class="dd {cls}"><div class="art">{body}</div>'
            f'<div class="lbl"><b>{tag}</b><span>{label}</span></div></div>')
def m(**kw): return L.mark(size=110,**kw)[0]
good=L.svg(120,120,L.mark(C['blue'],None,C['cedar'],size=110,x=5,y=5)[0])
bad_color=L.svg(120,120,L.mark('#7B3FA0',None,'#37C26B',size=110,x=5,y=5)[0])
bad_stretch=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 120"><g transform="translate(5,5) scale(1.42,1)">{L.mark(C["blue"],None,C["cedar"],size=110)[0]}</g></svg>'
bad_rot=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g transform="rotate(-22 60 60) translate(5,5)">{L.mark(C["blue"],None,C["cedar"],size=110)[0]}</g></svg>'
bad_fill=L.svg(120,120,L.mark(C['blue'],C['green'],C['cedar'],size=110,x=5,y=5)[0])
bad_shadow=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><filter id="sh"><feDropShadow dx="4" dy="5" stdDeviation="3" flood-color="#0F2338" flood-opacity=".5"/></filter></defs><g filter="url(#sh)" transform="translate(2,2)">{L.mark(C["blue"],None,C["cedar"],size=105)[0]}</g></svg>'
bad_outline=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g transform="translate(5,5) scale(0.9167)"><path d="{L.STICK}" fill-rule="evenodd" fill="none" stroke="{C["blue"]}" stroke-width="4"/><path d="{L.BASE}" fill="none" stroke="{C["blue"]}" stroke-width="4"/><path d="{L.LINE}" fill="none" stroke="{C["cedar"]}" stroke-width="4"/></g></svg>'
bad_detach=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g transform="translate(5,5) scale(0.9167)"><path d="{L.STICK}" fill-rule="evenodd" fill="{C["blue"]}"/><path d="{L.BASE}" fill="{C["blue"]}"/><g transform="translate(14,-16)"><path d="{L.LINE}" fill="{C["cedar"]}"/></g></g></svg>'
busy=('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">'
      '<rect width="120" height="120" fill="#8A97A3"/>'
      + ''.join(f'<circle cx="{(i*37)%120}" cy="{(i*53)%120}" r="{12+(i%4)*7}" fill="#{["D98235","1B5FA6","46525E","A9C7E5"][i%4]}" opacity=".85"/>' for i in range(9))
      + f'<g transform="translate(5,5)">{L.mark(C["blue"],None,C["cedar"],size=110)[0]}</g></svg>')
items=[dd("Use the mark as drawn, in brand color, with the notches knocked out.",good,ok=True),
       dd("Don't recolor. The palette is the palette.",bad_color),
       dd("Don't stretch, squash, or scale non-proportionally.",bad_stretch),
       dd("Don't rotate. The pole is plumb and the line is level — that's the point.",bad_rot),
       dd("Don't fill the notches with a third color. They are knockouts.",bad_fill),
       dd("Don't add shadows, glows, bevels, or gradients.",bad_shadow),
       dd("Don't outline the mark. It is solid.",bad_outline),
       dd("Don't detach the cedar line from the pole or change its position.",bad_detach),
       dd("Don't set the mark on a busy field without a solid scrim behind it.",busy)]
src=src.replace('{{MISUSE}}', ''.join(items))

# ---------- icons ----------
ic=[]
for nm,cap in [('app-icon','Dark — primary'),('app-icon-light','Light'),('app-icon-blue','Blue'),
               ('app-icon-maskable','Maskable / PWA'),('favicon-mark','Favicon 32')]:
    px = 32 if nm=='favicon-mark' else 256
    b64=base64.b64encode(open(f'icon/{nm}-{px}.png','rb').read()).decode()
    style='border-radius:22%' if nm!='favicon-mark' else 'border-radius:22%;image-rendering:pixelated'
    ic.append(f'<figure><img src="data:image/png;base64,{b64}" style="{style}"><figcaption>{cap}</figcaption></figure>')
src=src.replace('{{ICONS}}', ''.join(ic))

# ---------- canvas demo ----------
def canvas_demo(w=520,h=360):
    g=[]
    for x in range(0,w,13):
        g.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{h}" stroke="#A9C7E5" stroke-width="1" opacity="{0.12 if x%65==0 else 0.055}"/>')
    for y in range(0,h,13):
        g.append(f'<line x1="0" y1="{y}" x2="{w}" y2="{y}" stroke="#A9C7E5" stroke-width="1" opacity="{0.12 if y%65==0 else 0.055}"/>')
    plan=('<g fill="none" stroke="#A9C7E5" stroke-width="1.5">'
          '<rect x="78" y="78" width="286" height="182"/>'
          '<path d="M78 182h130M208 182v78"/>'
          '</g>'
          '<g fill="none" stroke="#D98235" stroke-width="2"><path d="M208 78v104"/></g>'
          '<g stroke="#3E86CE" stroke-width="1" stroke-dasharray="3 2">'
          '<path d="M78 292h286M78 286v12M364 286v12"/></g>'
          '<rect x="204" y="74" width="8" height="8" fill="#1F9D6B"/>'
          '<rect x="360" y="256" width="8" height="8" fill="#1F9D6B"/>')
    txt=('<text x="212" y="300" font-family="IBM Plex Mono" font-size="11" fill="#A9C7E5" text-anchor="middle">24\'-0"</text>'
         '<text x="216" y="132" font-family="IBM Plex Mono" font-size="11" fill="#EFA860">8\'-8"</text>'
         '<text x="400" y="94" font-family="IBM Plex Mono" font-size="10" fill="#8A97A3">SNAP · 16 O.C.</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" style="width:100%;display:block">'
            f'<rect width="{w}" height="{h}" fill="#0B1A2B"/>{"".join(g)}{plan}{txt}</svg>')
src=src.replace('{{CANVAS_DEMO}}', canvas_demo())

open('brand/storystick-brand-guide.html','w').write(src)
print('guide KB', round(os.path.getsize('brand/storystick-brand-guide.html')/1024), 'unresolved:', re.findall(r'\{\{[^}]+\}\}', src)[:5])
