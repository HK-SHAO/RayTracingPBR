import taichi as ti
from taichi.math import vec3, vec4


from src.config import image_resolution
from src.dataclass import Ray

ray_buffer = Ray.field()
image_buffer = vec4.field()
image_pixels = vec3.field()

ti.root.dense(ti.ij, image_resolution).place(ray_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_pixels)
