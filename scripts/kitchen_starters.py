"""Individual portions of hand-cut fries, breaded onion rings and filled croquettes."""
import math
from mathutils import Vector

from kitchen_geometry import P, TAU, bowl, ellipsoid, material, mesh, plate, rng, tube


def croquettes():
    plate(.12)
    bowl((.054,.064,.006),.030,P["cream"])
    pts=[]
    for j in range(40):
        t=j/39; a=t*TAU*1.45; r=.019*(1-t)
        pts.append((.054+r*math.cos(a),.064+r*math.sin(a),.025+t*.0022))
    tube("Maionese de limao",pts,.0011,P["cream"])
    for _ in range(13):
        a=rng.random()*TAU; r=.018*math.sqrt(rng.random())
        x,y=.054+r*math.cos(a),.064+r*math.sin(a)
        tube("Raspa de limao",[(x,y,.026),(x+.002,y+.0006,.0266)],.0003,P["lime"])
    for i,(x,y) in enumerate([(-.061,.039),(-.011,.062),(.004,.017),(-.057,-.014),(.062,.004)]):
        ob=ellipsoid("Bolinho empanado",(x,y,.032),(.026,.023,.025),P["fried"],.11,28,15)
        ob.rotation_euler.z=i*.93
    # The sixth serving is split so both the fried shell and the filling can be seen.
    filling=material("costela-desfiada",(.27,.098,.045),.66,.08)
    for x,y,angle in [(-.023,-.060,-.38),(.031,-.052,.83)]:
        faces=[]; verts=[]; n=36
        for j in range(11):
            t=(j+.0001)/10*math.pi/2
            for k in range(n):
                a=k*TAU/n
                radius=.025*math.sin(t)*(1+.045*math.cos(5*a)+.028*math.sin(9*a+j))
                verts.append((radius*math.cos(a),radius*math.sin(a),-.021*math.cos(t)))
                if j:
                    b=(j-1)*n+k; c=(j-1)*n+(k+1)%n
                    faces.append((b,c,c+n,b+n))
        shell=mesh("Casquinha partida",verts,faces,P["fried"])
        shell.location=(x,y,.028); shell.rotation_euler=(.37,0,angle)
        def on_cut(pos):
            return shell.location + shell.rotation_euler.to_matrix() @ Vector(pos)
        cut=ellipsoid("Costela e catupiry",on_cut((0,0,.0003)),(.0234,.0234,.0033),filling,.066,26,12)
        cut.rotation_euler=shell.rotation_euler
        for j in range(7):
            t=j/6
            start=(.006*math.cos(t*4),-.009+t*.019,.0036)
            end=(start[0]+.002,start[1]+.004,.0039)
            tube("Veio de catupiry",[on_cut(start),on_cut(end)],.0014,P["cream"])


def onion_rings():
    plate(.115)
    # A loose pile, with different diameters and cuts; the bottom ring rests on the plate.
    placements=[(-.047,.024,.019,.037,.13),(.042,.034,.018,.035,-.11),
                (.038,-.039,.021,.038,.18),(-.046,-.039,.022,.034,-.21),
                (-.013,.017,.038,.044,.31),(.023,-.014,.053,.038,-.41),
                (-.028,-.004,.067,.034,.53)]
    for i,(x,y,z,r,tilt) in enumerate(placements):
        verts=[]; faces=[]; n=69; m=12
        for k in range(n):
            a=TAU*k/n
            center=r*(1+.044*math.sin(a*3+i)+.026*math.cos(5*a-i))
            for j in range(m):
                t=TAU*j/m
                crumb=.0065*(1+.15*math.cos(7*a+i)+rng.uniform(-.10,.10))
                rr=center+crumb*math.cos(t)
                verts.append((rr*math.cos(a),rr*.94*math.sin(a),crumb*math.sin(t)+.0012*math.cos(4*a)))
                a0=k*m+j; b=((k+1)%n)*m+j
                faces.append((a0,b,((k+1)%n)*m+(j+1)%m,k*m+(j+1)%m))
        ring=mesh("Anel de massa crocante",verts,faces,P["fried"])
        ring.location=(x,y,z);ring.rotation_euler=(tilt,.05,i*.91)
    for i in range(43):
        a=rng.random()*TAU; r=rng.uniform(.064,.093)
        ellipsoid("Farelo de empanado",(r*math.cos(a),r*math.sin(a),.0095),(.0018,.0013,.0009),
                  P["fried"],.31,7,4)


def fries():
    plate(.12)
    skin=material("casca-de-batata",(.43,.22,.08),.72)
    # Boat-shaped skin-on potato wedges, nested in three crossing layers.
    for i in range(24):
        layer=i//8
        angle=(-.72,.93,-.52)[layer]+rng.uniform(-.39,.39)
        across=((i%8)-3.5)*(.018-layer*.0014)
        along=rng.uniform(-.021,.021)
        x=along*math.cos(angle)-across*math.sin(angle)
        y=along*math.sin(angle)+across*math.cos(angle)
        length=rng.uniform(.062,.097); width=rng.uniform(.011,.017)
        verts=[]; faces=[]; strips=[]; section=[(-1,-.28),(-.73,-.53),(0,-.64),(.71,-.48),(1,-.2),(.28,.63),(-.16,.77)]
        m=len(section)
        for j in range(11):
            t=j/10; taper=.29+.71*math.sin(math.pi*t)**.48
            for k,(side,up) in enumerate(section):
                verts.append(((t-.5)*length,side*width*taper+.0025*math.sin(3*t+i),
                              up*width*taper+.002*math.sin(4*t+i)+rng.uniform(-.0005,.0005)))
                if j:
                    b=(j-1)*m+k;c=(j-1)*m+(k+1)%m
                    faces.append((b,c,c+m,b+m))
                    strips.append(k<3)
        faces.extend([tuple(reversed(range(m))),tuple(range(10*m,11*m))])
        potato=mesh("Batata com casca",verts,faces,P["potato"])
        potato.data.materials.append(skin)
        for p,has_skin in zip(potato.data.polygons,strips):
            p.material_index=int(has_skin)
        potato.location=(x,y,.017+layer*.013)
        potato.rotation_euler=(rng.uniform(-.28,.28),rng.uniform(-.12,.12),angle)
    for x,y,z,angle in [(-.031,-.024,.047,.8),(.026,.018,.048,-.6),(.038,-.036,.039,1.9)]:
        def sprig(t,s=0):
            return (x+t*math.cos(angle)-s*math.sin(angle),y+t*math.sin(angle)+s*math.cos(angle),z+.002*math.cos(t*110))
        tube("Ramo de alecrim",[sprig(-.016),sprig(0),sprig(.017)],.00048,P["wood"])
        for j in range(9):
            d=-.015+j*.0034
            for side in (-1,1):
                tube("Folha de alecrim",[sprig(d),sprig(d+.002,side*.002),sprig(d+.006,side*.004)],.00063,P["basil"])
