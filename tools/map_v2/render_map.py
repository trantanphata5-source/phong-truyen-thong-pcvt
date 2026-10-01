import pymupdf as fitz, numpy as np, cv2, json, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
FD='/mnt/user-data/uploads/PHÒNG TRUYỀN THỐNG/Be_Vietnam_Pro/'
def F(w,s): return ImageFont.truetype(FD+f'BeVietnamPro-{w}.ttf',s)
g=json.load(open('/mnt/user-data/uploads/PHÒNG TRUYỀN THỐNG/3d-heritage-room/assets/grid/pcvt_grid.json'))
B=g['bounds']; WC=4096; S=WC/B['w']; HC=int(round(B['h']*S))
def P(x,y): return ((x-B['x0'])*S,(y-B['y0'])*S)       # page pt -> canvas
def N(u,v): return (u*WC,v*HC)                            # normalized -> canvas
Z=2.0
wards=json.load(open('wards_final_px.json'))
PAL={'p_tan_thanh':'#CFE3F7','x_chau_pha':'#E1EDC2','p_phu_my':'#F8D2C2','p_tan_phuoc':'#C7E7D4','p_tan_hai':'#D6DCF6',
'p_long_huong':'#F6C8C8','p_tam_long':'#E6D2F1','p_ba_ria':'#FAE6A4','x_long_son':'#EEE2CC','p_phuoc_thang':'#BDE2D8',
'p_rach_dua':'#F3C4E2','p_tam_thang':'#CDCBEA','p_vung_tau':'#E8E0C4'}
def hx(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
BG=(241,244,247)
base=np.full((HC,WC,3),BG,np.uint8)
# --- ward polygons in canvas coords
wpoly={}
for k,lst in wards['polys'].items():
    wpoly[k]=[np.array([P(px/Z,py/Z) for px,py in c],np.float32) for c in lst]
union=np.zeros((HC,WC),np.uint8)
for k,lst in wpoly.items():
    for c in lst: cv2.fillPoly(union,[c.astype(np.int32)],255)
union=cv2.morphologyEx(union,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))
# shadow
sh=cv2.GaussianBlur(union,(0,0),18).astype(np.float32)/255
off=np.zeros_like(sh); off[14:,10:]=sh[:-14,:-10]
base=(base*(1-0.22*off[...,None])).astype(np.uint8)
# land base (fills gaps)
base[union>0]=(250,250,250)
for k,lst in wpoly.items():
    for c in lst: cv2.fillPoly(base,[c.astype(np.int32)],hx(PAL[k]),lineType=cv2.LINE_AA)
for k,lst in wpoly.items():
    for c in lst: cv2.polylines(base,[c.astype(np.int32)],True,(255,255,255),7,lineType=cv2.LINE_AA)
for k,lst in wpoly.items():
    for c in lst: cv2.polylines(base,[c.astype(np.int32)],True,(30,64,160),3,lineType=cv2.LINE_AA)
