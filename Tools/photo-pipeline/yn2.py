from common import *
import cv2, json, numpy as np
def measure(path):
    im=Image.open(path).convert('RGBA'); a=np.array(im.getchannel('A')); ys,xs=np.where(a>10)
    y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    top=im.crop((x0,y0,x1,y0+int((y1-y0)*0.4)))
    bg=Image.new('RGB',top.size,(128,128,128)); bg.paste(top,mask=top.getchannel('A'))
    k=0.25; img=cv2.cvtColor(np.array(bg.resize((int(bg.width*k),int(bg.height*k)))),cv2.COLOR_RGB2BGR)
    det=cv2.FaceDetectorYN.create('model/yunet.onnx','',(img.shape[1],img.shape[0]),0.5,0.3,5000)
    _,f=det.detect(img)
    if f is None: return None
    f=max(f,key=lambda r:r[14])
    re,le,nose,rm,lm=f[4:6],f[6:8],f[8:10],f[10:12],f[12:14]
    eyec=(re+le)/2; mc=(rm+lm)/2
    eyec_src=((eyec[0]/k)+x0,(eyec[1]/k)+y0)
    return dict(eye_x=float(eyec_src[0]),eye_y=float(eyec_src[1]),box_w=float(f[2]/k),box_h=float(f[3]/k),eye_mouth=float(np.linalg.norm(mc-eyec)/k),eye_dist=float(np.linalg.norm(re-le)/k),score=float(f[14]),top_to_eye=float((eyec[1])/k))
if __name__=='__main__':
    log=json.load(open('log.json')); out={}
    for p,t,n,src in log:
        if p in('SIG','WIN'):
            out[p+'|'+t+'|'+n]=dict(m=measure(D+src),src=src)
    json.dump(out,open('yn2.json','w'))
    miss=[k for k,v in out.items() if not v['m']]; print(len(out),'miss',miss)
