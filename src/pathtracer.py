import taichi as ti
from taichi.math import vec3


from src.dataclass import SDFObject, Ray
from src.scene import SHAPE_SPLIT, objects
from src.sdf import sd_sphere, sd_cylinder, sd_box, transform
from src.config import MIN_DIS, MAX_DIS, MAX_RAYMARCH, VISIBILITY, PIXEL_RADIUS, QUALITY_PER_SAMPLE
from src.util import at, brightness, sample_float
from src.pbr import ray_surface_interaction
from src.ibl import sky_color


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
        if dis < min_dis:
            min_dis = dis
            index = i
    for i in ti.static(range(SHAPE_SPLIT[1], SHAPE_SPLIT[2])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_box(pos, scale))
        if dis < min_dis:
            min_dis = dis
            index = i
    for i in ti.static(range(SHAPE_SPLIT[2], SHAPE_SPLIT[3])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_cylinder(pos, scale))
        if dis < min_dis:
            min_dis = dis
            index = i
    return index, min_dis


@ti.func
def raycast(ray: Ray) -> tuple[SDFObject, vec3, bool]:
    t = MIN_DIS
    w, s, d, cerr = 1.6, 0.0, 0.0, 1e32
    index = 0
    position = vec3(0)
    hit = False
    for _ in range(MAX_RAYMARCH):
        position = at(ray, t)
        index, distance = nearest_object(position)

        ld = d
        d = distance
        if w > 1.0 and ld + d < s:
            s -= w * s
            t += s
            w = 1.0
            continue
        err = d / t
        if err < cerr:
            cerr = err

        s = w * d
        t += s
        hit = err < PIXEL_RADIUS
        if t > MAX_DIS or hit:
            break

    return objects[index], position, hit


@ti.func
def raytrace(ray: Ray) -> Ray:
    ray.depth += 1

    if ray.depth > 1 and sample_float() > QUALITY_PER_SAMPLE:
        ray.color = vec3(0)
        ray.depth *= -1
    else:
        ray.color /= QUALITY_PER_SAMPLE
        object, position, hit = raycast(ray)

        if not hit:
            ray.color *= sky_color(ray) * 1.8

        ray = ray_surface_interaction(ray, object, position)

        intensity = brightness(ray.color)
        ray.color *= object.material.emission
        visible = brightness(ray.color)

        ray.light = not hit or intensity < visible

        if visible < VISIBILITY.x or visible > VISIBILITY.y:
            ray.depth *= -1

    return ray
