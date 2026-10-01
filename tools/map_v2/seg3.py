import numpy as np, cv2, json
Z=2.0
img=np.load('render.npy');H,W=img.shape[:2]
g=json.load(open('/mnt/user-data/uploads/PHÒNG TRUYỀN THỐNG/3d-heritage-room/assets/grid/pcvt_grid.json'));B=g['bounds']
bar=json.load(open('wards_bar.json'))
sup=json.load(open('../ranh_gioi_bo_sung.json'))['phuong']
lab=cv2.cvtColor(img,cv2.COLOR_RGB2LAB).astype(np.float32)
def mask_from_poly(px):
    m=np.zeros((H,W),np.uint8); cv2.fillPoly(m,[np.array(px,np.int32).reshape(-1,1,2)],255); return m
masks={}
for pid,v in bar.items():
    if v['ten'] in sup: continue
    masks[pid]=mask_from_poly(v['poly_px'])
# Ba Ria by color
ph={p['id']:p for p in g['phuong']}
x,y=[int(v*Z) for v in ph['p_ba_ria']['pt']]
box=img[y-50:y+50,x-50:x+50].reshape(-1,3).astype(int); sat=box.max(1)-box.min(1)
c=np.median(box[(sat>15)&(box.min(1)>110)],0).astype(np.uint8); print('baria col',c)
cl=cv2.cvtColor(c.reshape(1,1,3),cv2.COLOR_RGB2LAB).astype(np.float32)[0,0]
dist=np.sqrt(((lab[:,:,1:]-cl[1:])**2).sum(2))
m=((dist<10)&(masks['p_long_huong']>0)).astype(np.uint8)*255
m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((31,31),np.uint8))
n,cc=cv2.connectedComponents(m); lv=cc[y,x]
if lv==0:
    sub=cc[y-40:y+40,x-40:x+40];vals,cnt=np.unique(sub[sub>0],return_counts=True);lv=vals[np.argmax(cnt)]
br=(cc==lv).astype(np.uint8)*255
br=cv2.morphologyEx(br,cv2.MORPH_OPEN,np.ones((11,11),np.uint8))
masks['p_ba_ria']=br
masks['p_long_huong']=cv2.subtract(masks['p_long_huong'],cv2.dilate(br,np.ones((3,3),np.uint8)))
for pid in ['p_phuoc_thang','p_rach_dua','p_tam_thang','p_vung_tau']:
    poly=sup[ph[pid]['ten']]
    px=[[ (u*B['w']+B['x0'])*Z,(v*B['h']+B['y0'])*Z] for u,v in poly]
    masks[pid]=mask_from_poly(px)
# resolve overlaps: priority to smaller area
order=sorted(masks,key=lambda k:masks[k].sum())
taken=np.zeros((H,W),np.uint8); final={}
for k in order:
    m=cv2.bitwise_and(masks[k],cv2.bitwise_not(taken)); final[k]=m; taken=cv2.bitwise_or(taken,m)
out=img.copy(); polys={}
for k,m in final.items():
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    cs=[c for c in cs if cv2.contourArea(c)>2000]
    polys[k]=[cv2.approxPolyDP(c,2.0,True)[:,0,:].tolist() for c in cs]
    for c in polys[k]: cv2.polylines(out,[np.array(c,np.int32).reshape(-1,1,2)],True,(220,0,0),6)
    print(k, len(cs), int(m.sum()/255))
np.save('final_masks.npy',np.stack([final[k] for k in sorted(final)]))
json.dump({'ids':sorted(final),'polys':polys},open('wards_final_px.json','w'),ensure_ascii=False)
cv2.imwrite('seg3_check.jpg',cv2.cvtColor(cv2.resize(out[int(H*0.38):int(H*0.8), :int(W*0.7)],None,fx=0.25,fy=0.25),cv2.COLOR_RGB2BGR))
