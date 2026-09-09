"""Independent smooth exterior construction, meters, bow +X."""
import math
import bpy
import bmesh
from mathutils import Vector

TAU = math.tau
PARTS = []
MAT = {}
COL = None


def mesh(name, verts, faces, material='coating', smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new('SUB_Yasen_' + name, data)
    COL.objects.link(obj)
    data.materials.append(MAT[material])
    for face in data.polygons:
        face.use_smooth = smooth
    PARTS.append(obj)
    return obj


def loft(name, rings, material='coating'):
    n = len(rings[0])
    verts = [tuple(p) for ring in rings for p in ring]
    faces = [(i*n+j, i*n+(j+1)%n, (i+1)*n+(j+1)%n, (i+1)*n+j)
             for i in range(len(rings)-1) for j in range(n)]
    faces += [tuple(reversed(range(n))), tuple((len(rings)-1)*n+j for j in range(n))]
    return mesh(name, verts, faces, material)


def bezier(t, points):
    return sum(p*c for p,c in zip(points, ((1-t)**3, 3*t*(1-t)**2, 3*t*t*(1-t), t**3)))


def radius(x):
    if x >= 46:
        return 6.5 * math.sqrt(max(0, 1-((x-46)/14)**2))
    if x >= -24:
        t = (x+24)/70
        return 6.5 - .05*math.sin(math.pi*t)**2
    t = max(0,min(1,(x+57.2)/33.2))
    return bezier(t, (.55, .85, 6.5, 6.5))


def surface(x, theta, offset=0):
    r = radius(x)
    return Vector((x, (r+offset)*math.cos(theta), (r*.965+offset)*math.sin(theta)))


def hull():
    # Dense cosine sampling resolves the round nose without a flat terminal cap.
    xs = [-57.2+103.2*i/144 for i in range(145)]
    xs += [46+14*math.sin(math.pi*.5*i/48) for i in range(1,48)]
    n = 128
    rings = [[surface(x, TAU*j/n) for j in range(n)] for x in xs]
    verts = [tuple(p) for ring in rings for p in ring]
    faces = [(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j)
             for i in range(len(rings)-1) for j in range(n)]
    verts += [(60,0,0),(-57.2,0,0)]
    nose, stern = len(verts)-2, len(verts)-1
    faces += [((len(rings)-1)*n+j,(len(rings)-1)*n+(j+1)%n,nose) for j in range(n)]
    faces += [(j,stern,(j+1)%n) for j in range(n)]
    obj = mesh('Hull',verts,faces,'hull')
    uv = obj.data.uv_layers.new(name='UV0')
    for poly in obj.data.polygons:
        angles = [math.atan2(obj.data.vertices[obj.data.loops[k].vertex_index].co.z/.965,
                             obj.data.vertices[obj.data.loops[k].vertex_index].co.y)%TAU for k in poly.loop_indices]
        crosses = max(angles)-min(angles)>math.pi
        for k,a in zip(poly.loop_indices,angles):
            co = obj.data.vertices[obj.data.loops[k].vertex_index].co
            if crosses and a<math.pi: a+=TAU
            uv.data[k].uv = ((co.x+60)/120,a/TAU)
    return obj


def sail():
    rings=[]
    for z,l,w,center in [(5.25,10.3,2.15,20),(5.9,10.1,2.1,20),(6.7,9.8,1.9,20.1),
                           (10.8,8.4,1.6,20.8),(11.65,7.9,1.48,20.8),(11.85,7.6,1.36,20.8)]:
        rings.append([(center+l*math.cos(TAU*j/80),w*math.sin(TAU*j/80)*(.83+.17*math.cos(TAU*j/80)),z) for j in range(80)])
    return loft('Sail',rings)


def axial(name, stations, material='metal', n=64):
    return loft(name,[[(x,r*math.cos(TAU*j/n),r*math.sin(TAU*j/n)) for j in range(n)] for x,r in stations],material)


def cylinder(name, center, r, height, material='metal', n=32):
    x,y,z=center
    return loft(name,[[(x+r*math.cos(TAU*j/n),y+r*math.sin(TAU*j/n),z+dz) for j in range(n)] for dz in (-height/2,height/2)],material)


def fin(name, theta, root, tip, lead, trail, tip_lead, tip_trail):
    radial=Vector((0,math.cos(theta),math.sin(theta)))
    tangent=Vector((0,-math.sin(theta),math.cos(theta)))
    rings=[]
    for i in range(13):
        t=i/12
        r=root+(tip-root)*t
        a=lead+(tip_lead-lead)*t
        b=trail+(tip_trail-trail)*t
        thick=.45*(1-t)+.065*t
        ring=[]
        # Closed elliptical foil sections, chord aligned with the boat axis.
        for j in range(48):
            v=TAU*j/48
            x=(a+b)/2+(a-b)/2*math.cos(v)
            seated=radius(x)*.84
            local_r=seated*(1-t)+tip*t
            ring.append(Vector((x,0,0))+radial*local_r+tangent*(thick*math.sin(v)))
        rings.append(ring)
    return loft(name,rings)


def patch(name, x, theta, length, width, material='panel', depth=.035):
    # Every vertex conforms to the hull; no suspended straight bars.
    n=40
    outline=[]
    for j in range(n):
        a=TAU*j/n
        dx=length*.5*math.copysign(abs(math.cos(a))**.35,math.cos(a))
        dw=width*.5*math.copysign(abs(math.sin(a))**.35,math.sin(a))
        outline.append((x+dx,theta+dw/max(.5,radius(x))))
    rings=[[surface(px,ang,-.06) for px,ang in outline]]
    for shrink in range(8,0,-1):
        f=shrink/8
        rings.append([surface(x+(px-x)*f,theta+(ang-theta)*f,depth) for px,ang in outline])
    return loft(name,rings,material)


def propeller():
    hub=axial('PropellerHub',[(-60,.08),(-59.9,.27),(-59.5,.64),(-58.85,.78),(-58.2,.75),(-57.55,.55)],'bronze')
    shaft=axial('ShaftFairing',[(-58.15,.53),(-57.0,.60),(-56.3,.76)],'coating')
    blades=[]
    for k in range(7):
        rings=[]
        for i in range(23):
            t=i/22
            r=.63+2.65*t
            skew=.02+.58*t*t
            theta=TAU*k/7+skew
            pitch=math.radians(48-27*t)
            chord=.56+1.18*math.sin(math.pi*t*.90)
            if t>.85:
                q=(t-.85)/.15
                chord*=max(.08,math.sqrt(max(0,1-q*q)))
            tangent=Vector((0,-math.sin(theta),math.cos(theta)))
            radial=Vector((0,math.cos(theta),math.sin(theta)))
            c=Vector((-58.83-.25*t*t,0,0))+radial*r
            chord_dir=tangent*math.cos(pitch)+Vector((math.sin(pitch),0,0))
            normal=tangent*(-math.sin(pitch))+Vector((math.cos(pitch),0,0))
            thick=.072*(1-t)+.017*t
            rings.append([c+chord_dir*(chord*.5*math.cos(TAU*j/24))+normal*(thick*math.sin(TAU*j/24)) for j in range(24)])
        b=loft('PropellerBlade_%02d'%k,rings,'bronze')
        b['root_pitch_deg']=48
        b['tip_pitch_deg']=21
        blades.append(b)
    return hub,shaft,blades


def build(collection,materials,detail=True):
    global COL,MAT
    COL,MAT=collection,materials
    PARTS.clear()
    body=hull()
    tower=sail()
    tails=[fin('Tail_%02d'%k,k*math.pi/2,1.5,7.45,-43,-54.6,-50.2,-54.7) for k in range(4)]
    planes=[fin('ForwardPlane_%02d'%k,k*math.pi,5.3,8.6,36.8,30.8,34.3,31.6) for k in range(2)]
    hub,shaft,blades=propeller()
    if detail:
        for row,theta in enumerate((math.pi/2-.26,math.pi/2+.26)):
            for i,x in enumerate((-13.5,-8.1,-2.7,2.7)):
                patch('VLS_Rim_%d_%d'%(row,i),x,theta,4.65,2.35,'recess',.026)
                patch('VLS_Lid_%d_%d'%(row,i),x,theta,4.48,2.20,'panel',.044)
        for x in (-31,8,36,43):
            patch('DeckHatch_%s'%x,x,math.pi/2,1.5,1.35,'panel',.032)
        for side in (-1,1):
            theta=math.pi/2+side*.94
            patch('FlankArray_%s'%side,-6,theta,25,1.42,'array',.015)
            for j,x in enumerate((-33,-30,-27,-24,-21,-18)):
                patch('FloodSlot_%d_%d'%(side,j),x,math.pi/2+side*.58,1.7,.16,'recess',.012)
            for j,x in enumerate((33,35.8,38.6)):
                patch('BowDoor_%d_%d'%(side,j),x,math.pi/2+side*1.31,2.2,.56,'panel',.02)
        for k,(x,y,h,r) in enumerate(((17,0,2.1,.14),(20,.48,1.75,.16),(23,-.42,2.65,.13),(25.5,.1,1.2,.11))):
            cylinder('MastSocket_%d'%k,(x,y,11.80),r*1.7,.18,'recess')
            cylinder('Mast_%d'%k,(x,y,11.7+h/2),r,h,'metal')
            cylinder('MastHead_%d'%k,(x,y,11.7+h),r*1.45,.32,'panel')
        cylinder('SailHatch',(15.4,0,11.86),.48,.07,'panel')
    return {'hull':body,'sail':tower,'tail':tails,'planes':planes,'hub':hub,'shaft':shaft,'blades':blades}
