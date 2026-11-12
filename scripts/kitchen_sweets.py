"""Dessert and drinks for the Blender catalog. Private geometry uses millimetres."""

import math
from math import cos, sin

from kitchen_geometry import P, TAU, material, mesh, plate, rng


class _Batch:
    """Collect closed components of one finish before making a Blender object."""

    def __init__(self):
        self.verts = []
        self.faces = []

    def loft(self, rows, caps=(True, True)):
        # Rows wind counterclockwise looking back from the end of the sweep.
        previous = None
        for row in rows:
            start = len(self.verts)
            self.verts.extend(row)
            current = list(range(start, len(self.verts)))
            if previous is None:
                if caps[0] and len(current) > 2:
                    self.faces.append(tuple(reversed(current)))
            elif len(previous) == 1:
                for i, a in enumerate(current):
                    self.faces.append((previous[0], current[(i + 1) % len(current)], a))
            elif len(current) == 1:
                for i, a in enumerate(previous):
                    self.faces.append((a, previous[(i + 1) % len(previous)], current[0]))
            else:
                for i, a in enumerate(previous):
                    j = (i + 1) % len(previous)
                    self.faces.append((a, previous[j], current[j], current[i]))
            previous = current
        if caps[1] and len(previous) > 2:
            self.faces.append(tuple(previous))

    def blob(self, center, radii, angle=0, sides=10, belts=5, relief=None):
        cx, cy, cz = center
        rx, ry, rz = radii
        rows = [[(cx, cy, cz - rz)]]
        for j in range(1, belts):
            lat = math.pi * (j / belts - .5)
            row = []
            for i in range(sides):
                a = TAU * i / sides
                scale = relief(a, lat) if relief else 1
                x = rx * cos(lat) * cos(a) * scale
                y = ry * cos(lat) * sin(a) * scale
                row.append((cx + x*cos(angle) - y*sin(angle),
                            cy + x*sin(angle) + y*cos(angle), cz + rz*sin(lat)*scale))
            rows.append(row)
        self.loft([*rows, [(cx, cy, cz + rz)]])

    def emit(self, name, mat):
        return mesh(name, [(x*.001, y*.001, z*.001) for x, y, z in self.verts], self.faces, mat)


def _turned(name, profile, mat, segments=80, shape=None, center=(0, 0), caps=(True, True)):
    batch = _Batch()
    rows = []
    for k, (radius, height) in enumerate(profile):
        if radius == 0:
            rows.append([(*center, height)])
            continue
        row = []
        for i in range(segments):
            a = TAU*i/segments
            r, z = shape(k, a, radius, height) if shape else (radius, height)
            row.append((center[0] + r*cos(a), center[1] + r*sin(a), z))
        rows.append(row)
    batch.loft(rows, caps)
    return batch.emit(name, mat)


def _plate_height(x, y, radius):
    t = math.hypot(x, y)/radius
    return 6 + max(0, t-.60) * 5/.19


def _ganache():
    return material("ganache-meio-amargo", (.082, .019, .009), .19, .7)


def pudding():
    plate(.090)

    def syrup_edge(k, a, r, z):
        r *= 1 + .037*cos(2*a-.4) + .023*sin(3*a+.8) + .009*sin(7*a)
        return r, _plate_height(r*cos(a), r*sin(a), 90) + z

    _turned("Espelho de caramelo", [(47, .06), (53, .06), (61, .09), (61.5, .28),
            (60.8, .64), (55, 1.0), (48, 1.12)], P["caramel"], shape=syrup_edge)

    def glaze_depth(a):
        # Localized runs share the edge loop with the custard.
        return sum(h*math.exp(-sharp*(1-cos(a-t))) for t, h, sharp in
                   [(4.4, 11, 85), (5.1, 3.4, 90), (2.3, 6, 50), (.4, 4.3, 45)])

    def mold(k, a, r, z):
        if z == 52:
            drop = glaze_depth(a) + .55*(1+sin(5*a))
            z -= drop
            r += .17*drop
        return r*(1+.004*cos(6*a+.3)), z

    seam = (42.5, 52)
    # A tube mould leaves a tapered inner wall. Join both walls at the glaze.
    _turned("Flan de leite condensado", [(12, 54.3), (10.5, 49), (9.2, 9),
            (10.5, 7), (43, 6.9), (48.8, 7.3), (50.3, 9),
            (50.6, 12), (49.8, 17), seam], P["custard"], 112, mold, caps=(False, False))
    _turned("Coroa de açúcar queimado", [seam, (42.15, 53.5), (41.1, 55.3),
            (38.8, 56.4), (31, 56.85), (20, 57), (14.2, 56.55), (12, 54.3)], P["caramel"], 112, mold,
            caps=(False, False))


