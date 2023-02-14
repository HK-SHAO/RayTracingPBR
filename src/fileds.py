import taichi as ti
from taichi.math import vec3, vec4


from .config import image_resolution
from .dataclass import Ray

ray_buffer = Ray.field()
image_buffer = vec4.field()
image_pixels = vec3.field()

ti.root.dense(ti.ij, image_resolution).place(ray_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_pixels)

u_frame = ti.field(dtype=ti.i32, shape=())
