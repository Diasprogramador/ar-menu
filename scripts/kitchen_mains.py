"""Table-scale picanha, smoked beef ribs and Caesar salad. Dimensions in metres."""

from math import cos, floor, hypot, pi, sin, sqrt

from kitchen_geometry import P, TAU, bowl, box, material, mesh, plate, rng


class _Batch:
    """One indexed mesh per finish, including disconnected crumbs and shavings."""

    def __init__(self):
        self.parts = {}

    def face(self, finish, points):
        if finish not in self.parts:
            self.parts[finish] = ({}, [], [])
        indices, verts, faces = self.parts[finish]
        face = []
        for point in points:
            if point not in indices:
                indices[point] = len(verts)
                verts.append(point)
            face.append(indices[point])
        faces.append(face)

    def emit(self, name):
        for finish, (_, verts, faces) in self.parts.items():
            mesh(f"SM_{name}_{finish.name}", verts, faces, finish)


def _grid(batch, rows, finish, reverse=False):
    for i in range(len(rows) - 1):
        for j in range(len(rows[i]) - 1):
            quad = (rows[i][j], rows[i+1][j], rows[i+1][j+1], rows[i][j+1])
            batch.face(finish(i, j), quad[::-1] if reverse else quad)


def _rim(rows):
    return ([row[0] for row in rows] + rows[-1][1:]
            + [row[-1] for row in reversed(rows[:-1])] + rows[0][-2:0:-1])


def _join_rings(batch, lower, upper, finish):
    for i, a in enumerate(lower):
        j = (i + 1) % len(lower)
        batch.face(finish(i), (a, lower[j], upper[j], upper[i]))


def _cap(batch, ring, finish, reverse=False):
    center = tuple(sum(p[k] for p in ring) / len(ring) for k in range(3))
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        batch.face(finish, (center, b, a) if reverse else (center, a, b))


def _sheet(batch, rows, finish, thickness, underside):
    lower = [[(x, y, z - thickness) for x, y, z in row] for row in rows]
    _grid(batch, rows, finish)
    _grid(batch, lower, lambda i, j: underside, reverse=True)
    _join_rings(batch, _rim(lower), _rim(rows), lambda i: underside)


def _turn(x, y, angle, cx, cy):
    return cx + x*cos(angle) - y*sin(angle), cy + x*sin(angle) + y*cos(angle)


def _morsel(batch, center, size, finish, crown, sides=6):
    """Fractured grain or diced vegetable with a small, irregular cut face."""
    cx, cy, base = center
    rx, ry, h = size
    angle = rng.random() * TAU
    outline = []
    for i in range(sides):
        a = TAU*i/sides + rng.uniform(-.12, .12)
        r = rng.uniform(.86, 1.08)
        outline.append(_turn(rx*r*cos(a), ry*r*sin(a), angle, 0, 0))
    lower = [(cx + x*.83, cy + y*.83, base) for x, y in outline]
    waist = [(cx+x, cy+y, base+h*.56) for x, y in outline]
    upper = [(cx + x*.81, cy + y*.81, base+h*rng.uniform(.84, 1.1))
             for x, y in outline]
    _cap(batch, lower, finish, True)
    _join_rings(batch, lower, waist, lambda i: finish)
    _join_rings(batch, waist, upper, lambda i: finish)
    _cap(batch, upper, crown)


def _surface_streak(batch, surface, finish, path, width, lift):
    """Taper a fleck across a parametric surface, following its local relief."""
    rows = []
    for i in range(17):
        t = i/16
        u, v = path(t)
        half = width * (.038 + sin(pi*t)**.68) * (1 + .17*sin(19*t))
        row = []
        for dv in (-half, 0, half):
            x, y, z = surface(u, v + dv)
            row.append((x, y, z + lift*(.55 if dv else 1)))
        rows.append(row)
    _grid(batch, rows, lambda i, j: finish)