def _scoop(cx, cy, base, scale=1):
    # A scoop cut from a tub has a rolled skirt and faint parallel blade marks.
    profile = [(17, 0), (22, 1), (25, 3), (25.5, 6), (24.6, 9)]
    for j in range(18):
        a = 1.53*j/17
        profile.append((24.2*cos(a), 11 + 31*sin(a)))

    def scraped(k, a, r, z):
        edge = math.exp(-((z-5)/4)**2)
        x, y = r*cos(a), r*sin(a)
        folds = .95*sin(.23*x+.09*y+.15*z) + .48*cos(.49*y-.13*z)
        ripple = sin(9*a+.45*sin(3*a)) + .42*sin(14*a+.6)
        radius = r + r/25*(2.4*edge*ripple + folds + .9*cos(3*a+.07*z))
        return scale*radius, base+scale*(z + r/25*(.65*ripple*edge+folds))

    # The last pole bypasses the shape callback.
    profile.append((0, base+scale*42.1))
    _turned("Sorvete de baunilha tirado à colher", profile, P["icecream"], 84, scraped, (cx, cy))


def _clip_cell(poly, seed, other):
    # Clip a sugar-crust flake to the perpendicular bisector of two bake sites.
    nx, ny = other[0]-seed[0], other[1]-seed[1]
    limit = (nx*(other[0]+seed[0]) + ny*(other[1]+seed[1]))/2
    output = []
    for i, b in enumerate(poly):
        a = poly[i-1]
        da, db = nx*a[0]+ny*a[1]-limit, nx*b[0]+ny*b[1]-limit
        if (da < 0) != (db < 0):
            t = da/(da-db)
            output.append((a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])))
        if db < 0:
            output.append(b)
    return output


def _walnut_brownie():
    cx, cy = -21, -3

    def cut_edge(k, a, r, z):
        square = (abs(cos(a)/36)**10 + abs(sin(a)/30)**10)**(-.1)
        crumb = .81*sin(31*a+1.2*k) + .56*cos(19*a-.7*k) + .85*cos(4*a+.43*k)
        return r*square + crumb, z+.44*sin(13*a+.8*k)

    _turned("Brownie de chocolate 70 por cento", [(.91, 6.5), (.98, 8), (1, 16),
            (.987, 25), (1.01, 38), (.993, 49), (1, 59), (.96, 61)],
            P["chocolate"], 112, cut_edge, (cx, cy))

    outline = []
    for i in range(56):
        a = TAU*i/56
        rr = (abs(cos(a)/34.7)**10 + abs(sin(a)/29)**10)**(-.1)
        outline.append((rr*cos(a), rr*sin(a)))
    seeds = [(rng.uniform(-33,33), rng.uniform(-28,28)) for _ in range(32)]
    flakes = _Batch()
    for seed in seeds:
        cell = outline
        for other in seeds:
            if other != seed and cell:
                cell = _clip_cell(cell, seed, other)
        if len(cell) < 3:
            continue
        x = sum(p[0] for p in cell)/len(cell)
        y = sum(p[1] for p in cell)/len(cell)
        lift = rng.uniform(.6, 1.35)
        rows = []
        for scale, h in ((.96, 60.4), (.93, 61.8), (.70, 61.9+lift)):
            rows.append([(cx+x+(px-x)*scale, cy+y+(py-y)*scale,
                          h+.024*(px-x)-.020*(py-y)) for px, py in cell])
        flakes.loft(rows)
    flakes.emit("Casquinha craquelada", material("crosta-fina-de-cacau", (.148,.043,.019), .37, .18))

    nuts = _Batch()
    for i in range(26):
        a = i*2.39996 + rng.uniform(-.05,.05)
        rr = (abs(cos(a)/36)**10 + abs(sin(a)/30)**10)**(-.1)
        x, y = cx+(rr-.7)*cos(a), cy+(rr-.7)*sin(a)
        z = rng.uniform(12, 56)
        size = rng.uniform(1.6, 3.3)
        if i % 4 == 0:
            x, y, z = cx+rng.uniform(-26,26), cy+rng.uniform(-22,22), 62
        for dx in (-.48, .53):
            nuts.blob((x+dx*size*sin(a), y-dx*size*cos(a), z+dx*.6),
                      (size*.72, size, size*.74), a+.3, 9, 5,
                      lambda t, b: 1+.14*cos(3*t+2*b)+.08*sin(5*t-b))
    nuts.emit("Miolo de noz partido", material("noz-tostada", (.48,.253,.109), .71))


