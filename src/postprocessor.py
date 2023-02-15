import taichi as ti
from taichi.math import vec2, vec3, mat3, clamp


from .camera import camera_exposure, camera_gamma
from .fileds import image_pixels, image_buffer, diff_pixels, diff_buffer
from .util import brightness

ACESInputMat = mat3(
    0.59719, 0.35458, 0.04823,
    0.07600, 0.90834, 0.01566,
    0.02840, 0.13383, 0.83777
)

ACESOutputMat = mat3(
    +1.60475, -0.53108, -0.07367,
    -0.10208, +1.10813, -0.00605,
    -0.00327, -0.07276, +1.07602
)


@ti.func
def RRTAndODTFit(v: vec3) -> vec3:
    a = v * (v + 0.0245786) - 0.000090537
    b = v * (0.983729 * v + 0.4329510) + 0.238081
    return a / b


@ti.func
def ACESFitted(color: vec3) -> vec3:
    color = ACESInputMat  @ color
    color = RRTAndODTFit(color)
    color = ACESOutputMat @ color
    return color


@ti.kernel
def post_process():
    for i, j in image_pixels:
        last_color = image_pixels[i, j]
        buffer = image_buffer[i, j]

        color = buffer.rgb / buffer.a
        color *= camera_exposure[None]
        color = pow(color, vec3(1.0 / camera_gamma))
        color = ACESFitted(color)

        image_pixels[i, j] = clamp(color, 0, 1)

        diff_color = abs(image_pixels[i, j] - last_color)
        diff_buffer[i, j] += vec2(brightness(diff_color), 1.0)
        diff_pixels[i, j] = diff_buffer[i, j].x / diff_buffer[i, j].y
