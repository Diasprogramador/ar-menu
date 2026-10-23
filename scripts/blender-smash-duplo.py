"""Modelo procedural gratuito; executar no Blender, inclusive por MCP."""
import bpy
import math
import random
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(PROJECT_ROOT)
STAGE = globals().get('PASS', 'structure')
rng = random.Random(20261020)
name = 'Cardapio-Smash-Duplo'
scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
bpy.context.window.scene = scene
for ob in list(scene.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
root = bpy.data.objects.new('Smash Duplo Cheddar', None)
scene.collection.objects.link(root)

def material(label, color, rough):
    mat = bpy.data.materials.get(label) or bpy.data.materials.new(label)
    mat.use_nodes = True
    for node in list(mat.node_tree.nodes):
        if node.type == 'VERTEX_COLOR':
            mat.node_tree.nodes.remove(node)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    mat.diffuse_color = (*color, 1)
    return mat

bread = material('SM-Brioche', (.48, .19, .045), .36)
crumb = material('SM-Miolo', (.75, .48, .19), .66)
meat = material('SM-Carne', (.065, .024, .012), .82)
cheese = material('SM-Cheddar', (.95, .38, .025), .35)
sauce = material('SM-Molho', (.78, .53, .26), .42)
char = material('SM-Crosta', (.022, .009, .004), .9)

def mesh(label, verts, faces, mat):
    data = bpy.data.meshes.new(label)
    data.from_pydata(verts, [], faces)
    data.update()
    ob = bpy.data.objects.new(label, data)
    scene.collection.objects.link(ob)
    ob.parent = root
    data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = True
    return ob

def lathe(label, profile, mat, irregular=0):
    verts, faces = [], []
    n = 96
    phase = rng.random() * 6
    for j, (radius, z) in enumerate(profile):
        for i in range(n):
            a = i * math.tau / n
            noise = irregular * (math.sin(a*13+phase)*.5 + math.sin(a*29+j*2)*.25 + rng.uniform(-.25,.25))
            r = max(0.00001, radius + noise)
            verts.append((r*math.cos(a), r*math.sin(a), z + noise*.28))
    for j in range(len(profile)-1):
        for i in range(n):
            a=j*n+i; b=j*n+(i+1)%n
            faces.append((a,b,b+n,a+n))
    return mesh(label, verts, faces, mat)

# Profiles follow the outside surface bottom-to-top. Dimensions are in metres.
lathe('Brioche base', [(0,0),(.048,0),(.058,.003),(.062,.009),(.061,.016),(.055,.02),(0,.02)], bread, .0005)
lathe('Miolo inferior', [(0,.02),(.056,.02),(.058,.022),(0,.022)], crumb)

for layer in range(4):
    z=.023+layer*.018
    patty_profile=[(0,z),(.05,z)]
    patty_profile += [(.061+.002*math.sin(k/10*math.pi),z+.001+k*.0011) for k in range(11)]
    patty_profile += [(.056,z+.013),(0,z+.013)]
    lathe(f'Carne {layer+1}', patty_profile, meat, .0017)
    verts, faces = [], []
    n=24
    angle=.25+layer*.68
    for j in range(n+1):
        for i in range(n+1):
            x=(i/n*2-1)*.056
            y=(j/n*2-1)*.056
            r=math.hypot(x,y)
            drop=max(0,r-.049)*.65
            zz=z+.014-drop+.0005*math.sin(x*100+y*70+layer)
            verts.append((x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle),zz))
    for j in range(n):
        for i in range(n):
            a=j*(n+1)+i
            faces.append((a,a+1,a+n+2,a+n+1))
    ob=mesh(f'Cheddar {layer+1}', verts, faces, cheese)
    solid=ob.modifiers.new('Espessura da fatia', 'SOLIDIFY')
    solid.thickness=.0011
    bevel=ob.modifiers.new('Borda macia', 'BEVEL')
    bevel.width=.0007
    bevel.segments=2

