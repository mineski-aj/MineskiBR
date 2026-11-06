from common import *
import cv2, json, sys, numpy as np
yn=json.load(open('yn2.json'))
keys=['box_h','box_w','eye_mouth','eye_dist']
med={k:np.median([v['m'][k] for v in yn.values()]) for k in keys}
headrel=lambda m: float(np.median([m[k]/med[k] for k in keys]))
# reference = ASC Alerth's current placement in the saved SIGNATURE file
refkey=[k for k in yn if k.startswith('SIG|ASC|ASC ALERTH')][0]; rm=yn[refkey]['m']
det=cv2.FaceDetectorYN.create('model/yunet.onnx','',(1000,1000),0.5,0.3,5000)
f=R+'SIGNATURE/ASC/ASC.Alerth MT.png'; im=Image.open(f).convert('RGBA'); bg=Image.new('RGB',im.size,(128,128,128)); bg.paste(im,mask=im.getchannel('A'))
_,fc=det.detect(cv2.cvtColor(np.array(bg),cv2.COLOR_RGB2BGR)); x=max(fc,key=lambda r:r[14])
eye=(x[4:6]+x[6:8])/2; xr,yr=float(eye[0]),float(eye[1]); em_out=float(np.linalg.norm((x[10:12]+x[12:14])/2-eye))
s_ref=em_out/rm['eye_mouth']; head_ref=headrel(rm)
print('ref eye (%.0f,%.0f) scale %.4f head %.2f'%(xr,yr,s_ref,head_ref))
rn={'Cw.Mav1er':'Cw.Mav1er-.-','Cw. Kai-.-':'Cw.Kai-.-','REVENANT IMANS':'revenant.iMans','REVENANT DWIVA':'revenant.Dwiva','REVENANT GARRY':'revenant.Garry','REVENANT RAFSY':'revenant.rafsy','REVENANT FJSOL':'revenant.NsJOL','ASC CHARLIE MT':'ASC.Charlie.MT','ASC ALERTH MT':'ASC.Alerth MT','ASC NACSZA MT':'ASC.Nacsza.MT','ASC NEO MT':'ASC.Neo MT'}
def rs(im,w,h):
    a=np.array(im).astype(np.float32); al=a[...,3:4]/255
    ch=[Image.fromarray(a[...,i]*al[...,0]).resize((w,h),Image.LANCZOS) for i in range(3)]
    A=np.clip(np.array(Image.fromarray(a[...,3]).resize((w,h),Image.LANCZOS)),0,255)
    rgb=[np.clip(np.array(c)/np.maximum(A/255,1e-4),0,255) for c in ch]
    return Image.fromarray(np.stack(rgb+[A],-1).astype(np.uint8))
bad=[]
for key,v in yn.items():
    p,t,name=key.split('|')
    if p!='SIG': continue
    b=name[:-4]; suf=''
    if b[-2:] in('_2','_3','_4'): b,suf=b[:-2],b[-2:]
    dest=R+'SIGNATURE/'+t+'/'+rn.get(b,b)+suf+'.png'; assert os.path.exists(dest),dest
    m=v['m']; s=s_ref*head_ref/headrel(m)
    im=Image.open(D+v['src']).convert('RGBA'); A=np.array(im.getchannel('A'))>10
    ex,ey=m['eye_x'],m['eye_y']
    sx0,sx1=ex-xr/s,ex+(1000-xr)/s; sy0,sy1=ey-yr/s,ey+(1000-yr)/s
    ys,xs=np.where(A); X0,X1,Y0,Y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
    # content that would fall outside the 1000x1000 canvas
    cl=max(0,sx0-X0)*s; cr=max(0,X1-sx1)*s; ct=max(0,sy0-Y0)*s; gap=max(0,sy1-Y1)*s
    if max(cl,cr,ct,gap)>3: bad.append((name,t,round(cl),round(cr),round(ct),round(gap)))
    if '--write' in sys.argv:
        reg=Image.new('RGBA',(int(round(sx1-sx0)),int(round(sy1-sy0))),(0,0,0,0))
        crop=im.crop((max(0,int(sx0)),max(0,int(sy0)),min(im.width,int(sx1)),min(im.height,int(sy1))))
        reg.paste(crop,(max(0,-int(sx0)),max(0,-int(sy0))))
        rs(reg,1000,1000).save(dest,optimize=True)
print('violations (left,right,top cut px; bottom gap px):')
for b in bad: print(b)
print(len(bad),'of',len([k for k in yn if k.startswith('SIG')]))
