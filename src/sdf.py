import taichi as ti
from taichi.math import length, vec2, vec3, min, max, dot
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


@ti.func
def sd_none(_: vec3, __: vec3) -> float:
    return MAX_DIS


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
def sd_cone(p: vec3, rh: vec3) -> float:
    q = length(p.xz)
    return max(dot(rh.xz, vec2(q, p.y)), -rh.y-p.y)


@ti.func
def sd_plane(p: vec3, _: vec3) -> float:
    return p.y


SHAPE_FUNC = {
    SHAPE.NONE: sd_none,
    SHAPE.SPHERE: sd_sphere,
    SHAPE.BOX: sd_box,
    SHAPE.CYLINDER: sd_cylinder,
    SHAPE.CONE: sd_cone,
    SHAPE.PLANE: sd_plane,
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
