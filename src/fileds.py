import taichi as ti
from taichi.math import vec2, vec3, vec4


from .config import image_resolution
from .dataclass import Ray

ray_buffer = Ray.field()
image_buffer = vec4.field()
image_pixels = vec3.field()

diff_buffer = vec2.field()
diff_pixels = ti.field(dtype=ti.f32)

ti.root.dense(ti.ij, image_resolution).place(ray_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_pixels)

ti.root.dense(ti.ij, image_resolution).place(diff_buffer)
ti.root.dense(ti.ij, image_resolution).place(diff_pixels)

u_frame = ti.field(dtype=ti.i32, shape=())
