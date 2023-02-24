import taichi as ti
from taichi.math import length, vec2, vec3, min, max


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


SHAPE_FUNC = {
    SHAPE_SPHERE: sd_sphere,
    SHAPE_BOX: sd_box,
    SHAPE_CYLINDER: sd_cylinder
}
