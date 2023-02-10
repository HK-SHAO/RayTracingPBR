import taichi as ti
from taichi.math import vec2, vec3, vec4


from src.dataclass import Camera
from src.config import (aspect_ratio, camera_vfov, camera_aperture,
                        camera_focus, SAMPLE_PER_PIXEL, SCREEN_PIXEL_SIZE, MAX_RAYTRACE)
from src.pathtracer import raytrace
from src.camera import get_ray, smooth_camera
from src.postprocessor import post_process
from src.fileds import image_pixels, image_buffer, ray_buffer
from src.util import sample_vec2


@ti.kernel
def refresh():
    for i, j in image_buffer:
        image_buffer[i, j] = vec4(0)
        ray_buffer[i, j].depth = 0


@ti.kernel
def sample():

    for i, j in image_pixels:
        ray = ray_buffer[i, j]

        if ray.light == True or ray.depth < 1 or ray.depth > MAX_RAYTRACE:
            image_buffer[i, j] += vec4(ray.color, 1.0)
            coord = vec2(i, j) + sample_vec2()
            uv = coord * SCREEN_PIXEL_SIZE

            camera = Camera()
            camera.lookfrom = smooth_camera.position[None]
            camera.lookat = smooth_camera.lookat[None]
            camera.vup = smooth_camera.up[None]
            camera.aspect = aspect_ratio
            camera.vfov = camera_vfov
            camera.aperture = camera_aperture
            camera.focus = camera_focus

            ray = get_ray(camera, uv, vec3(1.0))

        ray = raytrace(ray)
        ray_buffer[i, j] = ray


def render(frame: int):

    if smooth_camera.moving[None]:
        refresh()

    for i in range(SAMPLE_PER_PIXEL):
        sample()
        print('frame:', frame, 'sample:', i + 1)

    post_process()
