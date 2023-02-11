import taichi as ti
from taichi.math import vec3, mat3, clamp


from src.camera import camera_exposure, camera_gamma
from src.fileds import image_pixels, image_buffer

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
        buffer = image_buffer[i, j]

        color = buffer.rgb / buffer.a
        color *= camera_exposure[None]
        color = ACESFitted(color)
        color = pow(color, vec3(1.0 / camera_gamma))

        image_pixels[i, j] = clamp(color, 0, 1)
