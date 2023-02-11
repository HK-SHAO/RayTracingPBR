import taichi as ti
from taichi.math import vec3, radians


from .dataclass import SDFObject, Transform, Material
from .config import SHAPE_SPHERE, SHAPE_CYLINDER, SHAPE_BOX
from .util import rotate

OBJECTS_LIST = sorted([
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(0, -100.501, 0), vec3(0), vec3(100)),
              material=Material(vec3(1, 1, 1)*0.6, vec3(1), 1, 1, 0, 1.635)),
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(0, 0, 0), vec3(0), vec3(0.5)),
              material=Material(vec3(1, 1, 1), vec3(1, 10, 1), 1, 0, 0, 1)),
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(1, -0.2, 0), vec3(0), vec3(0.3)),
              material=Material(vec3(0.2, 0.2, 1), vec3(1), 0.2, 1, 0, 1.100)),
    SDFObject(type=SHAPE_SPHERE,
              transform=Transform(vec3(0.0, -0.2, 2), vec3(0), vec3(0.3)),
              material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 0, 1, 1.5)),
    SDFObject(type=SHAPE_CYLINDER,
              transform=Transform(vec3(-1.0, -0.2, 0), vec3(0), vec3(0.3)),
              material=Material(vec3(1.0, 0.2, 0.2), vec3(1), 0, 0, 0, 1.460)),
    SDFObject(type=SHAPE_BOX,
              transform=Transform(vec3(0, 0, 5), vec3(0), vec3(2, 1, 0.2)),
              material=Material(vec3(1, 1, 0.2)*0.9, vec3(1), 0, 1, 0, 0.470)),
    SDFObject(type=SHAPE_BOX,
              transform=Transform(vec3(0, 0, -2), vec3(0), vec3(2, 1, 0.2)),
              material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 1, 0, 2.950))
], key=lambda o: o.type)

SHAPE_SPLIT = [0, 0, 0, 0]
for o in OBJECTS_LIST:
    SHAPE_SPLIT[o.type] += 1
for i in range(1, len(SHAPE_SPLIT)):
    SHAPE_SPLIT[i] += SHAPE_SPLIT[i - 1]

objects = SDFObject.field()
ti.root.dense(ti.i, len(OBJECTS_LIST)).place(objects)
for i in range(objects.shape[0]):
    objects[i] = OBJECTS_LIST[i]


@ti.func
def update_transform(i: int):
    transform = objects[i].transform
    matrix = rotate(radians(transform.rotation))
    objects[i].transform.matrix = matrix


@ti.kernel
def update_all_transform():
    for i in objects:
        update_transform(i)


def build_scene():
    update_all_transform()
