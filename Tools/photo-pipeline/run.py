from common import *
import difflib, numpy as np
BUST,HEAD,SIDE=0.50,40,30
OUTDIR={'M':'FRONT','L':'LEFT','R':'RIGHT','WIN':'VICTORY','SIG':'SIGNATURE'}
def treat(path):
    im=Image.open(path).convert('RGBA')
    a=np.array(im.getchannel('A')); ys,xs=np.where(a>10)
    x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
    sw,sh=x1-x0,max(1,round((y1-y0)*BUST))
    crop=im.crop((x0,y0,x1,y0+sh))
    sc=min((1000-2*SIDE)/sw,(1000-HEAD)/sh); dw,dh=round(sw*sc),round(sh*sc)
    arr=np.array(crop).astype(np.float32); al=arr[...,3:4]/255
    pm=Image.fromarray(np.concatenate([arr[...,:3]*al,arr[...,3:4]],-1).astype(np.float32),'RGBA') if False else None
    # premultiplied resize per channel (float)
    ch=[Image.fromarray((arr[...,i]*al[...,0]).astype(np.float32),'F').resize((dw,dh),Image.LANCZOS) for i in range(3)]
    A=Image.fromarray(arr[...,3].astype(np.float32),'F').resize((dw,dh),Image.LANCZOS)
    A_=np.clip(np.array(A),0,255); rgb=[np.clip(np.array(c)/np.maximum(A_/255,1e-4),0,255) for c in ch]
    out=np.stack(rgb+[A_],-1).astype(np.uint8)
    res=Image.new('RGBA',(1000,1000),(0,0,0,0))
    res.paste(Image.fromarray(out,'RGBA'),(round((1000-dw)/2),1000-dh))
    return res
inv=inventory(); ot=oldteams(); log=[]
for (team,pl),v in sorted(inv.items()):
    t=ot.get(fold(team)) or ot.get(fold(team.replace('SPORTS','ESPORTS')))
    if t:
        olds=os.listdir(R+'FRONT/'+t)
        if 'ARCJA' in pl: o='ADMT E ARCJA.png'
        else: o=max(olds,key=lambda o:difflib.SequenceMatcher(None,fold(pl),fold(o[:-4])).ratio())
        base=o[:-4]; tdir=t
    else:
        base=pl; tdir=team
    groups=collections.defaultdict(list)
    for p,f in v:
        if p=='?': p='M'   # Cw.Mav1er ESPORTPOSE_W -> no M exists, treat as front
        rel=f[len(D):]; wo='W_O TATTOO' in rel
        m=re.search(r'_(\d)(?:png)?\.png$',f); n=int(m.group(1)) if m else 1
        groups[p].append((wo,n,f))
    for p,items in groups.items():
        items.sort()
        for i,(wo,n,f) in enumerate(items):
            suffix='' if i==0 else ('_%d'%(i+1))
            name=base+suffix+'.png'
            dest=R+OUTDIR[p]+'/'+tdir+'/'+name
            os.makedirs(os.path.dirname(dest),exist_ok=True)
            treat(f).save(dest,optimize=True)
            log.append((p,tdir,name,f[len(D):]))
import json; json.dump(log,open('log.json','w'),ensure_ascii=False,indent=0)
print(len(log))
