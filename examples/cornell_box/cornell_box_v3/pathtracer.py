import taichi as ti
from dataclass import SDFObject
from scene import objects, objects_num
from sdf import signed_distance
from taichi.math import vec2, vec3, exp, radians, normalize, cross, tan
from dataclass import Ray, HitRecord, Camera
from config import MIN_DIS, MAX_DIS, MAX_RAYTRACE, MAX_RAYMARCH, VISIBILITY, PIXEL_RADIUS, light_quality
from util import at, random_in_unit_disk, brightness
from pbr import ray_surface_interaction


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
def nearest_object(p: vec3) -> SDFObject:
    o = objects[0]
    o.distance = abs(signed_distance(o, p))
    for i in range(1, objects_num):
        oi = objects[i]
        oi.distance = abs(signed_distance(oi, p))
        if oi.distance < o.distance:
            o = oi
    return o


@ti.func
def raycast(ray: Ray) -> HitRecord:
    record = HitRecord()
    t = MIN_DIS
    w, s, d, cerr = 1.6, 0.0, 0.0, 1e32
    for _ in range(MAX_RAYMARCH):
        record.position = at(ray, t)
        record.object = nearest_object(record.position)

        ld = d
        d = record.object.distance
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
        record.hit = err < PIXEL_RADIUS
        if t > MAX_DIS or record.hit:
            break

    return record


@ti.func
def raytrace(ray: Ray) -> Ray:
    for i in range(MAX_RAYTRACE):
        inv_pdf = exp(float(i) / light_quality)
        roulette_prob = 1.0 - (1.0 / inv_pdf)

        if ti.random() < roulette_prob:
            ray.color *= roulette_prob
            break

        record = raycast(ray)

        if not record.hit:
            ray.color = vec3(0)
            break

        ray = ray_surface_interaction(ray, record)

        intensity = brightness(ray.color)
        ray.color *= record.object.material.emission
        visible = brightness(ray.color)

        if intensity < visible or visible < VISIBILITY:
            break

    return ray
