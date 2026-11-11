"""Rebuild the complete demo catalog as detailed, real-time Blender models.

Run with Blender's Python. The generated GLBs remain procedural, compact and
dimensionally correct, but use organic silhouettes, ingredient-specific PBR
materials and deliberate food details instead of icon-like primitives.
"""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(PROJECT_ROOT)
ONLY = set(globals().get("ONLY", []))
RENDER = globals().get("RENDER", True)
OUT = ROOT / "artifacts" / "blender-realistic"
OUT.mkdir(parents=True, exist_ok=True)
# Import the kitchen from the workspace even when Blender starts with its own Python path.
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "scripts"))
import kitchen_geometry as kitchen
from kitchen_geometry import P, rng
from kitchen_burgers import burger
from kitchen_pizzas import pizza
from kitchen_mains import ribs, salad, steak
from kitchen_sweets import brownie, glass_drink, pudding, water_bottle
from kitchen_starters import croquettes, fries, onion_rings


BUILDERS = {
    "bolinho-de-costela": croquettes, "aneis-de-cebola": onion_rings, "batata-crocante": fries,
    "smash-bacon": lambda: burger("smash-bacon", ["patty","cheese","bacon","patty","cheese"]),
    "burger-da-casa": lambda: burger("burger-da-casa", ["patty","cheese","lettuce","tomato","onion"]),
    "smash-duplo-cheddar": lambda: burger("smash-duplo-cheddar", ["patty","cheese","patty","cheese","patty","cheese","patty"]),
    "pizza-margherita": lambda: pizza("pizza-margherita","margherita"),
    "pizza-pepperoni": lambda: pizza("pizza-pepperoni","pepperoni"),
    "pizza-quatro-queijos": lambda: pizza("pizza-quatro-queijos","four-cheese"),
    "costela-defumada": ribs, "salada-caesar": salad, "picanha-na-brasa": steak,
    "brownie": lambda: brownie(False), "petit-gateau": lambda: brownie(True), "pudim-de-leite": pudding,
    "milkshake": lambda: glass_drink("milkshake"), "refrigerante": lambda: glass_drink("cola"),
    "suco-natural": lambda: glass_drink("juice"), "agua-com-gas": water_bottle,
}


def add_color_variation():
    for ob in list(scene.objects):
        if ob.parent != root or ob.type != "MESH" or not ob.data.materials:
            continue
        mat = ob.data.materials[0]
        # UVs por face, em metros. O mesmo poro mantém a escala no topo e na lateral.
        uv = ob.data.uv_layers.active or ob.data.uv_layers.new(name="Ingredient")
        bun = mat == P["bread"] and ob.name.startswith("Pao")
        if bun:
            low = min(v.co.z for v in ob.data.vertices)
            span = max(v.co.z for v in ob.data.vertices) - low
        normal_matrix = ob.matrix_world.to_3x3().inverted_safe().transposed()
        for face in (() if ob.get("authored_uv") else ob.data.polygons):
            normal = normal_matrix @ face.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            for loop in face.loop_indices:
                pos = ob.matrix_world @ ob.data.vertices[ob.data.loops[loop].vertex_index].co
                a, b = ((pos.y, pos.z), (pos.x, pos.z), (pos.x, pos.y))[axis]
                if bun:
                    # Continuous mapping around the dome, including its steep lip.
                    flare = 1.4 - .55*(pos.z-low)/span
                    a, b = pos.x*flare, pos.y*flare
                uv.data[loop].uv = (a/.055, b/.055)
        base = mat.diffuse_color[:3]
        attr = ob.data.color_attributes.get("COLOR_0") or ob.data.color_attributes.new(name="COLOR_0",type="FLOAT_COLOR",domain="POINT")
        local = random.Random(ob.name + str(len(ob.data.vertices)))
        for v,c in zip(ob.data.vertices,attr.data):
            wave = .94 + .045*math.sin(v.co.x*340+v.co.y*270+v.co.z*410) + local.uniform(-.025,.025)
            c.color = (*(max(0,min(1,k*wave)) for k in base),1)
        if not any(n.type == "VERTEX_COLOR" for n in mat.node_tree.nodes):
            node = mat.node_tree.nodes.new("ShaderNodeVertexColor"); node.layer_name="COLOR_0"
            bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            bsdf.inputs["Base Color"].default_value=(1,1,1,1)
            mat.node_tree.links.new(node.outputs["Color"],bsdf.inputs["Base Color"])