def _fondant():
    cx, cy = -21, 3
    front = -1.25

    def broken(k, a, r, z):
        cleft = math.exp(-14*(1-cos(a-front-.06*sin(.13*z))))
        return r*(1-.73*cleft + .014*sin(7*a+.12*k)+.009*sin(19*a+k)), z-2.6*cleft

    _turned("Bolo de casca rompida", [(23, 7), (28, 9.6), (30.6, 16), (31, 29),
            (30, 42), (28.7, 51), (26, 55.6), (21, 57), (15, 54.6), (10, 52.2)],
            P["chocolate"], 108, broken, (cx,cy))
    # A continuous glossy fold starts inside the crater and widens on the plate.
    trail = _Batch()
    rows = []
    for distance, width, bottom, top in [
            (-12, 2, 51, 53), (-9, 7, 50, 54.5), (-3, 12.5, 48, 55.1),
            (3, 13, 46, 54.4), (9, 10, 38, 53), (13, 7.4, 29, 47),
            (14.8, 7, 15, 33), (17, 7.4, 8, 24), (22, 9.1, 6.4, 15.5),
            (28, 10.5, 6.3, 11.4), (34, 8.7, 6.3, 9.8), (39, 5, 6.4, 8.8),
            (41, 1.8, 6.7, 7.8)]:
        row = []
        for j in range(32):
            a = TAU*j/32
            side = width*cos(a) + 1.2*sin(distance*.16)
            row.append((cx+distance*cos(front)-side*sin(front),
                        cy+distance*sin(front)+side*cos(front),
                        (top+bottom)/2+(top-bottom)*sin(a)/2))
        rows.append(row)
    trail.loft(rows)
    trail.emit("Coração de chocolate fundido", _ganache())


def _raspberries():
    fruit = _Batch()
    for cx, cy, radius in ((28,-32,6.3),(42,-24,5.6),(15,-35,5.3)):
        base = _plate_height(cx,cy,75)
        fruit.blob((cx,cy,base+.85*radius), (.83*radius,.83*radius,.86*radius))
        for k, (n, r, z) in enumerate(((9,.70,.42),(10,.78,.89),(8,.57,1.35),(4,.24,1.59))):
            for i in range(n):
                a = TAU*(i+.48*k)/n
                fruit.blob((cx+radius*r*cos(a), cy+radius*r*sin(a), base+radius*z),
                           (.32*radius,.34*radius,.35*radius), a, 8, 4)
    fruit.emit("Framboesas em drupéolas", P["berry"])


