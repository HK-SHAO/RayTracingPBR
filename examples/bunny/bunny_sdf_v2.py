# Copyright © 2019-2023 HK-SHAO
# GPL-3.0 Licensed: https://github.com/HK-SHAO/RayTracingPBR

import taichi as ti
from taichi.math import *

ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)

image_resolution = (3840, 2160)

image_buffer = ti.Vector.field(4, float, image_resolution)
image_pixels = ti.Vector.field(3, float, image_resolution)
u_frame = ti.field(int, ())

SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)
PIXEL_RADIUS      = 0.5 * min(SCREEN_PIXEL_SIZE.x, SCREEN_PIXEL_SIZE.y)

MIN_DIS      = 0.005
MAX_DIS      = 2000.0
PRECISION    = 0.0001
VISIBILITY   = 0.000001

SAMPLE_PER_PIXEL = 12
MAX_RAYMARCH = 512
MAX_RAYTRACE = 128

SHAPE_NONE     = 0
SHAPE_BUNNY    = 1

ENV_IOR = 1.000277

aspect_ratio    = image_resolution[0] / image_resolution[1]
light_quality   = 128.0
camera_exposure = 0.8
camera_vfov     = 30
camera_aperture = 0.01
camera_focus    = 4
camera_gamma    = 2.2

@ti.data_oriented
class Image:
    def __init__(self, path: str):
        img = ti.tools.imread(path).astype('float32')
        self.img = vec3.field(shape=img.shape[:2])
        self.img.from_numpy(img / 255)

    @ti.func
    def texture(self, uv: vec2) -> vec3:
        x = int(uv.x * self.img.shape[0])
        y = int(uv.y * self.img.shape[1])
        return self.img[x, y]

hdr_map = Image('assets/limpopo_golf_course_3k.hdr')

@ti.dataclass
class Ray:
    origin: vec3
    direction: vec3
    color: vec3

    @ti.func
    def at(r, t: float) -> vec3:
        return r.origin + t * r.direction

@ti.dataclass
class Material:
    albedo: vec3
    emission: vec3
    roughness: float
    metallic: float
    transmission: float
    ior: float

@ti.dataclass
class Transform:
    position: vec3
    rotation: vec3
    scale: vec3

@ti.dataclass
class SDFObject:
    type: int
    distance: float
    transform: Transform
    material: Material

@ti.dataclass
class HitRecord:
    object: SDFObject
    position: vec3
    hit: bool

@ti.func
def random_in_unit_disk():
    x = ti.random()
    a = ti.random() * 2 * pi
    return sqrt(x) * vec2(sin(a), cos(a))

@ti.dataclass
class Camera:
    lookfrom: vec3
    lookat: vec3
    vup: vec3
    vfov: float
    aspect: float
    aperture: float
    focus: float

    @ti.func
    def get_ray(c, uv: vec2, color: vec3) -> Ray:
        theta = radians(c.vfov)
        half_height = tan(theta * 0.5)
        half_width = c.aspect * half_height

        z = normalize(c.lookfrom - c.lookat)
        x = normalize(cross(c.vup, z))
        y = cross(z, x)

        lens_radius = c.aperture * 0.5
        rud = lens_radius * random_in_unit_disk()
        offset = x * rud.x + y * rud.y
        
        hwfx = half_width  * c.focus * x
        hhfy = half_height * c.focus * y

        lower_left_corner = c.lookfrom - hwfx - hhfy - c.focus * z
        horizontal = 2.0 * hwfx
        vertical   = 2.0 * hhfy

        ro = c.lookfrom + offset
        po = lower_left_corner + uv.x * horizontal + uv.y * vertical
        rd = normalize(po - ro)
    
        return Ray(ro, rd, color)

@ti.func
def angle(a: vec3) -> mat3:
    s, c = sin(a), cos(a)
    return mat3(vec3( c.z,  s.z,    0),
                vec3(-s.z,  c.z,    0),
                vec3(   0,    0,    1)) @ \
           mat3(vec3( c.y,    0, -s.y),
                vec3(   0,    1,    0),
                vec3( s.y,    0,  c.y)) @ \
           mat3(vec3(   1,    0,    0),
                vec3(   0,  c.x,  s.x),
                vec3(   0, -s.x,  c.x))

