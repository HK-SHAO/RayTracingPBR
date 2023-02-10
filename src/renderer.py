import taichi as ti
from taichi.math import vec2, vec3, vec4


from src.dataclass import Camera
from src.config import (aspect_ratio, camera_vfov, camera_aperture,
                        camera_focus, SAMPLE_PER_PIXEL, SCREEN_PIXEL_SIZE, MAX_RAYTRACE)
from src.pathtracer import raytrace, get_ray
from src.postprocessor import post_process
from src.fileds import image_pixels, image_buffer, ray_buffer
from src.util import sample_vec2


@ti.kernel
def refresh():
    image_buffer.fill(vec4(0))


@ti.kernel
def sample(
        camera_position: vec3,
        camera_lookat: vec3,
        camera_up: vec3):

    for i, j in image_pixels:
        ray = ray_buffer[i, j]

        if ray.light == True:
            image_buffer[i, j] += vec4(ray.color, 1.0)
        if ray.light == True or ray.depth < 1 or ray.depth > MAX_RAYTRACE:
            coord = vec2(i, j) + sample_vec2()
            uv = coord * SCREEN_PIXEL_SIZE

            camera = Camera()
            camera.lookfrom = camera_position
            camera.lookat = camera_lookat
            camera.vup = camera_up
            camera.aspect = aspect_ratio
            camera.vfov = camera_vfov
            camera.aperture = camera_aperture
            camera.focus = camera_focus

            ray = get_ray(camera, uv, vec3(1.0))

        ray = raytrace(ray)
        ray_buffer[i, j] = ray


def render(
        camera_position: vec3,
        camera_lookat: vec3,
        camera_up: vec3,
        moving: bool,
        frame: int):

    if moving:
        refresh()

    for i in range(SAMPLE_PER_PIXEL):
        sample(
            camera_position,
            camera_lookat,
            camera_up)
        print('frame:', frame, 'sample:', i + 1)

    post_process()