def brownie(petit=False):
    plate(.075 if petit else .085)
    if petit:
        _fondant()
        _scoop(29, 9, 6)
        _raspberries()
    else:
        _walnut_brownie()
        _scoop(41, 10, 6, 1.12)
        # Warm sauce spooned in a crescent alongside the vanilla.
        trail = _Batch()
        rows = []
        for j in range(43):
            t = j/42
            a = -2.8 + 3.75*t
            w = .2 + 4.1*sin(math.pi*t)**.85*(1.25-.72*t)
            row = []
            for i in range(12):
                b = TAU*i/12
                radial = 25-w*cos(b)
                x, y = 39+radial*cos(a), 9+radial*sin(a)
                row.append((x, y, _plate_height(x,y,85)+.7+.63*sin(b)))
            rows.append(row)
        trail.loft(rows)
        trail.emit("Calda quente de chocolate", _ganache())


def _citrus(center, radius, lime, tilt, heading, slit=True):
    """Cut wheel with rind, albedo and inset pulp visible on both faces."""
    rind, pith, flesh = _Batch(), _Batch(), _Batch()
    half = 2.35 if lime else 2.65
    skip = .068 if slit else 0
    start = -math.pi/2 + skip
    span = TAU-2*skip

    def point(r, a, z):
        x = r*cos(a)
        y = r*sin(a)*cos(tilt) - z*sin(tilt)
        return (center[0]+x*cos(heading)-y*sin(heading),
                center[1]+x*sin(heading)+y*cos(heading),
                center[2]+r*sin(a)*sin(tilt)+z*cos(tilt))

    def annulus(batch, profile):
        # Sweep the cross-section about the fruit axis; weld the unslit wheel.
        n = 72
        count = n+1 if slit else n
        offset = len(batch.verts)
        m = len(profile)
        for j in range(count):
            a = start+span*j/n
            batch.verts.extend(point(r,a,z) for r,z in profile)
        for j in range(n):
            u, v = offset+j*m, offset+((j+1)%count)*m
            for k in range(m):
                l = (k+1)%m
                batch.faces.append((u+k,v+k,v+l,u+l))
        if slit:
            batch.faces.append(tuple(offset+i for i in range(m)))
            batch.faces.append(tuple(offset+n*m+i for i in reversed(range(m))))

    inner = radius*.894
    annulus(rind, [(radius*.96,-half), (radius,-half+.6), (radius,half-.6),
                   (radius*.96,half), (radius*.944,half-.12), (radius*.944,-half+.12)])
    # The pith provides a solid, pale bed under the translucent-looking segments.
    # A tiny central core is shared by the fan triangles on each end.
    n = 72
    count = n+1 if slit else n
    for z in (-half+.13, half-.13):
        pith.verts.extend(point(radius*.951,start+span*j/n,z) for j in range(count))
    low, high = len(pith.verts), len(pith.verts)+1
    pith.verts.extend((point(0,0,-half+.13),point(0,0,half-.13)))
    for j in range(n):
        l = (j+1)%count
        pith.faces.extend(((low,l,j),(high,count+j,count+l),(j,l,count+l,count+j)))
    if slit:
        pith.faces.extend(((low,0,count,high),(n,low,high,count+n)))

    sizes = [rng.uniform(.84,1.16) for _ in range(10)]
    angle = start
    for size in sizes:
        end = angle+span*size/sum(sizes)
        lo, hi = angle+.015, end-.015
        for sign in (-1,1):
            # Each segment has a gently swollen interior and a narrow membrane.
            z = sign*(half-.10)
            rows = []
            for k in range(6):
                t = k/5
                r = 1.2+(inner-1.2)*t
                row = []
                for j in range(8):
                    u = j/7
                    a = lo+(hi-lo)*u+.022*sin(math.pi*t)
                    rise = .12+.38*sin(math.pi*u)*sin(math.pi*t)
                    row.append(len(flesh.verts))
                    flesh.verts.append(point(r,a,z+sign*rise))
                rows.append(row)
            for prev, curr in zip(rows,rows[1:]):
                for j in range(7):
                    quad = (prev[j],curr[j],curr[j+1],prev[j+1])
                    flesh.faces.append(quad if sign==1 else quad[::-1])
        angle = end
    rind.emit("Epicarpo do cítrico", P["lime" if lime else "rind"])
    pith.emit("Albedo e membranas", material("albedo-citrico", (.88,.81,.51), .57))
    color = (.59,.69,.19) if lime else (.99,.42,.033)
    flesh.emit("Vesículas dos gomos", material("polpa-lima" if lime else "polpa-laranja",
                                              color, .27, .35))


