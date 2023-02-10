import taichi as ti


from src.config import image_resolution
from src.dataclass import Ray

ray_buffer = Ray.field()
image_buffer = ti.Vector.field(4, float)
image_pixels = ti.Vector.field(3, float)

ti.root.dense(ti.ij, image_resolution).place(ray_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_pixels)
