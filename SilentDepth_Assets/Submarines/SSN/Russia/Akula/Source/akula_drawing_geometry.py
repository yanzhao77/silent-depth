"""Independent exterior meshes traced from the supplied Project 971 drawing."""
import math

import bmesh
import bpy
from mathutils import Vector

LENGTH = 110.2
BEAM = 13.6
ID = "RU_SSN_Akula"


def px(x):
    return (x - 30.0) / 1913.0 * LENGTH - LENGTH / 2


def interp(stations, x):
    # Shape-preserving Hermite interpolation avoids scallops at tracing stations.
    xs, ys = zip(*stations)
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    delta = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(len(xs) - 1)]
    slopes = [delta[0]]
    for i in range(1, len(xs) - 1):
        a, b = delta[i - 1], delta[i]
        slopes.append(0 if a * b <= 0 else 2 * a * b / (a + b))
    slopes.append(delta[-1])
    i = next(i for i in range(len(xs) - 1) if xs[i] <= x <= xs[i + 1])
    h = xs[i + 1] - xs[i]
    t = (x - xs[i]) / h
    return ((2*t**3-3*t**2+1)*ys[i] + (t**3-2*t**2+t)*h*slopes[i]
            + (-2*t**3+3*t**2)*ys[i+1] + (t**3-t**2)*h*slopes[i+1])


# Pixel stations from board 04: the side and plan share the same longitudinal datum.
UPPER = [(px(x), (383-y)*13.6/244) for x, y in
         [(49,375),(150,349),(285,325),(450,292),(650,267),(800,262),
          (1100,260),(1450,260),(1700,260),(1790,268),(1850,286),
          (1900,315),(1927,344),(1940,367),(1943,383)]]
LOWER = [(px(x), (y-383)*13.6/244) for x, y in
         [(49,391),(150,413),(285,441),(450,468),(650,493),(800,503),
          (1100,503),(1450,503),(1700,502),(1790,490),(1850,472),
          (1900,446),(1927,420),(1940,397),(1943,383)]]
WIDTH = [(px(x), (750-y)*13.6/230) for x, y in
         [(49,746),(150,729),(285,701),(450,672),(650,647),(800,639),
          (1100,635),(1450,635),(1700,635),(1790,646),(1850,669),
          (1900,697),(1927,721),(1940,739),(1943,750)]]
SAIL_TOP = [(px(x), (383-y)*13.6/244) for x, y in
            [(825,266),(880,234),(955,199),(1030,183),(1170,177),
             (1247,179),(1280,194),(1308,233),(1330,256),(1340,262)]]
SAIL_WIDTH = [(px(x), w) for x, w in
              [(825,.02),(880,.58),(955,1.45),(1030,2.15),(1170,2.65),
               (1247,2.25),(1280,1.8),(1308,1.1),(1330,.45),(1340,.02)]]


def surface(x, angle):
    upper, lower = interp(UPPER,x), interp(LOWER,x)
    sine=math.sin(angle)
    return Vector((x, interp(WIDTH,x)*math.cos(angle), (upper if sine>=0 else lower)*sine))


def mesh(name, verts, faces, mats, collection, indices=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new("SUB_RU_Akula_"+name, data)
    collection.objects.link(obj)
    for mat in mats if isinstance(mats,list) else [mats]:
        data.materials.append(mat)
    uv = data.uv_layers.new(name="UV0")
    for i,p in enumerate(data.polygons):
        p.use_smooth = len(p.vertices) == 4
        if indices:
            p.material_index = indices[i]
        for loop in p.loop_indices:
            v = data.vertices[data.loops[loop].vertex_index].co
            uv.data[loop].uv = ((v.x+55.1)/LENGTH, math.atan2(v.z,v.y)/(2*math.pi)+.5)
    obj["asset_id"] = ID
    return obj


def loft(name, rings, mats, collection, color_split=False):
    n = len(rings[0])
    verts = [tuple(p) for ring in rings for p in ring]
    faces, indices = [], []
    for k in range(len(rings)-1):
        for j in range(n):
            face = (k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j)
            faces.append(face)
            indices.append(int(color_split and sum(verts[v][2] for v in face)/4 < 0))
    faces += [tuple(reversed(range(n))),tuple(range(len(verts)-n,len(verts)))]
    indices += [0,0]
    return mesh(name,verts,faces,mats,collection,indices)


def tube(name, points, radius, mat, collection, sides=8):
    rings=[]
    for i,point in enumerate(points):
        p=Vector(point)
        direction=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        ref=Vector((0,0,1)) if abs(direction.z)<.9 else Vector((0,1,0))
        u=direction.cross(ref).normalized()
        v=direction.cross(u)
        rings.append([p+radius*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides)) for j in range(sides)])
    return loft(name,rings,mat,collection)


