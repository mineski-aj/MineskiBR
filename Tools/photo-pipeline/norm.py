from common import *
import json, numpy as np, sys
BUST,HEAD,SIDE=0.50,40,30
rn={'Cw.Mav1er':'Cw.Mav1er-.-','Cw. Kai-.-':'Cw.Kai-.-','REVENANT IMANS':'revenant.iMans','REVENANT DWIVA':'revenant.Dwiva','REVENANT GARRY':'revenant.Garry','REVENANT RAFSY':'revenant.rafsy','REVENANT FJSOL':'revenant.NsJOL','ASC CHARLIE MT':'ASC.Charlie.MT','ASC ALERTH MT':'ASC.Alerth MT','ASC NACSZA MT':'ASC.Nacsza.MT','ASC NEO MT':'ASC.Neo MT'}
yn=json.load(open('yn.json'))
keys=['box_h','box_w','eye_mouth','eye_dist']
med={k:np.median([v['m'][k] for v in yn.values()]) for k in keys}
print('min score',min(v['m']['score'] for v in yn.values()))
def rs(im,w,h):
    a=np.array(im).astype(np.float32); al=a[...,3:4]/255
    ch=[Image.fromarray(a[...,i]*al[...,0]).resize((w,h),Image.LANCZOS) for i in range(3)]
    A=np.clip(np.array(Image.fromarray(a[...,3]).resize((w,h),Image.LANCZOS)),0,255)
    rgb=[np.clip(np.array(c)/np.maximum(A/255,1e-4),0,255) for c in ch]
    return Image.fromarray(np.stack(rgb+[A],-1).astype(np.uint8))
items=[]
for key,v in yn.items():
    p,tdir,name=key.split('|'); b=name[:-4]; suf=''
    if b[-2:] in('_2','_3','_4'): b,suf=b[:-2],b[-2:]
    dest=R+{'SIG':'SIGNATURE','WIN':'VICTORY'}[p]+'/'+tdir+'/'+rn.get(b,b)+suf+'.png'; assert os.path.exists(dest),dest
    head=float(np.median([v['m'][k]/med[k] for k in keys]))   # relative head size (1.0 = median head px in source)
    im=Image.open(D+v['src']).convert('RGBA'); a=np.array(im.getchannel('A')); ys,xs=np.where(a>10)
    y0,y1=ys.min(),ys.max()+1; sh=round((y1-y0)*BUST); crop=im.crop((0,y0,im.width,y0+sh))
    ca=np.array(crop.getchannel('A')); cy,cx=np.where(ca>10); cx0,cx1,cy0=cx.min(),cx.max()+1,cy.min()
    items.append(dict(p=p,dest=dest,crop=crop.crop((cx0,cy0,cx1,sh)),w=cx1-cx0,h=sh-cy0,head=head))
res={}
for grp in ['SIG','WIN']:
    g=[i for i in items if i['p']==grp]
    # head-normalized scale: s_i = K / head_i ; K limited by the photo that runs out of room first
    K=min(min((1000-2*SIDE)/i['w'],(1000-HEAD)/i['h'])*i['head'] for i in g)
    lim=min(g,key=lambda i:min((1000-2*SIDE)/i['w'],(1000-HEAD)/i['h'])*i['head'])
    print(grp,'K',round(K,4),'limited by',os.path.basename(lim['dest']),'head',round(lim['head'],2))
    for i in g:
        sc=K/i['head']; dw,dh=round(i['w']*sc),round(i['h']*sc)
        assert dw<=1000-2*SIDE+1 and dh<=1000-HEAD+1,(i['dest'],dw,dh)
        if '--dry' not in sys.argv:
            out=Image.new('RGBA',(1000,1000),(0,0,0,0)); out.paste(rs(i['crop'],dw,dh),(round((1000-dw)/2),1000-dh)); out.save(i['dest'],optimize=True)
        res[i['dest']]=(round(sc,4),dw,dh)
import collections
t=collections.defaultdict(list)
for d,(sc,dw,dh) in res.items(): t[d.split('/')[-2]].append(dh)
for k,v in t.items(): print(k,min(v),max(v))
