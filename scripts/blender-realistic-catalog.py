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
        "bread": material("brioche-assado", (.64, .30, .075), .44, .25),
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
        "cola": material("refrigerante-cola", (.095, .016, .006), .18, .55, alpha=.9),
        "orange": material("suco-laranja", (.95, .25, .008), .32, .42),
        "rind": material("casca-laranja", (.94, .24, .006), .62),
        "lime": material("limao", (.27, .55, .035), .5, .2),
        "glass": material("vidro", (.62, .82, .86), .09, .9, alpha=.25, transmission=.3),
        "ice": material("gelo", (.65, .84, .9), .14, .8, alpha=.48, transmission=.2),
        "water": material("agua", (.32, .61, .68), .13, .72, alpha=.28, transmission=.15),
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


def sesame_on_bun(radius, z, height, count=26):
    for i in range(count):
        a = i * 2.399 + .3
        rr = radius * math.sqrt((i + 1) / (count + 2)) * .82
        dome = math.sqrt(max(0, 1 - (rr / radius) ** 2))
        ob = ellipsoid("Gergelim", (rr*math.cos(a), rr*math.sin(a), z + dome*height + .0008),
            (.0022, .0011, .00065), P["sesame"], segments=8, rings=5)
        ob.rotation_euler.z = a


def melted_cheese_sheet(name, radius, z, angle):
    n=8; side=radius*1.78; verts=[]; faces=[]
    for iy in range(n+1):
        for ix in range(n+1):
            x=(ix/n-.5)*side; y=(iy/n-.5)*side
            edge=max(abs(x),abs(y))/(side*.5)
            corner=min(1, math.hypot(x,y)/(side*.60))
            droop=max(0,edge-.58)**1.6*.012 + max(0,corner-.82)**1.5*.010
            ripple=math.sin(x*90+iy)*.0006+math.sin(y*75+ix)*.00045
            verts.append((x,y,z-droop+ripple))
    for iy in range(n):
        for ix in range(n):
            a=iy*(n+1)+ix; faces.append((a,a+1,a+n+2,a+n+1))
    ob=mesh(name,verts,faces,P["cheese"]); ob.rotation_euler.z=angle
    sol=ob.modifiers.new("espessura", "SOLIDIFY"); sol.thickness=.0014
    bev=ob.modifiers.new("borda derretida", "BEVEL"); bev.width=.0007; bev.segments=2
    return ob


def burger(slug, layers):
    r = .061 if slug != "smash-duplo-cheddar" else .064
    lathe("Pao inferior", [(0, 0), (r*.72, 0), (r*.98, .006), (r, .017),
        (r*.94, .023), (0, .023)], P["bread"], wobble=.018)
    lathe("Miolo inferior", [(0, .0215), (r*.93, .0215), (r*.91, .024), (0, .024)], P["crumb"])
    z = .024
    for idx, layer in enumerate(layers):
        if layer == "patty":
            h = .013 if "smash" in slug else .019
            lathe("Carne", [(0, z), (r*.78, z), (r*1.01, z+.001), (r*1.045, z+h*.16),
                (r*1.00, z+h*.82), (r*.86, z+h), (0, z+h)], P["meat"], wobble=.055, phase=idx)
            for k in range(18):
                a = TAU*k/18 + idx*.27
                ellipsoid("Crosta", (r*1.015*math.cos(a), r*1.015*math.sin(a), z+h*.45),
                    (.0022, .0012, .0009), P["char"], irregular=.2, segments=8, rings=5)
            z += h*.88
        elif layer == "cheese":
            melted_cheese_sheet("Cheddar derretido",r,z,idx*.48)
            z += .004
        elif layer == "bacon":
            for k in range(3):
                pts=[]
                for j in range(8):
                    x=-r*.88+j*r*.25
                    pts.append((x, (k-1)*.018, z+.002+math.sin(j*1.7+k)*.002))
                tube("Bacon", pts, .0052, P["bacon"])
                tube("Gordura bacon", [(x,y-.001,zv+.001) for x,y,zv in pts], .0014, P["fat"])
            z += .009
        elif layer == "lettuce":
            for k in range(7):
                a=TAU*k/7
                leaf("Alface", (r*.52*math.cos(a),r*.52*math.sin(a),z), r*1.05,.036,P["lettuce"],a, .005)
            z += .009
        elif layer == "tomato":
            for k in range(2):
                ellipsoid("Tomate", ((k-.5)*.026,0,z+.003),(.036,.031,.0045),P["tomato"],.025)
            z += .009
        elif layer == "onion":
            for k in range(3):
                torus("Cebola", ((k-1)*.019,0,z+.002), .019, .0025, P["onion"], major_segments=32)
            z += .006
    lathe("Molho", [(0,z),(r*.78,z),(r*.92,z+.002),(r*.82,z+.005),(0,z+.005)], P["sauce"], wobble=.04)
    z += .004
    top_h = r*.58
    profile=[(0,z),(r*.78,z),(r,z+.006),(r*.98,z+.014)]
    for k in range(1,13):
        t=k/12*math.pi/2
        profile.append((r*math.cos(t),z+.014+top_h*math.sin(t)))
    lathe("Pao superior", profile, P["bread"], wobble=.016)
    sesame_on_bun(r, z+.014, top_h, 30)


