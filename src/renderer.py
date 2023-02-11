import taichi as ti
from taichi.math import vec2, vec3, vec4


from src.dataclass import Camera
from src.config import SAMPLE_PER_PIXEL, SCREEN_PIXEL_SIZE, MAX_RAYTRACE
from src.pathtracer import raytrace
from src.camera import get_ray, smooth, aspect_ratio, camera_vfov, camera_aperture, camera_focus
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


def render():
    if smooth.moving[None]:
        refresh()

    for _ in range(SAMPLE_PER_PIXEL):
        sample()

    post_process()
