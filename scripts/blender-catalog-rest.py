"""Six original, stylized menu models. Run with Blender's Python, not CPython."""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(PROJECT_ROOT)
STAGE = globals().get('PASS', 'structure')
ONLY = globals().get('ONLY', None)
OUT = ROOT / 'artifacts' / 'blender-catalog'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(20261022)
scene = None
root = None

def mat(name, color, rough=.5):
    m = bpy.data.materials.new('CAT-' + name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m

ceramic = mat('ceramica', (.76,.79,.72), .24)
gold = mat('empanado', (.53,.23,.045), .85)
dough = mat('massa', (.57,.28,.075), .68)
cream = mat('creme', (.85,.67,.34), .4)
white = mat('queijo-claro', (.82,.72,.44), .48)
yellow = mat('queijo-dourado', (.7,.44,.12), .55)
blue = mat('gorgonzola', (.14,.23,.18), .85)
caramel = mat('caramelo', (.26,.065,.012), .2)
honey = mat('mel', (.65,.25,.035), .22)
crust = mat('selado', (.085,.025,.013), .85)
pink = mat('carne-ao-ponto', (.36,.095,.07), .65)
fat = mat('gordura', (.67,.47,.23), .5)
char = mat('grelha', (.025,.012,.007), .9)
farofa = mat('farofa', (.57,.37,.13), .94)
tomato = mat('tomate', (.62,.045,.018), .5)
green = mat('ervas', (.075,.23,.023), .75)
onion = mat('cebola', (.7,.68,.48), .6)
glass = mat('vidro-estilizado', (.39,.63,.68), .17)
orange = mat('suco-laranja', (.98,.34,.015), .33)
rind = mat('casca-laranja', (.81,.22,.006), .64)
lime = mat('casca-limao', (.19,.39,.014), .6)
lime_in = mat('polpa-limao', (.64,.76,.2), .43)
label_mat = mat('rotulo', (.025,.19,.23), .6)
cap_mat = mat('tampa', (.12,.3,.33), .35)

def mesh(name, verts, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    ob.parent = root
    data.materials.append(material)
    for p in data.polygons: p.use_smooth = True
    return ob

def lathe(name, profile, material, pos=(0,0,0), noise=0, segments=64):
    verts, faces = [], []
    for j,(radius,z) in enumerate(profile):
        for i in range(segments):
            a = math.tau*i/segments
            delta = noise*(.65*math.sin(a*17+j)+.35*rng.uniform(-1,1)) if radius>.001 else 0
            r = max(0,radius+delta)
            verts.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(len(profile)-1):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    ob=mesh(name,verts,faces,material); ob.location=pos
    return ob

def ellipsoid(name, pos, size, material, rough=0):
    small=max(size)<.006
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8 if small else 24, ring_count=6 if small else 12, radius=1, location=pos)
    ob=bpy.context.object; ob.name=name; ob.parent=root
    for v in ob.data.vertices:
        factor=1+rng.uniform(-rough,rough)
        v.co.x*=size[0]*factor; v.co.y*=size[1]*factor; v.co.z*=size[2]*factor
    ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth=True
    return ob

def tube(name, points, radius, material):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'
    curve.bevel_depth=radius; curve.bevel_resolution=2; curve.resolution_u=1
    spline=curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points): p.co=(*co,1)
    ob=bpy.data.objects.new(name,curve); scene.collection.objects.link(ob)
    ob.parent=root; curve.materials.append(material)
    return ob

def plate(radius):
    return lathe('Prato',[(0,0),(radius*.7,0),(radius*.96,.004),(radius,.009),
        (radius*.99,.012),(radius*.85,.01),(radius*.65,.005),(0,.005)],ceramic)

def bowl(pos, radius, filling):
    lathe('Ramequim',[(0,0),(radius*.75,0),(radius,.022),(radius-.002,.024),
        (radius-.004,.019),(radius*.7,.004),(0,.004)],ceramic,pos)
    lathe('Conteudo ramequim',[(0,.004),(radius*.7,.004),(radius-.004,.018),(0,.018)],filling,pos)

def croquettes():
    plate(.12)
    bowl((0,.066,.007),.026,cream)
    for i,(x,y) in enumerate([(-.066,.035),(.066,.035),(-.065,-.024),(0,-.025),(.065,-.024),(0,-.076)]):
        ob=ellipsoid('Bolinho '+str(i+1),(x,y,.029),(.024,.022,.024),gold,.065)
        ob.rotation_euler.z=rng.random()
        if STAGE=='finish':
            # Crumbs are aggregated at export to avoid hundreds of draw calls.
            for k in range(24):
                a=rng.random()*math.tau; b=rng.uniform(.15,1.5)
                ellipsoid('Panko',(x+.024*math.sin(b)*math.cos(a),y+.022*math.sin(b)*math.sin(a),.029+.024*math.cos(b)),(.0013,.001,.001),dough)

