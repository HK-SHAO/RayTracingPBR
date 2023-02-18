import taichi as ti


from .config import image_resolution
from .dataclass import Ray

ray_buffer = Ray.field()
image_buffer = ti.Vector.field(4, float)
image_pixels = ti.Vector.field(3, float)

diff_buffer = ti.Vector.field(2, float)
diff_pixels = ti.field(float)

ti.root.dense(ti.ij, image_resolution).place(ray_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_pixels)

ti.root.dense(ti.ij, image_resolution).place(diff_buffer)
ti.root.dense(ti.ij, image_resolution).place(diff_pixels)

u_frame = ti.field(dtype=int, shape=())