@ti.func
def sd_bunny(p: vec3) -> float: # from https://www.shadertoy.com/view/wtVyWK
    # sdf is undefined outside the unit sphere, uncomment to witness the abominations
    sd = 0.0
    if length(p) > 1.0:
        sd =  length(p) - 0.8
    else:
        # neural networks can be really compact... when they want to be
        f00=sin(p.y*vec4(-3.02,1.95,-3.42,-.60)+p.z*vec4(3.08,.85,-2.25,-.24)-p.x*vec4(-.29,1.16,-3.74,2.89)+vec4(-.71,4.50,-3.24,-3.50))
        f01=sin(p.y*vec4(-.40,-3.61,3.23,-.14)+p.z*vec4(-.36,3.64,-3.91,2.66)-p.x*vec4(2.90,-.54,-2.75,2.71)+vec4(7.02,-5.41,-1.12,-7.41))
        f02=sin(p.y*vec4(-1.77,-1.28,-4.29,-3.20)+p.z*vec4(-3.49,-2.81,-.64,2.79)-p.x*vec4(3.15,2.14,-3.85,1.83)+vec4(-2.07,4.49,5.33,-2.17))
        f03=sin(p.y*vec4(-.49,.68,3.05,.42)+p.z*vec4(-2.87,.78,3.78,-3.41)-p.x*vec4(-2.65,.33,.07,-.64)+vec4(-3.24,-5.90,1.14,-4.71))
        f10=sin(f00@mat4(-.34,.06,-.59,-.76,.10,-.19,-.12,.44,.64,-.02,-.26,.15,-.16,.21,.91,.15)+
            f01@mat4(.01,.54,-.77,.11,.06,-.14,.43,.51,-.18,.08,.39,.20,.33,-.49,-.10,.19)+
            f02@mat4(.27,.22,.43,.53,.18,-.17,.23,-.64,-.14,.02,-.10,.16,-.13,-.06,-.04,-.36)+
            f03@mat4(-.13,.29,-.29,.08,1.13,.02,-.83,.32,-.32,.04,-.31,-.16,.14,-.03,-.20,.39)+
            vec4(.73,-4.28,-1.56,-1.80))+f00
        f11=sin(f00@mat4(-1.11,.55,-.12,-1.00,.16,.15,-.30,.31,-.01,.01,.31,-.42,-.29,.38,-.04,.71)+
            f01@mat4(.96,-.02,.86,.52,-.14,.60,.44,.43,.02,-.15,-.49,-.05,-.06,-.25,-.03,-.22)+
            f02@mat4(.52,.44,-.05,-.11,-.56,-.10,-.61,-.40,-.04,.55,.32,-.07,-.02,.28,.26,-.49)+
            f03@mat4(.02,-.32,.06,-.17,-.59,.00,-.24,.60,-.06,.13,-.21,-.27,-.12,-.14,.58,-.55)+
            vec4(-2.24,-3.48,-.80,1.41))+f01
        f12=sin(f00@mat4(.44,-.06,-.79,-.46,.05,-.60,.30,.36,.35,.12,.02,.12,.40,-.26,.63,-.21)+
            f01@mat4(-.48,.43,-.73,-.40,.11,-.01,.71,.05,-.25,.25,-.28,-.20,.32,-.02,-.84,.16)+
            f02@mat4(.39,-.07,.90,.36,-.38,-.27,-1.86,-.39,.48,-.20,-.05,.10,-.00,-.21,.29,.63)+
            f03@mat4(.46,-.32,.06,.09,.72,-.47,.81,.78,.90,.02,-.21,.08,-.16,.22,.32,-.13)+
            vec4(3.38,1.20,.84,1.41))+f02
        f13=sin(f00@mat4(-.41,-.24,-.71,-.25,-.24,-.75,-.09,.02,-.27,-.42,.02,.03,-.01,.51,-.12,-1.24)+
            f01@mat4(.64,.31,-1.36,.61,-.34,.11,.14,.79,.22,-.16,-.29,-.70,.02,-.37,.49,.39)+
            f02@mat4(.79,.47,.54,-.47,-1.13,-.35,-1.03,-.22,-.67,-.26,.10,.21,-.07,-.73,-.11,.72)+
            f03@mat4(.43,-.23,.13,.09,1.38,-.63,1.57,-.20,.39,-.14,.42,.13,-.57,-.08,-.21,.21)+
            vec4(-.34,-3.28,.43,-.52))+f03
        f00=sin(f10@mat4(-.72,.23,-.89,.52,.38,.19,-.16,-.88,.26,-.37,.09,.63,.29,-.72,.30,-.95)+
            f11@mat4(-.22,-.51,-.42,-.73,-.32,.00,-1.03,1.17,-.20,-.03,-.13,-.16,-.41,.09,.36,-.84)+
            f12@mat4(-.21,.01,.33,.47,.05,.20,-.44,-1.04,.13,.12,-.13,.31,.01,-.34,.41,-.34)+
            f13@mat4(-.13,-.06,-.39,-.22,.48,.25,.24,-.97,-.34,.14,.42,-.00,-.44,.05,.09,-.95)+
            vec4(.48,.87,-.87,-2.06))/1.4+f10
        f01=sin(f10@mat4(-.27,.29,-.21,.15,.34,-.23,.85,-.09,-1.15,-.24,-.05,-.25,-.12,-.73,-.17,-.37)+
            f11@mat4(-1.11,.35,-.93,-.06,-.79,-.03,-.46,-.37,.60,-.37,-.14,.45,-.03,-.21,.02,.59)+
            f12@mat4(-.92,-.17,-.58,-.18,.58,.60,.83,-1.04,-.80,-.16,.23,-.11,.08,.16,.76,.61)+
            f13@mat4(.29,.45,.30,.39,-.91,.66,-.35,-.35,.21,.16,-.54,-.63,1.10,-.38,.20,.15)+
            vec4(-1.72,-.14,1.92,2.08))/1.4+f11
        f02=sin(f10@mat4(1.00,.66,1.30,-.51,.88,.25,-.67,.03,-.68,-.08,-.12,-.14,.46,1.15,.38,-.10)+
            f11@mat4(.51,-.57,.41,-.09,.68,-.50,-.04,-1.01,.20,.44,-.60,.46,-.09,-.37,-1.30,.04)+
            f12@mat4(.14,.29,-.45,-.06,-.65,.33,-.37,-.95,.71,-.07,1.00,-.60,-1.68,-.20,-.00,-.70)+
            f13@mat4(-.31,.69,.56,.13,.95,.36,.56,.59,-.63,.52,-.30,.17,1.23,.72,.95,.75)+
            vec4(-.90,-3.26,-.44,-3.11))/1.4+f12
        f03=sin(f10@mat4(.51,-.98,-.28,.16,-.22,-.17,-1.03,.22,.70,-.15,.12,.43,.78,.67,-.85,-.25)+
            f11@mat4(.81,.60,-.89,.61,-1.03,-.33,.60,-.11,-.06,.01,-.02,-.44,.73,.69,1.02,.62)+
            f12@mat4(-.10,.52,.80,-.65,.40,-.75,.47,1.56,.03,.05,.08,.31,-.03,.22,-1.63,.07)+
            f13@mat4(-.18,-.07,-1.22,.48,-.01,.56,.07,.15,.24,.25,-.09,-.54,.23,-.08,.20,.36)+
            vec4(-1.11,-4.28,1.02,-.23))/1.4+f13
        sd = dot(f00,vec4(.09,.12,-.07,-.03))+dot(f01,vec4(-.04,.07,-.08,.05))+dot(f02,vec4(-.01,.06,-.02,.07))+dot(f03,vec4(-.05,.07,.03,.04))-0.16

    return sd