def pizza(slug, topping):
    r=.15
    lathe("Massa", [(0,0),(r*.90,0),(r*.98,.006),(r,.013),(r*.96,.022),(r*.87,.018),(0,.012)],
        P["dough"], segments=80, wobble=.015)
    lathe("Molho", [(0,.012),(r*.86,.012),(r*.89,.015),(r*.82,.018),(0,.018)], P["sauce"], segments=72, wobble=.01)
    if topping != "margherita":
        lathe("Mucarela", [(0,.016),(r*.84,.016),(r*.87,.020),(r*.76,.024),(0,.022)],
            P["mozzarella"], segments=72, wobble=.018)
    for i in range(26):
        a=rng.random()*TAU; rr=r*.81*math.sqrt(rng.random())
        if topping=="margherita" and i<9:
            ellipsoid("Mucarela de bufala",(rr*math.cos(a),rr*math.sin(a),.024),(.021,.017,.0045),P["mozzarella"],.08)
        elif topping=="pepperoni" and i<20:
            ellipsoid("Pepperoni",(rr*math.cos(a),rr*math.sin(a),.026),(.017,.016,.0028),P["pepperoni"],.045)
            for k in range(3):
                aa=rng.random()*TAU; rad=rng.random()*.009
                ellipsoid("Gordura pepperoni",(rr*math.cos(a)+rad*math.cos(aa),rr*math.sin(a)+rad*math.sin(aa),.029),
                    (.0015,.0012,.0005),P["fat"],segments=8,rings=5)
        elif topping=="four-cheese":
            mat=[P["mozzarella"],P["cheese"],P["blue"]][i%3]
            ellipsoid("Queijo gratinado",(rr*math.cos(a),rr*math.sin(a),.025),(.012,.009,.0026),mat,.08)
    if topping=="margherita":
        for i in range(9):
            a=i*2.399; rr=.025+(i%3)*.027
            leaf("Manjericao",(rr*math.cos(a),rr*math.sin(a),.030),.036,.018,P["basil"],a,.003)
    if topping=="four-cheese":
        for k in range(3):
            pts=[]
            turns=1.15+k*.20
            for i in range(42):
                t=i/41; a=t*TAU*turns+k*2.0
                rr=.018+t*(.088-k*.008)+.006*math.sin(t*TAU*3+k)
                pts.append((rr*math.cos(a),rr*math.sin(a),.030))
            tube("Fio de mel",pts,.00085,P["honey"])
        for i in range(18):
            a=rng.random()*TAU; rr=r*.78*math.sqrt(rng.random())
            ellipsoid("Gratinado",(rr*math.cos(a),rr*math.sin(a),.029),(.004,.003,.001),
                P["bread"] if i%4 else P["char"],.12,8,5)
    for i in range(24):
        a=TAU*i/24+rng.uniform(-.05,.05)
        ellipsoid("Bolha tostada",(r*.965*math.cos(a),r*.965*math.sin(a),.020+rng.random()*.004),
            (.0035,.0022,.0007),P["char"] if i%4==0 else P["bread"],segments=8,rings=5)


