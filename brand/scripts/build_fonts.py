"""Subset the three brand faces to Latin + punctuation and emit base64 @font-face CSS
used by the self-contained HTML deliverables. Run before build_guide/build_web/build_landing."""
import base64, os
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
CH = ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      " .,:;!?'\"()[]{}/\\|-–—_+=*&%#@$^~<>°×✓•→↑↓★")
os.makedirs('web', exist_ok=True)
specs=[("SpaceGrotesk-Medium.ttf","Space Grotesk",500),("SpaceGrotesk-Bold.ttf","Space Grotesk",700),
       ("SpaceGrotesk-Regular.ttf","Space Grotesk",400),
       ("Inter-Regular.ttf","Inter",400),("Inter-Medium.ttf","Inter",500),
       ("Inter-SemiBold.ttf","Inter",600),("Inter-Bold.ttf","Inter",700),
       ("IBMPlexMono-Regular.ttf","IBM Plex Mono",400),("IBMPlexMono-Medium.ttf","IBM Plex Mono",500)]
css=[]
for f,fam,wt in specs:
    ft=TTFont(f'fonts/{f}')
    o=Options(); o.layout_features=['kern','liga','calt']; o.desubroutinize=True; o.notdef_outline=True
    Subsetter(options=o).subset(ft) if False else None
    s=Subsetter(options=o); s.populate(text=CH); s.subset(ft)
    ft.flavor='woff2'; out=f'web/{f.replace(".ttf",".woff2")}'; ft.save(out)
    b64=base64.b64encode(open(out,'rb').read()).decode()
    css.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{wt};"
               f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
open('web/fonts.css','w').write("".join(css))
print("wrote web/fonts.css", round(os.path.getsize('web/fonts.css')/1024), "KB")