def _picanha_cut(batch, cx, cy, angle, length, width, height, phase, seared):
    def surface(u, v):
        # The pointed end belongs to the sirloin tip. The cap follows its convex edge.
        breadth = .48 + .46*sin(pi*u)**.62 + .22*u
        x = (u-.5)*length + .007*(1-v*v)*(2*u-1)
        y = width*(.5*v*breadth + .09*sin(pi*u) - .11*u)
        y += .0012*sin(11*u + phase + v)*abs(v)
        x, y = _turn(x, y, angle, cx, cy)
        z = .006 + height + .004*v + .0028*u
        z -= .0027*(abs(v)**5 + abs(2*u-1)**8)
        z += .00065*sin(14*u + 4*v + phase) + .0004*cos(17*v-7*u)
        return x, y, z

    def fat_edge(u):
        return .71 + .10*sin(6*u+phase) + .065*cos(13*u)

    nx, ny, seam = 34, 22, 18
    uv = []
    for i in range(nx+1):
        u = i/nx
        edge = fat_edge(u)
        lean = [(u, -1 + (edge+1)*j/seam) for j in range(seam)]
        cap = [(u, edge + (1-edge)*j/(ny-seam)) for j in range(ny-seam+1)]
        uv.append(lean + cap)
    rows = [[surface(u, v) for u, v in row] for row in uv]

    def top_finish(i, j):
        u, v = (i+.5)/nx, (uv[i][j][1]+uv[i][j+1][1])*.5
        if j >= seam:
            return P["fat"]
        if seared or abs(v) > .91 or min(u, 1-u) < .048:
            return P["meat"]
        return P["pink"]

    _grid(batch, rows, top_finish)
    edge = _rim(uv)
    top = _rim(rows)
    base = []
    shoulder = []
    heel = []
    for (u, v), (x, y, z) in zip(edge, top):
        dx, dy = x-cx, y-cy
        # The inward bevel meets the flat serving well at the heel.
        base.append((cx+.94*dx, cy+.92*dy, .006 + .0016*v*v))
        heel.append((cx+1.01*dx, cy+1.02*dy, .009 + .0008*sin(14*u)))
        shoulder.append((cx+1.012*dx, cy+1.03*dy, z-.0032))

    def side_finish(i):
        u, v = edge[i]
        return P["fat"] if v > fat_edge(u) else P["meat"]

    _cap(batch, base, P["meat"], True)
    _join_rings(batch, base, heel, lambda i: P["meat"])
    _join_rings(batch, heel, shoulder, side_finish)
    _join_rings(batch, shoulder, top, side_finish)
    if seared:
        for i in range(5):
            start = .09 + .13*i
            _surface_streak(batch, surface, P["char"],
                            lambda t: (start+.18*t, -.78+1.37*t+.035*sin(9*t+i)),
                            .065, .00055)
    else:
        for i in range(4):
            start = .09 + .155*i
            level = -.62 + .28*i
            _surface_streak(batch, surface, P["fat"],
                            lambda t: (start+.25*t, level+.21*t+.045*sin(8*t+phase)),
                            .014, .00042)
        _surface_streak(batch, surface, P["fat"],
                        lambda t: (.285+.13*t, -.37+.18*t+.024*sin(6*t)),
                        .009, .0004)


def steak():
    plate(.14)
    batch = _Batch()
    _picanha_cut(batch, -.023, .019, -.58, .135, .047, .037, .7, True)
    _picanha_cut(batch, -.007, -.018, -.32, .140, .047, .029, 2.1, False)
    _picanha_cut(batch, .011, -.051, -.08, .119, .041, .021, 4.3, False)

    # A low spoonful of bacon farofa; the outer grains break up the mound's edge.
    cx, cy, rx, ry = -.049, .076, .035, .024
    rings = []
    for scale, h in ((1, .0078), (.92, .012), (.66, .019), (.32, .023)):
        ring = []
        for i in range(32):
            a = TAU*i/32
            r = scale*(1+.054*sin(5*a)+.031*sin(13*a+h*80))
            ring.append((cx+rx*r*cos(a), cy+ry*r*sin(a), h+.0008*sin(9*a)))
        rings.append(ring)
    _cap(batch, rings[0], P["farofa"], True)
    for low, high in zip(rings, rings[1:]):
        _join_rings(batch, low, high, lambda i: P["farofa"])
    _cap(batch, rings[-1], P["farofa"])
    for i in range(175):
        a, r = rng.random()*TAU, sqrt(rng.random())*1.12
        x, y = cx+rx*r*cos(a), cy+ry*r*sin(a)
        base = max(.0078, .0235-.015*r**2)
        crumb = P["bacon"] if i % 13 == 0 else P["farofa"]
        _morsel(batch, (x, y, base-.0014), (.0021, .0015, .0028), crumb, crumb, 5)

    bowl((.056, .069, .007), .029, P["tomato"])
    for i in range(38):
        a, r = rng.random()*TAU, .020*sqrt(rng.random())
        finish = (P["tomato"], P["onion"], P["basil"], P["tomato"])[i % 4]
        _morsel(batch, (.056+r*cos(a), .069+r*sin(a), .0255),
                (.0034, .0025, .0034), finish, finish, 4)
    batch.emit("Picanha")