def pizza():
    lathe('Base pizza',[(0,0),(.136,0),(.15,.008),(.147,.017),(.13,.013),(0,.013)],dough,noise=.0008,segments=96)
    lathe('Cobertura muçarela',[(0,.012),(.13,.012),(.135,.016),(.125,.02),(0,.019)],white,noise=.001,segments=96)
    for i in range(34):
        a=rng.random()*math.tau; r=.12*math.sqrt(rng.random())
        ellipsoid('Queijo gratinado',(r*math.cos(a),r*math.sin(a),.02),(.012,.009,.002),yellow if i%3 else cream)
    for i in range(42):
        a=rng.random()*math.tau; r=.12*math.sqrt(rng.random())
        ellipsoid('Gorgonzola',(r*math.cos(a),r*math.sin(a),.022),(.002,.003,.0012),blue)
    for k in range(3):
        pts=[]
        for i in range(65):
            a=math.tau*i/64
            r=.04+k*.032+.003*math.sin(a*7)
            pts.append((r*math.cos(a),r*math.sin(a),.023))
        tube('Fio de mel',pts,.0007,honey)
    if STAGE=='finish':
        for i in range(40):
            a=rng.random()*math.tau
            ellipsoid('Tostado da borda',(.142*math.cos(a),.142*math.sin(a),.017),(.004,.003,.0007),caramel)

def steak():
    plate(.14)
    # Three sliced steaks: browned perimeter, visible pink cut and a curved fat cap.
    for k in range(3):
        x=-.065+k*.045; y=-.025+k*.008
        ellipsoid('Picanha selada '+str(k+1),(x,y,.026),(.027,.059,.017),crust,.025)
        ellipsoid('Corte ao ponto '+str(k+1),(x,y-.002,.038),(.024,.053,.0055),pink,.025)
        tube('Capa de gordura '+str(k+1),[(x+.023*math.cos(a),y+.052*math.sin(a),.04) for a in [math.pi*j/24 for j in range(25)]],.005,fat)
        for i in range(4):
            yy=y-.035+i*.021
            tube('Marca da grelha',[(x-.017,yy-.005,.043),(x,yy,.044),(x+.018,yy+.005,.042)],.0014,char)
    ellipsoid('Porcao farofa',(-.065,.069,.017),(.035,.025,.014),farofa,.1)
    for i in range(48):
        a=rng.random()*math.tau; r=.025*math.sqrt(rng.random())
        ellipsoid('Graos farofa',(-.065+r*math.cos(a),.069+r*.7*math.sin(a),.028),(.002,.002,.0015),gold if i%5==0 else cream)
    bowl((.06,.074,.007),.029,tomato)
    for i in range(32):
        a=rng.random()*math.tau; r=.021*math.sqrt(rng.random())
        ellipsoid('Vinagrete',(.06+r*math.cos(a),.074+r*math.sin(a),.027),(.003,.002,.002),[tomato,onion,green][i%3])

def pudding():
    plate(.09)
    lathe('Calda no prato',[(0,.005),(.066,.005),(.068,.006),(0,.007)],caramel,noise=.0008)
    lathe('Pudim anelar',[(.016,.007),(.048,.007),(.051,.012),(.044,.048),(.041,.052),
        (.022,.052),(.019,.049),(.015,.013),(.016,.007)],cream,segments=96)
    lathe('Caramelo sobre pudim',[(.021,.05),(.043,.05),(.044,.052),(.041,.054),(.022,.054),(.021,.05)],caramel,segments=96)
    for k in range(9):
        a=k*math.tau/9
        length=rng.uniform(.009,.027)
        tube('Escorrido caramelo',[(r*math.cos(a),r*math.sin(a),z) for r,z in [(.043,.052),(.045,.046),(.045+length*.16,.052-length)]],.0012,caramel)

def citrus(name,pos,radius,skin,pulp):
    # A full cross-section, including pith and eight radial segment boundaries.
    ob=lathe(name,[(0,0),(radius,0),(radius,.004),(0,.004)],skin,pos,segments=48)
    lathe(name+' miolo',[(0,.004),(radius*.88,.004),(radius*.88,.0045),(0,.0045)],cream,pos,segments=48)
    lathe(name+' polpa',[(0,.0045),(radius*.78,.0045),(radius*.78,.005),(0,.005)],pulp,pos,segments=48)
    for k in range(8):
        a=k*math.tau/8
        tube(name+' gomo',[(pos[0],pos[1],pos[2]+.0055),
            (pos[0]+radius*.77*math.cos(a),pos[1]+radius*.77*math.sin(a),pos[2]+.0055)],.00055,cream)
    return ob

def juice():
    lathe('Base copo',[(0,0),(.03,0),(.033,.006),(.03,.009),(0,.009)],glass)
    lathe('Suco de laranja',[(0,.008),(.029,.008),(.037,.138),(0,.138)],orange)
    lathe('Borda copo',[(.036,.137),(.039,.137),(.04,.15),(.037,.15),(.036,.137)],glass)
    for a in (-.4,2.7):
        tube('Reflexo copo',[(.031*math.cos(a),.031*math.sin(a),.01),(.038*math.cos(a),.038*math.sin(a),.146)],.001,glass)
    citrus('Laranja',(.022,0,.143),.026,rind,orange)

