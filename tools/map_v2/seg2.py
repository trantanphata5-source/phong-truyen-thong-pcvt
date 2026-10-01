import pymupdf as fitz, numpy as np, cv2, json
d=fitz.open('../map.pdf');p=d[0];Z=2.0
img=np.load('render.npy');H,W=img.shape[:2]
g=json.load(open('/mnt/user-data/uploads/PHÒNG TRUYỀN THỐNG/3d-heritage-room/assets/grid/pcvt_grid.json'))
bar=np.zeros((H,W),np.uint8)
for x in p.get_drawings():
    c=x.get('color')
    if not c or x.get('fill'): continue
    if tuple(round(v,2) for v in c)!=(0,0,0): continue
    w=round(x.get('width') or 0,2)
    if w not in (0,0.36,0.48,0.72): continue
    for it in x['items']:
        if it[0]=='l': pts=[(it[1].x,it[1].y),(it[2].x,it[2].y)]
        elif it[0]=='c': pts=[(it[1].x,it[1].y),(it[2].x,it[2].y),(it[3].x,it[3].y),(it[4].x,it[4].y)]
        else: continue
        pp=np.array([[a*Z,b*Z] for a,b in pts],np.int32)
        cv2.polylines(bar,[pp],False,255,5)
land=(img.min(2)<252).astype(np.uint8)*255
# fill small gaps in land (roads white?) 
land=cv2.morphologyEx(land,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
free=((land>0)&(bar==0)).astype(np.uint8)
n,cc=cv2.connectedComponents(free,connectivity=4)
res={};out=img.copy()
for ph in g['phuong']:
    if ph['ten']=='Đặc khu Côn Đảo': continue
    x,y=[int(v*Z) for v in ph['pt']]
    lv=cc[y,x]
    if lv==0:
        sub=cc[y-40:y+40,x-40:x+40]; vals,cnt=np.unique(sub[sub>0],return_counts=True); lv=vals[np.argmax(cnt)]
    comp=(cc==lv).astype(np.uint8)*255
    comp=cv2.morphologyEx(comp,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))
    cs,_=cv2.findContours(comp,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);cm=max(cs,key=cv2.contourArea)
    ap=cv2.approxPolyDP(cm,2.5,True)[:,0,:]
    res[ph['id']]={'ten':ph['ten'],'poly_px':ap.tolist(),'area':int(cv2.contourArea(cm)),'lv':int(lv)}
    cv2.polylines(out,[ap.reshape(-1,1,2)],True,(220,0,0),7)
    print(ph['ten'],res[ph['id']]['area'],len(ap),lv)
json.dump(res,open('wards_bar.json','w'),ensure_ascii=False)
cv2.imwrite('seg2_check.jpg',cv2.cvtColor(cv2.resize(out[:int(H*0.8)],None,fx=0.16,fy=0.16),cv2.COLOR_RGB2BGR))
cv2.imwrite('bar.png',cv2.resize(bar,None,fx=0.25,fy=0.25))
