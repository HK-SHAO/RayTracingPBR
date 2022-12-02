from taichi.math import *   # 导入 Taichi 数学库
import taichi as ti # 导入 Taichi 库
import time # 导入时间库

ti.init(arch=ti.gpu)    # 初始化 Taichi ，GPU 加速

image_resolution = (1920, 1080) # 图像分辨率
image_pixels = ti.Vector.field(3, float, image_resolution)  # 图像的像素场

aspect_ratio = image_resolution[0] / image_resolution[1]    # 图像宽高比

# 配置常量
TMIN        = 0.001     # 光开始传播的起始偏移，避免光线自相交
TMAX        = 2000.0    # 最大单次光线传播距离
PRECISION   = 0.0001    # 必须要小于 TMIN，否则光线会自相交产生阴影痤疮

MAX_RAYMARCH = 512      # 最大光线步进次数

@ti.dataclass
class Ray:  # 光线类
    origin: vec3    # 光线起点
    direction: vec3 # 光线方向
    color: vec4     # 光的颜色

    @ti.func
    def at(r, t: float) -> vec3: # 计算光子所在位置
        return r.origin + t * r.direction

@ti.dataclass
class Material:
    albedo: vec3    # 材质颜色

@ti.dataclass
class Transform:
    position: vec3  # 物体位置

@ti.dataclass
class Object:
    sd: float       # 到物体表面的符号距离
    mtl: Material   # 物体材质
    trs: Transform  # 物体变换

@ti.dataclass
class HitRecord:    # 光子碰撞记录类
    position: vec3  # 光子碰撞的位置
    distance: float # 光子步进的距离
    hit: ti.i32     # 是否击中到物体
    obj: Object     # 碰撞到的物体

@ti.func
def random_in_unit_disk():  # 单位圆内随机取一点
    x = ti.random()
    a = ti.random() * 2 * pi
    return sqrt(x) * vec2(sin(a), cos(a))

@ti.dataclass
class Camera:           # 相机类
    lookfrom: vec3      # 视点位置
    lookat: vec3        # 目标位置
    vup: vec3           # 向上的方向
    vfov: float         # 视野
    aspect: float       # 传感器长宽比
    aperture: float     # 光圈大小
    focus: float        # 对焦距离

    @ti.func
    def get_ray(c, uv: vec2, color: vec4) -> Ray:
        # 根据 vfov 和画布长宽比计算出半高和半宽
        theta = radians(c.vfov) # 角度转弧度
        half_height = tan(theta * 0.5)
        half_width = c.aspect * half_height

        # 以目标位置到摄像机位置为 Z 轴正方向
        z = normalize(c.lookfrom - c.lookat)
        # 计算出摄像机传感器的 XY 轴正方向
        x = normalize(cross(c.vup, z))
        y = cross(z, x)

        # 计算出画布左下角
        lower_left_corner = c.lookfrom  - half_width  * c.focus*x \
                                        - half_height * c.focus*y \
                                        -               c.focus*z

        horizontal = 2.0 * half_width  * c.focus * x
        vertical   = 2.0 * half_height * c.focus * y

        # 模拟光进入镜头光圈
        lens_radius = c.aperture * 0.5
        rud = lens_radius * random_in_unit_disk()
        offset = x * rud.x + y * rud.y

        # 计算光线起点和方向
        ro = c.lookfrom + offset
        rp = lower_left_corner  + uv.x*horizontal \
                                + uv.y*vertical
        rd = normalize(rp - ro)
    
        return Ray(ro, rd, color)


@ti.func
def sd_sphere(p: vec3, r: float) -> float:  # SDF 球体
    return length(p) - r

@ti.func
def signed_distance(obj, pos: vec3) -> float:
    p = pos - obj.trs.position  # 计算物体位移后的场
    r = 0.5 # 球体半径
    sd = sd_sphere(p, r) # 计算 SD 值
    return sd

@ti.func
def nearest_object(p: vec3) -> Object:  # 计算最近的物体
    obj = Object()
    obj.mtl.albedo = vec3(1, 0, 0)
    obj.trs.position = vec3(0, 0, -1)
    obj.sd = signed_distance(obj, p)
    return obj

@ti.func
def calc_normal(obj, p: vec3) -> vec3:  # 计算物体法线
    e = vec2(1, -1) * 0.5773 * 0.0005
    return normalize(   e.xyy*signed_distance(obj, p + e.xyy) + \
                        e.yyx*signed_distance(obj, p + e.yyx) + \
                        e.yxy*signed_distance(obj, p + e.yxy) + \
                        e.xxx*signed_distance(obj, p + e.xxx)   )

@ti.func
def raycast(ray) -> HitRecord:  # 光线步进求交
    record = HitRecord(ray.origin, TMIN, False) # 初始化光子碰撞记录
    for _ in range(MAX_RAYMARCH):   # 光线步进
        record.position = ray.at(record.distance)   # 计算光子所在位置
        record.obj = nearest_object(record.position)    # 计算光子与球体的有向距离
        dis = abs(record.obj.sd)    # 绝对值为无符号距离
        if dis < PRECISION: # 如果光子与球体的距离小于精度即为击中
            record.hit = True   # 设置击中状态
            break
        record.distance += dis  # 光子继续传播
        if record.distance > TMAX:  # 如果光子传播距离大于最大传播距离
            break
    return record   # 返回光子碰撞记录

@ti.func
def sky_color(ray, time) -> vec3:
    t = 0.5 * ray.direction.y + 0.5 # 将 y 分量归一化
    blue = 0.5 * sin(time) + 0.5    # 计算蓝色分量
    return mix(vec3(1.0, 1.0, blue), vec3(0.5, 0.7, 1.0), t)    # 混合两种颜色

@ti.kernel
def render(time: float):   # 渲染函数
    for i, j in image_pixels:   # 并行遍历像素场
        resolution = vec2(image_resolution)
        uv = vec2(i, j) / resolution    # 计算像素坐标

        camera = Camera()
        camera.lookfrom = vec3(0, 0, 4) # 设置摄像机位置
        camera.lookat = vec3(0, 0, 2)   # 设置目标位置
        camera.vup = vec3(0, 1, 0)      # 设置向上的方向
        camera.aspect = aspect_ratio    # 设置长宽比
        camera.vfov = 30                # 设置视野
        camera.aperture = 0.01          # 设置光圈大小
        camera.focus = 4                # 设置对焦距离

        ray = camera.get_ray(uv, vec4(1.0)) # 生成光线

        record = raycast(ray)   # 光线步进求交
        normal = calc_normal(record.obj, record.position) # 计算法线
        
        if record.hit:
            # ray.color.rgb *= record.obj.mtl.albedo   # 设置为材质颜色
            ray.color.rgb = 0.5 + 0.5 * normal  # 设置为法线颜色
        else:
            ray.color.rgb = sky_color(ray, time)  # 获取天空颜色
        
        image_pixels[i, j] = ray.color.rgb  # 设置像素颜色

window = ti.ui.Window("Taichi Renderer", image_resolution)  # 创建窗口
canvas = window.get_canvas()    # 获取画布

start_time = time.time()    # 获取程序开始时时间
while window.running:
    delta_time = time.time() - start_time   # 计算时间差
    render(delta_time)  # 调用渲染函数
    canvas.set_image(image_pixels)  # 为画布设置图像
    window.show()   # 显示窗口