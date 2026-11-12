"""Burger ingredients in metres, for the Blender catalog's shared finalizer."""

from math import atan2, cos, exp, pi, sin, sqrt

from mathutils import Vector

from kitchen_geometry import P, TAU, material, mesh, rng


def _angles(count):
    return [TAU * i / count for i in range(count)]


def _append_loft(vertices, faces, bottom, rings, top):
    """Append a closed shell. Each ring runs counterclockwise viewed from above."""
    base = len(vertices)
    vertices.append(bottom)
    n = len(rings[0])
    for j, ring in enumerate(rings):
        start = len(vertices)
        vertices.extend(ring)
        for i in range(n):
            a, b = start + i, start + (i + 1) % n
            if j == 0:
                faces.append((base, b, a))
            else:
                faces.append((a - n, b - n, b, a))
    apex = len(vertices)
    vertices.append(top)
    for i in range(n):
        faces.append((apex - n + i, apex - n + (i + 1) % n, apex))


def _loft(name, mat, bottom, rings, top):
    vertices, faces = [], []
    _append_loft(vertices, faces, bottom, rings, top)
    return mesh(name, vertices, faces, mat)


def _sheet(name, mat, rows, thickness):
    """Closed sheet with matching front and back, including its thin cut edges."""
    nx, ny = len(rows), len(rows[0])
    top = [point for row in rows for point in row]
    count = len(top)
    vertices = list(top)
    for i in range(nx):
        for j in range(ny):
            du = Vector(rows[min(nx-1, i+1)][j]) - Vector(rows[max(0, i-1)][j])
            dv = Vector(rows[i][min(ny-1, j+1)]) - Vector(rows[i][max(0, j-1)])
            vertices.append(Vector(rows[i][j]) - thickness*du.cross(dv).normalized())
    faces = []
    for i in range(nx - 1):
        for j in range(ny - 1):
            a = i * ny + j
            faces.append((a, a + ny, a + ny + 1, a + 1))
    faces += [tuple(count + k for k in reversed(face)) for face in faces]
    rim = ([i * ny for i in range(nx)] + list(range(count - ny + 1, count))
           + [i * ny + ny - 1 for i in reversed(range(nx - 1))]
           + list(reversed(range(1, ny - 1))))
    for i, a in enumerate(rim):
        b = rim[(i + 1) % len(rim)]
        faces.append((b, a, a + count, b + count))
    return mesh(name, vertices, faces, mat)


def _heel(r, height, phase):
    angles = _angles(72)
    rings = []
    for width, level in ((.62, 0), (.80, .05), (.91, .19), (.985, .52),
                         (1, .77), (.96, .95), (.88, 1), (.65, 1.01)):
        ring = []
        for a in angles:
            radius = r * width * (1 + .025*sin(3*a + phase) + .013*cos(5*a - .8))
            z = height * level + .0013 * level * sin(2*a - phase)
            ring.append((radius*cos(a), .985*radius*sin(a), z))
        rings.append(ring)
    _loft("Pao inferior tostado", P["bread"], (0, 0, 0), rings, (0, 0, height))


