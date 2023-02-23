import taichi as ti
from taichi.math import vec3, radians


from .dataclass import SDFObject, Transform, Material, Ray
from .config import MAX_RAYMARCH, MIN_DIS, MAX_DIS, PIXEL_RADIUS
from .sdf import SHAPE_SPHERE, SHAPE_CYLINDER, SHAPE_BOX, sd_sphere, sd_box, sd_cylinder, transform
from .util import rotate, at


OBJECTS_LIST = sorted([
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

SHAPE_SPLIT = [0, 0, 0, 0]
for o in OBJECTS_LIST:
    SHAPE_SPLIT[o.type] += 1
for i in range(1, len(SHAPE_SPLIT)):
    SHAPE_SPLIT[i] += SHAPE_SPLIT[i - 1]

objects = SDFObject.field()
ti.root.dense(ti.i, len(OBJECTS_LIST)).place(objects)
for i in range(objects.shape[0]):
    objects[i] = OBJECTS_LIST[i]


@ti.func
def get_object_pos_scale(i: int, p: vec3) -> tuple[vec3, vec3]:
    obj = objects[i]
    pos = transform(obj.transform, p)
    return pos, obj.transform.scale


@ti.func
def nearest_object(p: vec3) -> tuple[int, float]:
    index = 0
    min_dis = MAX_DIS
    for i in ti.static(range(SHAPE_SPLIT[0], SHAPE_SPLIT[1])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_sphere(pos, scale))
        update = dis < min_dis
        min_dis = dis if update else min_dis
        index = i if update else index
    for i in ti.static(range(SHAPE_SPLIT[1], SHAPE_SPLIT[2])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_box(pos, scale))
        update = dis < min_dis
        min_dis = dis if update else min_dis
        index = i if update else index
    for i in ti.static(range(SHAPE_SPLIT[2], SHAPE_SPLIT[3])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_cylinder(pos, scale))
        update = dis < min_dis
        min_dis = dis if update else min_dis
        index = i if update else index
    return index, min_dis


@ti.func
def raycast(ray: Ray) -> tuple[Ray, SDFObject, bool]:
    t, w, s, d = 0.0, 1.6, 0.0, 0.0
    index, hit = 0, False

    for _ in range(MAX_RAYMARCH):
        index, distance = nearest_object(ray.origin)

        ld, d = d, distance
        if w > 1.0 and ld + d < s:
            s -= w * s
            t += s
            w = 1.0
            ray.origin += ray.direction * s
            continue
        s = w * d
        t += s
        ray.origin += ray.direction * s

        err = d / t
        hit = err < PIXEL_RADIUS
        if hit or t > MAX_DIS:
            break

    ray.depth += 1
    return ray, objects[index], hit


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
