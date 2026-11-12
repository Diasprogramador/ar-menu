"""Shared metric mesh primitives and ingredient materials for the Brasa & Mesa kitchen."""
import bpy
import math
import random

TAU = math.tau

scene = None
root = None
rng = random.Random(26022026)
M = {}


def material(name, color, roughness=.55, coat=0.0, metallic=0.0, alpha=1.0, transmission=0.0):
    key = (name, color, roughness, coat, metallic, alpha, transmission)
    if key in M:
        return M[key]
    mat = bpy.data.materials.new("REAL-" + name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, alpha)
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    values = {
        "Base Color": (*color, 1), "Roughness": roughness, "Metallic": metallic,
        "Coat Weight": coat, "Coat Roughness": min(.55, roughness),
        "Alpha": alpha, "Transmission Weight": transmission,
    }
    for socket, value in values.items():
        if bsdf.inputs.get(socket):
            bsdf.inputs[socket].default_value = value
    if alpha < 1:
        mat.surface_render_method = "DITHERED"
        mat.use_transparency_overlap = False
    M[key] = mat
    return mat


def palette():
    return {
        "plate": material("porcelana", (.78, .79, .76), .16, .45),
        "dark_plate": material("ceramica-escura", (.045, .055, .052), .22, .35),
        "bread": material("brioche-assado", (.64, .30, .075), .52, .10),
        "crumb": material("miolo", (.88, .68, .37), .9),
        "sesame": material("gergelim", (.88, .72, .42), .66),
        "meat": material("carne-selada", (.15, .032, .012), .68, .18),
        "char": material("carbonizado", (.028, .009, .004), .92),
        "cheese": material("queijo-derretido", (.98, .43, .035), .28, .62),
        "lettuce": material("alface-romana", (.18, .47, .055), .48, .22),
        "lettuce_light": material("nervura-alface", (.48, .67, .18), .52),
        "tomato": material("tomate", (.72, .035, .015), .23, .7),
        "onion": material("cebola-roxa", (.53, .21, .32), .35, .3),
        "bacon": material("bacon", (.47, .055, .022), .48, .32),
        "fat": material("gordura", (.83, .60, .32), .47, .3),
        "dough": material("massa-assada", (.68, .37, .10), .69),
        "sauce": material("molho-tomate", (.54, .025, .008), .28, .55),
        "mozzarella": material("mucarela", (.89, .76, .46), .34, .48),
        "basil": material("manjericao", (.025, .22, .035), .4, .28),
        "pepperoni": material("pepperoni", (.48, .025, .012), .48, .35),
        "blue": material("gorgonzola", (.11, .19, .13), .68),
        "honey": material("mel", (.72, .23, .018), .17, .8),
        "fried": material("empanado", (.58, .24, .035), .8),
        "potato": material("batata-frita", (.86, .49, .085), .67, .08),
        "salt": material("sal", (.9, .9, .82), .88),
        "pink": material("carne-ao-ponto", (.43, .065, .045), .56, .24),
        "farofa": material("farofa", (.68, .43, .14), .9),
        "caramel": material("caramelo", (.29, .055, .006), .16, .78),
        "custard": material("pudim", (.91, .61, .22), .39, .48),
        "chocolate": material("chocolate", (.10, .018, .008), .52, .25),
        "icecream": material("sorvete", (.87, .79, .61), .72),
        "berry": material("frutas-vermelhas", (.62, .015, .035), .22, .7),
        "cream": material("chantilly", (.91, .86, .73), .62),
        "strawberry": material("milkshake-morango", (.82, .25, .34), .42, .24),
        "cola": material("refrigerante-cola", (.15, .042, .009), .14, .28, transmission=.32),
        "orange": material("suco-laranja", (.92, .365, .025), .37, .18),
        "rind": material("casca-laranja", (.94, .24, .006), .62),
        "lime": material("limao", (.27, .55, .035), .5, .2),
        "glass": material("vidro", (.91, .97, .95), .075, .16, alpha=.14, transmission=.86),
        "ice": material("gelo", (.81, .91, .92), .12, .28, alpha=.62, transmission=.56),
        "water": material("agua", (.80, .93, .94), .07, .12, alpha=.21, transmission=.89),
        "wood": material("madeira", (.29, .105, .028), .67),
        "rib": material("costela-glaceada", (.23, .035, .012), .28, .68),
        "bone": material("osso", (.73, .57, .34), .66),
        "paper": material("papel", (.75, .68, .55), .92),
    }