def lathe(name, stations, mat, collection, z=0, y=0):
    rings=[]
    for x,r in stations:
        rings.append([(x,y+r*math.cos(j*2*math.pi/48),z+r*math.sin(j*2*math.pi/48)) for j in range(48)])
    return loft(name,rings,mat,collection)


def hull(c,m):
    start,end=UPPER[0][0],UPPER[-1][0]
    # Cosine spacing resolves the round bow without a cone-shaped last segment.
    xs=[start+(end-start)*(1-math.cos(i*math.pi/320))/2 for i in range(320)]
    xs.append(end-.0001)
    rings=[[surface(x,j*2*math.pi/96) for j in range(96)] for x in xs]
    obj=loft("Hull_Drawing04",rings,[m["hull"],m["bottom"]],c["01_HULL"],True)
    return obj


def sail(c,m):
    rings=[]
    for i in range(111):
        x=SAIL_TOP[0][0]+(SAIL_TOP[-1][0]-SAIL_TOP[0][0])*i/110
        top=interp(SAIL_TOP,x)
        bottom=interp(UPPER,x)-.45
        width=interp(SAIL_WIDTH,x)
        ring=[]
        for j in range(48):
            a=2*math.pi*j/48
            y=width*math.copysign(abs(math.cos(a))**.55,math.cos(a))
            z=(top+bottom)/2+(top-bottom)/2*math.copysign(abs(math.sin(a))**.22,math.sin(a))
            ring.append((x,y,z))
        rings.append(ring)
    result=loft("Sail_AsymmetricDrawing04",rings,m["hull"],c["02_SAIL"])
    for i,(x,y,h) in enumerate([(-1.1,-.6,4.2),(.2,.4,4.8),(1.3,-.4,5.4),
                                (2.4,.35,9.4),(3.8,-.25,5.6),(5.1,.5,4.6)]):
        z=interp(SAIL_TOP,x)-.25
        tube("Mast_%02d"%i,[(x,y,z),(x,y,z+h)],.075 if i!=3 else .038,m["metal"],c["04_MASTS"],12)
        if i!=3:
            tube("MastHead_%02d"%i,[(x,y,z+h-.5),(x,y,z+h+.05)],.15,m["hull"],c["04_MASTS"],16)
    return result


def foil(name, stations, axis, sign, mat, collection):
    # Closed hydrofoil sections, thick embedded root and thin rounded leading edge.
    rings=[]
    for span,leading,trailing,thick in stations:
        ring=[]
        for i in range(40):
            a=2*math.pi*i/40
            q=(1-math.cos(a))/2
            x=leading+(trailing-leading)*q
            t=thick*math.sin(a)*(1-.55*q)
            ring.append((x,t,sign*span) if axis=="Z" else (x,sign*span,t))
        rings.append(ring)
    return loft(name,rings,mat,collection)


def tail(c,m):
    fins=[]
    for sign in (-1,1):
        fins.append(foil("TailVertical_"+str(sign),[
            (.65,-38.8,-48.4,.43),(2.0,-40,-48.6,.4),
            (3.3,-42.4,-48.55,.34),(5.1,-43.2,-48.5,.23),
            (7.7,-43.3,-48.3,.14),(8.15,-43.5,-48.0,.08)],
            "Z",sign,m["hull"] if sign>0 else m["bottom"],c["06_TAIL"]))
        fins.append(foil("TailHorizontal_"+str(sign),[
            (.6,-38.6,-48.6,.46),(2.7,-40.3,-48.5,.4),(5,-42.1,-48.3,.31),
            (8.7,-43.1,-48.1,.17),(9.8,-43.5,-47.8,.08)],"Y",sign,m["hull"],c["06_TAIL"]))
    pod=lathe("TowedArrayPod",[(-51.1,.06),(-50.5,.28),(-49.3,.65),(-47.5,1.1),
                (-45.5,1.38),(-42.8,1.38),(-41.5,1.25),(-40.9,.85),(-40.7,.12)],
                m["hull"],c["06_TAIL"],z=9.05)
    for sign in (-1,1):
        lathe("TailSideFairing_"+str(sign),[(-48.2,.03),(-47,.27),(-44,.38),(-42,.25),(-41,.02)],
              m["hull"],c["06_TAIL"],y=sign*1.25)
    return fins,pod


