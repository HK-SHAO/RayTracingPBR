import taichi as ti
from taichi.math import vec3, mat3


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
def ACESFitted(rgb: vec3) -> vec3:
    rgb = ACESInputMat  @ rgb
    rgb = RRTAndODTFit(rgb)
    rgb = ACESOutputMat @ rgb
    return rgb