def parent(ob, mat=None):
    ob.parent = root
    if mat:
        ob.data.materials.append(mat)
    if ob.type == "MESH":
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob


def mesh(name, verts, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    return parent(ob, mat)


def lathe(name, profile, mat, pos=(0, 0, 0), segments=64, wobble=0.0, phase=0.0):
    verts, faces = [], []
    for j, (radius, z) in enumerate(profile):
        for i in range(segments):
            a = TAU * i / segments
            wave = wobble * (math.sin(a * 5 + phase) * .55 + math.sin(a * 11 + j) * .25)
            r = max(.00001, radius * (1 + wave))
            verts.append((r * math.cos(a), r * math.sin(a), z + wave * radius * .12))
    for j in range(len(profile) - 1):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    ob = mesh(name, verts, faces, mat)
    ob.location = pos
    return ob


def ellipsoid(name, pos, size, mat, irregular=0.0, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=pos)
    ob = parent(bpy.context.object, mat)
    ob.name = name
    for v in ob.data.vertices:
        x, y, z = v.co
        wave = 1 + irregular * (math.sin(x * 7 + y * 11) * .55 + rng.uniform(-.45, .45))
        v.co = (x * size[0] * wave, y * size[1] * wave, z * size[2] * wave)
    return ob


def tube(name, points, radius, mat, resolution=1):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new("NURBS" if len(points) > 3 else "POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1)
    if len(points) > 3:
        spline.order_u = min(3, len(points))
        spline.use_endpoint_u = True
    ob = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(ob)
    parent(ob)
    curve.materials.append(mat)
    return ob


def torus(name, pos, major, minor, mat, rotation=(0, 0, 0), major_segments=40, minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
        major_segments=major_segments, minor_segments=minor_segments, location=pos, rotation=rotation)
    ob = parent(bpy.context.object, mat)
    ob.name = name
    return ob


def box(name, pos, size, mat, rotation=(0, 0, 0), bevel=.0015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos, rotation=rotation)
    ob = parent(bpy.context.object, mat)
    ob.name = name
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = ob.modifiers.new("arestas naturais", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return ob


def plate(radius, dark=False):
    mat = P["dark_plate"] if dark else P["plate"]
    return lathe("Prato", [(0, 0), (radius*.48, 0), (radius*.78, .003),
        (radius*.96, .008), (radius, .013), (radius*.98, .016),
        (radius*.79, .011), (radius*.60, .006), (0, .006)], mat, segments=72)


def bowl(pos, radius, mat=None):
    fill = mat or P["sauce"]
    lathe("Ramequim", [(0, 0), (radius*.72, 0), (radius, .022),
        (radius-.002, .026), (radius-.005, .020), (radius*.68, .004), (0, .004)], P["plate"], pos)
    lathe("Conteudo", [(0, .004), (radius*.68, .004), (radius-.005, .019), (0, .019)], fill, pos)


def leaf(name, pos, length, width, mat, angle=0, lift=.008):
    verts, faces = [], []
    nx, ny = 8, 4
    for ix in range(nx + 1):
        u = ix / nx
        x = (u - .5) * length
        taper = math.sin(math.pi * u) ** .55
        for iy in range(ny + 1):
            v = iy / ny * 2 - 1
            y = v * width * .5 * taper
            z = abs(v) * lift + math.sin(u * math.pi) * lift * .25 + math.sin(u * 11 + v * 4) * .001
            verts.append((x, y, z))
    for ix in range(nx):
        for iy in range(ny):
            a = ix*(ny+1)+iy
            faces.append((a, a+ny+1, a+ny+2, a+1))
    ob = mesh(name, verts, faces, mat)
    ob.location = pos
    ob.rotation_euler.z = angle
    solid = ob.modifiers.new("espessura", "SOLIDIFY")
    solid.thickness = .00045
    return ob



P = palette()
