from taichi.math import *   # 导入 Taichi 数学库
import taichi as ti # 导入 Taichi 库
import time # 导入时间库

ti.init(arch=ti.gpu)    # 初始化 Taichi ，GPU 加速

image_resolution = (1920, 1080) # 图像分辨率
image_pixels = ti.Vector.field(3, float, image_resolution)  # 图像的像素场

aspect_ratio = image_resolution[0] / image_resolution[1]    # 图像宽高比

# 配置常量

TMIN        = 0.001                 # 光开始传播的起始偏移，避免光线自相交
TMAX        = 2000.0                # 最大单次光线传播距离
PRECISION   = 0.0001                # 必须要小于 TMIN，否则光线会自相交产生阴影痤疮
MAP_SIZE    = float(0x7fffffff);    # 地图大小

MAX_RAYMARCH = 512  # 最大光线步进次数
MAX_RAYTRACE = 512  # 最大路径追踪次数

SHAPE_NONE      = 0 # 无形状
SHAPE_SPHERE    = 1 # 球体
SHAPE_BOX       = 2 # 箱体

ENV_IOR = 1.000277  # 环境的折射率

@ti.data_oriented
class Image:
    def __init__(self, path: str):
        img = ti.tools.imread(path).astype('float32') / 255
        self.img = vec3.field(shape=img.shape)
        self.img.from_numpy(img.to_numpy())

    @ti.func
    def texture(self, uv: vec2):
        x = int(uv.x * self.img.shape[0])
        y = int(uv.y * self.img.shape[1])
        return self.img[x, y]

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
    albedo: vec3        # 材质颜色
    roughness: float    # 材质粗糙度
    metallic: float     # 材质金属度
    transmission: float # 材质透明度
    ior: float          # 材质折射率
    emission: vec4      # 材质自发光
    normal: vec3        # 切线空间法线

@ti.dataclass
class Transform:
    position: vec3
    scale: vec3

@ti.dataclass
class Object:
    type: ti.u32
    trs: Transform
    mtl: Material
    sd: float

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
class Camera:
    lookfrom: vec3     # 视点位置
    lookat: vec3       # 目标位置
    vup: vec3          # 向上的方向
    vfov: float        # 视野
    aspect: float      # 传感器长宽比
    aperture: float    # 光圈大小
    focus: float       # 对焦距离

    @ti.func
    def get_ray(c, uv: vec2, color: vec4) -> Ray:
        # 根据 vfov 和显示画布长宽比计算传感器长宽
        theta = radians(c.vfov)
        half_height = tan(theta / 2)
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
        lens_radius = c.aperture / 2.0
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
def sd_box(p: vec3, b: vec3) -> float:  # SDF 盒子
    q = abs(p) - b
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0)

@ti.func
def signed_distance(obj, pos: vec3) -> float:   # 对物体求 SDF 距离
    position = obj.trs.position # 位置空间变换（下一步再实现旋转变换）
    scale = obj.trs.scale   # 用缩放控制物体大小

    p = pos - position
    # 为不同形状选择不同的 SDF 函数
    if obj.type == SHAPE_SPHERE:
        obj.sd = sd_sphere(p, scale.x)
    elif obj.type == SHAPE_BOX:
        obj.sd = sd_box(p, scale)
    else:
        obj.sd = sd_sphere(p, scale.x)

    return obj.sd   # 返回符号距离

objects_num = 6 # 地图中物体的数量
objects = Object.field(shape=objects_num)   # 存放物体的场

objects[0] = Object(type=SHAPE_SPHERE,
                    trs=Transform(vec3(0, -100.5, 0), vec3(100)),
                    mtl=Material(vec3(1, 1, 1), 1, 1, 0, 1, vec4(0), vec3(0, 0, 1)))

objects[1] = Object(type=SHAPE_BOX,
                    trs=Transform(vec3(0, 0, -2), vec3(2, 1, 0.2)),
                    mtl=Material(vec3(1, 1, 1), 0, 1, 0, 1, vec4(0), vec3(0, 0, 1)))