@ti.func
def signed_distance(obj: SDFObject, pos: vec3) -> float:
    position = obj.transform.position
    rotation = obj.transform.rotation
    scale    = obj.transform.scale

    p = angle(radians(rotation)) @ (pos - position)

    # Programmatic Animation
    t  = pi * float(u_frame[None]) / 120.0
    p  = angle(vec3(0, 0, t)) @ p
    p += vec3(0, 0, 0.1*sin(t)) 
    obj.distance = sd_bunny(p)

    return obj.distance

WORLD_LIST = [
    SDFObject(type=SHAPE_BUNNY,
                transform=Transform(vec3(0, 0, 0), vec3(-90, 0, 0), vec3(1, 1, 1)),
                material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0.0, 1, 0, 2.950))
]

objects_num = len(WORLD_LIST)
objects = SDFObject.field(shape=objects_num)
for i in range(objects_num): objects[i] = WORLD_LIST[i]

@ti.func
def nearest_object(p: vec3) -> SDFObject:
    o = objects[0]; o.distance = abs(signed_distance(o, p))
    for i in range(1, objects_num):
        oi = objects[i]
        oi.distance = abs(signed_distance(oi, p))
        if oi.distance < o.distance: o = oi
    return o

@ti.func
def calc_normal(obj: SDFObject, p: vec3) -> vec3:
    e = vec2(1, -1) * PRECISION
    return normalize(e.xyy * signed_distance(obj, p + e.xyy) + \
                     e.yyx * signed_distance(obj, p + e.yyx) + \
                     e.yxy * signed_distance(obj, p + e.yxy) + \
                     e.xxx * signed_distance(obj, p + e.xxx) )

