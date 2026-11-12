"""Render consistent local menu covers from the published GLB catalog.

Run with Blender's Python. The render is intentionally a product portrait, not
an attempt to fake food photography: it shows the same model the customer will
open in AR and removes the brittle dependency on third-party image URLs.
"""

import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(PROJECT_ROOT)
MODELS = ROOT / "public" / "demo-models"
OUT = ROOT / "public" / "demo" / "covers"
OUT.mkdir(parents=True, exist_ok=True)

PRODUCTS = {
    "bolinho-de-costela": "bolinho-de-costela",
    "aneis-de-cebola": "aneis-de-cebola",
    "batata-crocante": "batata-crocante",
    "smash-bacon": "smash-bacon",
    "burger-da-casa": "burger-da-casa",
    "smash-duplo-cheddar": "smash-duplo-cheddar",
    "pizza-margherita": "pizza-margherita",
    "pizza-pepperoni": "pizza-pepperoni",
    "pizza-quatro-queijos": "pizza-quatro-queijos",
    "costela-defumada": "costela-defumada",
    "salada-caesar": "salada-caesar",
    "picanha-na-brasa": "picanha-na-brasa",
    "brownie-com-sorvete": "brownie",
    "petit-gateau": "petit-gateau",
    "pudim-de-leite": "pudim-de-leite",
    "milkshake-de-morango": "milkshake",
    "refrigerante": "refrigerante",
    "suco-natural": "suco-natural",
    "agua-com-gas": "agua-com-gas",
}


def hex_color(value):
    value = value.lstrip("#")
    rgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    # Blender node colors are linear; convert the authored sRGB palette.
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb) + (1,)


def material(name, color, roughness=0.72):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    return mat


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def tabletop():
    stone = material("Honed limestone", hex_color("#AEA18D"), .84)
    tree = stone.node_tree
    shader = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    coord = tree.nodes.new("ShaderNodeTexCoord")
    grain = tree.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 32
    grain.inputs["Detail"].default_value = 5
    tree.links.new(coord.outputs["Object"], grain.inputs["Vector"])
    tones = tree.nodes.new("ShaderNodeValToRGB")
    for stop, color in zip(tones.color_ramp.elements, ("#9C9181", "#D0C4B2")):
        stop.color = hex_color(color)
    tree.links.new(grain.outputs["Fac"], tones.inputs["Fac"])
    tree.links.new(tones.outputs["Color"], shader.inputs["Base Color"])
    pores = tree.nodes.new("ShaderNodeTexNoise")
    pores.inputs["Scale"].default_value = 1700
    tree.links.new(coord.outputs["Object"], pores.inputs["Vector"])
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = .00016
    bump.inputs["Strength"].default_value = .20
    tree.links.new(pores.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return stone


def add_area(name, location, target, energy, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    look_at(light, target)


def mesh_points(objects):
    points = []
    for obj in objects:
        if obj.type == "MESH":
            transform = obj.matrix_world
            points.extend(transform @ vertex.co for vertex in obj.data.vertices)
    if not points:
        raise RuntimeError("GLB contains no mesh")
    return points


def fit_camera(camera, scene, slug, points, target):
    elevation = 32
    if slug.startswith("pizza") or slug in {"salada-caesar", "picanha-na-brasa", "costela-defumada"}:
        elevation = 43
    elif slug.startswith(("smash", "burger")):
        elevation = 16
    elif slug in {"milkshake-de-morango", "suco-natural", "refrigerante", "agua-com-gas"}:
        elevation = 13
    azimuth = math.radians(-62)
    tilt = math.radians(elevation)
    direction = Vector((math.cos(azimuth)*math.cos(tilt), math.sin(azimuth)*math.cos(tilt), math.sin(tilt)))
    rotation = (-direction).to_track_quat("-Z", "Y")
    right, up = (rotation @ axis for axis in (Vector((1,0,0)), Vector((0,1,0))))
    frame = camera.data.view_frame(scene=scene)
    half_width = max(abs(c.x/c.z) for c in frame) * .85
    half_height = max(abs(c.y/c.z) for c in frame) * .82
    distance = max(v.dot(direction) + max(abs(v.dot(right))/half_width, abs(v.dot(up))/half_height)
                   for v in (point-target for point in points))
    camera.location = target + direction*distance
    camera.rotation_euler = rotation.to_euler()
    camera.data.clip_start = .005


def render_cover(slug, model_name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"

    source = MODELS / f"{model_name}.glb"
    if not source.exists():
        raise FileNotFoundError(source)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = list(scene.objects)

    points = mesh_points(imported)
    low, high = (Vector(tuple(fn(p[i] for p in points) for i in range(3))) for fn in (min, max))
    offset = Vector((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))
    roots = [obj for obj in imported if obj.parent is None]
    for obj in roots:
        obj.location += offset
    bpy.context.view_layer.update()

    points = [p + offset for p in points]
    size = high - low
    span = max(size.x, size.y, size.z)

    world = bpy.data.worlds.new("Daylight bounce")
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = hex_color("#ECE9E1")
    background.inputs["Strength"].default_value = 0.34
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.0001))
    floor = bpy.context.object
    floor.name = "Limestone table"
    floor.data.materials.append(tabletop())

    target = Vector((0, 0, size.z * .47))
    # Power follows the physical footprint. The GLBs are in meters, so fixed
    # studio wattages would overexpose a 15 cm burger by several stops.
    # Rake a broad, flat glaze from the side so its wet reflection doesn't
    # occupy the centre of a pizza or obscure the smoked bark on the ribs.
    key_y = -.95 if slug.startswith("pizza-") or slug == "costela-defumada" else .45
    add_area("Window", Vector((-span*1.65, span*key_y, span*1.85)), target,
             102*span*span, span*1.55, (1.0,.94,.84))
    add_area("Front bounce", Vector((span*.5, -span*1.8, span*1.4)), target,
             27*span*span, span*2.3, (.91,.95,1.0))

    camera_data = bpy.data.cameras.new("Menu cover camera")
    camera_data.lens = 58
    camera = bpy.data.objects.new("Menu cover camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.resolution_x = 900
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    fit_camera(camera, scene, slug, points, target)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    formats = {item.identifier for item in bpy.types.ImageFormatSettings.bl_rna.properties["file_format"].enum_items}
    scene.render.image_settings.file_format = "JPEG" if "JPEG" in formats else next(iter(formats))
    if scene.render.image_settings.file_format == "JPEG":
        scene.render.image_settings.quality = 90
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = str(OUT / f"{slug}.jpg")
    bpy.ops.render.render(write_still=True)
    print("COVER_DONE", slug)


selection = set(globals().get("ONLY", []))
if selection.difference(PRODUCTS.values()):
    raise ValueError(f"Unknown model: {selection.difference(PRODUCTS.values())}")
jobs = [(slug, glb) for slug, glb in PRODUCTS.items() if not selection or glb in selection]
for product_slug, glb_name in jobs:
    render_cover(product_slug, glb_name)

print("Rendered", len(jobs), "menu covers to", OUT)
