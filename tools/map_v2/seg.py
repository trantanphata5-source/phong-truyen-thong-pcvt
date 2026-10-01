import pymupdf as fitz, numpy as np, cv2, json
d=fitz.open('../map.pdf');p=d[0];Z=2.0
pix=p.get_pixmap(matrix=fitz.Matrix(Z,Z))
img=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.h,pix.w,pix.n)[:,:,:3].copy()
np.save('render.npy',img)
g=json.load(open('/mnt/user-data/uploads/PHÒNG TRUYỀN THỐNG/3d-heritage-room/assets/grid/pcvt_grid.json'));B=g['bounds']
lab=cv2.cvtColor(img,cv2.COLOR_RGB2LAB).astype(np.float32)
white=(img.min(2)>=250)
cfg={}  # ten:(tol, abonly, close)
default=(10,False,21)
over={'P. Tân Thành':(5,False,25),'Xã Châu Pha':(6,False,25),'P. Rạch Dừa':(14,True,25),'P. Tam Thắng':(6,True,21),'P. Vũng Tàu':(5,False,25),'P. Phước Thắng':(12,False,21),'Xã Long Sơn':(6,False,25)}
res={};cols={}
out=img.copy()
for ph in g['phuong']:
    if ph['ten']=='Đặc khu Côn Đảo': continue
    tol,abo,k=over.get(ph['ten'],default)
    x,y=[int(v*Z) for v in ph['pt']]
    box=img[y-70:y+70,x-70:x+70].reshape(-1,3).astype(int)
    sat=box.max(1)-box.min(1)
    cand=box[(sat>6)&(box.min(1)>110)&(box.min(1)<250)]
    c=np.median(cand,0).astype(np.uint8)
    cl=cv2.cvtColor(c.reshape(1,1,3),cv2.COLOR_RGB2LAB).astype(np.float32)[0,0]
    dist=np.sqrt(((lab[:,:,1:]-cl[1:])**2).sum(2)) if abo else np.sqrt(((lab-cl)**2).sum(2))
    m=((dist<tol)&(~white)&(lab[:,:,0]>140)).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((k,k),np.uint8))
    n,cc=cv2.connectedComponents(m);lv=cc[y,x]
    if lv==0:
        ys,xs=np.nonzero(cc);i=np.argmin((ys-y)**2+(xs-x)**2);lv=cc[ys[i],xs[i]]
    comp=(cc==lv).astype(np.uint8)*255
    comp=cv2.morphologyEx(comp,cv2.MORPH_OPEN,np.ones((9,9),np.uint8))
    cs,_=cv2.findContours(comp,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);cm=max(cs,key=cv2.contourArea)
    ap=cv2.approxPolyDP(cm,2.5,True)[:,0,:]
    res[ph['id']]={'ten':ph['ten'],'poly_px':ap.tolist(),'area':int(cv2.contourArea(cm))}
    cols[ph['id']]=c.tolist()
    cv2.polylines(out,[ap.reshape(-1,1,2)],True,(220,0,0),6)
    print(ph['ten'],c.tolist(),res[ph['id']]['area'],len(ap))
json.dump(res,open('wards_px.json','w'),ensure_ascii=False)
cv2.imwrite('seg_check.jpg',cv2.cvtColor(cv2.resize(out,None,fx=0.18,fy=0.18),cv2.COLOR_RGB2BGR))
