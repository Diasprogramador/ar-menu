"""Wood-fired 30 cm pizzas. The rim and toppings share one uneven dough surface."""
import math

from kitchen_geometry import P, TAU, ellipsoid, leaf, material, mesh, rng, tube


def ring_mesh(name, rows, sampler, finish, segments=96):
    vertices, faces = [], []
    for j, row in enumerate(rows):
        for i in range(segments):
            vertices.append(sampler(row, TAU*i/segments))
            if j:
                a = (j-1)*segments+i
                b = (j-1)*segments+(i+1)%segments
                faces.append((a, b, b+segments, a+segments))
    return mesh(name, vertices, faces, finish)


def pizza(slug, topping):
    phase = rng.random()*TAU
    def edge(a):
        return .15*(1+.024*math.sin(3*a+phase)+.019*math.cos(5*a)+.011*math.sin(11*a))

    pockets = [(a*TAU/17+rng.uniform(-.15,.15), rng.uniform(.002,.011),rng.uniform(.045,.16))
               for a in range(17)]
    def rim_height(a):
        return sum(h*math.exp(-((math.remainder(a-p,TAU)/w)**2)) for p,h,w in pockets)

    def crust(row, a):
        fraction, height, puff = row
        radius = edge(a)*fraction*(1 + .024*puff*math.sin(7*a+phase))
        return (radius*math.cos(a),radius*math.sin(a),height+puff*rim_height(a))

    ring_mesh("Cornicione alveolado", [
        (.0001,0,0),(.89,0,0),(.979,.004,.1),(1,.011,.4),(.994,.017,.8),
        (.972,.020,1),(.943,.022,1),(.911,.019,.7),(.88,.013,.25),
        (.84,.010,0),(.0001,.009,0)],crust,P["dough"],144)

    def base_z(x,y):
        return .014 + .0017*math.sin(42*x+phase)*math.cos(58*y)+.0008*math.sin(92*(x+y))
    def sauce(row,a):
        radius=edge(a)*row*(1+.014*math.sin(12*a+phase))
        x,y=radius*math.cos(a),radius*math.sin(a)
        return (x,y,base_z(x,y)+(.001 if topping != "margherita" else 0))
    # Outside-in ring ordering gives the edible surface upward normals.
    base_material = {"margherita":P["sauce"],"pepperoni":material("queijo-de-forno", (.89,.73,.42), .41, .28),
                     "four-cheese":material("quatro-queijos-gratinado",(.79,.65,.36),.48,.12)}
    ring_mesh("Cobertura assada", [.904,.86,.72,.59,.46,.32,.18,.001],sauce,base_material[topping])

    if topping == "pepperoni":
        # Raised, irregular rims with shallow oil-catching cups.
        for i in range(23):
            a=i*2.39996+phase+rng.uniform(-.19,.19)
            dist=.115*math.sqrt((i+.4)/23)
            x,y=dist*math.cos(a),dist*math.sin(a)
            radius=rng.uniform(.014,.020)
            direction=rng.random()*TAU
            def salami(row,t):
                fraction, height=row
                rr=radius*fraction*(1+.045*math.sin(5*t+direction))
                xx,yy=x+rr*math.cos(t),y+rr*math.sin(t)
                curl = 1+.55*math.sin(2*t+direction)+.22*math.cos(5*t-direction)
                return xx,yy,base_z(xx,yy)+.002+height*curl
            ring_mesh("Pepperoni em concha",[(.001,0),(.94,.001),(1,.005),(.96,.006),
                      (.83,.003),(.55,.0017),(.001,.0015)],salami,P["pepperoni"],32)
    else:
        count = 10 if topping=="margherita" else 23
        parmesan = material("parmesao-gratinado", (.75,.57,.29), .55, .12)
        for i in range(count):
            a=i*2.39996+phase+rng.uniform(-.16,.16)
            dist=.109*math.sqrt((i+.45)/count)
            x,y=dist*math.cos(a),dist*math.sin(a)
            finish=P["mozzarella"] if topping=="margherita" else (P["cream"],parmesan,material("gorgonzola-cremoso",(.78,.74,.53),.54,.12))[i%3]
            r=rng.uniform(.023,.039) if topping=="margherita" else rng.uniform(.009,.019)
            offset=rng.random()*TAU
            def melted(row,t):
                frac,h=row
                rr=frac*r*(1+.22*math.sin(3*t+offset)+.13*math.cos(5*t-offset)+.05*math.sin(9*t))
                u,v=rr*math.cos(t),rr*.8*math.sin(t)
                xx,yy=x+u*math.cos(offset)-v*math.sin(offset),y+u*math.sin(offset)+v*math.cos(offset)
                return xx,yy,base_z(xx,yy)+.0017+h*(1+.28*math.sin(4*t)*frac)
            ring_mesh("Ilha de queijo fundido",[(.999,0),(.94,.001),(.68,.0035),(.32,.004),(.001,.003)],
                      melted,finish,28)
            if topping == "four-cheese" and i % 3 == 2:
                for branch in [-1, 1]:
                    vein = []
                    for j in range(6):
                        xx = x+(j-2)*r*.13
                        yy = y+branch*r*.16*math.sin(j*1.1+offset)
                        vein.append((xx,yy,base_z(xx,yy)+.00565))
                    tube("Veio do gorgonzola",vein,.00045,P["blue"])
        if topping=="margherita":
            for i in range(8):
                a=i*2.39996+phase; d=.026+(i%4)*.024
                x,y=d*math.cos(a),d*math.sin(a)
                leaf("Folha de manjericao",(x,y,base_z(x,y)+.004),rng.uniform(.023,.037),
                     rng.uniform(.011,.019),P["basil"],a+.5,.002)
        else:
            for j in range(3):
                pts=[]
                for i in range(49):
                    t=i/48; a=phase+j*1.93+t*3.4
                    rr=.046+.051*t+.009*math.sin(t*12)
                    x,y=rr*math.cos(a),rr*math.sin(a)
                    pts.append((x,y,base_z(x,y)+.005))
                tube("Mel de laranjeira",pts,.00075,P["honey"])
