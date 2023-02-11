import taichi as ti
from taichi.math import vec2, vec3, sqrt, sin, cos, pi, dot, mat3, atan2, asin


from .dataclass import Ray


@ti.func
def at(r: Ray, t: float) -> vec3:
    return r.origin + t * r.direction


@ti.func
def random_in_unit_disk() -> vec2:
    vec = sample_vec2()
    x = vec.x
    a = vec.y * 2 * pi
    return sqrt(x) * vec2(sin(a), cos(a))


@ti.func
def random_in_unit_sphere() -> vec3:
    vec = sample_vec2()
    z = 2.0 * vec.x - 1.0
    a = vec.y * 2.0 * pi

    xy = sqrt(1.0 - z*z) * vec2(sin(a), cos(a))
    return vec3(xy, z)


@ti.func
def brightness(rgb: vec3) -> float:
    return dot(rgb, vec3(0.299, 0.587, 0.114))


@ti.func
def rotate(a: vec3) -> mat3:
    s, c = sin(a), cos(a)
    return \
        mat3(c.z, s.z, 0, -s.z, c.z, 0, 0, 0, 1) @ \
        mat3(c.y, 0, -s.y, 0, 1, 0, s.y, 0, c.y) @ \
        mat3(1, 0, 0, 0, c.x, s.x, 0, -s.x, c.x)


@ti.func
def sample_spherical_map(v: vec3) -> vec2:
    uv = vec2(atan2(v.z, v.x), asin(v.y))
    uv *= vec2(0.5 / pi, 1 / pi)
    uv += 0.5
    return uv


@ti.func
def sample_float() -> float:
    return ti.random()


@ti.func
def sample_vec2() -> vec2:
    return vec2(ti.random(), ti.random())
