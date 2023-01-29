from taichi.math import *

image_resolution = (512, 512)
SAMPLE_PER_PIXEL = 1

SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)
PIXEL_RADIUS      = 0.5 * min(SCREEN_PIXEL_SIZE.x, SCREEN_PIXEL_SIZE.y)

MIN_DIS = 0.05
MAX_DIS = 2000.0
NORMAL_PRECISION = 0.5773 * 0.005
VISIBILITY = 0.000001

MAX_RAYMARCH = 512
MAX_RAYTRACE = 3

ENV_IOR = 1.000277

aspect_ratio = image_resolution[0] / image_resolution[1]
light_quality = 128.0
camera_exposure = 1
camera_vfov = 35
camera_aperture = 0.01
camera_focus = 4
camera_gamma = 2.2
