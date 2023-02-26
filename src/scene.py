import taichi as ti
from taichi.math import vec3, radians


from .dataclass import SDFObject, Transform, Material, Ray
from .config import MAX_RAYMARCH, MAX_DIS, PIXEL_RADIUS
from .sdf import SHAPE, SHAPE_FUNC, calc_pos_scale, normal
from .util import rotate


OBJECTS = sorted([
    SDFObject(type=SHAPE.SPHERE,
              transform=Transform(vec3(0, -100.501, 0), vec3(0), vec3(100)),
              material=Material(vec3(1, 1, 1)*0.6, vec3(1), 1.0, 1.0, 0, 1.100)),
    SDFObject(type=SHAPE.SPHERE,
              transform=Transform(vec3(0, 0, 0), vec3(0), vec3(0.5)),
              material=Material(vec3(1, 1, 1)*0.9, vec3(1, 10, 1), 0, 1, 0, 1.000)),
    SDFObject(type=SHAPE.SPHERE,
              transform=Transform(vec3(1, -0.2, 0), vec3(0), vec3(0.3)),
              material=Material(vec3(0.2, 0.2, 1)*0.9, vec3(1), 0.2, 1, 0, 1.100)),
    SDFObject(type=SHAPE.SPHERE,
              transform=Transform(vec3(0.0, -0.2, 2), vec3(0), vec3(0.3)),
              material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 0, 1, 1.500)),
    SDFObject(type=SHAPE.CYLINDER,
              transform=Transform(vec3(-1.0, -0.2, 0), vec3(0), vec3(0.3)),
              material=Material(vec3(1.0, 0.2, 0.2)*0.9, vec3(1), 0, 0, 0, 1.460)),
    SDFObject(type=SHAPE.BOX,
              transform=Transform(vec3(0, 0, 5), vec3(0), vec3(2, 1, 0.2)),
              material=Material(vec3(1, 1, 0.2)*0.9, vec3(1), 0, 1, 0, 0.470)),
    SDFObject(type=SHAPE.BOX,
              transform=Transform(vec3(0, 0, -2), vec3(0), vec3(2, 1, 0.2)),
              material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 1, 0, 2.950))
], key=lambda o: o.type)

SHAPES = list(set([o.type for o in OBJECTS]))


objects = SDFObject.field()
ti.root.dense(ti.i, len(OBJECTS)).place(objects)
for i in range(objects.shape[0]):
    objects[i] = OBJECTS[i]


@ti.func
def nearest(p: vec3) -> tuple[int, float]:
    index, min_dis = 0, MAX_DIS

    for i in ti.static(range(len(OBJECTS))):
        shape = ti.static(OBJECTS[i].type)
        pos, scale = calc_pos_scale(objects[i], p)
        dis = abs(SHAPE_FUNC[shape](pos, scale))

        if dis < min_dis:
            index, min_dis = i, dis

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

        hit = distance < t * PIXEL_RADIUS
        if hit or t >= MAX_DIS:
            break

    ray.depth += 1
    return ray, objects[index], hit


@ti.func
def calc_normal(obj: SDFObject, p: vec3) -> vec3:
    n = vec3(0)
    for shape in ti.static(SHAPES):
        if obj.type == shape:
            n = normal(shape, obj, p)
        # else:
        #   ...

    return n


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
