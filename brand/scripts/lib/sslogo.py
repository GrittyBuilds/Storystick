import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

FONTS = "/root/storystick/fonts"
C = {
 "blueprint":"#0F2338","ink":"#0A1826","blue":"#1B5FA6","blue_lt":"#3E86CE",
 "chalk":"#A9C7E5","cedar":"#D98235","cedar_lt":"#EFA860","vellum":"#F7F4ED",
 "graphite":"#46525E","slate":"#8A97A3","mist":"#E4E9EE","green":"#1F9D6B","red":"#D14343",
}
_cache={}
def _font(name):
    if name not in _cache: _cache[name]=TTFont(os.path.join(FONTS,name))
    return _cache[name]

def text_path(s, fontfile="SpaceGrotesk-Medium.ttf", size=100, tracking=0.0):
    """Return (svg path 'd' in y-down coords with baseline at 0, advance width)."""
    f=_font(fontfile); upem=f['head'].unitsPerEm; gs=f.getGlyphSet(); cmap=f.getBestCmap()
    sc=size/upem; x=0.0; ds=[]
    for ch in s:
        gname=cmap.get(ord(ch))
        if gname is None: x+=size*0.35; continue
        pen=SVGPathPen(gs)
        gs[gname].draw(pen)
        d=pen.getCommands()
        if d: ds.append(f'<g transform="translate({x:.3f},0) scale({sc:.6f},{-sc:.6f})"><path d="{d}"/></g>')
        x += gs[gname].width*sc + tracking*size
    return "".join(ds), x

def wordmark(size=100, fill=None, fill2=None, tracking=-0.005, y=0):
    """Two-tone or single-tone 'Storystick'. Returns (svg, width)."""
    fill = fill or C['blueprint']
    if fill2 is None:
        d,w = text_path("Storystick", size=size, tracking=tracking)
        return f'<g fill="{fill}" transform="translate(0,{y})">{d}</g>', w
    d1,w1 = text_path("Story", size=size, tracking=tracking)
    d2,w2 = text_path("stick", size=size, tracking=tracking)
    return (f'<g transform="translate(0,{y})"><g fill="{fill}">{d1}</g>'
            f'<g fill="{fill2}" transform="translate({w1:.3f},0)">{d2}</g></g>', w1+w2)
STICK = ("M37 8H49A11 11 0 0 1 60 19V79A11 11 0 0 1 49 90H37A11 11 0 0 1 26 79V19A11 11 0 0 1 37 8Z"
         "M60 25H42A3 3 0 0 0 42 31H60Z"
         "M60 44H50A3 3 0 0 0 50 50H60Z"
         "M60 63H42A3 3 0 0 0 42 69H60Z")
BASE  = "M20 94H100A8 8 0 0 1 100 110H20A8 8 0 0 1 20 94Z"
LINE  = "M70 23H99A5 5 0 0 1 99 33H70A5 5 0 0 1 70 23Z"

def mark(bar=None, tick=None, accent=None, size=120, x=0, y=0):
    """Storystick mark in a 120x120 box, scaled to `size`.
    tick=None -> notches are knocked out (transparent). tick=<color> -> notches filled."""
    bar = bar or C['blue']; accent = accent or C['cedar']
    s = size/120.0
    fill_rule = ' fill-rule="evenodd"'
    body = '<path d="%s"%s fill="%s"/><path d="%s" fill="%s"/>' % (STICK, fill_rule, bar, BASE, bar)
    if tick not in (None, 'knockout'):
        notches = STICK.split('Z',1)[1] + 'Z'
        body = ('<path d="%s" fill="%s"/><path d="%s" fill="%s"/>'
                '<path d="%s" fill="%s"/>') % (STICK.split('Z')[0]+'Z', bar, BASE, bar, notches, tick)
    body += '<path d="%s" fill="%s"/>' % (LINE, accent)
    return '<g transform="translate(%s,%s) scale(%.6f)">%s</g>' % (x,y,s,body), size

def svg(w,h,body,bg=None):
    b=f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
            f'width="{w:.2f}" height="{h:.2f}">{b}{body}</svg>')
