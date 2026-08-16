import sys,os; sys.path.insert(0,'/root/storystick/lib')
import sslogo as L, cairosvg
C=L.C; OUT='/root/storystick/icon'; os.makedirs(OUT,exist_ok=True)

def grid(w,color,op=0.07,step=64,sw=2):
    g=[]
    x=step
    while x<w:
        g.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{w}"/>'); g.append(f'<line x1="0" y1="{x}" x2="{w}" y2="{x}"/>')
        x+=step
    return f'<g stroke="{color}" stroke-width="{sw}" opacity="{op}">{"".join(g)}</g>'

# compact mark for tiny sizes: 2 notches, chunkier
COMPACT = ("M37 8H49A11 11 0 0 1 60 19V79A11 11 0 0 1 49 90H37A11 11 0 0 1 26 79V19A11 11 0 0 1 37 8Z"
           "M60 28H41A4 4 0 0 0 41 36H60Z" "M60 62H41A4 4 0 0 0 41 70H60Z")
def compact(bar,accent,size=120):
    s=size/120.0
    return (f'<g transform="scale({s:.6f})"><path d="{COMPACT}" fill-rule="evenodd" fill="{bar}"/>'
            f'<path d="{L.BASE}" fill="{bar}"/><path d="{L.LINE}" fill="{accent}"/></g>')

def icon(name, bg, barc, accentc, size=1024, radius=0.2237, gridc=None, bleed=False, compact_mark=False, scale=0.60):
    r=0 if bleed else size*radius
    ms=size*scale
    ox=(size-ms)/2; oy=(size-ms)/2
    m = compact(barc,accentc,ms) if compact_mark else L.mark(barc,None,accentc,size=ms)[0]
    inner=(f'<rect width="{size}" height="{size}" rx="{r}" fill="{bg}"/>'
           + (grid(size,gridc,0.09,size/16,max(1,size/512)) if gridc else '')
           + f'<g transform="translate({ox:.2f},{oy:.2f})">{m}</g>')
    if not bleed:
        inner=f'<clipPath id="c{name}"><rect width="{size}" height="{size}" rx="{r}"/></clipPath><g clip-path="url(#c{name})">{inner}</g>'
    s=L.svg(size,size,inner)
    open(f'{OUT}/{name}.svg','w').write(s)
    return s

specs=[
 ('app-icon',        C['blueprint'], C['vellum'], C['cedar'], C['chalk'], False, False),
 ('app-icon-light',  C['vellum'],    C['blue'],   C['cedar'], C['blue'],  False, False),
 ('app-icon-blue',   C['blue'],      C['vellum'], C['cedar_lt'], C['vellum'], False, False),
 ('app-icon-maskable',C['blueprint'],C['vellum'], C['cedar'], C['chalk'], True,  False),
 ('favicon-mark',    C['blueprint'], C['vellum'], C['cedar'], None,       False, True),
]
for nm,bg,bar,acc,gc,bleed,cm in specs:
    sc = 0.52 if bleed else 0.60
    s=icon(nm,bg,bar,acc,gridc=gc,bleed=bleed,compact_mark=cm,scale=sc)
    for px in ([1024,512,256,192,180,120,96,64] if 'favicon' not in nm else [64,48,32,16]):
        cairosvg.svg2png(bytestring=s.encode(), write_to=f'{OUT}/{nm}-{px}.png', output_width=px, output_height=px)
print(sorted(os.listdir(OUT))[:6], len(os.listdir(OUT)))