top=.023+3*.018+.015
lathe('Molho sob brioche', [(0,top),(.05,top),(.057,top+.001),(.055,top+.003),(0,top+.003)], sauce, .0008)
profile=[(0,top+.003),(.052,top+.003),(.061,top+.005)]
for k in range(25):
    t=k/24*math.pi/2
    profile.append((.062*math.cos(t),top+.008+.032*math.sin(t)))
lathe('Coroa brioche', profile, bread, .00035)

if STAGE == 'finish':
    # Vertex colours survive GLB without procedural shader baking.
    for ob in list(scene.objects):
        if ob.type!='MESH': continue
        mat=ob.data.materials[0]
        base=mat.diffuse_color[:3]
        colors=ob.data.color_attributes.new(name='COLOR_0', type='FLOAT_COLOR', domain='POINT')
        for v,c in zip(ob.data.vertices, colors.data):
            x,y,z=v.co
            variation=.92+.08*math.sin(x*420+y*370+z*550)+rng.uniform(-.06,.06)
            if 'brioche' in ob.name.lower():
                variation*=1-.22*max(0,(z-top)/.04)
            c.color=(*(min(1,max(0,k*variation)) for k in base),1)
        node=mat.node_tree.nodes.new('ShaderNodeVertexColor')
        node.layer_name='COLOR_0'
        bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        # Exporter reads COLOR_0; leave base material white to avoid double tint.
        bsdf.inputs['Base Color'].default_value=(1,1,1,1)
        mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])

    # Small irregular seared fragments belong to each patty's rim.
    for layer in range(4):
        for i in range(44):
            a=rng.random()*math.tau
            r=.062+rng.uniform(-.001,.001)
            z=.028+layer*.018+rng.uniform(-.001,.004)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(r*math.cos(a),r*math.sin(a),z))
            ob=bpy.context.object
            ob.name=f'Crosta {layer+1}-{i+1}'
            ob.scale=(.0015,.0012,.001)
            ob.parent=root
            ob.data.materials.append(char)

# Separate studio equipment is never exported as part of the food.
world=bpy.data.worlds.get('SM-Studio') or bpy.data.worlds.new('SM-Studio')
scene.world=world
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.12,.12,.12,1)
bg.inputs['Strength'].default_value=.5
for label,loc,power,size in [('Key',(.18,-.22,.3),1.5,.22),('Fill',(-.2,-.08,.16),.5,.18),('Rim',(.1,.2,.25),1,.16)]:
    data=bpy.data.lights.new('SM-'+label,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    ob=bpy.data.objects.new('SM-'+label,data); scene.collection.objects.link(ob); ob.location=loc
    ob.rotation_euler=(Vector((0,0,.065))-ob.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('SM-Camera')
cam=bpy.data.objects.new('SM-Camera',data); scene.collection.objects.link(cam); scene.camera=cam
data.type='ORTHO'; data.ortho_scale=.205
scene.render.resolution_x=800; scene.render.resolution_y=800; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=True
try: scene.render.engine='CYCLES'
except TypeError: pass
scene.cycles.samples=24
out=ROOT/'artifacts'/'blender-smash-duplo'; out.mkdir(parents=True,exist_ok=True)
for angle in (() if globals().get('SKIP_RENDERS', False) else (0,90,180,270)):
    a=math.radians(angle-65)
    cam.location=(.3*math.cos(a),.3*math.sin(a),.175)
    cam.rotation_euler=(Vector((0,0,.065))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'{STAGE}-{angle}.png')
    bpy.ops.render.render(write_still=True)

if STAGE=='finish':
    bpy.ops.object.select_all(action='DESELECT')
    for ob in scene.objects:
        if ob.parent==root or ob==root: ob.select_set(True)
    dest=ROOT/'public'/'demo-models'/'smash-duplo-cheddar.glb'
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'smash-duplo-cheddar.blend'))
print(json.dumps({'pass':STAGE,'renders':str(out),'objects':len(scene.objects)}))