def finalize_curves_and_join():
    # Bake thickness and bevels before joining. Join alone drops modifiers on
    # non-active ingredients (notably folded cheese, leaves and cut fries).
    bpy.ops.object.select_all(action="DESELECT")
    pending = [ob for ob in scene.objects if ob.parent == root and
               (ob.type == "CURVE" or (ob.type == "MESH" and ob.modifiers))]
    if pending:
        for ob in pending:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = pending[0]
        bpy.ops.object.convert(target="MESH")
    bpy.context.view_layer.update()
    add_color_variation()
    buckets={}
    for ob in list(scene.objects):
        if ob.parent==root and ob.type=="MESH" and ob.data.materials:
            buckets.setdefault(ob.data.materials[0].name,[]).append(ob)
    for obs in buckets.values():
        if len(obs)<2: continue
        bpy.ops.object.select_all(action="DESELECT")
        for ob in obs: ob.select_set(True)
        bpy.context.view_layer.objects.active=obs[0]
        bpy.ops.object.join()


def render_and_export(slug):
    finalize_curves_and_join()
    bpy.context.view_layer.update()
    bounds=[ob.matrix_world@Vector(c) for ob in scene.objects if ob.type=="MESH" for c in ob.bound_box]
    lo=Vector(tuple(min(v[i] for v in bounds) for i in range(3))); hi=Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    center=(lo+hi)/2; span=max(hi-lo)
    if RENDER:
        world=bpy.data.worlds.new(slug+"-studio"); world.use_nodes=True; scene.world=world
        bg=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
        bg.inputs["Color"].default_value=(.035,.028,.022,1); bg.inputs["Strength"].default_value=.22
        for label,loc,power,size in [("Key",(1.2,-1.5,2.2),46,1.15),("Fill",(-1.4,-.5,1.2),18,1.4),("Rim",(.8,1.5,1.8),32,.9)]:
            data=bpy.data.lights.new(slug+label,"AREA"); data.energy=power*span*span; data.size=size*span
            ob=bpy.data.objects.new(label,data); scene.collection.objects.link(ob); ob.location=center+Vector(loc)*span
            ob.rotation_euler=(center-ob.location).to_track_quat("-Z","Y").to_euler()
        data=bpy.data.cameras.new(slug+"-camera"); data.lens=58
        cam=bpy.data.objects.new("Camera",data); scene.collection.objects.link(cam); scene.camera=cam
        scene.render.engine="BLENDER_EEVEE"; scene.render.resolution_x=700; scene.render.resolution_y=700; scene.render.resolution_percentage=100
        scene.render.image_settings.file_format="PNG"; scene.render.film_transparent=True
        scene.render.image_settings.color_mode="RGBA"; scene.view_settings.look="AgX - Medium High Contrast"
        for angle in (0,90,180,270):
            a=math.radians(angle-65); cam.location=center+Vector((math.cos(a)*span*1.65,math.sin(a)*span*1.65,span*1.22))
            cam.rotation_euler=(center-cam.location).to_track_quat("-Z","Y").to_euler()
            scene.render.filepath=str(OUT/f"{slug}-{angle}.png"); bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in scene.objects:
        if ob.parent==root or ob==root: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f"{slug}.glb"),export_format="GLB",use_selection=True,use_active_scene=True,export_apply=True,export_attributes=True)


for slug,builder in BUILDERS.items():
    if ONLY and slug not in ONLY: continue
    rng.seed(slug)
    scene=bpy.data.scenes.new("Realistic-"+slug); bpy.context.window.scene=scene
    scene.unit_settings.system="METRIC"; scene.unit_settings.scale_length=1
    root=bpy.data.objects.new(slug,None); scene.collection.objects.link(root)
    kitchen.scene, kitchen.root = scene, root
    builder(); render_and_export(slug)
    print("REALISTIC_DONE",slug)

print("Completed realistic catalog")
