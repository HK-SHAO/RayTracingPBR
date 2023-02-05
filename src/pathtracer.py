import taichi as ti
from taichi.math import vec2, vec3, exp, radians, normalize, cross, tan


from src.dataclass import SDFObject
from src.scene import SHAPE_SPLIT, objects
from src.sdf import sd_sphere, sd_cylinder, sd_box, transform
from src.dataclass import Ray, Camera
from src.config import MIN_DIS, MAX_DIS, MAX_RAYTRACE, MAX_RAYMARCH, VISIBILITY, PIXEL_RADIUS, light_quality
from src.util import at, random_in_unit_disk, brightness
from src.pbr import ray_surface_interaction
from src.ibl import sky_color


@ti.func
def get_ray(c: Camera, uv: vec2, color: vec3) -> Ray:
    theta = radians(c.vfov)
    half_height = tan(theta * 0.5)
    half_width = c.aspect * half_height

    z = normalize(c.lookfrom - c.lookat)
    x = normalize(cross(c.vup, z))
    y = cross(z, x)

    lens_radius = c.aperture * 0.5
    rud = lens_radius * random_in_unit_disk()
    offset = x * rud.x + y * rud.y

    hwfx = half_width * c.focus * x
    hhfy = half_height * c.focus * y

    lower_left_corner = c.lookfrom - hwfx - hhfy - c.focus * z
    horizontal = 2.0 * hwfx
    vertical = 2.0 * hhfy

    ro = c.lookfrom + offset
    po = lower_left_corner + uv.x * horizontal + uv.y * vertical
    rd = normalize(po - ro)

    return Ray(ro, rd, color)


@ti.func
def get_object_pos_scale(i: int, p: vec3) -> tuple[vec3, vec3]:
    obj = objects[i]
    pos = transform(obj.transform, p)
    return pos, obj.transform.scale


@ti.func
def nearest_object(p: vec3) -> tuple[int, float]:
    index = 0
    min_dis = MAX_DIS
    for i in range(SHAPE_SPLIT[0], SHAPE_SPLIT[1]):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_sphere(pos, scale))
        if dis < min_dis:
            min_dis = dis
            index = i
    for i in range(SHAPE_SPLIT[1], SHAPE_SPLIT[2]):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_box(pos, scale))
        if dis < min_dis:
            min_dis = dis
            index = i
    for i in range(SHAPE_SPLIT[2], SHAPE_SPLIT[3]):
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
    # inv_pdf = exp(float(ray.depth) / light_quality)
    # roulette_prob = 1.0 - (1.0 / inv_pdf)

    ray.depth += 1

    # if ti.random() < roulette_prob:
    #     ray.color *= roulette_prob
    #     ray.depth *= -1

    object, position, hit = raycast(ray)

    if not hit:
        ray.color *= sky_color(ray) * 1.8
        ray.light = True

    ray = ray_surface_interaction(ray, object, position)

    intensity = brightness(ray.color)
    ray.color *= object.material.emission
    visible = brightness(ray.color)

    ray.light = ray.light or intensity < visible
    
    if visible < VISIBILITY.x or visible > VISIBILITY.y:
        ray.depth *= -1

    return ray