def _crown(r, z, height, center, phase, count, shoulder_power):
    cx, cy = center
    # Same continuous surface for the glaze silhouette and the seed contact frames.
    def skin(a, t):
        shoulder = max(0, cos(t))**shoulder_power
        lobe = .022*sin(3*a + phase) + .012*cos(5*a - .8*phase)
        rad = r * shoulder * (1 + shoulder*lobe)
        lift = sin(t)
        x = cx + rad*cos(a) + .0035*lift
        y = cy + .98*rad*sin(a) - .0018*lift
        crease = .0028*exp(-((sin(a - phase+.17*sin(3*t))*4.6)**2 + ((t - .69)/.39)**2))
        crease += .00125*exp(-((t-.29)/.29)**2)*(1+.6*cos(7*a+phase))*cos(14*a+2*t)
        h = z + .006 + height*lift + shoulder*(.0016*cos(a + phase) - crease)
        return (x, y, h)

    angles = _angles(80)
    rings = []
    for width, lift in ((.64, -.0012), (.87, -.0011), (.95, 0), (.988, .0025)):
        ring = []
        for a in angles:
            x, y, h = skin(a, 0)
            ring.append((cx + width*(x-cx), cy + width*(y-cy), h - .006 + lift))
        rings.append(ring)
    rings.extend([[skin(a, pi*j/32) for a in angles] for j in range(16)])
    _loft("Pao superior glaceado", P["bread"], (cx, cy, z-.001), rings,
          skin(phase, pi/2))

    vertices, faces = [], []
    seed_angles = _angles(8)
    for i in range(count):
        a = i * 2.39996 + rng.uniform(-.32, .32) + phase
        t = atan2(sqrt(1 - (i+.5)/count*.94), sqrt((i+.5)/count*.94))
        p = Vector(skin(a, t))
        along = (Vector(skin(a+.001, t)) - Vector(skin(a-.001, t))).normalized()
        uphill = Vector(skin(a, t+.001)) - Vector(skin(a, t-.001))
        normal = along.cross(uphill).normalized()
        turn = rng.uniform(-pi, pi)
        axis = along*cos(turn) + normal.cross(along)*sin(turn)
        across = normal.cross(axis)
        length = rng.uniform(.00145, .00215)
        width = rng.uniform(.00063, .00090)
        rings = []
        for level, scale in ((-.45, .70), (.12, 1), (.72, .70)):
            ring = []
            for b in seed_angles:
                tip = cos(b)
                ring.append(p + axis*(length*tip*scale)
                            + across*(width*sin(b)*scale*(1-.25*tip))
                            + normal*(.00058*level))
            rings.append(ring)
        _append_loft(vertices, faces, p-normal*.0004, rings, p+normal*.00058)
    mesh("Gergelim na crosta", vertices, faces, P["sesame"])


def _beef_radius(r, a, phase):
    return r * (1 + .036*sin(3*a+phase) + .025*cos(5*a-phase)
                + .017*sin(9*a+2*phase) + .012*cos(17*a-phase))


def _patty(r, z, height, center, phase, smash):
    cx, cy = center
    angles = _angles(112)
    rings = []
    # The smashed skirt flares below the shoulder. Ridges connect across rings,
    # then break up into short crisp peaks at the perimeter.
    skirt = 1.075 if smash else 1.018
    for j, (width, level) in enumerate(((.66, .03), (.86, .015), (.96, .06),
            (skirt, .19), (1.015, .34), (1.025, .52), (.988, .71),
            (.964, .88), (.90, .98), (.79, 1), (.62, 1.01), (.35, 1))):
        ring = []
        for a in angles:
            relief = sin(32*a + phase + .52*j) + .60*sin(47*a - phase - .34*j)
            edge = min(1, width**4)
            rad = width*_beef_radius(r, a, phase)
            if smash:
                rad += .0034*exp(-((level-.19)/.18)**2)*sin(21*a+phase)*cos(9*a-phase)
            rad += edge*(.0016*relief + rng.uniform(-.0009, .0009))
            ripple = .0014*sin(4*a+phase) + .0008*sin(13*a-phase+j*.5)
            h = z + height*level + edge*(ripple + .00065*relief)
            ring.append((cx+rad*cos(a), cy+rad*sin(a), h))
        rings.append(ring)
    ob = _loft("Carne prensada na chapa", P["meat"], (cx, cy, z), rings,
               (cx, cy, z+height))
    # Wrap the seared edge continuously. Per-face box projection cuts visible
    # rectangles into the crust where the side normal changes direction.
    uv = ob.data.uv_layers.new(name="Ingredient")
    ob["authored_uv"] = True
    for face in ob.data.polygons:
        j, i = divmod(face.index, len(angles))
        for loop in face.loop_indices:
            v = ob.data.vertices[ob.data.loops[loop].vertex_index].co
            if 2 <= j <= 9:
                u = atan2(v.y-cy, v.x-cx)/TAU
                u += round((i+.5)/len(angles)-u)
                st = (8*u, (v.z-z)/.045)
            else:
                st = (v.x/.045, v.y/.045)
            uv.data[loop].uv = st


