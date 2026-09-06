"""Rebuild original Yard Shift assets. Blender 4.4+; metres; GLTF front = +Z.
No downloaded models. Shapes, materials and asset placement are authored here.
"""
import bpy, math, random, os
from mathutils import Vector
random.seed(18)
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../public/models'))
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, rough=.65):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=rough
    return m
M={
 'teal':material('Peripass teal',(0,.40,.32),.25,.28),
 'tealLight':material('Teal enamel',(.03,.57,.44),.15,.35),
 'dark':material('Charcoal',(.045,.085,.09),.1),
 'rubber':material('Rubber',(.022,.028,.034),0,.96),
 'metal':material('Brushed aluminium',(.44,.52,.53),.72,.28),
 'white':material('Porcelain',(.86,.9,.86),.12,.45),
 'glass':material('Smoked blue glass',(.055,.16,.19),.55,.16),
 'orange':material('Safety amber',(1,.37,.055),.1,.5),
 'yellow':material('Safety yellow',(.98,.70,.15)),
 'red':material('Tail lamps',(.64,.025,.025),.3,.25),
 'light':material('Headlamps',(.92,.95,.75),.3,.15),
 'asphalt':material('Asphalt',(.095,.135,.145),0,.98),
 'concrete':material('Concrete',(.52,.60,.57)),
 'grass':material('Meadow',(.30,.43,.32)),
 'grassDark':material('Meadow edge',(.20,.32,.24)),
 'leaf':material('Leaf',(.13,.32,.23)),
 'leaf2':material('Leaf sun',(.25,.45,.29)),
 'bark':material('Bark',(.26,.19,.12)),
 'warehouse':material('Warehouse cladding',(.68,.74,.72),.3,.7),
 'roof':material('Standing seam roof',(.35,.45,.44),.35,.5),
 'blue':material('Solar glass',(.055,.12,.17),.5,.25),
 'paint':material('Road paint',(.80,.83,.72),0,.95),
 'wood':material('Pallet wood',(.56,.39,.21)),
}
def pos(x,y,z):return(x,-z,y)
def box(name,p,d,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos(*p)); o=bpy.context.object;o.name=name
    o.dimensions=(d[0],d[2],d[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(M[mat])
    if bevel:
        mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted highlights','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cyl(name,p,r,depth,mat,axis='y',vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=pos(*p))
    o=bpy.context.object;o.name=name
    if axis=='x':o.rotation_euler[1]=math.pi/2
    if axis=='z':o.rotation_euler[0]=math.pi/2
    o.data.materials.append(M[mat]);return o

def text(label,p,size,mat,rotate=(math.pi/2,0,0)):
    bpy.ops.object.text_add(location=pos(*p));o=bpy.context.object;o.name='Sign '+label
    o.data.body=label;o.data.align_x='CENTER';o.data.size=size;o.data.extrude=.004;o.rotation_euler=rotate
    o.data.materials.append(M[mat]);bpy.ops.object.convert(target='MESH');return bpy.context.object

def pivot(name,p,children):
    """Named empty the runtime can rotate; children keep their world placement."""
    bpy.ops.object.empty_add(location=pos(*p));root=bpy.context.object;root.name=name
    for child in children:
        matrix=child.matrix_world.copy();child.parent=root;child.matrix_world=matrix
    return root

def join_by_material(objects):
    """Join meshes sharing a material into one; returns the surviving objects."""
    # Grouped before any join: joining removes objects from the scene.
    groups={}
    for o in objects:
        if o.type=='MESH' and o.data.materials:groups.setdefault(o.data.materials[0].name,[]).append(o)
    joined=[]
    for mat in M.values():
        group=groups.get(mat.name,[])
        if len(group)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in group:o.select_set(True)
            bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
        joined+=group[:1]
    return joined

# Every wheel hangs from a `wheel-*` empty at its hub so the runtime can roll it
# about the axle (local X). Tyre, hub and cap+bolts join into three meshes per
# wheel. Front wheels sit inside a `steering-*` empty that yaws with the steer.
def wheel(x,z,front=False):
    before=set(bpy.context.scene.objects)
    cyl('Front wheel' if front else 'Tire',(x,.58,z),.58,.38,'rubber','x',24)
    cyl('Alloy hub',(x+math.copysign(.2,x),.58,z),.32,.05,'metal','x',16)
    cyl('Hub cap',(x+math.copysign(.235,x),.58,z),.12,.06,'dark','x',12)
    for a in range(6):
        t=a*math.tau/6
        cyl('Wheel bolt',(x+math.copysign(.235,x),.58+math.sin(t)*.22,z+math.cos(t)*.22),.032,.02,'dark','x',6)
    side='left' if x<0 else 'right'
    hub=pivot('wheel-'+side,(x,.58,z),join_by_material(set(bpy.context.scene.objects)-before))
    if front:pivot('steering-'+side,(x,.58,z),[hub])

def export(name):
    # Join by material: small draw-call budget, full bevel geometry retained.
    join_by_material([o for o in bpy.context.scene.objects if o.parent is None])
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',export_yup=True,export_materials='EXPORT')
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

# European cab-over tractor, hitch at rear axle.
box('Ladder chassis',(0,.74,1.4),(1.9,.32,5.6),'dark',.08)
box('Cab lower',(0,1.35,3.35),(2.48,1.05,3.1),'teal',.17)
box('Sleeper cab',(0,2.75,3.18),(2.48,2.05,2.84),'teal',.24)
box('Aero roof',(0,3.86,2.8),(2.36,.36,2.05),'tealLight',.14)
box('Windshield',(0,2.95,4.602),(2.15,1.06,.035),'glass',.055)
box('Centre window split',(0,2.96,4.63),(.04,1.08,.035),'dark')
box('Sun visor',(0,3.58,4.58),(2.36,.12,.21),'dark',.035)
box('Grille',(0,1.6,4.94),(1.78,.69,.07),'dark',.065)
for y in [1.38,1.54,1.7,1.86]:box('Grille slat',(0,y,4.99),(1.67,.024,.045),'metal')
box('Bumper',(0,.88,4.91),(2.44,.34,.2),'white',.06)
box('Plate',(0,.89,5.023),(.55,.15,.025),'yellow',.01)
for side in [-1,1]:
    x=side*1.25
    box('Door glass',(x,2.98,3.79),(.032,.9,1.22),'glass',.03)
    box('Door seam',(x,2.1,3.13),(.028,1.1,.025),'dark')
    box('Door handle',(x,2.42,3.0),(.06,.075,.25),'metal',.015)
    box('Cab step',(side*1.2,.73,2.29),(.36,.14,.72),'metal',.025)
    box('Mirror arm',(side*1.42,2.74,4.08),(.36,.06,.08),'dark')
    box('Mirror',(side*1.59,2.93,4.09),(.15,.5,.2),'dark',.045)
    box('Headlamp',(side*.98,1.16,4.95),(.37,.22,.08),'light',.04)
    box('Indicator',(side*1.13,1.4,4.95),(.12,.13,.08),'orange',.02)
    box('Fuel tank',(side*1.04,.89,1.21),(.48,.64,1.55),'metal',.12)
    box('Mudguard',(side*1.12,1.17,-.05),(.55,.13,2.14),'teal',.06)
    wheel(side*1.1,3.57,True)
    wheel(side*1.1,0)
    wheel(side*1.1,-1.23)
cyl('Fifth wheel',(0,1.08,0),.72,.18,'metal')
for i in range(3):
    cyl('Air hose',(i*.19-.19,1.7,1.8),.065,.72,'red' if i==0 else 'dark','y',8)
text('peripass',(0,2.22,4.99),.22,'white')
export('tractor')

# 13.6 m box trailer. Hitch at 0; rear at -11.5.
box('Trailer box',(0,2.65,-4.7),(2.55,2.7,13.6),'white',.075)
box('Trailer chassis',(0,1.11,-4.7),(2.48,.24,13.6),'dark',.035)
box('Roof cap',(0,4.03,-4.7),(2.61,.09,13.67),'metal',.025)
for side in [-1,1]:
    box('Side rail',(side*1.3,1.36,-4.7),(.055,.12,13.5),'metal')
    box('Brand stripe',(side*1.283,1.64,-4.7),(.025,.32,13.25),'teal')
    box('Side underrun',(side*1.1,.65,-3.2),(.1,.28,4.7),'metal',.03)
    for z in [-10.8,-8.7,-6.6,-4.5,-2.4,-.3,1.5]:
        box('Reflector',(side*1.317,1.39,z),(.027,.06,.15),'orange')
    for z in [-9.1,-7.85,-6.6]:wheel(side*1.1,z)
    box('Landing leg',(side*.8,.71,-1.3),(.13,.87,.18),'dark')
    box('Landing foot',(side*.8,.24,-1.3),(.35,.06,.35),'metal')
    # Typography placed on trailer side with Blender text facing outward.
    t=text('peripass',(side*1.285,2.65,-4.5),.74,'teal')
    t.rotation_euler=(math.pi/2,0, side*math.pi/2)
box('Rear doors',(0,2.65,-11.54),(2.42,2.53,.035),'warehouse')
box('Door split',(0,2.65,-11.57),(.035,2.5,.04),'metal')
for x in [-.87,-.38,.38,.87]:
    box('Door locking rod',(x,2.62,-11.6),(.04,2.2,.05),'metal')
for x in [-.95,.95]:
    box('Tail lights',(x,1.03,-11.63),(.4,.14,.05),'red',.025)
box('Rear bumper',(0,.58,-11.56),(2.43,.2,.22),'metal',.04)
export('trailer')

# Static yard: a legible, sunlit miniature logistics terminal.
box('Diorama base',(0,-1.5,13),(120,2.5,149),'grassDark',1.5)
box('Meadow',(0,-.22,13),(119,.25,148),'grass',.5)
box('Asphalt',(0,-.12,13),(105,.16,135),'asphalt',.7)
box('North apron',(0,.005,-29),(101,.05,30),'concrete')
# expansion joints
for x in range(-50,51,10):box('Apron joint',(x,.035,-29),(.045,.005,30),'roof')
for z in [-42,-32,-22]:box('Apron joint',(0,.035,z),(100,.005,.045),'roof')
# warehouse front -45
box('Distribution centre',(0,4.8,-54),(101,9.6,18),'warehouse',.12)
for x in range(-50,51,2):box('Facade seam',(x,5.1,-44.93),(.045,8.8,.08),'roof')
box('Roof',(0,9.68,-54),(102,.3,19),'roof',.06)
box('Teal parapet',(0,9.35,-44.74),(102,.45,.23),'teal')
for x in range(-48,50,2):box('Roof seam',(x,9.89,-54),(.055,.06,18.5),'metal')
for x in [-39,-23,-7,9,25,41]:
    for z in [-52,-58]:
        box('Solar module',(x,10.02,z),(10,.18,4.4),'blue',.035)
        for dx in [-3.4,0,3.4]:box('Solar cell line',(x+dx,10.13,z),(.04,.012,4.4),'metal')
for i,x in enumerate([-36,-18,0,18,36]):
    box('Dock surround',(x,2.65,-44.68),(5.2,5.3,.7),'dark',.12)
    box('Dock door',(x,2.48,-44.25),(3.4,3.55,.09),'roof')
    for y in [1,1.5,2,2.5,3,3.5,4]:box('Door rib',(x,y,-44.19),(3.35,.04,.08),'metal')
    for dx in [-2,2]:
        box('Dock bumper',(x+dx,.65,-44.12),(.34,1.3,.45),'rubber',.06)
        cyl('Bollard',(x+dx*1.45,.7,-43),.13,1.4,'yellow')
    box('Dock number panel',(x,6.22,-44.73),(2.55,1.38,.15),'teal' if i==2 else 'dark',.05)
    text('0'+str(i+1),(x,5.85,-44.62),.93,'white')
    for dx in [-2.6,2.6]:box('Dock line',(x+dx,.052,-35),(.13,.018,17),'paint')
    box('Traffic lamp',(x+3.18,3.8,-44.29),(.3,.75,.2),'dark',.025)
    cyl('Lamp red',(x+3.18,4,-44.15),.08,.035,'red','z')
text('peripass',(37,7.1,-44.76),1.35,'teal')
text('DISTRIBUTION  /  01',(-27,7.4,-44.76),.68,'dark')
# parking bays
for i,x in enumerate([-42,-24,-6]):
    for dx in [-3,3]:box('Parking white line',(x+dx,.044,44),(.15,.014,23),'paint')
    box('Parking back line',(x,.044,55.5),(6,.014,.15),'paint')
    text('P0'+str(i+1),(x,.06,48),1.05,'paint',(-math.pi/2,0,0))
# Road dashed centre lines and arrows
for z in range(22,76,5):box('Lane divider',(8,.043,z),(.12,.01,2.3),'paint')
for z in [25,45,65]:
    box('Arrow shaft',(18,.045,z),( .24,.014,2.2),'paint')
    for side in [-1,1]:
        o=box('Arrow chevron',(18+side*.38,.045,z-1),(.17,.014,1.05),'paint');o.rotation_euler[2]=side*.75
box('Stop line',(18,.048,19),(10,.02,.35),'paint')
text('STOP',(18,.06,21.4),1.3,'paint',(-math.pi/2,0,0))
# Safe walkway & crossing
box('Pedestrian path',(-32.5,.075,39),(3,.18,40),'concrete',.1)
for z in range(21,59,3):box('Walkway edge',(-30.92,.18,z),(.13,.025,1.4),'yellow')
for x in range(-29,-19,2):box('Zebra stripe',(x,.05,29.5),(1,.012,3),'paint')
# Reception office and actual kiosk
box('Reception plinth',(-40,.15,23),(13,.3,10),'concrete',.15)
box('Reception',(-41,1.9,21),(9,3.5,5),'white',.12)
box('Office fascia',(-41,3.77,21),(9.6,.23,5.6),'teal',.07)
for x in [-43.5,-41.3]:box('Office glass',(x,2,23.54),(1.75,1.6,.055),'glass',.06)
box('Office door',(-38.4,1.48,23.54),(1.15,2.55,.06),'dark',.03)
text('DRIVER CHECK-IN',(-41,3.2,23.64),.4,'teal')
box('Kiosk foot',(-33.7,.18,26),(.95,.3,.75),'dark',.05)
box('Kiosk pedestal',(-33.7,1.25,26),(.5,2,.42),'metal',.06)
box('Kiosk enclosure',(-33.7,2.25,26),(.98,1.55,.56),'teal',.12)
box('Kiosk screen',(-33.7,2.42,26.3),(.73,.94,.035),'glass',.04)
box('Kiosk interface',(-33.7,2.44,26.325),(.57,.58,.01),'white',.02)
box('Kiosk button',(-33.7,2.23,26.34),(.42,.13,.015),'teal',.01)
for x in [-35,-32.3]:cyl('Kiosk bollard',(x,.55,26),.12,1.1,'yellow')
# gate hardware, dynamic boom added by runtime
box('Gate housing',(12, .85,12),(.65,1.7,.75),'teal',.07)
box('PIN foot',(11.9,.18,16),(.72,.3,.62),'dark',.05)
box('PIN pedestal',(11.9,1.525,16),(.42,2.55,.42),'metal',.04)
box('PIN terminal',(11.9,2.65,16),(.72,.83,.45),'dark',.07)
box('PIN screen',(11.9,2.72,16.24),(.52,.51,.025),'tealLight',.02)
# fence meshes using thin pickets (combined into a few draw calls)
def fence(x1,z1,x2,z2):
    length=math.hypot(x2-x1,z2-z1);n=max(1,int(length/3))
    for i in range(n+1):
        t=i/n;box('Fence post',(x1+(x2-x1)*t,1.1,z1+(z2-z1)*t),(.12,2.2,.12),'metal')
    for y in [.45,1.3,2.05]:
        o=box('Fence rail',((x1+x2)/2,y,(z1+z2)/2),(length,.045,.045),'metal')
        o.rotation_euler[2]=-math.atan2(z2-z1,x2-x1)
    for i in range(int(length/.52)):
        t=i/max(1,int(length/.52));box('Fence picket',(x1+(x2-x1)*t,1.15,z1+(z2-z1)*t),(.022,1.85,.022),'roof')
fence(-52,12,11.6,12);fence(24,12,52,12)
fence(-52,-44,-52,76);fence(52,-44,52,76)
fence(-52,76,-33,76);fence(-13,76,52,76)
# Trees outside truck circulation
for x,z in [(-57,z) for z in [-42,-24,-3,17,44,66]]+[(57,z) for z in [-38,-16,5,29,52,73]]:
    cyl('Tree trunk',(x,1.7,z),.33,3.4,'bark',vertices=8)
    for dx,dy,dz,r in [(0,4.8,0,2.6),(-.9,4.1,.6,1.9),(1.1,4.4,-.5,2.0)]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=r,location=pos(x+dx,dy,z+dz))
        bpy.context.object.data.materials.append(M['leaf' if dx<.5 else 'leaf2'])
# Lighting columns, drainage, small pallets and cones.
for x,z in [(-49,-10),(48,-10),(-49,61),(47,62)]:
    cyl('Light column',(x,4.5,z),.14,9,'metal')
    box('Light arm',(x,9,z),(3.5,.13,.13),'metal')
    for dx in [-1.5,1.5]:box('Luminaire',(x+dx,8.9,z),(.65,.2,.65),'dark',.05)
for x in [-48,46]:
    for z in [-37,-7,33,68]:
        box('Drain',(x,.041,z),(1.2,.03,.65),'dark')
        for dx in [-.4,-.2,0,.2,.4]:box('Drain grate',(x+dx,.064,z),(.04,.02,.6),'metal')
for x,z in [(44,-30),(44,-28.5),(46,-29)]:
    for y in [.15,.4,.65]:
        for dx in [-.46,-.23,0,.23,.46]:box('Pallet board',(x+dx,y,z),(.2,.09,1.2),'wood')
for x,z in [(-30,60),(-18,60),(26,19),(10,19),(40,-38)]:
    box('Cone base',(x,.07,z),(.6,.14,.6),'dark',.03)
    bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.24,radius2=.055,depth=.7,location=pos(x,.49,z))
    bpy.context.object.data.materials.append(M['orange'])
    cyl('Cone reflector',(x,.53,z),.155,.12,'white')
