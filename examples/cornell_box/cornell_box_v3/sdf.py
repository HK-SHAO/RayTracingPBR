import taichi as ti
from taichi.math import (length, vec2, vec3, radians, normalize, min, max)
from dataclass import SDFObject
from config import NORMAL_PRECISION
from util import angle


@ti.func
def sd_box(p: vec3, b: vec3) -> float:
    q = abs(p) - b
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0) - 0.01


@ti.func
def signed_distance(obj: SDFObject, pos: vec3) -> float:
    position = obj.transform.position * 10
    rotation = obj.transform.rotation
    scale = obj.transform.scale * 10

    p = angle(radians(rotation)) @ (pos - position)

    return sd_box(p, scale)


@ti.func
def calc_normal(obj: SDFObject, p: vec3) -> vec3:
    e = vec2(1, -1) * NORMAL_PRECISION
    return normalize(e.xyy * signed_distance(obj, p + e.xyy) +
                     e.yyx * signed_distance(obj, p + e.yyx) +
                     e.yxy * signed_distance(obj, p + e.yxy) +
                     e.xxx * signed_distance(obj, p + e.xxx) )
