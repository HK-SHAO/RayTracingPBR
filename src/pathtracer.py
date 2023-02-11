import taichi as ti
from taichi.math import vec2, vec3, vec4


from .dataclass import SDFObject, Ray, Camera
from .scene import SHAPE_SPLIT, objects
from .fileds import ray_buffer, image_buffer, image_pixels
from .sdf import sd_sphere, sd_cylinder, sd_box, transform
from .camera import get_ray, smooth, aspect_ratio, camera_vfov, camera_aperture, camera_focus
from .config import MIN_DIS, MAX_DIS, MAX_RAYMARCH, VISIBILITY, PIXEL_RADIUS, QUALITY_PER_SAMPLE, SCREEN_PIXEL_SIZE, MAX_RAYTRACE
from .util import at, brightness, sample_float, sample_vec2
from .pbr import ray_surface_interaction
from .ibl import sky_color


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

    if ray.depth > 3 and sample_float() > QUALITY_PER_SAMPLE:
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


@ti.kernel
def sample():
    for i, j in image_pixels:
        ray = ray_buffer[i, j]

        if ray.light == True or ray.depth < 1 or ray.depth > MAX_RAYTRACE:
            # image_buffer[i, j] += vec4(vec3(2.0 / (1.0 + abs(ray.depth) * 2)), 1.0)
            image_buffer[i, j] += vec4(ray.color, 1.0)

            coord = vec2(i, j) + sample_vec2()
            uv = coord * SCREEN_PIXEL_SIZE

            camera = Camera()
            camera.lookfrom = smooth.position[None]
            camera.lookat = smooth.lookat[None]
            camera.vup = smooth.up[None]
            camera.aspect = aspect_ratio[None]
            camera.vfov = camera_vfov[None]
            camera.aperture = camera_aperture[None]
            camera.focus = camera_focus[None]

            ray = get_ray(camera, uv, vec3(1))

        ray = raytrace(ray)
        ray_buffer[i, j] = ray