def propulsion(c,m):
    col=c["07_PROPULSION"]
    lathe("Bearing",[(-54.2,.26),(-53.65,.43),(-53.35,.47)],m["metal"],col)
    hub=lathe("PropellerHub",[(-55.1,.025),(-54.95,.22),(-54.6,.43),(-54.0,.43),(-53.7,.28)],m["prop"],col)
    blades=[]
    for index in range(7):
        rings=[]
        for i in range(27):
            t=i/26
            r=.32+1.85*t
            angle=index*2*math.pi/7 + .92*t**1.5
            radial=Vector((0,math.cos(angle),math.sin(angle)))
            tangent=Vector((0,-math.sin(angle),math.cos(angle)))
            beta=math.atan(.85/r)
            chord=interp([(0,.32),(.25,.65),(.6,.9),(.85,.65),(1,.025)],t)
            mid=Vector((-54.25-.20*t*t,0,0))+radial*r
            chord_axis=tangent*math.cos(beta)+Vector((math.sin(beta),0,0))
            normal=Vector((math.cos(beta),0,0))-tangent*math.sin(beta)
            ring=[]
            for j in range(32):
                a=j*2*math.pi/32
                q=(1-math.cos(a))/2
                camber=.035*chord*4*q*(1-q)
                thickness=.075*chord*math.sin(a)*(1-.65*q)
                ring.append(mid+chord_axis*((q-.5)*chord)+normal*(camber+thickness))
            rings.append(ring)
        blade=loft("PropellerBlade_%02d"%index,rings,m["prop"],col)
        blade["pitch_root_deg"]=math.degrees(math.atan(.85/.32))
        blade["pitch_tip_deg"]=math.degrees(math.atan(.85/2.17))
        blades.append(blade)
    return hub,blades


def hull_patch(name,x,angle,length,arc,mat,col):
    verts=[]
    for i in range(7):
        for j in range(5):
            xx=x+length*(i/6-.5)
            aa=angle+arc*(j/4-.5)
            p=surface(xx,aa)
            p+=Vector((0,math.cos(aa),math.sin(aa)))*.025
            verts.append(p)
    faces=[]
    for i in range(6):
        for j in range(4):
            a=i*5+j
            faces.append((a,a+1,a+6,a+5))
    return mesh(name,verts,faces,mat,col)


def panel_outline(name,x,angle,length,arc,mat,col):
    parameters=[]
    for i in range(65):
        a=i*2*math.pi/64
        xx=x+length/2*math.copysign(abs(math.cos(a))**.22,math.cos(a))
        aa=angle+arc/2*math.copysign(abs(math.sin(a))**.22,math.sin(a))
        parameters.append((xx,aa))
    points=[]
    for (x0,a0),(x1,a1) in zip(parameters,parameters[1:]):
        steps=max(1,math.ceil(abs(x1-x0)/.25),math.ceil(abs(a1-a0)/.035))
        for i in range(steps):
            t=i/steps
            xx,aa=x0+(x1-x0)*t,a0+(a1-a0)*t
            points.append(surface(xx,aa)+Vector((0,math.cos(aa),math.sin(aa)))*.018)
    points.append(points[0])
    tube(name,points,.022,mat,col,6)


def sail_detail_surface(x,q,side):
    top=interp(SAIL_TOP,x)
    bottom=interp(UPPER,x)-.45
    half=(top-bottom)/2
    v=(q-(top+bottom)/2)/half
    a=math.asin(math.copysign(min(abs(v),.999)**(1/.22),v))
    y=interp(SAIL_WIDTH,x)*math.cos(a)**.55
    return Vector((x,side*(y+.018),q))