def _cheese(r, z, center, phase, rotation):
    """A softened square follows the meat shoulder before its corners gather."""
    cx, cy = center
    rings = []
    angles = _angles(88)
    def surface(a, fraction):
        u = a - rotation
        # Superellipse keeps broad cut sides and rounds just the four corners.
        edge = 1.018*r / (abs(cos(u))**9 + abs(sin(u))**9)**(1/9)
        edge *= 1 + .022*sin(3*a+phase) + .012*sin(7*a-phase)
        flat = edge * fraction
        support = _beef_radius(r, a, phase)
        spill = max(0, flat - 1.076*support)
        bend = 1 - exp(-spill/.005)
        # Horizontal run shortens gradually as the cheese wraps down the side.
        rad = flat - .90*spill*bend
        h = z + .0018 + .0007*fraction*sin(3*a + phase)
        h -= spill*bend*(.96 + .16*sin(a+phase) + .10*cos(2*a-phase))
        return (cx + rad*cos(a), cy + rad*sin(a), h)

    # Traverse the underside outward, roll the lip, return across the top.
    for fraction, offset in ((.72, -.0015), (.92, -.0015), (.985, -.00145),
                             (1, -.00095), (1, -.00040), (.985, 0),
                             (.95, 0), (.90, 0), (.84, 0), (.72, 0), (.48, 0)):
        ring = []
        for a in angles:
            x, y, h = surface(a, fraction)
            ring.append((x, y, h+offset))
        rings.append(ring)
    _loft("Queijo fundido sobre a carne", P["cheese"], (cx, cy, z-.0006),
          rings, (cx, cy, z+.0009))


def _bacon(r, z):
    # Three lengths cross the stack on different chords. The exposed ends buckle
    # and curl down, while the section under the second patty stays compressed.
    for k, (angle, side, phase) in enumerate(((-1.19, -.020, .7),
                                              (-.85, .006, 2.1), (.39, .018, 4.6))):
        rows = []
        for i in range(45):
            u = i/22 - 1
            end = abs(u)**4
            turn = max(0, (abs(u)-.84)/.16)
            x = r*(1.27 + .025*cos(phase))*u
            x += .002*end*sin(17*u+phase) - (.010 if u > 0 else -.010)*turn**2
            axis = side + .0048*sin(3.4*u+phase)
            width = (.0105+.0016*cos(9*u+phase))*(1-.16*end)
            fold = .0035*sin(9*u+phase) + .0045*end*sin(17*u+phase)
            row = []
            # Moving internal edges describe the cooked fat seam in the same mesh.
            seam = -.34 + .13*sin(6*u + phase) + .06*cos(14*u)
            for v in (-1, -.73, seam, seam+.23+.06*cos(7*u), .32, .72, 1):
                y = axis + width*v
                h = z + .005 + fold*(.62+.38*v) + .0027*v*sin(8*u+phase)
                h += .0016*v*v*sin(14*u+phase) - .0055*end
                h += .009*turn**2 * (.81+.19*v)
                row.append((x*cos(angle)-y*sin(angle), x*sin(angle)+y*cos(angle), h))
            rows.append(row)
        ob = _sheet("Bacon dobrado %d" % (k+1), P["bacon"], rows, .0022)
        ob.data.materials.append(P["fat"])
        quads = (len(rows)-1)*6
        for i in range(2, quads, 6):
            ob.data.polygons[i].material_index = 1
            ob.data.polygons[quads+i].material_index = 1


def _lettuce(r, z):
    for k in range(7):
        a = k*TAU/7 + rng.uniform(-.14, .14)
        length = r*rng.uniform(.99, 1.08)
        fan = rng.uniform(.44, .59)
        rows = []
        for i in range(13):
            u = i/12
            row = []
            for j in range(19):
                v = j/9-1
                direction = a + v*fan + .09*sin(2.6*u+k)
                lobes = .0038*sin(9*v+k) + .0023*cos(16*v-k)
                rad = .004 + length*u*(1-.19*v*v) + u**2*lobes
                # A central valley, branching pleats and a turned outer lip.
                pleat = cos(9*v + 3*u + k*.6) + .45*cos(17*v - 2*u)
                h = z + .001 + u*(.004*abs(v) + .0015*sin(k))
                h += u**1.7*(.0034*pleat + .002*sin(2*a)) - .004*u**7
                # The midrib tapers into oblique side veins as the blade opens.
                h += .0018*(1-.85*u)*exp(-44*v*v)
                h += .0011*u*(1-u)*cos(18*u - 7*abs(v) + .5*k)
                row.append((rad*cos(direction), rad*sin(direction), h))
            rows.append(row)
        _sheet("Alface crespa %d" % (k+1), P["lettuce"], rows, .00048)