export('yard')
# Driver: hi-vis figure for walking stage. Limbs hang from named empties (hip,
# shoulder, neck) so the runtime can swing them; the meshes stay unjoined.
for side,x in [('left',-.16),('right',.16)]:
    pivot('leg-'+side,(x,.92,0),[box('Boot',(x*1.06,.12,.06),(.25,.23,.42),'dark',.065),box('Trouser leg',(x,.55,0),(.25,.74,.28),'dark',.07)])
arms=[pivot('arm-'+side,(x,1.29,0),[box('Arm',(x,1.03,0),(.18,.58,.23),'teal',.055)]) for side,x in [('left',-.39),('right',.39)]]
head=pivot('head',(0,1.46,0),[cyl('Head',(0,1.62,0),.19,.29,'wood'),cyl('Hard hat',(0,1.80,0),.23,.15,'yellow'),cyl('Hat brim',(0,1.74,0),.28,.035,'yellow'),box('Hat peak',(0,1.735,.3),(.2,.03,.12),'yellow',.01)]+[box('Eye',(x,1.65,.18),(.06,.05,.03),'dark') for x in [-.07,.07]])
pivot('body',(0,.92,0),[box('Torso',(0,1.13,0),(.64,.59,.34),'orange',.08),box('Vest stripe',(0,1.07,0),(.66,.07,.36),'white')]+arms+[head])
export('driver')
print('Yard Shift assets generated in '+OUT)