_BONE_STATIONS = (.11, .31, .52, .72, .91)


def _rack_point(u, v):
    """The arch and the meat pulled back from each individual bone."""
    ridge = max(0, 1-min(abs(u-s) for s in _BONE_STATIONS)/.10)
    ridge = ridge*ridge*(3-2*ridge)
    x = (u-.5)*.190 + .005*sin(pi*v) + .009*(v-.5)
    y = -.043 + .093*v + .008*u + .006*sin(5*u)
    y += .008*(1-v)**3*ridge - .006*v*v*u
    y -= .005*(1-v)*sin(pi*u)
    y += .0048*cos(14*u+.8*v)*abs(2*v-1)**3
    bevel = .0035*(abs(2*u-1)**10 + abs(2*v-1)**8)
    z = .041 + .008*sin(pi*v) + .003*sin(pi*u) + .0029*ridge - bevel
    z += .0013*sin(19*u+3*v) + .0008*cos(31*v+9*u)*sin(45*u-6*v)
    z += .0015*sin(26*u+4*cos(7*v))*sin(17*v+3*sin(11*u))
    return x, y, z


def _rib_bone(batch, u, index, marrow):
    x, y, _ = _rack_point(u, 0)
    length = .026 + .004*sin(2.4*index)
    previous = None
    for t, radius in ((0, .83), (.29, .96), (.62, .86), (.86, .96), (1, 1)):
        ring = []
        for j in range(16):
            a = TAU*j/16
            # Flat, broad rib cross-section with a shallow lobe, not a round dowel.
            dx = .0078*radius*cos(a)*(1+.09*sin(2*a+index))
            dz = .0039*radius*sin(a)*(1+.12*cos(3*a))
            ring.append((x+dx+.005*t*t, y+.006-length*t+.18*dx*t,
                         .025+dz+.0023*sin(pi*t)-.001*t))
        if previous is None:
            _cap(batch, ring, P["bone"], True)
        else:
            _join_rings(batch, previous, ring, lambda i: P["bone"])
        previous = ring
    center = tuple(sum(p[k] for p in previous)/len(previous) for k in range(3))
    inset = [(center[0]+.58*(x-center[0]), y+.00065, center[2]+.47*(z-center[2]))
             for x, y, z in previous]
    _join_rings(batch, previous, inset, lambda i: P["bone"])
    _cap(batch, inset, marrow)


def ribs():
    box("Tabua", (0, 0, .009), (.255, .180, .018), P["wood"], bevel=.006)
    batch = _Batch()
    nx, ny = 58, 30
    uv = [[(i/nx, j/ny) for j in range(ny+1)] for i in range(nx+1)]
    rows = [[_rack_point(u, v) for u, v in row] for row in uv]

    def bark(i, j):
        u, v = (i+.5)/nx, (j+.5)/ny
        grain = sin(34*u+9*v+1.8*sin(13*v)) + .65*sin(7*u-30*v) + .45*cos(69*u+11*v)
        char = grain + .30*abs(2*v-1)**4
        if char > 1.26:
            return P["char"]
        return P["meat"] if grain > .50 else P["rib"]

    _grid(batch, rows, bark)
    edge, top = _rim(uv), _rim(rows)
    levels = []
    for scale, fraction in ((.97, 0), (1.0, .13), (1.014, .64),
                            (1.016, .72), (1.011, .87)):
        ring = []
        for (u, v), (x, y, z) in zip(edge, top):
            base = .018 + .0013*(.5+.5*cos(9*u-3*v))
            zz = base+(z-base)*fraction
            zz += .0009*sin(25*v+19*u)*sin(pi*fraction)
            ring.append((x*scale, y*scale, zz))
        levels.append(ring)
    _cap(batch, levels[0], P["meat"], True)
    levels.append(top)
    for level, (low, high) in enumerate(zip(levels, levels[1:])):
        def flank(i):
            u, v = edge[i]
            # A trimmed crosscut on the two ends shows a sub-bark smoke ring.
            if u == 0 or u == 1:
                if level == 2:
                    return P["pink"]
                if level in (1, 3):
                    return P["meat"]
            return P["char"] if sin(35*u+13*v+level*.6) > .63 else P["rib"]
        _join_rings(batch, low, high, flank)
    marrow = material("miolo-osso-assado", (.35, .21, .108), .81)
    for i, u in enumerate(_BONE_STATIONS):
        _rib_bone(batch, u, i, marrow)
    for i in range(115):
        u, v = rng.uniform(.018, .982), rng.uniform(.025, .975)
        x, y, z = _rack_point(u, v)
        pepper = P["char"] if i % 4 else P["meat"]
        _morsel(batch, (x, y, z-.00055), (.0016, .0011, .0014),
                pepper, pepper, 5)
    batch.emit("Costela")


