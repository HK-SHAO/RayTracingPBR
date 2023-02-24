import taichi as ti
from taichi.math import vec3, radians, normalize


from .dataclass import SDFObject, Transform, Material, Ray
from .config import MAX_RAYMARCH, MAX_DIS, PIXEL_RADIUS
from .sdf import SHAPE_SPHERE, SHAPE_CYLINDER, SHAPE_BOX, SHAPE_FUNC
from .util import rotate


OBJECTS = sorted([
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(0, -100.501, 0), vec3(0), vec3(100)),
              material=Material(vec3(1, 1, 1)*0.6, vec3(1), 1.0, 1.0, 0, 1.100)),
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(0, 0, 0), vec3(0), vec3(0.5)),
              material=Material(vec3(1, 1, 1), vec3(1, 10, 1), 0, 1, 0, 1.000)),
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(1, -0.2, 0), vec3(0), vec3(0.3)),
              material=Material(vec3(0.2, 0.2, 1)*0.9, vec3(1), 0.2, 1, 0, 1.100)),
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(0.0, -0.2, 2), vec3(0), vec3(0.3)),
              material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 0, 1, 1.500)),
    SDFObject(type=SHAPE_CYLINDER,
              transform=Transform(vec3(-1.0, -0.2, 0), vec3(0), vec3(0.3)),
              material=Material(vec3(1.0, 0.2, 0.2)*0.9, vec3(1), 0, 0, 0, 1.460)),
    SDFObject(type=SHAPE_BOX,
              transform=Transform(vec3(0, 0, 5), vec3(0), vec3(2, 1, 0.2)),
              material=Material(vec3(1, 1, 0.2)*0.9, vec3(1), 0, 1, 0, 0.470)),
    SDFObject(type=SHAPE_BOX,
              transform=Transform(vec3(0, 0, -2), vec3(0), vec3(2, 1, 0.2)),
              material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 1, 0, 2.950))
], key=lambda o: o.type)

SHAPES = list(set([o.type for o in OBJECTS]))


objects = SDFObject.field()
ti.root.dense(ti.i, len(OBJECTS)).place(objects)
for i in range(objects.shape[0]):
    objects[i] = OBJECTS[i]


@ti.func
def get_object_pos_scale(i: int, p: vec3) -> tuple[vec3, vec3]:
    obj = objects[i]
    pos = transform(obj.transform, p)
    return pos, obj.transform.scale


@ti.func
def nearest(p: vec3) -> tuple[int, float]:
    index = 0
    min_dis = MAX_DIS

    for i in ti.static(range(len(OBJECTS))):
        pos, scale = get_object_pos_scale(i, p)
        dis = MAX_DIS

        shape = ti.static(OBJECTS[i].type)
        dis = abs(SHAPE_FUNC[shape](pos, scale))

        update = dis < min_dis
        min_dis = dis if update else min_dis
        index = i if update else index

    return index, min_dis


@ti.func
def raycast(ray: Ray) -> tuple[Ray, SDFObject, bool]:
    t, w, s, distance = 0.0, 1.6, 0.0, MAX_DIS
    index, hit = 0, False

    for _ in range(MAX_RAYMARCH):
        ld = distance
        index, distance = nearest(ray.origin)

        if w > 1.0 and ld + distance < s:
            s -= w * s
            w = 1.0
            t += s
            ray.origin += ray.direction * s
            continue

        s = w * distance
        t += s
        ray.origin += ray.direction * s

        hit = distance < PIXEL_RADIUS * t
        if hit or t > MAX_DIS:
            break

    ray.depth += 1
    return ray, objects[index], hit


@ti.func
def transform(t: Transform, p: vec3) -> vec3:
    p -= t.position  # Cannot squeeze the Euclidean space of distance field
    p = t.matrix @ p  # Otherwise the correct ray marching is not possible
    return p


@ti.func
def calc_normal(obj: SDFObject, p: vec3) -> vec3:
    scale = obj.transform.scale
    pos = transform(obj.transform, p)

    n, h = vec3(0), 0.5773 * 0.005
    for shape in ti.static(SHAPES):
        if obj.type == shape:
            for i in ti.static(range(4)):
                e = (2.0*vec3((((i+3) >> 1) & 1), ((i >> 1) & 1), (i & 1))-1.0)
                n += e*SHAPE_FUNC[shape](pos+e*h, scale)

    return normalize(n)


@ti.func
def update_transform(i: int):
    transform = objects[i].transform
    matrix = rotate(radians(transform.rotation))
    objects[i].transform.matrix = matrix


@ti.kernel
def update_all_transform():
    for i in objects:
        update_transform(i)


def build_scene():
    update_all_transform()
