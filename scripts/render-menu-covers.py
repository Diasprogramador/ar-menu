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


def imported_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
    if not points:
        raise RuntimeError("GLB contains no mesh")
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return low, high


def render_cover(slug, model_name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"

    source = MODELS / f"{model_name}.glb"
    if not source.exists():
        raise FileNotFoundError(source)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = list(scene.objects)

    low, high = imported_bounds(imported)
    offset = Vector((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))
    roots = [obj for obj in imported if obj.parent is None]
    for obj in roots:
        obj.location += offset
    bpy.context.view_layer.update()

    low, high = imported_bounds(imported)
    center = (low + high) / 2
    size = high - low
    radius = max((point - center).length for obj in imported if obj.type == "MESH" for point in [obj.matrix_world @ Vector(corner) for corner in obj.bound_box])
    span = max(size.x, size.y, size.z)

    world = bpy.data.worlds.new("Charcoal studio")
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = hex_color("#18110E")
    background.inputs["Strength"].default_value = 0.32
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=max(span * 12, 2), location=(0, 0, -span * 0.015))
    floor = bpy.context.object
    floor.name = "Warm slate"
    floor.data.materials.append(material("Warm slate", hex_color("#2A1D18"), 0.82))

    target = Vector((0, 0, max(size.z * 0.42, center.z * 0.86)))
    # Power follows the physical footprint. The GLBs are in meters, so fixed
    # studio wattages would overexpose a 15 cm burger by several stops.
    add_area("Softbox", Vector((-span * 1.5, -span * 1.7, span * 2.4)), target, 55 * span * span, span * 1.8, (1.0, 0.76, 0.55))
    add_area("Fill", Vector((span * 1.7, -span * 0.6, span * 1.3)), target, 22 * span * span, span * 2.1, (0.65, 0.76, 1.0))
    add_area("Ember rim", Vector((span * 0.7, span * 1.5, span * 1.5)), target, 36 * span * span, span * 1.2, (1.0, 0.18, 0.055))

    camera_data = bpy.data.cameras.new("Menu cover camera")
    camera_data.lens = 58
    camera = bpy.data.objects.new("Menu cover camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    direction = Vector((1.15, -1.55, 0.92)).normalized()
    distance = radius / max(math.sin(camera_data.angle_y / 2), 0.1) * 1.28
    camera.location = target + direction * distance
    look_at(camera, target)

    scene.render.resolution_x = 900
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
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


for product_slug, glb_name in PRODUCTS.items():
    render_cover(product_slug, glb_name)

print("Rendered", len(PRODUCTS), "menu covers to", OUT)