class _LeafPile:
    """Store upper leaf triangles so each new ingredient can rest on the salad."""

    cell = .014

    def __init__(self):
        self.cells = {}

    def add(self, triangle):
        xs, ys, _ = zip(*triangle)
        for ix in range(floor(min(xs)/self.cell), floor(max(xs)/self.cell)+1):
            for iy in range(floor(min(ys)/self.cell), floor(max(ys)/self.cell)+1):
                self.cells.setdefault((ix, iy), []).append(triangle)

    def height(self, x, y):
        # Serving well of the 21.2 cm plate, including the start of the rim.
        r = hypot(x, y)/.106
        height = .006 + min(.005, max(0, r-.60)*.005/.19)
        for a, b, c in self.cells.get((floor(x/self.cell), floor(y/self.cell)), ()):
            dx, dy = x-a[0], y-a[1]
            bx, by = b[0]-a[0], b[1]-a[1]
            cx, cy = c[0]-a[0], c[1]-a[1]
            det = bx*cy - cx*by
            if abs(det) < 1e-12:
                continue
            s, t = (dx*cy-cx*dy)/det, (bx*dy-dx*by)/det
            if min(s, t, 1-s-t) >= -1e-8:
                height = max(height, a[2]+s*(b[2]-a[2])+t*(c[2]-a[2]))
        return height


def _romaine(batch, pile, root, angle, length, width, lift, blade, rib, dressing, dressed):
    phase = rng.random()*TAU
    curl = rng.uniform(.004, .010)
    bend = rng.uniform(-.008, .008)
    # A narrow broken stem opens into broad, slightly ragged shoulders.
    def plan(u, v):
        breadth = .14*(1-u) + .27*u + .76*sin(pi*u**1.45)**.74
        scallop = .075*sin(30*u+2*v+phase) + .039*cos(67*u-3*v)
        x = length*u + (.003*sin(8*u+phase)*v + .005*(1-v*v)*u**4)
        y = .5*width*v*breadth*(1+scallop*abs(v)) + bend*sin(pi*u)
        return _turn(x, y, angle, *root)

    anchors = [pile.height(*plan(u, 0)) for u in (0, .5, 1)]

    def point(u, v):
        x, y = plan(u, v)
        half = min(1, int(2*u))
        t = 2*u-half
        support = anchors[half]*(1-t) + anchors[half+1]*t
        cup = curl*v*v*(.3 + .7*sin(pi*u)**.66)
        fold = (.0023*sin(27*u-6*abs(v)+phase) + .0011*sin(52*u+v))*abs(v)**1.35
        midrib = .0019*(1-.72*u)*max(0, 1-4.5*abs(v))
        z = support + .00065 + lift*u**1.35 + cup + fold + midrib
        z += .003*sin(4*u+phase)*v + .002*sin(pi*u)
        return x, y, max(z, .0066)

    nx = 18
    across = (-1, -.86, -.64, -.37, -.12, 0, .12, .37, .64, .86, 1)
    rows = [[point(i/nx, v) for v in across] for i in range(nx+1)]
    # Seat the base of each stem against the surface immediately beneath it.
    stem_gap = min(z-pile.height(x, y) for x, y, z in rows[0]) - .00045
    rows = [[(x, y, z-max(0, stem_gap)) for x, y, z in row] for row in rows]
    lower = [[(x, y, z-.00055) for x, y, z in row] for row in rows]
    _grid(batch, lower, lambda i, j: blade, reverse=True)
    _join_rings(batch, _rim(lower), _rim(rows), lambda i: blade)
    for i in range(nx):
        for j in range(len(across)-1):
            a, b = rows[i][j], rows[i+1][j]
            c, d = rows[i+1][j+1], rows[i][j+1]
            finish = rib if j in (4, 5) and i < nx-3 else blade
            for triangle in ((a, b, c), (a, c, d)):
                batch.face(finish, triangle)
                pile.add(triangle)
    if dressed:
        # Press a streak onto this leaf before adding the next layer. Sample the
        # triangles themselves so the dressing follows a fold all the way across.
        def on_leaf(u, v):
            i = min(nx-1, int(u*nx))
            j = next(k for k in range(len(across)-1) if v <= across[k+1])
            s = u*nx-i
            t = (v-across[j])/(across[j+1]-across[j])
            a, c = rows[i][j], rows[i+1][j+1]
            if s >= t:
                middle, weights = rows[i+1][j], (1-s, s-t, t)
            else:
                middle, weights = rows[i][j+1], (1-t, t-s, s)
            return tuple(weights[0]*a[k]+weights[1]*middle[k]+weights[2]*c[k]
                         for k in range(3))

        start = rng.uniform(.12, .39)
        side = rng.choice((-1, 1))
        _surface_streak(batch, on_leaf, dressing,
                        lambda t: (start+.41*t, side*(.53-.44*t+.08*sin(7*t+phase))),
                        .085, .00055)


