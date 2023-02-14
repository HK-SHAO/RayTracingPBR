import taichi as ti
from taichi.math import vec2, vec3, vec4


from .dataclass import SDFObject, Ray, Camera
from .config import MIN_DIS, MAX_DIS, MAX_RAYMARCH, VISIBILITY, PIXEL_RADIUS, QUALITY_PER_SAMPLE, SCREEN_PIXEL_SIZE, MAX_RAYTRACE, SAMPLES_PER_FRAME
from .fileds import ray_buffer, image_buffer, image_pixels
from .camera import get_ray, smooth, aspect_ratio, camera_vfov, camera_aperture, camera_focus
from .scene import objects
from .util import at, brightness, sample_float, sample_vec2
from .pbr import ray_surface_interaction
from .sdf import nearest_object
from .ibl import sky_color


@ti.func
def raycast(ray: Ray) -> tuple[Ray, SDFObject, vec3, bool]:
    w, s, d, cerr = 1.6, 0.0, 0.0, 1e32
    index, t, position, hit = 0, MIN_DIS, vec3(0), False

    for _ in range(MAX_RAYMARCH):
        ray.depth += 1
        position = at(ray, t)
        index, distance = nearest_object(position)

        ld, d = d, distance
        if ld + d < s:
            s -= w * s
            t += s
            w *= 0.5
            w += 0.5
            continue
        err = d / t
        if err < cerr:
            cerr = err

        s = w * d
        t += s
        hit = err < PIXEL_RADIUS
        if hit or t > MAX_DIS:
            break

    return ray, objects[index], position, hit


@ti.func
def raytrace(ray: Ray) -> Ray:
    if sample_float() > QUALITY_PER_SAMPLE:
        ray.color = vec3(0)
        ray.depth *= -1
    else:
        ray.color *= 1.0 / QUALITY_PER_SAMPLE
        ray, object, position, hit = raycast(ray)

        if hit:
            ray = ray_surface_interaction(ray, object, position)

            intensity = brightness(ray.color)
            ray.color *= object.material.emission
            visible = brightness(ray.color)

            ray.light = intensity < visible

            if visible < VISIBILITY.x or visible > VISIBILITY.y:
                ray.depth *= -1
        else:
            ray.color *= sky_color(ray)
            ray.light = True

    return ray


@ti.func
def gen_ray(uv: vec2) -> Ray:
    camera = Camera()
    camera.lookfrom = smooth.position[None]
    camera.lookat = smooth.lookat[None]
    camera.vup = smooth.up[None]
    camera.aspect = aspect_ratio[None]
    camera.vfov = camera_vfov[None]
    camera.aperture = camera_aperture[None]
    camera.focus = camera_focus[None]

    return get_ray(camera, uv, vec3(1))


@ti.kernel
def sample():
    for i, j in image_pixels:
        ray = ray_buffer[i, j]

        for _ in ti.static(range(SAMPLES_PER_FRAME)):
            if ray.light == True or ray.depth < 1 or ray.depth > MAX_RAYTRACE:
                image_buffer[i, j] += vec4(ray.color, 1.0)

                coord = vec2(i, j) + sample_vec2()
                uv = coord * SCREEN_PIXEL_SIZE

                ray = gen_ray(uv)

            ray = raytrace(ray)

        ray_buffer[i, j] = ray
