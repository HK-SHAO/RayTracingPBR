import taichi as ti
from taichi.math import vec2


ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)

image_resolution = (1920 * 4 // 10, 1080 * 4 // 10)

SAMPLES_PER_PIXEL = 1
SAMPLES_PER_FRAME = 1
QUALITY_PER_SAMPLE = 0.9

VISIBILITY = vec2(1e-4, 1e4)
NOISE_THRESHOLD = 1e-4

SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)
PIXEL_RADIUS = 0.5 * min(SCREEN_PIXEL_SIZE.x, SCREEN_PIXEL_SIZE.y)

MIN_DIS = 0.005
MAX_DIS = 1e3

MAX_RAYMARCH = 512
MAX_RAYTRACE = 512

ENV_IOR = 1.000277

SHAPE_NONE = 0
SHAPE_SPHERE = 1
SHAPE_BOX = 2
SHAPE_CYLINDER = 3
