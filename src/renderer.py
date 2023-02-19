import taichi as ti
from taichi.math import vec2, vec4


from .config import SAMPLES_PER_FRAME, ADAPTIVE_SAMPLING
from .camera import smooth
from .pathtracer import pathtrace
from .postprocessor import post_process
from .fileds import image_buffer, ray_buffer, diff_pixels, diff_buffer


@ti.kernel
def refresh():
    for i, j in image_buffer:
        image_buffer[i, j] = vec4(0)
        ray_buffer[i, j].depth = 0

        if ti.static(ADAPTIVE_SAMPLING):
            diff_buffer[i, j] = vec2(1)
            diff_pixels[i, j] = 1e32

        # ToDo: Reprojection


def render(refreshing):
    if refreshing or smooth.moving[None]:
        refresh()

    for _ in range(SAMPLES_PER_FRAME):
        pathtrace()

    post_process()