def _tomatoes(r, z):
    pulp = material("polpa-de-tomate", (.72, .10, .037), .21, .53)
    for k, a in enumerate((-.93, 2.25)):
        cx, cy = .38*r*cos(a), .38*r*sin(a)
        level = z + k*.0025
        angles = _angles(60)
        rings = []
        profile = ((.78, 0), (.96, .0003), (1, .0013), (1, .006),
                   (.975, .0071), (.89, .0073), (.79, .0073), (.69, .0072),
                   (.55, .0072), (.40, .0072), (.28, .0072))
        def chamber(t):
            return .5 + .5*cos(4*t + .52*sin(2*t+a) + a)

        for width, h in profile:
            ring = []
            for t in angles:
                rad = r*.62*width*(1+.045*sin(4*t+a)+.021*cos(7*t-a))
                x, y = rad*cos(t), .96*rad*sin(t)
                pocket = .00145*exp(-((width-.62)/.17)**2)*chamber(t)**2 if h > .007 else 0
                ring.append((cx+x, cy+y, level+h+.032*x-.020*y-pocket))
            rings.append(ring)
        ob = _loft("Tomate maduro fatiado", P["tomato"], (cx, cy, level), rings,
                   (cx, cy, level+.0072))
        ob.data.materials.append(pulp)
        for j in (7, 8, 9):
            for i, t in enumerate(angles):
                if chamber(t) > (.64 if j == 8 else .80):
                    ob.data.polygons[j*len(angles)+i].material_index = 1


def _onions(r, z):
    # Thin cut onion crescents with flat cut ends, tucked under the crown.
    for k, a in enumerate((-.95, 1.56, 3.30)):
        cx, cy = .41*r*cos(a), .41*r*sin(a)
        rows = []
        for i in range(33):
            t = a + (i/32-.5)*(1.20+.07*k)*pi
            rad = r*(.54+.018*cos(3*t+k))
            row = []
            for v in (0, .5, 1):
                rr = rad - .0033*v
                row.append((cx+rr*cos(t), cy+rr*sin(t),
                            z+.0028+.0016*sin(t-a+.6*k)+.0005*sin(pi*v)))
            rows.append(row)
        # Increasing angle crossed with inward radius points up.
        _sheet("Cebola roxa em meia-lua", P["onion"], rows, .0025)


def _sauce(r, z, center, phase, mat):
    cx, cy = center
    rings = []
    for f, h in ((.73, -.0015), (.95, -.001), (1, .0002), (.975, .0024), (.77, .0032)):
        ring = []
        for a in _angles(64):
            rad = r*f*(.92 + .035*cos(3*a+phase) + .041*sin(5*a-phase))
            ring.append((cx+rad*cos(a), cy+rad*sin(a), z+h+.001*cos(3*a)*f))
        rings.append(ring)
    _loft("Molho sob a tampa", mat, (cx, cy, z-.0015), rings, (cx, cy, z+.0032))


def burger(slug, layers):
    """Build the catalog recipe bottom up. The heel rests directly on z = 0."""
    casa = slug == "burger-da-casa"
    duplo = slug == "smash-duplo-cheddar"
    r, heel, dome, seeds, phase, shoulder_power = {
        "burger-da-casa": (.068, .025, .043, 32, 2.2, 1.18),
        "smash-duplo-cheddar": (.071, .022, .038, 28, 4.3, .79),
    }.get(slug, (.067, .023, .045, 53, .75, 1.0))
    _heel(.965*r, heel, phase)
    z = heel
    center = (0, 0)
    meat_phase = phase
    patties = 0
    for layer in layers:
        if layer == "patty":
            meat_phase = phase + patties*1.81
            center = (.0024*cos(meat_phase), .0021*sin(1.4*meat_phase))
            height = .031 if casa else .017 + .0009*sin(meat_phase)
            _patty(r, z-.0008, height, center, meat_phase, not casa)
            patties += 1
            z += height-.0011
        elif layer == "cheese":
            _cheese(r, z, center, meat_phase, -.38+.67*patties+.18*phase)
            z += .0024
        elif layer == "bacon":
            _bacon(r, z)
            z += .007
        elif layer == "lettuce":
            _lettuce(r, z)
            z += .004
        elif layer == "tomato":
            _tomatoes(r, z-.0005)
            z += .0083
        elif layer == "onion":
            _onions(r, z)
            z += .0038
    crown_center = (.0028*cos(phase), .0032*sin(phase))
    if not casa:
        sauce = material("molho-da-casa", (.78, .45, .21), .35, .22) if duplo else P["sauce"]
        _sauce(r, z, crown_center, phase, sauce)
        z += .0022
    _crown(r*(.965 if duplo else .993), z, dome, crown_center, phase, seeds, shoulder_power)
