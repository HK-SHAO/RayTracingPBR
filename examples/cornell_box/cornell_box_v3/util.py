import taichi as ti
from taichi.math import (vec2, vec3, sqrt, sin, cos, pi, dot, mat3)
from dataclass import Ray


@ti.func
def at(r: Ray, t: float) -> vec3:
    return r.origin + t * r.direction


@ti.func
def random_in_unit_disk():
    x = ti.random()
    a = ti.random() * 2 * pi
    return sqrt(x) * vec2(sin(a), cos(a))


@ti.func
def brightness(rgb: vec3) -> float:
    return dot(rgb, vec3(0.299, 0.587, 0.114))


@ti.func
def angle(a: vec3) -> mat3:
    s, c = sin(a), cos(a)
    return mat3(c.z, s.z, 0, -s.z, c.z, 0, 0, 0, 1) @ \
           mat3(c.y, 0, -s.y, 0, 1, 0, s.y, 0, c.y) @ \
           mat3(1, 0, 0, 0, c.x, s.x, 0, -s.x, c.x)