def sail_details(c,m):
    for side in (-1,1):
        for index,(x,z,w,h) in enumerate([(1,8.6,1.1,.8),(5,8.4,.8,.9),
                     (9,8.4,.85,.7),(13,8.5,.85,.65),(15.9,9.9,.6,.3)]):
            points=[]
            for j in range(33):
                a=j*2*math.pi/32
                xx=x+w/2*math.copysign(abs(math.cos(a))**.3,math.cos(a))
                zz=z+h/2*math.copysign(abs(math.sin(a))**.3,math.sin(a))
                points.append(sail_detail_surface(xx,zz,side))
            tube("SailAccess_%s_%s"%(side,index),points,.019,m["dark"],c["02_SAIL"],6)
        for row in range(6):
            z=9.2+row*.1
            tube("SailVent_%s_%s"%(side,row),[sail_detail_surface(-.1,z,side),sail_detail_surface(1.6,z,side)],.024,m["dark"],c["02_SAIL"],6)
        for index,x in enumerate([14.3,15.1,15.9]):
            points=[sail_detail_surface(x-.25,10.45,side),sail_detail_surface(x+.25,10.45,side)]
            tube("BridgeWindow_%s_%s"%(side,index),points,.055,m["dark"],c["02_SAIL"],8)
    for x in [8,12]:
        z=interp(SAIL_TOP,x)+.035
        ring=[(x+.65*math.cos(j*2*math.pi/40),.55*math.sin(j*2*math.pi/40),z) for j in range(41)]
        tube("SailRoofHatch_"+str(x),ring,.025,m["dark"],c["09_HATCHES"],6)


def details(c,m):
    for side in (-1,1):
        angle=.32 if side>0 else math.pi-.32
        for i,x in enumerate(range(-33,42,5)):
            hull_patch("UpperFloodPort_%s_%02d"%(side,i),x,angle,.7,.045,m["dark"],c["08_DETAILS"])
        angle=-1.06 if side>0 else math.pi+1.06
        for i,x in enumerate(range(-23,39,2)):
            hull_patch("LowerFloodPort_%s_%02d"%(side,i),x,angle,.6,.035,m["dark"],c["08_DETAILS"])
        foil("BowPlane_"+str(side),[(5.7,43.4,41.8,.24),(6.7,43.2,41.4,.22),
             (8.9,42.8,41,.12),(9.6,42.5,41,.05)],"Y",side,m["hull"],c["05_DIVE_PLANES"])
        for x,length,zangle in [(-23,9,.06),(21,3,.02),(32,6,.38)]:
            angle=zangle if side>0 else math.pi-zangle
            panel_outline("ServicePanel_"+str(side)+"_"+str(x),x,angle,length,.24,m["dark"],c["09_HATCHES"])
        angle=.05 if side>0 else math.pi-.05
        panel_outline("ForwardCasingDoor_"+str(side),30.1,angle,7.2,1.5,m["dark"],c["09_HATCHES"])
        # Four flush bow shutters on each shoulder, no exposed internal launch tubes.
        for i in range(4):
            aa=.35+i*.25
            if side<0:
                aa=math.pi-aa
            panel_outline("BowShutter_%s_%s"%(side,i),50.1-i*.24,aa,1.9,.075,m["dark"],c["09_HATCHES"])
    for i,x in enumerate([-36,-28,-18,23,31,38]):
        panel_outline("DeckHatch_%02d"%i,x,math.pi/2,1.8,.18,m["dark"],c["09_HATCHES"])
    # Subtle hull seams follow the actual casing instead of floating in a fixed plane.
    for i,x in enumerate([-33,-23,-12,22,36,46]):
        points=[surface(x,j*2*math.pi/96)+Vector((0,math.cos(j*2*math.pi/96),math.sin(j*2*math.pi/96)))*.009 for j in range(97)]
        tube("CasingSeam_%02d"%i,points,.012,m["panel"],c["08_DETAILS"],6)


def build(c,m):
    body=hull(c,m)
    fairwater=sail(c,m)
    fins,pod=tail(c,m)
    hub,blades=propulsion(c,m)
    details(c,m)
    sail_details(c,m)
    return {"hull":body,"sail":fairwater,"fins":fins,"pod":pod,"hub":hub,"blades":blades}
