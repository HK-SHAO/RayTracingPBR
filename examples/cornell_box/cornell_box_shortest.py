import taichi as ti                                                                       # 导入太极数值计算库
from taichi.math import *                                                             # 直接使用常用的数学函数

ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)     # 初始化太极，使用GPU计算，整数为32位，浮点数为32位

image_resolution = (512, 512)                                                                   # 图像分辨率
image_buffer = ti.Vector.field(4, float, image_resolution)          # 图像缓冲区，4通道，每个通道为浮点数，用于渲染
image_pixels = ti.Vector.field(3, float, image_resolution)        # 图像像素，3通道，每个通道为浮点数，用于最终显示
aspect_ratio = image_resolution[0] / image_resolution[1]                                        # 图像宽高比

Ray = ti.types.struct(origin=vec3, direction=vec3, color=vec3)                 # 光线结构体，包含原点、方向、颜色
Material = ti.types.struct(albedo=vec3, emission=vec3)                          # 材质结构体，包含反射率、发射率
Transform = ti.types.struct(position=vec3, rotation=vec3, scale=vec3)          # 变换结构体，包含位置、旋转、缩放
SDFObject = ti.types.struct(distance=float, transform=Transform, material=Material)          # SDF物体结构体
HitRecord = ti.types.struct(object=SDFObject, position=vec3, distance=float, hit=bool)       # 碰撞记录结构体

objects = SDFObject.field(shape=8)                          # SDF物体数组，有8个物体，分别是5面墙，2个物体和1面灯
objects[0]=SDFObject(transform=Transform(vec3(0, 0, -1), vec3(0, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1)))                                       # 墙面1
objects[1]=SDFObject(transform=Transform(vec3(0, 1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1)))                                       # 墙面2
objects[2]=SDFObject(transform=Transform(vec3(0, -1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1)))                                       # 墙面3
objects[3]=SDFObject(transform=Transform(vec3(-1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 0, 0)*0.5, vec3(1)))                                       # 墙面4
objects[4]=SDFObject(transform=Transform(vec3(1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(0, 1, 0)*0.5, vec3(1)))                                       # 墙面5
objects[5]=SDFObject(transform=Transform(vec3(-0.275, -0.3, -0.2), vec3(0, 112, 0), vec3(0.25, 0.5, 0.25)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1)))                                       # 物体1
objects[6]=SDFObject(transform=Transform(vec3(0.275,-0.55, 0.2), vec3(0, -197, 0), vec3(0.25, 0.25, 0.25)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1)))                                       # 物体2
objects[7]=SDFObject(transform=Transform(vec3(0, 0.809, 0), vec3(90, 0, 0), vec3(0.2, 0.2, 0.01)),
                material=Material(vec3(1, 1, 1), vec3(100)))                                           # 灯

@ti.func
def angle(a: vec3) -> mat3:                                                           # 将欧拉角转换为旋转矩阵
    s, c = sin(a), cos(a)                                                          # 分别计算欧拉角的正弦和余弦
    return mat3(c.z, s.z, 0, -s.z, c.z, 0, 0, 0, 1) @ \
           mat3(c.y, 0, -s.y, 0, 1, 0, s.y, 0, c.y) @ \
           mat3(1, 0, 0, 0, c.x, s.x, 0, -s.x, c.x)                  # 依次计算绕x、y、z轴旋转的旋转矩阵，然后左乘

@ti.func
def signed_distance(obj: SDFObject, pos: vec3) -> float:                           # 计算点到SDF物体的符号距离
    p = angle(radians(obj.transform.rotation)) @ (pos - obj.transform.position)                 # 平移和旋转
    q = abs(p) - obj.transform.scale                                                         # 盒子的SDF函数
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0)                               # 返回符号距离值

@ti.func
def nearest_object(p: vec3) -> SDFObject:                                       # 计算点到所有SDF物体的最近距离
    o = objects[0]; o.distance = abs(signed_distance(o, p))                                # 从第一个物体开始
    for i in range(1, 8):                                                                      # 遍历所有物体
        oi = objects[i]; oi.distance = abs(signed_distance(oi, p))              # 用绝对值处理SDF物体内部的情况
        if oi.distance < o.distance: o = oi                                                # 选择最近那个物体
    return o

@ti.func
def calc_normal(obj: SDFObject, p: vec3) -> vec3:                                      # 计算点的法向量（梯度）
    e = vec2(1, -1) * 0.001                                 # 用一个小的值，用于计算偏移量，使用了四面体方法近似梯度
    return normalize(e.xyy * signed_distance(obj, p + e.xyy) + \
                     e.yyx * signed_distance(obj, p + e.yyx) + \
                     e.yxy * signed_distance(obj, p + e.yxy) + \
                     e.xxx * signed_distance(obj, p + e.xxx) )