def croquettes():
    plate(.12); bowl((.065,.060,.007),.027,P["cream"])
    for i,(x,y) in enumerate([(-.063,.035),(0,.050),(.057,.025),(-.058,-.033),(0,-.030),(.058,-.040)]):
        ellipsoid("Bolinho",(x,y,.031),(.026,.023,.025),P["fried"],.095)
        for k in range(16):
            a=rng.random()*TAU; b=rng.uniform(.25,2.7)
            ellipsoid("Panko",(x+.025*math.sin(b)*math.cos(a),y+.022*math.sin(b)*math.sin(a),.031+.024*math.cos(b)),
                (.0015,.0010,.0008),P["dough"],segments=8,rings=5)


def onion_rings():
    plate(.115)
    for i in range(7):
        a=i*2.399; rr=.012*(i%3); z=.017+i*.007
        ob=torus("Anel de cebola",(rr*math.cos(a),rr*math.sin(a),z),.037+rng.uniform(-.004,.004),.010,P["fried"],
            rotation=(rng.uniform(-.28,.28),rng.uniform(-.22,.22),a),major_segments=40,minor_segments=10)
        for v in ob.data.vertices:
            v.co *= 1+rng.uniform(-.035,.035)
    for i in range(42):
        a=rng.random()*TAU; rr=.075*math.sqrt(rng.random())
        ellipsoid("Migalha",(rr*math.cos(a),rr*math.sin(a),.015),(.0015,.0012,.0008),P["dough"],segments=8,rings=5)


def fries():
    plate(.12)
    for i in range(30):
        a=rng.random()*TAU; rr=.075*math.sqrt(rng.random()); length=rng.uniform(.055,.085)
        ob=box("Batata rustica",(rr*math.cos(a),rr*math.sin(a),.018+rng.random()*.025),
            (rng.uniform(.009,.014),length,rng.uniform(.008,.012)),P["potato"],
            (rng.uniform(-.5,.5),rng.uniform(-.35,.35),a),.002)
    for i in range(22):
        a=rng.random()*TAU; rr=.08*math.sqrt(rng.random())
        tube("Alecrim",[(rr*math.cos(a),rr*math.sin(a),.050),(rr*math.cos(a)+.011,rr*math.sin(a)+.003,.054)],.0006,P["basil"])


def steak():
    plate(.14)
    for k in range(3):
        x=-.058+k*.055; y=-.020+k*.006
        ellipsoid("Picanha selada",(x,y,.028),(.034,.062,.018),P["meat"],.055)
        ellipsoid("Corte rosado",(x,y-.004,.042),(.030,.056,.006),P["pink"],.04)
        tube("Capa de gordura",[(x+.030*math.cos(a),y+.054*math.sin(a),.044) for a in [math.pi*j/28 for j in range(29)]],.0048,P["fat"])
        for i in range(5):
            yy=y-.038+i*.018
            tube("Fibra da carne",[(x-.020,yy,.048),(x,yy+.002,.049),(x+.019,yy,.048)],.00045,P["meat"])
        for i in range(4):
            yy=y-.038+i*.023
            tube("Marca de grelha",[(x-.021,yy-.006,.050),(x,yy,.051),(x+.022,yy+.006,.049)],.00115,P["char"])
    ellipsoid("Farofa",(-.067,.073,.020),(.037,.027,.017),P["farofa"],.12)
    bowl((.062,.073,.007),.029,P["tomato"])
    for i in range(36):
        a=rng.random()*TAU; rr=.021*math.sqrt(rng.random())
        ellipsoid("Vinagrete",(.062+rr*math.cos(a),.073+rr*math.sin(a),.028),(.003,.0025,.002),
            [P["tomato"],P["onion"],P["basil"]][i%3],segments=8,rings=5)


