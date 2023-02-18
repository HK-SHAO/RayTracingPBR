import taichi as ti
from taichi.math import length, vec2, vec3, normalize, min, max


from .dataclass import SDFObject, Transform
from .config import MAX_DIS


SHAPE_NONE = 0
SHAPE_SPHERE = 1
SHAPE_BOX = 2
SHAPE_CYLINDER = 3


@ti.func
def sd_sphere(p: vec3, r: vec3) -> float:
    return length(p) - r.x


@ti.func
def sd_box(p: vec3, b: vec3) -> float:
    q = abs(p) - b
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0) - 0.03


@ti.func
def sd_cylinder(p: vec3, rh: vec3) -> float:
    d = abs(vec2(length(p.xz), p.y)) - rh.xy
    return min(max(d.x, d.y), 0) + length(max(d, 0))


@ti.func
def transform(t: Transform, p: vec3) -> vec3:
    p -= t.position  # Cannot squeeze the Euclidean space of distance field
    p = t.matrix @ p  # Otherwise the correct ray marching is not possible
    return p


@ti.func
def signed_distance(obj: SDFObject, pos: vec3) -> float:
    scale = obj.transform.scale
    p = transform(obj.transform, pos)

    if obj.type == SHAPE_SPHERE:
        obj.distance = sd_sphere(p, scale)
    elif obj.type == SHAPE_BOX:
        obj.distance = sd_box(p, scale)
    elif obj.type == SHAPE_CYLINDER:
        obj.distance = sd_cylinder(p, scale)
    else:
        obj.distance = MAX_DIS

    return obj.distance


@ti.func
def calc_normal(obj: SDFObject, p: vec3) -> vec3:
    e = vec2(1, -1) * 0.5773 * 0.005
    return normalize(e.xyy * signed_distance(obj, p + e.xyy) +
                     e.yyx * signed_distance(obj, p + e.yyx) +
                     e.yxy * signed_distance(obj, p + e.yxy) +
                     e.xxx * signed_distance(obj, p + e.xxx))
