import taichi as ti
from taichi.math import vec2, vec3, vec4, clamp


from .config import ADAPTIVE_SAMPLING
from .camera import camera_exposure, camera_gamma
from .fileds import image_pixels, image_buffer, diff_pixels, diff_buffer
from .util import brightness
from .aces import ACESFitted


@ti.func
def average(rgba: vec4) -> vec3:
    return rgba.rgb / rgba.a


@ti.func
def adjust(rgb: vec3, exposure: float, gamma: float) -> vec3:
    rgb *= exposure
    rgb = pow(rgb, gamma)
    return rgb


@ti.kernel
def post_process():
    for i, j in image_pixels:
        last_color = image_pixels[i, j]
        buffer = image_buffer[i, j]

        # ToDo: Post Denoise
        exposure = camera_exposure[None]
        gamma = ti.static(1.0 / camera_gamma)

        color = average(buffer)
        color = adjust(color, exposure, gamma)
        color = ACESFitted(color)

        image_pixels[i, j] = clamp(color, 0, 1)

        if ti.static(ADAPTIVE_SAMPLING):
            diff_color = abs(image_pixels[i, j] - last_color)
            diff_buffer[i, j] += vec2(brightness(diff_color), 1.0)
            diff_pixels[i, j] = diff_buffer[i, j].x / diff_buffer[i, j].y