objects[2] = Object(type=SHAPE_SPHERE,
                    trs=Transform(vec3(0, 0, 0), vec3(0.5)),
                    mtl=Material(vec3(1, 1, 1), 1, 0, 0, 1, vec4(0.1, 1, 0.1, 10), vec3(0, 0, 1)))

objects[3] = Object(type=SHAPE_SPHERE,
                    trs=Transform(vec3(-1, -0.2, 0), vec3(0.3)),
                    mtl=Material(vec3(1, 0.1, 0.1), 0.9, 0.1, 0, 1, vec4(0), vec3(0, 0, 1)))

objects[4] = Object(type=SHAPE_SPHERE,
                    trs=Transform(vec3(1, -0.2, 0), vec3(0.3)),
                    mtl=Material(vec3(0.1, 0.1, 1), 0.2, 1, 0, 1, vec4(0), vec3(0, 0, 1)))

objects[5] = Object(type=SHAPE_SPHERE,
                    trs=Transform(vec3(0.5, -0.2, -1), vec3(0.3)),
                    mtl=Material(vec3(0.9, 0.9, 1), 0, 0, 1, 1.5, vec4(0), vec3(0, 0, 1)))

@ti.func
def nearest_object(p: vec3) -> Object:  # 求最近的物体
    o = Object(sd=MAP_SIZE) # 设置一个最大的 SDF 值，即地图边界
    for i in range(objects_num):
        oi = objects[i]
        oi.sd = signed_distance(oi, p)  # 求物体的 SDF 值
        if abs(oi.sd) < abs(o.sd): o = oi
    return o

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

inv_atan = vec2(0.5 / pi, 1 / pi)

@ti.func
def sample_spherical_map(v: vec3) -> vec2:  # 球面坐标到笛卡尔坐标
    uv = vec2(atan2(v.z, v.x), asin(v.y))
    uv *= inv_atan
    uv += 0.5
    return uv

@ti.func
def IBL(ray, img) -> vec3:    # 光照环境光
    uv = sample_spherical_map(ray.direction)
    return img.texture(uv)

@ti.func
def sky_color(ray, time) -> vec3:
    t = 0.5 * ray.direction.y + 0.5 # 将 y 分量归一化
    blue = 0.5 * sin(time) + 0.5    # 计算蓝色分量
    return mix(vec3(1.0, 1.0, blue), vec3(0.5, 0.7, 1.0), t)    # 混合两种颜色

@ti.func
def pow5(x: float): # 快速计算 x 的 5 次方
    t = x*x
    t *= t
    return t*x

@ti.func
def TBN(N: vec3) -> mat3:   # 用世界坐标下的法线计算 TBN 矩阵
    # Building an Orthonormal Basis from a 3D Unit Vector Without Normalization
    # https://doi.org/10.1080/2165347X.2012.689606
    T = vec3(0)
    B = vec3(0)
    
    # 这个判断条件是为了避免出现除 0 的情况
    # 精度要根据浮点数精度调整
    if N.z < -0.99999:
        T = vec3(0, -1, 0)
        B = vec3(-1, 0, 0)
    else:
        a = 1 / (1 + N.z)
        b = -N.x*N.y*a
        
        T = vec3(1 - N.x*N.x*a, b, -N.x)
        B = vec3(b, 1 - N.y*N.y*a, -N.y)
    
    return mat3(T, B, N)

@ti.func
def hemispheric_sampling(n: vec3) -> vec3:  # 以 n 为法线进行半球采样
    ra = ti.random() * 2 * pi
    rb = ti.random()
    
    rz = sqrt(rb)
    v = vec2(cos(ra), sin(ra))
    rxy = sqrt(1 - rb) * v
    
    return TBN(n) @ vec3(rxy, rz)   # 用 TBN 矩阵将切线空间方向转换到世界空间

