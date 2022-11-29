from taichi.math import *
import taichi as ti
import time as time

ti.init(arch=ti.gpu)

image_resolution = (1920, 1080) # 画布分辨率

image_pixels = ti.Vector.field(3, float, image_resolution) # 画布每个像素

# 统一值
camera_position     = vec3(0, 0, 4)
camera_lookat       = vec3(0, 0, 0)
camera_aspect       = 2.0                  # 画布长宽比
camera_vfov         = 30.0                 # 摄像机的纵向视野
camera_focus        = 2.0                  # 摄像机的对焦距离
camera_aperture     = 0.005                # 摄像机的光圈大小
camera_exposure     = 1.0                  # 摄像机曝光值
camera_gamma        = 0.2                  # gamma 矫正值
light_quality       = 0.2                  # 间接光质量

# 配置常量
TMIN        = 0.001                        # 光开始传播的起始偏移，避免光线自相交
TMAX        = 2000.0                       # 最大单次光线传播距离
PRECISION   = 0.0001                       # 必须要小于 TMIN，否则光线会自相交产生阴影痤疮
MAP_SIZE    = float(0x7fffffff)            # 地图大小

MAX_RAYMARCH = 512                         # 最大光线步进次数
MAX_RAYTRACE = 512                         # 最大光线追踪次数

ENV_IOR = 1.000277                         # 环境的折射率

# 枚举形状类型
SHAPE_SPHERE      = 0
SHAPE_BOX         = 1
SHAPE_CYLINDER    = 2
SHAPE_TEST        = 3

NONE = 0


# 光线
@ti.dataclass
class ray:
    origin: vec3        # 光的起点
    direction: vec4     # 光的方向
    color: vec4         # 光的颜色

# 物体材质
@ti.dataclass
class material:
    albedo: vec3;        # 反照率
    roughness: float;    # 粗糙度
    metallic: float;     # 金属度
    transmission: float; # 透明度
    ior: float;          # 折射率
    emission: vec4;      # 自发光 (RGB, Intensity)
    normal: vec3;        # 切线空间法线

# 物体变换
class transform:
    position: vec3;        # 位置
    rotation: vec3;        # 旋转
    scale: vec3;           # 缩放

# SDF 物体
class object:
    shape: int;          # 形状
    sd: float;           # 距离物体表面
    trs: transform;      # 变换
    mtl: material;       # 材质

# 光子击中的记录
class record:
    obj: object;         # 物体
    hit: bool;           # 是否击中
    t: float;            # 沿射线前进的距离
    position: vec3;      # 击中的位置

@ti.kernel
def render(time: float, frame: int):
    for i, j in image_pixels: # Parallelized over all pixels
        u = i / image_resolution[0]
        v = j / image_resolution[1]

        inv_frame = 1 / frame
        last_color = image_pixels[i, j]
        color = ti.Vector([ti.random(), ti.random(), ti.random()])

        image_pixels[i, j] = mix(last_color, color, inv_frame)

window = ti.ui.Window("Hello Taichi", image_resolution)
canvas = window.get_canvas()
scene = ti.ui.Scene()
camera = ti.ui.Camera()
camera.position(0, 0, 4)
scene.set_camera(camera)

start_time = time.time()
frame = 0
while window.running:
    camera.track_user_inputs(window, movement_speed=0.03, hold_key=ti.ui.RMB)
    # print(camera.curr_position)
    cur_time = time.time() - start_time
    frame += 1
    render(cur_time, frame)
    canvas.set_image(image_pixels)
    window.show()