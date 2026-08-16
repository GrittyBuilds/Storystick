import sys,os,re; sys.path.insert(0,'/root/storystick')
from build_web import base, canvas, ICONS
FEAT=[("wall","Draw the way you build","Walls, studs, joists, panels, joints. Not abstract solids — the actual parts, with the actual thicknesses, so the numbers mean something.",False),
 ("layers","Plan, elevation, section","Draw it once and switch views. They can't disagree, because they're the same model seen from a different side.",False),
 ("dim","Dimensions that hold","Set a dimension and it stays set. Move something that would break it and Storystick tells you which one gave way.",False),
 ("measure","Feet-and-inches or metric","Type 12'-4 1/2 or 3785 mm. Switch the whole project either direction without rounding drift.",False),
 ("rect","Materials and cost","Every part carries a material. The takeoff and the rough cost update while you draw.",True),
 ("door","Print a set that reads","Title block, scale bar, north arrow, sheet numbers. Drawings a contractor will actually accept.",False)]
def features():
    out=[]
    for k,t,b,acc in FEAT:
        out.append(f'<div class="card{" accent" if acc else ""}"><div class="ic"><svg viewBox="0 0 24 24">{ICONS[k]}</svg></div>'
                   f'<h3>{t}</h3><p style="margin:0;font-size:15px" class="muted">{b}</p></div>')
    return ''.join(out)
AUD=[("For woodworkers","Cabinets, furniture, jigs, shop builds",
      "Joinery you can actually specify — dado, rabbet, mortise, domino. Grain direction on every panel. A cut list that knows your blade takes an eighth."),
     ("For homeowners","Kitchens, baths, additions, basements",
      "Draw what you're picturing well enough that a contractor can price it. Show three layouts side by side before anyone swings a hammer."),
     ("For remodelers","As-builts, change orders, client sign-off",
      "Measure a room on your phone, have a clean plan before you leave the driveway. Mark up, send, get an answer the same day."),
     ("For designers &amp; architects","Schematic design, small residential, studies",
      "Fast enough for the messy front end of a project, accurate enough that nothing has to be redrawn when it firms up.")]
def audience():
    return ''.join(f'<div class="aud"><div class="t"><div class="k">{k}</div><h3>{t}</h3></div>'
                   f'<div class="b"><p style="margin:0;font-size:15px;color:var(--slate)">{b}</p></div></div>'
                   for t,k,b in AUD)
s=base(open('gtm/landing.src.html').read())
s=s.replace('{{FEATURES}}',features()).replace('{{AUDIENCE}}',audience())
s=s.replace('{{CANVAS_DARK}}', canvas(880,470,True))
s=s.replace('class="muted"','style="color:var(--slate)"') if False else s
open('gtm/storystick-landing.html','w').write(s)
print('landing KB', round(os.path.getsize('gtm/storystick-landing.html')/1024), re.findall(r'\{\{[^}]+\}\}',s)[:3])
