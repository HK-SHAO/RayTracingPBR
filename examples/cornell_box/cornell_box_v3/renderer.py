import taichi as ti
from taichi.math import vec2, vec3, vec4
from dataclass import Camera
from config import (aspect_ratio, camera_vfov, camera_aperture,
                    camera_focus, SAMPLE_PER_PIXEL, SCREEN_PIXEL_SIZE)
from scene import image_pixels, image_buffer
from pathtracer import raytrace, get_ray
from postprocessor import post_process


@ti.kernel
def render(
        camera_position: vec3,
        camera_lookat: vec3,
        camera_up: vec3,
        moving: bool):

    camera = Camera()
    camera.lookfrom = camera_position
    camera.lookat = camera_lookat
    camera.vup = camera_up
    camera.aspect = aspect_ratio
    camera.vfov = camera_vfov
    camera.aperture = camera_aperture
    camera.focus = camera_focus

    for i, j in image_pixels:
        if moving:
            image_buffer[i, j] = vec4(0)  # ToDo: Reprojection

        for _ in range(SAMPLE_PER_PIXEL):
            coord = vec2(i, j) + vec2(ti.random(), ti.random())
            uv = coord * SCREEN_PIXEL_SIZE

            ray = raytrace(get_ray(camera, uv, vec3(1)))
            image_buffer[i, j] += vec4(ray.color, 1.0)

        buffer = image_buffer[i, j]

        color = post_process(buffer)

        image_pixels[i, j] = color
