import taichi as ti
from taichi.math import vec3
from dataclass import SDFObject, Transform, Material
from config import image_resolution

SCENE_LIST = [
    SDFObject(transform=Transform(vec3(0, 0, -1), vec3(0, 0, 0), vec3(1, 1, 0.2)),
              material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(transform=Transform(vec3(0, 1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
              material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),
    SDFObject(transform=Transform(vec3(0, -1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
              material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(transform=Transform(vec3(-1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
              material=Material(vec3(1, 0, 0)*0.5, vec3(1), 1, 0, 0, 1.530)),
    SDFObject(transform=Transform(vec3(1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
              material=Material(vec3(0, 1, 0)*0.5, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(transform=Transform(vec3(-0.275, -0.3, -0.2), vec3(0, -253, 0), vec3(0.25, 0.5, 0.25)),
              material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),
    SDFObject(transform=Transform(vec3(0.275, -0.55, 0.2), vec3(0, -197, 0), vec3(0.25, 0.25, 0.25)),
              material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(transform=Transform(vec3(0, 0.809, 0), vec3(90, 0, 0), vec3(0.2, 0.2, 0.01)),
              material=Material(vec3(1, 1, 1), vec3(100), 1, 0, 0, 1)),
]

ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)

image_buffer = ti.Vector.field(4, float, image_resolution)
image_pixels = ti.Vector.field(3, float, image_resolution)

objects_num = len(SCENE_LIST)
objects = SDFObject.field(shape=objects_num)
for i in range(objects_num):
    objects[i] = SCENE_LIST[i]