cs,_=cv2.findContours(union,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
cv2.polylines(base,cs,True,(15,23,42),6,lineType=cv2.LINE_AA)
# --- Con Dao inset (raster crop, cleaned)
img=np.load('render.npy')
fx0,fy0,fx1,fy1=1097,2291,2306,3125
crop=img[int(fy0*Z)+8:int(fy1*Z)-8, int(fx0*Z)+8:int(fx1*Z)-8].copy()
hsv=cv2.cvtColor(crop,cv2.COLOR_RGB2HSV)
r,gg,b=[crop[...,i].astype(int) for i in range(3)]
dbgt=((gg>200)&(r<120)&(b<120))|((r>220)&(gg>100)&(gg<170)&(b<80))|((r>220)&(gg>200)&(b<110))
mk=cv2.dilate(dbgt.astype(np.uint8)*255,np.ones((5,5),np.uint8))
crop=cv2.inpaint(crop,mk,5,cv2.INPAINT_TELEA)
cx0,cy0=P(fx0,fy0); cx1,cy1=P(fx1,fy1)
cw,ch=int(cx1-cx0),int(cy1-cy0)
wh=(crop.min(2)>=235).astype(np.uint8)
wh=cv2.erode(wh,np.ones((3,3),np.uint8))
n,cc=cv2.connectedComponents(wh,connectivity=4)
border=set(np.unique(np.concatenate([cc[0],cc[-1],cc[:,0],cc[:,-1]])))-{0}
sea=np.isin(cc,list(border))
land=(wh>0)&(~sea)
sizes=np.bincount(cc[land].ravel()) if land.any() else None
crop[sea]=(222,236,247)
crop[land]=(206,232,214)
crop=cv2.resize(crop,(cw,ch),interpolation=cv2.INTER_AREA)
base[int(cy0):int(cy0)+ch,int(cx0):int(cx0)+cw]=crop
cv2.rectangle(base,(int(cx0),int(cy0)),(int(cx1),int(cy1)),(15,23,42),6)
# --- power lines from PDF fills
d=fitz.open('../map.pdf');p=d[0]
def inside_skip(r):
    if r.x0>=fx0-5 and r.y0>=fy0-5: return True          # inset
    if r.x1<=500 and r.y0>=2850: return True              # legend
    return False
LAY={'500':[],'220':[],'110':[]}
for x in p.get_drawings():
    f=x.get('fill')
    if not f: continue
    k=tuple(round(v,2) for v in f); r=x['rect']
    lvl={(1.0,0.0,1.0):'500',(1.0,0.0,0.0):'220',(0.0,0.0,1.0):'110'}.get(k)
    if not lvl or inside_skip(r): continue
    w,h=r.width,r.height
    if max(w,h)<16 and (max(w,h)/max(min(w,h),0.1))<2.5: continue   # station squares
    segs=[]
    for it in x['items']:
        if it[0]=='l': segs.append([P(it[1].x,it[1].y),P(it[2].x,it[2].y)])
        elif it[0]=='c': segs.append([P(it[1].x,it[1].y),P(it[2].x,it[2].y),P(it[3].x,it[3].y),P(it[4].x,it[4].y)])
    LAY[lvl]+= [np.array(sg,np.int32) for sg in segs]
STY={'500':((192,38,211),12),'220':((225,29,72),9),'110':((29,78,216),6)}
for lvl in ['110','220','500']:
    col,t=STY[lvl]
    for pp in LAY[lvl]:
        cv2.polylines(base,[pp],False,(255,255,255),t+6,lineType=cv2.LINE_AA)
for lvl in ['110','220','500']:
    col,t=STY[lvl]
    for pp in LAY[lvl]:
        cv2.polylines(base,[pp],False,col,t,lineType=cv2.LINE_AA)
print({k:len(v) for k,v in LAY.items()})
obst=np.zeros((HC,WC),np.uint8)
for lvl in LAY:
    for pp in LAY[lvl]: cv2.polylines(obst,[pp],False,255,70)
for t in g['tram']:
    cx,cy=N(t['x'],t['y']); cv2.circle(obst,(int(cx),int(cy)),110,255,-1)
for c in g['co_so']:
    cx,cy=N(c['x'],c['y']); cv2.circle(obst,(int(cx),int(cy)),130,255,-1)
im=Image.fromarray(base); dr=ImageDraw.Draw(im)
labels=[]
WLAB={}
# ward names (on top, largest)
for ph in g['phuong']:
    if ph['id'] not in wpoly: continue
    m=np.zeros((HC,WC),np.uint8)
    for c in wpoly[ph['id']]: cv2.fillPoly(m,[c.astype(np.int32)],255)
    lx,ly=N(ph['x'],ph['y'])
    dfull=cv2.distanceTransform(m,cv2.DIST_L2,5)
    name=ph['ten'].replace('P. ','PHƯỜNG ').replace('Xã ','XÃ ').upper()
    sz=64 if dfull.max()>220 else 50
    fnt=F('ExtraBold',sz)
    bw=dr.textbbox((0,0),name,font=fnt,anchor='mm',stroke_width=9)
    hw,hh=(bw[2]-bw[0])/2+10,(bw[3]-bw[1])/2+10
    ys,xs=np.nonzero(m[::16,::16]); ys=ys*16; xs=xs*16
    order_=np.argsort((xs-lx)**2+(ys-ly)**2)
    best=None
    for i in order_[:6000]:
        cx,cy=xs[i],ys[i]
        x0,y0,x1,y1=int(cx-hw),int(cy-hh),int(cx+hw),int(cy+hh)
        if x0<0 or y0<0 or x1>=WC or y1>=HC: continue
        if m[y0:y1,x0:x1].mean()<0.93*255: continue
        if obst[y0:y1,x0:x1].mean()>0.10*255: continue
        best=(cx,cy); break
    if best is None:
        for i in order_[:6000]:
            cx,cy=xs[i],ys[i]; x0,y0,x1,y1=int(cx-hw),int(cy-hh),int(cx+hw),int(cy+hh)
            if x0<0 or y0<0 or x1>=WC or y1>=HC: continue
            if m[y0:y1,x0:x1].mean()>=0.9*255: best=(cx,cy); break
    if best is None: best=(lx,ly)
    xx,yy=best
    MAN={'p_phu_my':(160,335,46,True),'p_tan_phuoc':(200,640,54,False),'p_long_huong':(545,700,48,False),'p_ba_ria':(697,700,40,True),
         'p_vung_tau':(330,1195,44,True),'p_tam_thang':(430,1085,46,False),'p_rach_dua':(448,1005,46,False)}
    if ph['id'] in MAN:
        zx,zy,sz,ml=MAN[ph['id']]; xx,yy=300+zx*3,500+zy*3; fnt=F('ExtraBold',sz)
        if ml: name=name.replace(' ','\n',1)
    dr.multiline_text((xx,yy),name,font=fnt,fill=(15,23,42),anchor='mm',align='center',spacing=4,stroke_width=9,stroke_fill=(255,255,255))
    labels.append(dr.multiline_textbbox((xx,yy),name,font=fnt,anchor='mm',align='center'))
    WLAB[ph['id']]=(float(xx)/WC,float(yy)/HC)
# --- stations
def tri(cx,cy,s,fill,outline=(255,255,255),ow=4):
    pts=[(cx,cy-s),(cx-s*0.95,cy+s*0.7),(cx+s*0.95,cy+s*0.7)]
    dr.polygon(pts,fill=fill,outline=outline,width=ow)
def free(bb):
    for o in labels:
        if not(bb[2]<o[0] or bb[0]>o[2] or bb[3]<o[1] or bb[1]>o[3]): return False
    return True
def put(text,cx,cy,font,fill,stroke=(255,255,255),sw=6,offs=((26,-14),(26,10),(-26,-14),(-26,10)),anchor_r='ls',anchor_l='rs'):
    for dx,dy in offs:
        a=anchor_r if dx>0 else anchor_l
        bb=dr.textbbox((cx+dx,cy+dy),text,font=font,anchor=a,stroke_width=sw)
        if free(bb) and bb[0]>0 and bb[2]<WC:
            dr.text((cx+dx,cy+dy),text,font=font,fill=fill,anchor=a,stroke_width=sw,stroke_fill=stroke); labels.append(bb); return True
    return False
CAP={'500kV':((192,38,211),30),'220kV':((225,29,72),24),'110kV':((29,78,216),17)}
order=sorted(g['tram'],key=lambda t:{'500kV':0,'220kV':1,'110kV':2}[t['cap']]+(0.5 if t['loai']!='luoi' else 0))
for t in g['tram']:
    cx,cy=N(t['x'],t['y'])
    if t['loai']=='khach_hang': tri(cx,cy,12,(148,163,184),ow=3)
    elif t['loai']=='lan_can': dr.ellipse([cx-13,cy-13,cx+13,cy+13],fill=(245,158,11),outline=(255,255,255),width=4)
for t in sorted(g['tram'],key=lambda t:{'500kV':2,'220kV':1,'110kV':0}[t['cap']]):
    if t['loai']!='luoi': continue
    cx,cy=N(t['x'],t['y']); col,s=CAP[t['cap']]; tri(cx,cy,s,col)
# station labels (grid stations only), biggest first
for t in order:
    if t['loai']!='luoi': continue
    cx,cy=N(t['x'],t['y']); col,s=CAP[t['cap']]
    put(t['ten']+(' '+t['cap'] if t['cap']!='110kV' else ''),cx,cy,F('SemiBold',34 if t['cap']!='110kV' else 30),col,offs=((s+10,-6),(s+10,26),(-s-10,-6),(-s-10,26),(0,-s-12)))
for t in g['tram']:
    if t['loai']=='lan_can':
        cx,cy=N(t['x'],t['y']); put('Trạm '+t['ten'],cx,cy,F('Medium',28),(180,83,9))
# PCVT facilities
logo=Image.open('/mnt/user-data/uploads/PHÒNG TRUYỀN THỐNG/3d-heritage-room/assets/logo.png').convert('RGBA')
lg=logo.copy(); lg.thumbnail((70,70))
for c in g['co_so']:
    cx,cy=N(c['x'],c['y'])
    dr.ellipse([cx-42,cy-42,cx+42,cy+42],fill=(255,255,255),outline=(30,64,160),width=6)
    im.paste(lg,(int(cx-lg.width/2),int(cy-lg.height/2)),lg)
    put(c['ten'].replace('PCVT – ',''),cx,cy,F('Bold',32),(30,64,160),offs=((50,12),(-50,12),(0,-52)))
cx,cy=P(fx0,fy0)
dr.rounded_rectangle([cx+20,cy+20,cx+820,cy+110],radius=18,fill=(30,64,160))
dr.text((cx+420,cy+65),'ĐẶC KHU CÔN ĐẢO',font=F('ExtraBold',54),fill='white',anchor='mm')
# outbound directions
OUT=[('Đi Long Thành, Sông Mây',0.263,0.143),('Đi Mỹ Tho, Cát Lái, Nhà Bè',0.17,0.181),('Đi trạm 110kV Ngãi Giao',0.66,0.141)]
for txt,u,v in OUT:
    x,y=N(u,v); dr.text((x,y-40),'↗ '+txt,font=F('SemiBold',30),fill=(71,85,105),anchor='mm',stroke_width=5,stroke_fill=(255,255,255))
# title block
dr.rounded_rectangle([60,60,1500,300],radius=26,fill=(255,255,255),outline=(30,64,160),width=6)
dr.text((110,135),'SƠ ĐỒ ĐỊA DƯ – LƯỚI ĐIỆN',font=F('ExtraBold',66),fill=(30,64,160),anchor='lm')
dr.text((110,215),'CÔNG TY ĐIỆN LỰC VŨNG TÀU',font=F('Bold',50),fill=(15,23,42),anchor='lm')
dr.text((110,270),'Nguồn: Bản đồ địa dư PCVT – trục chính – phường (29/06/2026)',font=F('Medium',28),fill=(71,85,105),anchor='lm')
# legend
LX,LY=2960,140
dr.rounded_rectangle([LX,LY,LX+1060,LY+560],radius=24,fill=(255,255,255),outline=(203,213,225),width=4)
dr.text((LX+40,LY+60),'CHÚ THÍCH',font=F('ExtraBold',40),fill=(15,23,42),anchor='lm')
items=[('line',(192,38,211),12,'Đường dây 500kV'),('line',(225,29,72),9,'Đường dây 220kV'),('line',(29,78,216),6,'Đường dây 110kV'),
       ('tri',(29,78,216),20,'Trạm biến áp (500/220/110kV)'),('tri',(148,163,184),12,'Trạm 110kV khách hàng'),('dot',(245,158,11),13,'Trạm lân cận (PC Đất Đỏ)'),
       ('logo',None,None,'Cơ sở PCVT'),('border',(30,64,160),3,'Ranh giới phường/xã')]
for i,(kind,col,s,txt) in enumerate(items):
    y=LY+120+i*55; x=LX+60
    if kind=='line': dr.line([(x-10,y),(x+70,y)],fill=col,width=s)
    elif kind=='tri':
        ss=min(s,18); dr.polygon([(x+30,y-ss),(x+30-ss,y+ss*0.7),(x+30+ss,y+ss*0.7)],fill=col,outline='white')
    elif kind=='dot': dr.ellipse([x+18,y-13,x+44,y+13],fill=col)
    elif kind=='logo':
        l2=logo.copy(); l2.thumbnail((40,40)); im.paste(l2,(x+11,y-20),l2)
    elif kind=='border': dr.rectangle([x,y-16,x+60,y+16],fill=(214,220,246),outline=col,width=s)
    dr.text((x+110,y),txt,font=F('Medium',32),fill=(30,41,59),anchor='lm')
# north arrow
ax,ay=2800,260
dr.polygon([(ax,ay-90),(ax-38,ay+30),(ax,ay+5),(ax+38,ay+30)],fill=(15,23,42))
dr.text((ax,ay+75),'B',font=F('ExtraBold',48),fill=(15,23,42),anchor='mm')
im.save('pcvt_map_4096.png',optimize=True)
im.convert('RGB').save('pcvt_map_4096.webp',quality=88)
small=im.copy(); small.thumbnail((1400,1400)); small.save('preview_small.jpg',quality=85)
print(im.size)

out={'phien_ban':'2026-10-02','nguon':'1.ĐỊA DƯ PCVT Trục chính-Phường-Model.pdf (AutoCAD, 29/06/2026)','bounds':B,
 'texture':{'file':'assets/grid/pcvt_map_4096.webp','w':WC,'h':HC,'ghi_chu':'Ảnh phủ đúng khung bounds; u = x chuẩn hóa, v = y chuẩn hóa (v=0 ở cạnh Bắc)'},
 'phuong':[], 'tram':g['tram'], 'co_so':[{k:v for k,v in c.items() if k!='dia_chi'} for c in g['co_so']],
 'con_dao_khung':[ (cx0)/WC,(cy0)/HC,(cx1)/WC,(cy1)/HC ]}
for ph in g['phuong']:
    pid=ph['id']
    if pid not in wpoly: out['phuong'].append({'id':pid,'ten':ph['ten'],'poly':[],'nhan':[ph['x'],ph['y']]}); continue
    polys=[[[round(float(x)/WC,5),round(float(y)/HC,5)] for x,y in c] for c in wpoly[pid]]
    out['phuong'].append({'id':pid,'ten':ph['ten'],'mau':PAL[pid],'poly':polys,'nhan':[round(WLAB[pid][0],5),round(WLAB[pid][1],5)]})
json.dump(out,open('pcvt_grid_v2.json','w'),ensure_ascii=False)
print('json ok', sum(len(p['poly']) for p in out['phuong']))
