import taichi as ti
from taichi.math import vec2


ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)

image_resolution = (1920 // 4, 1080 // 4)

SAMPLE_PER_PIXEL = 1

SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)
PIXEL_RADIUS = 0.5 * min(SCREEN_PIXEL_SIZE.x, SCREEN_PIXEL_SIZE.y)

MIN_DIS = 0.005
MAX_DIS = 2000.0
VISIBILITY = 0.000001

MAX_RAYMARCH = 512
MAX_RAYTRACE = 128

ENV_IOR = 1.000277

SHAPE_NONE = 0
SHAPE_SPHERE = 1
SHAPE_BOX = 2
SHAPE_CYLINDER = 3

aspect_ratio = SCREEN_PIXEL_SIZE.y / SCREEN_PIXEL_SIZE.x
light_quality = 128.0
camera_exposure = 1
camera_vfov = 35
camera_aperture = 0.01
camera_focus = 4
camera_gamma = 2.2