def ribs():
    box("Tabua",(0,0,.009),(.255,.18,.018),P["wood"],bevel=.006)
    for i in range(5):
        y=-.060+i*.030
        pts=[(-.085,y,.027),(-.045,y+rng.uniform(-.004,.004),.034),(0,y,.038),(.045,y-.003,.034),(.085,y,.025)]
        tube("Costela",pts,.014,P["rib"],2)
        tube("Osso exposto",[(-.098,y,.025),(-.078,y,.029)],.007,P["bone"])
        for k in range(4):
            x=-.055+k*.034
            tube("Marca defumada",[(x,y-.010,.041),(x+.008,y+.010,.043)],.0018,P["char"])


def salad():
    plate(.106,True)
    for i in range(20):
        a=i*2.399; rr=.013*(i%6); z=.018+(i%4)*.009
        leaf("Alface romana",(rr*math.cos(a),rr*math.sin(a),z),rng.uniform(.052,.078),rng.uniform(.025,.038),
            P["lettuce"] if i%3 else P["lettuce_light"],a+rng.uniform(-.5,.5),.010)
    for i in range(9):
        a=i*2.1; rr=.055*math.sqrt((i+1)/10)
        box("Crouton",(rr*math.cos(a),rr*math.sin(a),.055+rng.random()*.012),(.014,.014,.012),P["dough"],(a,a*.4,a*.2),.002)
    for i in range(11):
        a=i*2.4; rr=.066*math.sqrt((i+1)/12)
        leaf("Lasca de parmesao",(rr*math.cos(a),rr*math.sin(a),.061),.028,.012,P["mozzarella"],a,.003)


def pudding():
    plate(.09)
    lathe("Calda no prato",[(0,.006),(.067,.006),(.070,.007),(0,.008)],P["caramel"],wobble=.03)
    lathe("Pudim",[(.017,.008),(.046,.008),(.052,.014),(.047,.047),(.041,.055),(.023,.055),(.018,.050),(.014,.014),(.017,.008)],P["custard"],segments=80,wobble=.01)
    lathe("Caramelo",[(.020,.051),(.044,.051),(.047,.054),(.041,.057),(.022,.057),(.020,.051)],P["caramel"],segments=72,wobble=.02)
    for k in range(11):
        a=k*TAU/11
        tube("Escorrido de caramelo",[(.044*math.cos(a),.044*math.sin(a),.052),(.047*math.cos(a),.047*math.sin(a),rng.uniform(.020,.044))],.0012,P["caramel"])


def brownie(petit=False):
    plate(.085 if not petit else .075)
    if petit:
        lathe("Petit gateau",[(0,.009),(.029,.009),(.032,.017),(.031,.043),(.027,.052),(0,.050)],P["chocolate"],wobble=.035)
        lathe("Recheio liquido",[(0,.049),(.017,.049),(.020,.052),(0,.054)],P["caramel"])
        ice_pos=(.038,.006,.030)
    else:
        box("Brownie",(-.018,-.005,.031),(.073,.062,.043),P["chocolate"],(0,0,.08),.004)
        for i in range(14):
            x=-.049+rng.random()*.064; y=-.030+rng.random()*.050
            tube("Fissura",[(x,y,.054),(x+rng.uniform(.004,.012),y+rng.uniform(-.006,.006),.055)],.0007,P["char"])
        ice_pos=(.045,.014,.037)
    ellipsoid("Sorvete",ice_pos,(.026,.026,.025),P["icecream"],.12,32,16)
    tube("Calda chocolate",[(ice_pos[0]-.018,ice_pos[1],ice_pos[2]+.010),(ice_pos[0],ice_pos[1],ice_pos[2]+.025),(ice_pos[0]+.018,ice_pos[1],ice_pos[2]+.008)],.0018,P["caramel"])
    if petit:
        for i in range(7):
            a=i*2.399
            ellipsoid("Fruta vermelha",(.045+.030*math.cos(a),.005+.020*math.sin(a),.019),(.006,.005,.005),P["berry"],.07,12,7)


def citrus(name,pos,radius,skin,pulp):
    lathe(name,[(0,0),(radius,0),(radius,.004),(0,.004)],skin,pos,segments=40)
    lathe(name+" polpa",[(0,.004),(radius*.84,.004),(radius*.84,.005),(0,.005)],pulp,pos,segments=40)
    for k in range(8):
        a=k*TAU/8
        tube(name+" gomo",[(pos[0],pos[1],pos[2]+.0055),(pos[0]+radius*.82*math.cos(a),pos[1]+radius*.82*math.sin(a),pos[2]+.0055)],.00045,P["cream"])