@ti.func
def hemispheric_sampling_roughness(n: vec3, roughness: float) -> vec3:  # 用粗糙度采样沿向量 n 半球采样
    ra = ti.random() * 2 * pi
    rb = ti.random()

    shiny = pow5(roughness) # 光感越大高光越锐利
    
    rz = sqrt((1.0 - rb) / (1.0 + (shiny - 1.0)*rb))
    v = vec2(cos(ra), sin(ra))
    rxy = sqrt(abs(1 - rz*rz)) * v
    
    return TBN(n) @ vec3(rxy, rz)

@ti.func
def fresnel_schlick(cosine: float, F0: float) -> float:   # 计算菲涅尔近似值
    return F0 + (1 - F0) * pow5(abs(1 - cosine))

@ti.func
def fresnel_schlick_roughness(cosine: float, F0: float, roughness: float) -> float:  # 计算粗糙度下的菲涅尔近似值
    return F0 + (max(1 - roughness, F0) - F0) * pow5(abs(1 - cosine))

@ti.func
def PBR(ray, record, normal: vec3) -> Ray:
    roughness = record.obj.mtl.roughness        # 获取粗糙度
    metallic = record.obj.mtl.metallic          # 获取金属度
    transmission = record.obj.mtl.transmission  # 获取透明度
    ior = record.obj.mtl.ior                    # 获取折射率

    I = ray.direction   # 入射方向
    V = -ray.direction  # 观察方向
    # 将材质的切线空间法线转换到世界空间
    N = TBN(record.obj.mtl.normal) @ normal   # 法线方向

    NoV = dot(N, V)

    if ti.random() < transmission:  # 折射部分
        eta = ENV_IOR / ior # 折射率之比
        outer = sign(NoV)   # 大于零就是穿入物体，小于零是穿出物体
        eta = pow(eta, outer)   # 更改折射率之比
        N  *= outer   # 如果是穿出物体表面，就更改法线方向

        NoI = -NoV
        k = 1.0 - eta * eta * (1.0 - NoI * NoI) # 这个值如果小于 0 就说明全反射了

        F0 = (eta - 1) / (eta + 1)  # 基础反射率
        F0 *= F0
        F = fresnel_schlick(NoV, F0)
        N = hemispheric_sampling_roughness(N, roughness)    # 根据粗糙度抖动法线方向
    
        # k < 0 为全反射
        if ti.random() < F + metallic and outer > 0 or k < 0:
            ray.direction = reflect(I, N)   # 反射
        else:
            # ray.direction = refract(I, N, eta)    # 折射
            ray.direction = eta * I - (eta * NoI + sqrt(k)) * N
    else:
        F = fresnel_schlick_roughness(NoV, 0.04, roughness)
        if ti.random() < F + metallic:  # 反射部分
            N = hemispheric_sampling_roughness(N, roughness)
            ray.direction = reflect(I, N)   # 平面反射
        else:   # 漫反射部分
            ray.direction = hemispheric_sampling(N)  # 半球采样

    # N = hemispheric_sampling_roughness(N, 0)
    # ray.direction = reflect(I, N)
    
    ray.origin = record.position    # 更新光线起点
    ray.color.rgb *= record.obj.mtl.albedo   # 更新光的颜色

    return ray

@ti.func
def raytrace(ray, time: float) -> Ray:
    for i in range(MAX_RAYTRACE):
        record = raycast(ray)   # 光线步进求交

        # 俄罗斯轮盘赌概率，防止光线过分的反复反射
        light_quality = 1 / 50
        inv_pdf = exp(float(i) * light_quality)
        roulette_prob = 1.0 - (1.0 / inv_pdf)
    
        visible = length(ray.color.rgb*ray.color.a)
        # 如果光已经衰减到不可分辨程度，或者光线毙掉就不继续了
        if visible < 0.001 or ti.random() < roulette_prob:
            ray.color *= roulette_prob
            break
        
        if not record.hit:
            ray.color.rgb *= sky_color(ray, time)  # 获取天空颜色
            break
        
        # 这里的法线会始终指向物体外面
        normal = calc_normal(record.obj, record.position) # 计算法线
        # ray.color.rgb = 0.5 + 0.5 * normal  # 设置为法线颜色
        # break

        # 处理自发光
        emission = record.obj.mtl.emission
        if abs(record.obj.mtl.emission.a) > 0.0:
            ray.color.rgb *= emission.rgb*emission.a
            break

        ray = PBR(ray, record, normal)  # 应用 PBR 材质

        if dot(normal, ray.direction) < 0: # 如果光线反射到了物体内部，也直接跳出循环
            break
    
        ray.color *= inv_pdf # 能量守恒

    return ray