@ti.func
def raycast(ray: Ray) -> HitRecord:
    record = HitRecord(); t = MIN_DIS
    w, s, d, cerr = 1.6, 0.0, 0.0, 1e32
    for _ in range(MAX_RAYMARCH):
        record.position = ray.at(t)
        record.object   = nearest_object(record.position)

        ld = d; d = record.object.distance
        if w > 1.0 and ld + d < s:
            s -= w * s; t += s; w = 0.7
            continue
        err = d / t
        if err < cerr: cerr = err

        s = w * d; t += s
        record.hit = err < PIXEL_RADIUS
        if t > MAX_DIS or record.hit: break

    return record

@ti.func
def sample_spherical_map(v: vec3) -> vec2:
    uv  = vec2(atan2(v.z, v.x), asin(v.y))
    uv *= vec2(0.5 / pi, 1 / pi)
    uv += 0.5
    return uv

@ti.func
def sky_color(ray: Ray) -> vec3:
    uv = sample_spherical_map(ray.direction)
    color = hdr_map.texture(uv) * 1.8
    color = pow(color, vec3(camera_gamma))
    return color

@ti.func
def fresnel_schlick(NoI: float, F0: float, roughness) -> float:
    return mix(mix(pow(abs(1.0 + NoI), 5.0), 1.0, F0), F0, roughness)

@ti.func
def hemispheric_sampling(normal: vec3) -> vec3:
    z = 2.0 * ti.random() - 1.0
    a = ti.random() * 2.0 * pi
    
    xy = sqrt(1.0 - z*z) * vec2(sin(a), cos(a))
    
    return normalize(normal + vec3(xy, z))

@ti.func
def roughness_sampling(hemispheric_sample: vec3, normal: vec3, roughness: float) -> vec3:
    alpha = roughness * roughness
    return normalize(mix(normal, hemispheric_sample, alpha))

@ti.func
def ray_surface_interaction(ray: Ray, record: HitRecord) -> Ray:
    albedo       = record.object.material.albedo
    roughness    = record.object.material.roughness
    metallic     = record.object.material.metallic
    transmission = record.object.material.transmission
    ior          = record.object.material.ior
    
    normal  = calc_normal(record.object, record.position)
    outer   = dot(ray.direction, normal) < 0
    normal *= 1 if outer else -1
    
    hemispheric_sample = hemispheric_sampling(normal)
    roughness_sample   = roughness_sampling(hemispheric_sample, normal, roughness)
    
    N   = roughness_sample
    I   = ray.direction
    NoI = dot(N, I)

    eta = ENV_IOR / ior if outer else ior / ENV_IOR
    k   = 1.0 - eta * eta * (1.0 - NoI * NoI)
    F0  = (eta - 1.0) / (eta + 1.0); F0 *= 2.0*F0
    F   = fresnel_schlick(NoI, F0, roughness)

    if ti.random() < F + metallic or k < 0.0:
        ray.direction = I - 2.0 * NoI * N
        ray.color *= float(dot(ray.direction, normal) > 0.0)
    elif ti.random() < transmission:
        ray.direction = eta * I - (sqrt(k) + eta * NoI) * N
    else:
        ray.direction = hemispheric_sample

    ray.color *= albedo
    ray.origin = record.position
    
    return ray