def _glass(top, foot, lip, pressed=False):
    def facets(k, a, r, z):
        flute = max(0, 1-abs(z-40)/45) if pressed and k < 6 else 0
        return r-.85*flute*(.5+.5*cos(12*a)), z

    _turned("Copo de vidro de fundo pesado",
            [(foot-4, .5),(foot-2,0),(foot,.8),(foot+1.6,4),(foot+1.8,9),
             (foot+4.4,61),(lip,top-2),(lip+.08,top-.8),(lip-.38,top),
             (lip-1.13,top+.05),(lip-1.64,top-.65),(lip-1.7,top-2.2),
             (foot+2.65,61),(foot+.1,10),(foot-.8,8),(foot-3,7.4),(0,7.4)],
            P["glass"], 96, facets)
    _condensation(12, top-6, lambda z: foot+1.8+(2.6*(z-9)/52 if z <= 61
                  else 2.6+(lip-foot-4.4)*(z-61)/(top-63)))


def _condensation(low, high, radius):
    drops = _Batch()
    for i in range(122):
        z = rng.uniform(low, high)
        a = rng.uniform(0, TAU)
        if sin(3*a+.048*z)+.6*cos(7*a-.022*z) < -.4:
            continue
        s = rng.uniform(.32,.85)
        r = radius(z) + .08
        drops.blob((r*cos(a),r*sin(a),z), (.55*s,s,s*rng.uniform(1,1.9)), a,
                   sides=8, belts=4)
    drops.emit("Condensação no vidro frio", material("gotas-frias",(.83,.89,.86),.10,
               .4,alpha=.42,transmission=.62))


def _drink_fill(name, top, foot, lip, mat):
    _turned(name, [(foot-2.2,7.65),(foot-.9,8.15),(foot-.13,10.25),
            (foot+2.4,61),(lip-2.35,top-.85),(lip-2.4,top+.16),
            (lip-2.95,top),(lip-4.6,top-.36),(0,top-.36)], mat)


def _fizz(bottle=False):
    gas = _Batch()
    for k in range(12 if bottle else 10):
        a = TAU*(k+rng.uniform(-.2,.2))/12
        start = rng.uniform(11,44)
        end = rng.uniform(117,159) if bottle else 128
        n = rng.randrange(6,13)
        for j in range(n):
            t = (j+rng.uniform(.05,.95))/n
            z = start+(end-start)*t
            r = (26.2 if bottle else 27+.054*z) + .65*sin(t*8+a)
            drift = a+.04*sin(t*6+k)
            s = rng.uniform(.31,.79)*(.7+.45*t)
            gas.blob((r*cos(drift),r*sin(drift),z),(s,s,1.04*s),sides=7,belts=4)
    if not bottle:
        for i in range(44):
            a = rng.random()*TAU
            r = rng.uniform(32,35.2)
            s = rng.uniform(.35,.95)
            gas.blob((r*cos(a),r*sin(a),132.6),(s,s,.70*s),sides=7,belts=4)
    gas.emit("Bolhas de carbonatação", P["ice"])


def _ice():
    cubes = _Batch()
    for cx,cy,cz,w,turn,pitch in [(-12,-10,131,10,.36,.28),(9,11,135,9.6,-.21,-.32),
            (-13,11,114,9,.15,.4),(12,-10,113,8.6,.65,-.52),(8,8,91,9,.38,.47)]:
        rows = []
        for z,scale in ((-.96,.59),(-.92,.82),(-.72,.97),(.64,1),(.88,.93),(.97,.74)):
            row = []
            for i in range(32):
                a = TAU*i/32
                rr = w*scale*(abs(cos(a))**6+abs(sin(a))**6)**(-1/6)
                x, y = rr*cos(a), rr*sin(a)
                h = w*(z+.025*sin(3*a+z))
                yp = y*cos(pitch)-h*sin(pitch)
                row.append((cx+x*cos(turn)-yp*sin(turn),cy+x*sin(turn)+yp*cos(turn),
                            cz+y*sin(pitch)+h*cos(pitch)))
            rows.append(row)
        cubes.loft(rows)
    cubes.emit("Gelo lapidado pelo derretimento", P["ice"])


