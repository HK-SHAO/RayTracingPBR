from taichi.math import *   # 导入 Taichi 数学库
import taichi as ti # 导入 Taichi 库
import time # 导入时间库

ti.init(arch=ti.gpu)    # 初始化 Taichi ，GPU 加速

image_resolution = (1920, 1080) # 图像分辨率
image_pixels = ti.Vector.field(3, float, image_resolution)  # 图像的像素场

@ti.dataclass
class Ray:  # 光线类
    origin: vec3    # 光线起点
    direction: vec3 # 光线方向
    color: vec4     # 光的颜色

    @ti.func
    def at(self, t: float) -> vec3: # 计算光子所在位置
        return self.origin + t * self.direction

@ti.func
def sky_color(ray, time) -> vec3:
    t = 0.5 * ray.direction.y + 0.5 # 将 y 分量归一化
    blue = 0.5 * sin(time) + 0.5    # 计算蓝色分量
    return mix(vec3(1.0, 1.0, blue), vec3(0.5, 0.7, 1.0), t)    # 混合两种颜色

@ti.kernel
def render(time: float):   # 渲染函数
    for i, j in image_pixels:   # 并行遍历像素场
        u = i / image_resolution[0] # 计算归一化的 u 坐标
        v = j / image_resolution[1] # 计算归一化的 v 坐标

        lower_left_corner = vec3(-2, -1, -1)    # 视野左下角
        horizontal = vec3(4, 0, 0)  # 视野水平方向
        vertical = vec3(0, 2, 0)    # 视野垂直方向
        origin = vec3(0, 0, 0)      # 视点
        
        ro = origin # 光线起点
        rd = normalize(lower_left_corner + u*horizontal + v*vertical - ro)  # 光线方向
        ray = Ray(ro, rd)   # 创建光线

        ray.color.rgb = sky_color(ray, time)    # 获取天空颜色
        
        image_pixels[i, j] = ray.color.rgb  # 设置像素颜色

window = ti.ui.Window("Taichi Renderer", image_resolution)  # 创建窗口
canvas = window.get_canvas()    # 获取画布

start_time = time.time()    # 获取程序开始时时间
while window.running:
    delta_time = time.time() - start_time   # 计算时间差
    render(delta_time)  # 调用渲染函数
    canvas.set_image(image_pixels)  # 为画布设置图像
    window.show()   # 显示窗口