def _crouton(batch, pile, cx, cy, angle):
    rx, ry = rng.uniform(.006, .009), rng.uniform(.005, .008)
    h = rng.uniform(.009, .014)
    # Clipped corners and a sloping torn face keep the croutons individually cut.
    outline = ((-.79, -1), (.74, -1), (1, -.67), (.96, .69),
               (.66, 1), (-.83, .94), (-1, .62), (-1, -.73))
    xy = [_turn(rx*x, ry*y, angle, cx, cy) for x, y in outline]
    z = max(pile.height(cx, cy), *(pile.height(x, y) for x, y in xy))-.002
    bottom = [(x, y, z) for x, y in xy]
    crown = [(cx+(x-cx)*.92, cy+(y-cy)*.92, z+h*(1+.14*u+.08*v))
             for (x, y), (u, v) in zip(xy, outline)]
    _cap(batch, bottom, P["dough"], reverse=True)
    _join_rings(batch, bottom, crown, lambda i: P["crumb"] if i in (2, 3) else P["dough"])
    _cap(batch, crown, P["dough"])
    for i, p in enumerate(crown):
        triangle = (p, crown[(i+1) % len(crown)], (cx, cy, z+h))
        pile.add(triangle)


def _shaving(batch, pile, cx, cy, angle, parmesan):
    length, width = rng.uniform(.018, .031), rng.uniform(.007, .013)
    phase = rng.random()*TAU
    rise = rng.uniform(.002, .005)
    rows = []
    for i in range(9):
        u = i/8
        row = []
        for v in (-1, 0, 1):
            x = (u-.5)*length + .0016*v*cos(phase+u*5)
            y = v*width*.5*(.75+.19*sin(9*u+phase)+.06*cos(21*u))
            px, py = _turn(x, y, angle, cx, cy)
            row.append((px, py, rise*(2*u-1)**2 + v*.0014*sin(5*u+phase)))
        rows.append(row)
    # A relatively rigid shaving bridges small valleys and touches at its high support.
    offset = max(pile.height(x, y)-z for row in rows for x, y, z in row) + .0004
    rows = [[(x, y, z+offset) for x, y, z in row] for row in rows]
    _sheet(batch, rows, lambda i, j: parmesan, .00055, parmesan)


def salad():
    plate(.106, dark=True)
    batch, pile = _Batch(), _LeafPile()
    rib = material("talo-romana", (.52, .65, .24), .46, .14)
    heart = material("coracao-romana", (.34, .55, .095), .47, .18)
    dressing = material("molho-caesar", (.76, .68, .47), .32, .38)
    parmesan = material("parmesao-curado", (.88, .73, .43), .61, .07)
    for layer, count in enumerate((9, 7, 4)):
        for i in range(count):
            a = (i*TAU/count + (0, .42, .93)[layer] + rng.uniform(-.15, .15))
            reach = (.089, .069, .046)[layer]*rng.uniform(.88, 1.04)
            length = (.084, .073, .058)[layer]*rng.uniform(.89, 1.08)
            angle = a + rng.uniform(-.83, .83)
            root = (reach*cos(a)-length*cos(angle), reach*sin(a)-length*sin(angle))
            blade = heart if layer == 2 or (layer == 1 and i == 2) else P["lettuce"]
            _romaine(batch, pile, root, angle, length, rng.uniform(.033, .049),
                     rng.uniform(.001, .006) + .005*layer, blade, rib, dressing,
                     (i+layer) % 3 != 1)
    for x, y in ((-.055, -.027), (.011, -.051), (.056, -.014), (-.032, .021),
                 (.024, .044), (.007, .002), (-.063, .032)):
        _crouton(batch, pile, x, y, rng.random()*TAU)
    for x, y in ((-.035, -.046), (.037, -.035), (-.014, -.018), (.053, .016),
                 (-.051, .004), (.008, .023), (-.018, .057), (.034, .051)):
        _shaving(batch, pile, x, y, rng.random()*TAU, parmesan)
    batch.emit("Caesar")