@ti.func
def raycast(ray: Ray) -> HitRecord:                                                     # 计算光线与场景的交点
    record = HitRecord(distance=0.001)                                 # 从0.001开始，避免光线在起点处与物体相交
    for _ in range(256):                                                        # 光线步进，设置一个最大步进次数
        record.position  = ray.origin + record.distance * ray.direction
        record.object    = nearest_object(record.position)
        record.distance += record.object.distance
        record.hit       = record.object.distance < 0.0001
        if record.distance > 2000.0 or record.hit: break
    return record

@ti.func
def hemispheric_sampling(normal: vec3) -> vec3:                                                   # 半球采样
    z = 2.0 * ti.random() - 1.0
    a = ti.random() * 2.0 * pi
    xy = sqrt(1.0 - z*z) * vec2(sin(a), cos(a))
    return normalize(normal + vec3(xy, z))                                                      # 球面上采样

@ti.func
def raytrace(ray: Ray) -> Ray:                                                                    # 路径追踪
    for i in range(3):                                                # 最多追踪3次，已经可以为场景带来全局光照了
        inv_pdf = exp(float(i) / 128.0)
        roulette_prob = 1.0 - (1.0 / inv_pdf)                  # 轮盘赌算法，用于减少光线的数量，在帧之间分摊计算量
        if ti.random() < roulette_prob: ray.color *= roulette_prob; break

        record = raycast(ray)                                                           # 计算光线与场景的交点
        if not record.hit: ray.color = vec3(0); break                          # 没有击中光源或者物体就是黑色的

        normal  = calc_normal(record.object, record.position)                              # 计算交点的法向量
        ray.direction = hemispheric_sampling(normal)                             # 用半球采样方向近似漫反射方向
        ray.color *= record.object.material.albedo                                              # 乘上反照率
        ray.origin = record.position                                                       # 更新光线出发位置

        intensity  = dot(ray.color, vec3(0.299, 0.587, 0.114))                               # 计算光线的亮度
        ray.color *= record.object.material.emission                                            # 乘上发射率
        visible    = dot(ray.color, vec3(0.299, 0.587, 0.114))
        if intensity < visible or visible < 0.000001: break                    # 如果太暗或者击中光源就结束追踪
    return ray

@ti.kernel
def render(camera_position: vec3, camera_lookat: vec3, camera_up: vec3):
    for i, j in image_pixels:                                                                  # 遍历所有像素
        buffer = image_buffer[i, j]                                                     # 获取当前缓冲区的颜色

        z = normalize(camera_position - camera_lookat)
        x = normalize(cross(camera_up, z))                                                   # 计算相机坐标系
        y = cross(z, x)
        
        half_height = tan(radians(35) * 0.5)                                              # 计算画幅位置和大小
        half_width = aspect_ratio * half_height
        lower_left_corner = camera_position - half_width * x - half_height * y - z
        horizontal = 2.0 * half_width  * x
        vertical   = 2.0 * half_height * y

        uv = (vec2(i, j) + vec2(ti.random(), ti.random())) / vec2(image_resolution)       # 抖动像素位置超采样
        po = lower_left_corner + uv.x * horizontal + uv.y * vertical
        rd = normalize(po - camera_position)                                                   # 计算光线方向

        ray = raytrace(Ray(camera_position, rd, vec3(1)))                                         # 路径追踪
        buffer += vec4(ray.color, 1.0)                                     # 积累颜色，用 alpha 通道记录累积次数
        image_buffer[i, j] = buffer                                                             # 更新缓冲区

        color = buffer.rgb / buffer.a                                   # 计算平均值颜色，然后使用 ACES 色调映射
        color = mat3(0.5971, 0.354, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777)  @ color
        color = (color * (color + 0.0245) - 0.000090537) / (color * (0.983 * color + 0.4329510) + 0.238081)
        color = mat3(1.604, -0.531, -0.073, -0.102, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602) @ color
        color = pow(clamp(color, 0, 1), vec3(1.0 / 2.2))                                          # 伽马校正
        image_pixels[i, j] = color                                                                # 写入像素

window = ti.ui.Window("Cornell Box", image_resolution)                                            # 创建窗口
canvas = window.get_canvas()                                                                      # 获取画布

while window.running:                                                                               # 主循环
    render(vec3(0, 0, 3.5), vec3(0, 0, -1), vec3(0, 1, 0))                                            # 渲染
    canvas.set_image(image_pixels)                                                           # 将像素写入画布
    window.show()                                                                                 # 显示窗口