def water():
    lathe('Garrafa 500 ml',[(0,0),(.028,0),(.033,.008),(.033,.15),(.03,.163),
        (.016,.182),(.012,.19),(.012,.221),(0,.221)],glass,segments=64)
    lathe('Rotulo neutro',[(.0331,.065),(.0331,.118)],label_mat)
    lathe('Tampa',[(0,.219),(.014,.219),(.014,.233),(.012,.235),(0,.235)],cap_mat)
    for z in (.012,.019,.145,.151,.22,.229):
        r=.0332 if z<.16 else .0142
        tube('Friso garrafa',[(r*math.cos(a),r*math.sin(a),z) for a in [math.tau*j/64 for j in range(65)]],.00065,glass)
    # Neutral embossed bubbles, no invented brand or commercial label.
    for x,z,r in [(0,.093,.008),(-.012,.081,.003),(.012,.108,.004)]:
        ellipsoid('Bolha do rotulo',(x,-.033,z),(r,.0008,r),ceramic)
    citrus('Limao',(.052,-.015,.001),.026,lime,lime_in)

def finish_geometry():
    # Convert curves and bake exportable colour variation; join by material.
    for ob in list(scene.objects):
        if ob.parent!=root: continue
        if ob.type=='CURVE':
            bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
            bpy.context.view_layer.objects.active=ob
            bpy.ops.object.convert(target='MESH')
    if STAGE=='finish':
        for ob in list(scene.objects):
            if ob.type!='MESH': continue
            m=ob.data.materials[0]
            base=m.diffuse_color[:3]
            colors=ob.data.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='POINT')
            for v,c in zip(ob.data.vertices,colors.data):
                delta=.94+rng.uniform(-.08,.06)
                c.color=(*(min(1,k*delta) for k in base),1)
            if not any(n.type=='VERTEX_COLOR' for n in m.node_tree.nodes):
                node=m.node_tree.nodes.new('ShaderNodeVertexColor'); node.layer_name='COLOR_0'
                bsdf=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                bsdf.inputs['Base Color'].default_value=(1,1,1,1)
                m.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
    # Small decorative fragments share materials and do not need individual draw calls.
    buckets={}
    for ob in list(scene.objects):
        if ob.type=='MESH': buckets.setdefault(ob.data.materials[0].name,[]).append(ob)
    for objects in buckets.values():
        if len(objects)<2: continue
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects: ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()

def render_and_export(slug):
    finish_geometry()
    bpy.context.view_layer.update()
    verts=[ob.matrix_world @ Vector(c) for ob in scene.objects if ob.type=='MESH' for c in ob.bound_box]
    lo=Vector(tuple(min(v[i] for v in verts) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in verts) for i in range(3)))
    center=(lo+hi)/2; span=max(hi-lo)
    world=bpy.data.worlds.new(slug+' world'); world.use_nodes=True; scene.world=world
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.3,.3,.3,1); bg.inputs['Strength'].default_value=.6
    for label,loc,power in [('Key',(1.1,-1.6,2.4),25),('Fill',(-1.5,-.4,1.6),10),('Rim',(.8,1.4,2),18)]:
        data=bpy.data.lights.new(slug+label,'AREA'); data.energy=power*span*span; data.size=span*1.5
        ob=bpy.data.objects.new(label,data); scene.collection.objects.link(ob)
        ob.location=center+Vector(loc)*span
        ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(slug+' camera'); data.type='ORTHO'; data.ortho_scale=span*1.45
    cam=bpy.data.objects.new('Camera',data); scene.collection.objects.link(cam); scene.camera=cam
    scene.render.engine='CYCLES'; scene.cycles.samples=16
    scene.render.resolution_x=600; scene.render.resolution_y=600; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=True
    for angle in ((0,) if STAGE=='structure' else (0,90,180,270)):
        a=math.radians(angle-65)
        cam.location=center+Vector((math.cos(a)*span*2,math.sin(a)*span*2,span*1.8))
        cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/f'{slug}-{STAGE}-{angle}.png')
        bpy.ops.render.render(write_still=True)
    if STAGE=='finish':
        bpy.ops.object.select_all(action='DESELECT')
        for ob in scene.objects:
            if ob.parent==root or ob==root: ob.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(ROOT/'public'/'demo-models'/f'{slug}.glb'),
            export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)

builders={'bolinho-de-costela':croquettes,'pizza-quatro-queijos':pizza,'picanha-na-brasa':steak,
    'pudim-de-leite':pudding,'suco-natural':juice,'agua-com-gas':water}
for slug,build in builders.items():
    if ONLY and slug not in ONLY: continue
    rng.seed(slug)
    scene=bpy.data.scenes.new('Cardapio-'+slug)
    bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC'
    root=bpy.data.objects.new(slug,None); scene.collection.objects.link(root)
    build(); render_and_export(slug)
if STAGE=='finish': bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'catalogo-restante.blend'))
print('Completed '+STAGE)