def _whipped_cream():
    _turned("Base de chantilly", [(22,142),(33,144),(35,148),(32,152),(23,158),
            (14,166),(4,171)], P["cream"])
    # A star nozzle sweeps a tapering helix; the flutes follow its tangent.
    cream = _Batch()
    rows = []
    for j in range(161):
        t = j/160
        a = .7+TAU*2.8*t
        r = 26*(1-t)**1.04
        z = 147+35*t+5*t**5
        bead = 9.0*(1-.43*t)*(1-.97*t**13)
        row = []
        for i in range(32):
            b = -TAU*i/32
            ridge = bead*(1+.16*cos(8*b+.55*t))
            radial = r+ridge*cos(b)
            row.append((radial*cos(a)-2*t**6,radial*sin(a),z+ridge*sin(b)))
        rows.append(row)
    cream.loft(rows)
    cream.emit("Chantilly de bico estrelado", P["cream"])
    cherry = _Batch()
    cherry.blob((-3,1,184),(8.5,8.1,8.1),-.2,28,14,
                lambda a,b: 1+.04*cos(2*a)*cos(b)-.035*sin(3*b))
    cherry.emit("Cereja",P["berry"])
    stem = _Batch()
    rows = []
    for j in range(13):
        t = j/12
        rows.append([(-3+4*t+3*t*t+(.58-.2*t)*cos(TAU*i/8),
                      1+2*t+(.58-.2*t)*sin(TAU*i/8),191+11*t) for i in range(8)])
    stem.loft(rows)
    stem.emit("Haste da cereja", material("haste-cereja",(.144,.082,.022),.59))


def _paper_straw():
    # Sweep the lip and bore as one ring section so the opening reads from above.
    n = 32
    straw = _Batch()
    profile = [(3.15,138),(3.15,209.6),(2.96,210),(2.47,210),(2.39,209.7),(2.39,138)]
    for r,z in profile:
        straw.verts.extend((17+(z-138)*.118+r*cos(TAU*i/n),
                            14+(z-138)*.034+r*sin(TAU*i/n),z) for i in range(n))
    for k in range(len(profile)):
        l = (k+1)%len(profile)
        for i in range(n):
            j = (i+1)%n
            straw.faces.append((k*n+i,k*n+j,l*n+j,l*n+i))
    straw.emit("Canudo de papel", material("canudo-cereja",(.62,.041,.084),.54))


def glass_drink(kind):
    if kind == "milkshake":
        _glass(149,27,39,pressed=True)
        _drink_fill("Morango batido com sorvete",144,27,39,P["strawberry"])
        _whipped_cream()
        _paper_straw()
    elif kind == "cola":
        _glass(142,28,39)
        _drink_fill("Cola gelada",133,28,38.6,P["cola"])
        _ice()
        _fizz()
        _citrus((36.5,14,144.1),21.5,True,1.30,.48)
    elif kind == "juice":
        _glass(151,27,39)
        _drink_fill("Suco recém-espremido",144,27,38.6,P["orange"])
        _citrus((35.7,15.5,153.3),24.5,False,1.27,.53)
        froth = _Batch()
        for j in range(84):
            a = rng.uniform(0,TAU) if j < 28 else rng.gauss(2.1,.68)
            r = min(35.7,max(26,rng.gauss(34.1,1.7)))
            s = rng.uniform(.42,1.22)
            froth.blob((r*cos(a),r*sin(a),143.9),(s,s,.62*s),sides=8,belts=4)
        froth.emit("Espuma da laranja espremida",material("espuma-laranja",(.96,.61,.18),.45))
    else:
        raise ValueError(f"Unknown glass drink {kind!r}")


