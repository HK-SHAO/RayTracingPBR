from taichi.math import *   # 导入 Taichi 数学库
import taichi as ti # 导入 Taichi 库

ti.init(arch=ti.gpu)    # 初始化 Taichi ，GPU 加速

image_resolution = (1920, 1080) # 图像分辨率
image_pixels = ti.Vector.field(3, float, image_resolution) # 图像的像素场

@ti.kernel
def render():   # 渲染函数
    for i, j in image_pixels:   # 并行遍历像素场
        image_pixels[i, j] = vec3(1, 0, 1)  # 设置像素颜色为紫色

window = ti.ui.Window("Taichi Renderer", image_resolution)  # 创建窗口
canvas = window.get_canvas()    # 获取画布

while window.running:
    render()    # 调用渲染函数
    canvas.set_image(image_pixels)  # 为画布设置图像
    window.show()   # 显示窗口