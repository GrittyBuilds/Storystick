import sys, os; sys.path.insert(0,'/root/storystick/lib')
import sslogo as L, cairosvg
C=L.C
OUT='/root/storystick/logo'; os.makedirs(OUT+'/svg',exist_ok=True); os.makedirs(OUT+'/png',exist_ok=True)
TAG="Draw it before you build it."

def horizontal(bar,tick,accent,wfill,wfill2=None,ms=100,pad=0):
    m,_=L.mark(bar,tick,accent,size=ms)
    ws=ms*0.555
    wm,ww=L.wordmark(size=ws, fill=wfill, fill2=wfill2)
    gap=ms*0.26
    # mark content spans y 8..110 of 120 => in scaled units
    ct=ms*8/120; cb=ms*110/120; ch=cb-ct
    cap=ws*0.70
    baseline = ct + ch/2 + cap/2
    body=f'<g transform="translate(0,0)">{m}</g><g transform="translate({ms+gap:.2f},{baseline:.2f})">{wm}</g>'
    W=ms+gap+ww; H=ms
    return body,W,H

def horizontal_tag(bar,tick,accent,wfill,wfill2=None,ms=110):
    m,_=L.mark(bar,tick,accent,size=ms)
    ws=ms*0.555; wm,ww=L.wordmark(size=ws, fill=wfill, fill2=wfill2)
    ts=ms*0.195
    tg,tw=L.text_path(TAG, "Inter-Medium.ttf", size=ts, tracking=0.012)
    gap=ms*0.26
    ct=ms*8/120; cb=ms*110/120
    wb = ct + 0.55*(cb-ct)          # wordmark baseline
    tb = wb + ts*2.05               # tagline baseline
    body=(f'{m}<g transform="translate({ms+gap:.2f},{wb:.2f})">{wm}</g>'
          f'<g fill="{C["graphite"] if wfill!=C["vellum"] else C["chalk"]}" transform="translate({ms+gap+1:.2f},{tb:.2f})">{tg}</g>')
    return body, ms+gap+max(ww,tw), ms

def stacked(bar,tick,accent,wfill,wfill2=None,ms=120,tag=False):
    m,_=L.mark(bar,tick,accent,size=ms)
    ws=ms*0.56; wm,ww=L.wordmark(size=ws, fill=wfill, fill2=wfill2)
    W=max(ms,ww)
    gap=ms*0.13
    base=ms*(110/120)+gap+ws*0.70
    body=f'<g transform="translate({(W-ms)/2:.2f},0)">{m}</g><g transform="translate({(W-ww)/2:.2f},{base:.2f})">{wm}</g>'
    H=base+ws*0.06
    if tag:
        ts=ms*0.145
        tg,tw=L.text_path(TAG,"Inter-Medium.ttf",size=ts,tracking=0.02)
        tb=base+ts*2.4
        body+=f'<g fill="{C["graphite"] if wfill!=C["vellum"] else C["chalk"]}" transform="translate({(W-tw)/2:.2f},{tb:.2f})">{tg}</g>'
        W=max(W,tw); H=tb+ts*0.25
        body=f'<g transform="translate({0:.2f},0)">{body}</g>'
    return body,W,H

def write(name, body, W, H, bg=None, padr=0.10):
    p=max(W,H)*padr
    inner=f'<g transform="translate({p:.2f},{p:.2f})">{body}</g>'
    s=L.svg(W+2*p, H+2*p, inner, bg=bg)
    open(f'{OUT}/svg/{name}.svg','w').write(s)
    cairosvg.svg2png(bytestring=s.encode(), write_to=f'{OUT}/png/{name}@2x.png', output_width=2400 if W>H else 1200)
    cairosvg.svg2png(bytestring=s.encode(), write_to=f'{OUT}/png/{name}.png', output_width=1200 if W>H else 600)
    return name

# ---- MARK ----
for nm,args,bg in [('mark',(C['blue'],None,C['cedar']),None),
                   ('mark-navy',(C['blueprint'],None,C['cedar']),None),
                   ('mark-reverse',(C['vellum'],C['blueprint'],C['cedar_lt']),None),
                   ('mark-mono-black',('#000000','#FFFFFF','#000000'),None),
                   ('mark-mono-white',('#FFFFFF','#0F2338','#FFFFFF'),None)]:
    m,_=L.mark(*args,size=120)
    write(nm, m, 120,120, bg=bg, padr=0.06)

# ---- WORDMARKS ----
for nm,kw in [('wordmark',dict(fill=C['blueprint'])),
              ('wordmark-twotone',dict(fill=C['blueprint'],fill2=C['cedar'])),
              ('wordmark-blue',dict(fill=C['blue'])),
              ('wordmark-white',dict(fill='#FFFFFF')),
              ('wordmark-black',dict(fill='#000000'))]:
    b,w=L.wordmark(size=120,**kw); write(nm,f'<g transform="translate(0,{120*0.70:.2f})">{b}</g>',w,120*0.70,padr=0.12)

# ---- LOCKUPS ----
LK={
 'lockup-horizontal': (horizontal,(C['blue'],None,C['cedar'],C['blueprint']),{},None),
 'lockup-horizontal-twotone': (horizontal,(C['blue'],None,C['cedar'],C['blueprint']),{'wfill2':C['cedar']},None),
 'lockup-horizontal-reverse': (horizontal,(C['vellum'],None,C['cedar_lt'],C['vellum']),{},C['blueprint']),
 'lockup-horizontal-mono-black': (horizontal,('#000',None,'#000','#000'),{},None),
 'lockup-horizontal-mono-white': (horizontal,('#fff',None,'#fff','#fff'),{},C['blueprint']),
}
for nm,(fn,a,kw,bg) in LK.items():
    b,W,H=fn(*a,**kw); write(nm,b,W,H,bg=bg)

b,W,H=horizontal_tag(C['blue'],None,C['cedar'],C['blueprint']); write('lockup-horizontal-tagline',b,W,H)
b,W,H=horizontal_tag(C['vellum'],None,C['cedar_lt'],C['vellum']); write('lockup-horizontal-tagline-reverse',b,W,H,bg=C['blueprint'])
b,W,H=stacked(C['blue'],None,C['cedar'],C['blueprint']); write('lockup-stacked',b,W,H)
b,W,H=stacked(C['vellum'],None,C['cedar_lt'],C['vellum']); write('lockup-stacked-reverse',b,W,H,bg=C['blueprint'])
b,W,H=stacked(C['blue'],None,C['cedar'],C['blueprint'],tag=True); write('lockup-stacked-tagline',b,W,H)
print('logo files:', len(os.listdir(OUT+'/svg')), len(os.listdir(OUT+'/png')))
