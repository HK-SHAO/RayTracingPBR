import taichi as ti
from taichi.math import vec2, vec3, vec4


from .dataclass import Ray, Camera
from .fileds import ray_buffer, image_buffer, image_pixels, diff_pixels
from .config import (VISIBILITY, QUALITY_PER_SAMPLE, SCREEN_PIXEL_SIZE, ADAPTIVE_SAMPLING,
                     MAX_RAYTRACE, SAMPLES_PER_PIXEL, NOISE_THRESHOLD, BLACK_BACKGROUND)
from .camera import get_ray, smooth, aspect_ratio, camera_vfov, camera_aperture, camera_focus
from .util import brightness, sample_float, sample_vec2
from .pbr import ray_surface_interaction
from .ibl import sky_color
from .scene import raycast


@ti.func
def raytrace(ray: Ray) -> Ray:
    ray, object, hit = raycast(ray)

    if hit:
        ray = ray_surface_interaction(ray, object)

        intensity = brightness(ray.color)
        ray.color *= object.material.emission
        visible = brightness(ray.color)

        stop = intensity < visible or visible < VISIBILITY.x or visible > VISIBILITY.y
        ray.depth *= -1 if stop else 1
    else:
        ray.depth *= -1
        ray.color *= sky_color(ray)

        if ti.static(BLACK_BACKGROUND):
            ray.color *= float(ray.depth < -1)

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


@ti.func
def track_once(ray: Ray, i: int, j: int) -> Ray:
    if ray.depth < 1 or ray.depth > MAX_RAYTRACE:
        image_buffer[i, j] += vec4(ray.color, 1.0)

        coord = vec2(i, j) + sample_vec2()
        uv = coord * SCREEN_PIXEL_SIZE
        ray = gen_ray(uv)

    return raytrace(ray)


@ti.func
def russian_roulette(ray: Ray, i: int, j: int) -> Ray:
    roulette_prob = 1.0 if ray.depth == 0 else QUALITY_PER_SAMPLE
    roulette_prob -= ray.depth * ti.static(1.0 / MAX_RAYTRACE)

    if sample_float() > roulette_prob:
        ray.color = vec3(0)
        ray.depth *= -1
    else:
        ray.color *= 1.0 / roulette_prob
        ray = track_once(ray, i, j)

    return ray


@ti.func
def sample(i: int, j: int):
    ray = ray_buffer[i, j]

    if ti.static(SAMPLES_PER_PIXEL <= 4):
        for _ in ti.static(range(SAMPLES_PER_PIXEL)):
            ray = russian_roulette(ray, i, j)
    else:
        for _ in range(SAMPLES_PER_PIXEL):
            ray = russian_roulette(ray, i, j)

    ray_buffer[i, j] = ray


@ti.kernel
def pathtrace():
    for i, j in image_pixels:
        if ti.static(ADAPTIVE_SAMPLING):
            # ToDo: Shader Execution Reordering
            diff = diff_pixels[i, j]  # for self-adaptive sampling
            if diff > NOISE_THRESHOLD:
                sample(i, j)
        else:
            sample(i, j)