def _bottle_label():
    # Explicit loop UVs avoid interpolating across the seam at the back.
    n = 96
    label = _Batch()
    for z in (76,118):
        for j in range(n):
            a = math.pi/2+TAU*j/n
            label.verts.append((31.82*cos(a),31.82*sin(a),z))
    for i in range(n):
        j = (i+1)%n
        label.faces.append((i,j,n+j,n+i))
    paper = material("rotulo-agua",(.023,.172,.17),.5,.13)
    ob = label.emit("Rótulo mineral",paper)
    layers = ob.data.uv_layers
    wrap = layers.new(name="PrintWrap")
    for i, face in enumerate(ob.data.polygons):
        u,v = i/n,(i+1)/n
        for loop, uv in zip(face.loop_indices,((u,0),(v,0),(v,1),(u,1))):
            wrap.data[loop].uv = uv
    # The shared generator writes metric projection into the active edit layer.
    layers.new(name="Ingredient", do_init=False)
    layers.active_index = 1
    layers["PrintWrap"].active_render = True
    foil = _Batch()
    for z, width in ((77.4,.32),(78.6,.15),(116.4,.32)):
        rows = [[(31.88*cos(TAU*j/n),31.88*sin(TAU*j/n),h) for j in range(n)]
                for h in (z-width,z+width)]
        foil.loft(rows, caps=(False,False))
    foil.emit("Filetes de estanho no rótulo",material("filete-estanho",(.62,.69,.63),.3,.2,.55))


def water_bottle():
    wall = [(0,5.8),(15,5.8),(22,2.7),(26,.3),(28,0),(30.3,1.8),(31.6,5),
            (32,8.4),(31.1,10.4),(31.9,12.2),(31.9,17),(31.1,19),(31.65,22),
            (31.65,34),(31.65,52),(31.65,70),(31.1,72.8),(31.55,75),(31.55,119),
            (31.1,121),(31.7,124),(31.7,140),(31.3,148),(30.6,154),(28.6,160),
            (25.2,166),(20.3,174),(16.7,182),(14,190),(13.15,196),(13.15,207),
            (14.75,209),(14.75,211),(13.5,212.3),(13.5,220),(11.7,220),(11.7,195),
            (12.4,189),(15.1,181),(18.8,173),(23.6,165),(27,159),(29.2,152),
            (29.8,144),(29.8,23),(29,13),(27,8.5),(21,7.8),(13,9),(0,9)]

    def bottle_flutes(k,a,r,z):
        if 22 <= z <= 70 and k < 17:
            r -= 1.1*max(0, sin(math.pi*(z-22)/48))*(.5+.5*cos(18*a+.018*z))**2
        return r,z

    _turned("Garrafa mineral de vidro",wall,P["glass"],108,bottle_flutes)
    _condensation(23, 146, lambda z: 31.7 if z < 76 or z > 119 else 31.86)
    _turned("Água mineral com menisco",[(0,9.4),(13,9.4),(21,8.3),(26.6,9),(28.6,13.5),
            (29.45,23),(29.45,144),(29,151),(26.7,158.6),(23.2,164.8),(18.5,172.8),
            (14.8,180.8),(12.1,188.8),(11.25,196),(11.25,200),(10.8,199.8),(0,199.5)],P["water"])
    _fizz(bottle=True)
    _bottle_label()
    metal = material("tampa-agua",(.038,.229,.22),.32,.32,.48)
    _turned("Anel de inviolabilidade",[(13.55,212.7),(14.4,212.8),(14.6,213.4),
            (14.6,217.1),(14.1,217.4),(13.5,217.3)],metal)

    def knurl(k,a,r,z):
        return r + (.44*(.5+.5*cos(48*a)) if k in (3,4) else 0), z

    _turned("Cápsula frisada",[(13.4,217.8),(14.5,217.8),(14.8,218.6),(14.7,220),
            (14.7,232),(14.7,233),(14.1,234.1),(12.8,234.7),(10,234.9),(0,235)],
            metal,192,knurl)
    _citrus((54,-15,2.35),24.5,True,0,.22,slit=False)