# ACES fitted
# from https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl
ACESInputMat = mat3(
    vec3(0.59719, 0.35458, 0.04823),
    vec3(0.07600, 0.90834, 0.01566),
    vec3(0.02840, 0.13383, 0.83777)
)

# ODT_SAT => XYZ => D60_2_D65 => sRGB
ACESOutputMat = mat3(
    vec3( 1.60475, -0.53108, -0.07367),
    vec3(-0.10208,  1.10813, -0.00605),
    vec3(-0.00327, -0.07276,  1.07602)
)

@ti.func
def RRTAndODTFit(v: vec3) -> vec3:
    a = v * (v + 0.0245786) - 0.000090537
    b = v * (0.983729 * v + 0.4329510) + 0.238081
    return a / b

@ti.func
def ACESFitted(color: vec3) -> vec3:    # ACES 色调映射
    color = ACESInputMat @ color
    color = RRTAndODTFit(color) # Apply RRT and ODT
    color = ACESOutputMat @ color
    return color

@ti.kernel
def render(
    time: float, 
    camera_position: vec3, 
    camera_lookat: vec3, 
    camera_up: vec3,
    denoise_frame: float):  # 渲染函数

    for i, j in image_pixels:   # 并行遍历像素场
        SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)
        uv = vec2(i, j) * SCREEN_PIXEL_SIZE # 计算像素坐标

        uv += vec2(ti.random(), ti.random()) * SCREEN_PIXEL_SIZE    # 超采样

        camera = Camera()
        camera.lookfrom = camera_position   # 设置摄像机位置
        camera.lookat = camera_lookat       # 设置目标位置
        camera.vup = camera_up              # 设置向上的方向
        camera.aspect = aspect_ratio        # 设置长宽比
        camera.vfov = 30                    # 设置视野
        camera.aperture = 0.01              # 设置光圈大小
        camera.focus = 4                    # 设置对焦距离

        ray = camera.get_ray(uv, vec4(1.0)) # 生成光线
        ray = raytrace(ray, time) # 光线追踪
        
        color = ray.color.rgb * ray.color.a # 混合颜色与光强

        color = pow(color, vec3(0.5))   # 伽马矫正
        exposure = 1.5
        color *= exposure
        color = ACESFitted(color)       # ACES 色调映射
        last_color = image_pixels[i, j] # 获取上一帧的颜色
        out_color = mix(last_color, color, 1.0 / denoise_frame) # 混合当前帧和上一帧的颜色

        image_pixels[i, j] = out_color  # 设置像素颜色

window = ti.ui.Window("Taichi Renderer", image_resolution)  # 创建窗口
canvas = window.get_canvas()    # 获取画布
camera = ti.ui.Camera()         # 创建摄像机
camera.position(0, 0, 4)        # 设置摄像机初始位置

denoise_frame = 0
start_time = time.time()    # 获取程序开始时时间
while window.running:
    camera.track_user_inputs(window, movement_speed=0.03, hold_key=ti.ui.LMB)
    delta_time = time.time() - start_time   # 计算时间差
    if window.is_pressed(' '):
        denoise_frame = 0
    denoise_frame += 1
    render(
        delta_time, 
        camera.curr_position, 
        camera.curr_lookat, 
        camera.curr_up,
        denoise_frame) # 调用渲染函数
    canvas.set_image(image_pixels)  # 为画布设置图像
    window.show()   # 显示窗口