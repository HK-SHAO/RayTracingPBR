import taichi as ti
from taichi.math import length, vec2, vec3, min, max, dot, mod
from enum import IntEnum

from .dataclass import Transform, SDFObject
from .config import MAX_DIS


# from https://iquilezles.org/articles/distfunctions/


class SHAPE(IntEnum):
    NONE = 0
    SPHERE = 1
    BOX = 2
    CYLINDER = 3
    CONE = 4
    PLANE = 5
    MENGER = 6


@ti.func
def sd_none(_: vec3, __: vec3) -> float:
    return MAX_DIS


@ti.func
def sd_sphere(p: vec3, r: vec3) -> float:
    return length(p) - r.x


@ti.func
def sd_box(p: vec3, b: vec3) -> float:
    q = abs(p) - b
    return length(max(q, 0)) + min(q.max(), 0)


@ti.func
def sd_cylinder(p: vec3, rh: vec3) -> float:
    d = abs(vec2(length(p.xz), p.y)) - rh.xy
    return min(max(d.x, d.y), 0) + length(max(d, 0))


@ti.func
def sd_cone(p: vec3, rh: vec3) -> float:
    q = length(p.xz)
    return max(dot(rh.xz, vec2(q, p.y)), -rh.y-p.y)


@ti.func
def sd_plane(p: vec3, _: vec3) -> float:
    return p.y


@ti.func
def sd_menger(p: vec3, _: vec3) -> float:
    q = abs(p) - 1.0
    d = min(q.max(), length(max(q, 0.0)))

    s = 1.0
    for _ in ti.static(range(4)):
        a = mod(p*s, 2.0)-1.0
        s *= 3.0
        r = abs(1.0 - 3.0*abs(a))
        da = max(r.x, r.y)
        db = max(r.y, r.z)
        dc = max(r.z, r.x)
        c = (min(da, min(db, dc))-1.0) / s

        d = max(d, c)

    return d


SHAPE_FUNC = {
    SHAPE.NONE: sd_none,
    SHAPE.SPHERE: sd_sphere,
    SHAPE.BOX: sd_box,
    SHAPE.CYLINDER: sd_cylinder,
    SHAPE.CONE: sd_cone,
    SHAPE.PLANE: sd_plane,
    SHAPE.MENGER: sd_menger,
}


@ti.func
def transform(t: Transform, p: vec3) -> vec3:
    p -= t.position  # Cannot squeeze the Euclidean space of distance field
    p = t.matrix @ p  # Otherwise the correct ray marching is not possible
    return p


@ti.func
def calc_pos_scale(obj: SDFObject, p: vec3) -> tuple[vec3, vec3]:
    pos = transform(obj.transform, p)
    return pos, obj.transform.scale