@ti.func
def brightness(rgb: vec3) -> float:
    return dot(rgb, vec3(0.299, 0.587, 0.114))

@ti.func
def raytrace(ray: Ray) -> Ray:
    for i in range(MAX_RAYTRACE):
        inv_pdf = exp(float(i) / light_quality)
        roulette_prob = 1.0 - (1.0 / inv_pdf)
        
        if ti.random() < roulette_prob:
            ray.color *= roulette_prob
            break

        record = raycast(ray)

        if not record.hit:
            if i == 0:
                ray.color  = vec3(1, 1, 1) # 纯白色背景
            else:
                ray.color *= sky_color(ray)
            break

        ray = ray_surface_interaction(ray, record)

        intensity  = brightness(ray.color)
        ray.color *= record.object.material.emission
        visible    = brightness(ray.color)

        if intensity < visible or visible < VISIBILITY: break

    return ray

ACESInputMat = mat3(
    0.59719, 0.35458, 0.04823,
    0.07600, 0.90834, 0.01566,
    0.02840, 0.13383, 0.83777
)

ACESOutputMat = mat3(
    +1.60475, -0.53108, -0.07367,
    -0.10208, +1.10813, -0.00605,
    -0.00327, -0.07276, +1.07602
)

@ti.func
def RRTAndODTFit(v: vec3) -> vec3:
    a = v * (v + 0.0245786) - 0.000090537
    b = v * (0.983729 * v + 0.4329510) + 0.238081
    return a / b

@ti.func
def ACESFitted(color: vec3) -> vec3:
    color = ACESInputMat  @ color
    color = RRTAndODTFit(color)
    color = ACESOutputMat @ color
    return clamp(color, 0, 1)

@ti.kernel
def render(
    camera_position: vec3, 
    camera_lookat: vec3, 
    camera_up: vec3,
    moving: bool,
    frame: int):

    camera = Camera()
    camera.lookfrom = camera_position
    camera.lookat   = camera_lookat
    camera.vup      = camera_up
    camera.aspect   = aspect_ratio
    camera.vfov     = camera_vfov
    camera.aperture = camera_aperture
    camera.focus    = camera_focus

    u_frame[None] = frame

    for i, j in image_pixels:
        buffer = vec4(0)
        # if not moving: buffer = image_buffer[i, j] # ToDo: Reprojection

        for _ in range(SAMPLE_PER_PIXEL):
            coord = vec2(i, j) + vec2(ti.random(), ti.random())
            uv = coord * SCREEN_PIXEL_SIZE

            ray = raytrace(camera.get_ray(uv, vec3(1)))
            buffer += vec4(ray.color, 1.0)

        color  = buffer.rgb / buffer.a
        color *= camera_exposure
        color  = ACESFitted(color)
        color  = pow(color, vec3(1.0 / camera_gamma))

        image_buffer[i, j] = buffer
        image_pixels[i, j] = color

window = ti.ui.Window("Taichi Renderer", image_resolution, show_window=False)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, 0, 4)

frame = 0
while window.running:
    camera.track_user_inputs(window, movement_speed=0.03, hold_key=ti.ui.LMB)
    moving = any([window.is_pressed(key) for key in ('w', 'a', 's', 'd', 'q', 'e', 'LMB', ' ')])
    render(
        camera.curr_position, 
        camera.curr_lookat, 
        camera.curr_up,
        moving,
        frame)
    frame += 1
    print(frame)
    canvas.set_image(image_pixels)
    window.save_image('out/sdf_bunny_4k_' + str(frame) + '.out.png')
    if frame > 240:
        break