def glass_drink(kind):
    if kind=="milkshake":
        liquid=P["strawberry"]; h=.145
    elif kind=="cola": liquid=P["cola"]; h=.14
    else: liquid=P["orange"]; h=.15
    lathe("Copo de vidro",[(0,0),(.029,0),(.033,.007),(.038,h),(.040,h+.004),(.038,h+.008),(.036,h+.008),(.030,.009),(0,.009)],P["glass"],segments=64)
    lathe("Bebida",[(0,.009),(.029,.009),(.036,h-.012),(0,h-.012)],liquid,segments=56)
    if kind=="milkshake":
        pts=[]
        for i in range(90):
            t=i/89; a=t*TAU*3.1; rr=.034*(1-t*.88)
            pts.append((rr*math.cos(a),rr*math.sin(a),h-.012+t*.050))
        tube("Chantilly",pts,.0085,P["cream"],2)
        ellipsoid("Cereja",(0,0,h+.044),(.009,.009,.009),P["berry"],.04,16,10)
        tube("Canudo",[(.018,.005,h*.65),(.026,.008,h+.065)],.0038,P["berry"])
    elif kind=="cola":
        for i in range(7):
            a=i*2.1; rr=.020*math.sqrt((i+1)/8)
            box("Gelo",(rr*math.cos(a),rr*math.sin(a),.075+(i%3)*.021),(.018,.018,.018),P["ice"],(a,a*.6,a*.3),.003)
        citrus("Limao",(.027,0,h-.002),.023,P["lime"],P["custard"])
    else:
        citrus("Laranja",(.025,0,h-.004),.026,P["rind"],P["orange"])


def water_bottle():
    lathe("Garrafa",[(0,0),(.026,0),(.032,.008),(.032,.145),(.029,.159),(.016,.181),(.012,.189),(.012,.219),(0,.219)],P["glass"],segments=64)
    lathe("Agua",[(0,.008),(.027,.008),(.027,.151),(.015,.176),(0,.176)],P["water"],segments=48)
    lathe("Rotulo",[(.0322,.070),(.0322,.116)],material("rotulo-agua",(.025,.20,.23),.5),segments=64)
    lathe("Tampa",[(0,.218),(.014,.218),(.014,.232),(.012,.235),(0,.235)],material("tampa-agua",(.08,.30,.31),.38),segments=48)
    for z in (.012,.020,.145,.151,.222,.229):
        r=.0325 if z<.17 else .0142
        tube("Friso",[(r*math.cos(a),r*math.sin(a),z) for a in [TAU*j/48 for j in range(49)]],.00055,P["glass"])
    for i in range(18):
        a=rng.random()*TAU; rr=rng.uniform(.004,.024); z=rng.uniform(.025,.165)
        ellipsoid("Bolha",(rr*math.cos(a),rr*math.sin(a),z),(.0012,.0012,.0012),P["ice"],segments=8,rings=5)
    citrus("Limao",(.050,-.012,.001),.025,P["lime"],P["custard"])


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
    for ob in list(scene.objects):
        if ob.parent == root and ob.type == "CURVE":
            bpy.context.view_layer.objects.active=ob; ob.select_set(True)
            bpy.ops.object.convert(target="MESH"); ob.select_set(False)
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
    bpy.ops.export_scene.gltf(filepath=str(ROOT/"public"/"demo-models"/f"{slug}.glb"),export_format="GLB",use_selection=True,use_active_scene=True,export_apply=True,export_attributes=True)


P = palette()
for slug,builder in BUILDERS.items():
    if ONLY and slug not in ONLY: continue
    rng.seed(slug)
    scene=bpy.data.scenes.new("Realistic-"+slug); bpy.context.window.scene=scene
    scene.unit_settings.system="METRIC"; scene.unit_settings.scale_length=1
    root=bpy.data.objects.new(slug,None); scene.collection.objects.link(root)
    builder(); render_and_export(slug)
    print("REALISTIC_DONE",slug)

print("Completed realistic catalog")
