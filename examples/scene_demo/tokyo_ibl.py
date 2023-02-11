# Copyright © 2019-2023 HK-SHAO
# GPL-3.0 Licensed: https://github.com/HK-SHAO/RayTracingPBR

import taichi as ti
from taichi.math import *

ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)

image_resolution = (192*15, 108*15)

image_buffer = ti.Vector.field(4, float, image_resolution)
image_pixels = ti.Vector.field(3, float, image_resolution)

SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)
PIXEL_RADIUS      = 0.5 * min(SCREEN_PIXEL_SIZE.x, SCREEN_PIXEL_SIZE.y)

MIN_DIS      = 0.005
MAX_DIS      = 2000.0
VISIBILITY   = 0.000001

SAMPLE_PER_PIXEL = 1
MAX_RAYMARCH = 512
MAX_RAYTRACE = 512

SHAPE_SPHERE   = 1
SHAPE_BOX      = 2
SHAPE_CYLINDER = 3

ENV_IOR = 1.000277

aspect_ratio    = image_resolution[0] / image_resolution[1]
light_quality   = 128.0
camera_exposure = 1.0
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

    @ti.kernel
    def process(self, exposure: float, gamma: float):
        for i, j in self.img:
            color = self.img[i, j] * exposure
            color = pow(color, vec3(gamma))
            self.img[i, j] = color

    @ti.func
    def texture(self, uv: vec2) -> vec3:
        x = int(uv.x * self.img.shape[0])
        y = int(uv.y * self.img.shape[1])
        return self.img[x, y]

hdr_map = Image('assets/Tokyo_BigSight_3k.hdr')
hdr_map.process(exposure=1.8, gamma=camera_gamma)

@ti.dataclass
class Ray:
    origin: vec3
    direction: vec3
    color: vec3

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
    matrix: mat3

@ti.dataclass
class SDFObject:
    type: int
    distance: float
    transform: Transform
    material: Material

@ti.dataclass
class Camera:
    lookfrom: vec3
    lookat: vec3
    vup: vec3
    vfov: float
    aspect: float
    aperture: float
    focus: float

OBJECTS_LIST = sorted([
    SDFObject(type=SHAPE_SPHERE,
                transform=Transform(vec3(0, -100.501, 0), vec3(0), vec3(100)),
                material=Material(vec3(1, 1, 1)*0.6, vec3(1), 1, 1, 0, 1.635)),
    SDFObject(type=SHAPE_SPHERE,
                transform=Transform(vec3(0, 0, 0), vec3(0), vec3(0.5)),
                material=Material(vec3(1, 1, 1), vec3(0.1, 1, 0.1)*10, 1, 0, 0, 1)),
    SDFObject(type=SHAPE_SPHERE,
                transform=Transform(vec3(1, -0.2, 0), vec3(0), vec3(0.3)),
                material=Material(vec3(0.2, 0.2, 1), vec3(1), 0.2, 1, 0, 1.100)),
    SDFObject(type=SHAPE_SPHERE,
                transform=Transform(vec3(0.0, -0.2, 2), vec3(0), vec3(0.3)),
                material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 0, 1, 1.5)),
    SDFObject(type=SHAPE_CYLINDER,
                transform=Transform(vec3(-1.0, -0.2, 0), vec3(0), vec3(0.3)),
                material=Material(vec3(1.0, 0.2, 0.2), vec3(1), 0, 0, 0, 1.460)),
    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(0, 0, 5), vec3(0), vec3(2, 1, 0.2)),
                material=Material(vec3(1, 1, 0.2)*0.9, vec3(1), 0, 1, 0, 0.470)),
    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(0, 0, -2), vec3(0), vec3(2, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.9, vec3(1), 0, 1, 0, 2.950))
], key=lambda o: o.type)

SHAPE_SPLIT = [0, 0, 0, 0]
for o in OBJECTS_LIST: SHAPE_SPLIT[o.type] += 1
for i in range(1, len(SHAPE_SPLIT)): SHAPE_SPLIT[i] += SHAPE_SPLIT[i - 1]

objects = SDFObject.field()
ti.root.dense(ti.i, len(OBJECTS_LIST)).place(objects)
for i in range(objects.shape[0]): objects[i] = OBJECTS_LIST[i]

@ti.func
def random_in_unit_disk() -> vec2:
    x = ti.random()
    a = ti.random() * 2 * pi
    return sqrt(x) * vec2(sin(a), cos(a))

@ti.func
def get_ray(c: Camera, uv: vec2, color: vec3) -> Ray:
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
def at(r: Ray, t: float) -> vec3:
    return r.origin + t * r.direction

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
def sd_sphere(p: vec3, r: vec3) -> float:
    return length(p) - r.x

@ti.func
def sd_box(p: vec3, b: vec3) -> float:
    q = abs(p) - b
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0) - 0.03

@ti.func
def sd_cylinder(p: vec3, rh: vec3) -> float:
    d = abs(vec2(length(p.xz), p.y)) - rh.xy
    return min(max(d.x, d.y), 0) + length(max(d, 0))

@ti.func
def transform(t: Transform, p: vec3) -> vec3:
    p -= t.position # Cannot squeeze the Euclidean space of distance field
    p  = t.matrix @ p # Otherwise the correct ray marching is not possible
    return p

@ti.func
def signed_distance(obj: SDFObject, pos: vec3) -> float:
    scale = obj.transform.scale 
    p = transform(obj.transform, pos) 

    if    obj.type == SHAPE_SPHERE:   obj.distance = sd_sphere(p, scale)
    elif  obj.type == SHAPE_BOX:      obj.distance = sd_box(p, scale)
    elif  obj.type == SHAPE_CYLINDER: obj.distance = sd_cylinder(p, scale)
    else:                             obj.distance = MAX_DIS

    return obj.distance

@ti.func
def get_object_pos_scale(i: int, p: vec3) -> tuple[vec3, vec3]:
    obj = objects[i]
    pos = transform(obj.transform, p)
    return pos, obj.transform.scale

@ti.func
def nearest_object(p: vec3) -> tuple[int, float]:
    index = 0; min_dis = MAX_DIS
    for i in ti.static(range(SHAPE_SPLIT[0], SHAPE_SPLIT[1])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_sphere(pos, scale))
        if dis < min_dis: min_dis = dis; index = i
    for i in ti.static(range(SHAPE_SPLIT[1], SHAPE_SPLIT[2])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_box(pos, scale))
        if dis < min_dis: min_dis = dis; index = i
    for i in ti.static(range(SHAPE_SPLIT[2], SHAPE_SPLIT[3])):
        pos, scale = get_object_pos_scale(i, p)
        dis = abs(sd_cylinder(pos, scale))
        if dis < min_dis: min_dis = dis; index = i
    return index, min_dis

@ti.func
def calc_normal(obj: SDFObject, p: vec3) -> vec3:
    e = vec2(1, -1) * 0.5773 * 0.005
    return normalize(e.xyy * signed_distance(obj, p + e.xyy) + \
                     e.yyx * signed_distance(obj, p + e.yyx) + \
                     e.yxy * signed_distance(obj, p + e.yxy) + \
                     e.xxx * signed_distance(obj, p + e.xxx) )

@ti.func
def raycast(ray: Ray) -> tuple[SDFObject, vec3, bool]:
    t = MIN_DIS; w, s, d, cerr = 1.6, 0.0, 0.0, 1e32
    index = 0; position = vec3(0); hit = False
    for _ in range(MAX_RAYMARCH):
        position = at(ray, t)
        index, distance = nearest_object(position)

        ld = d; d = distance
        if ld + d < s:
            s -= w * s; t += s; w = 0.5 + 0.5 * w
            continue
        err = d / t
        if err < cerr: cerr = err

        s = w * d; t += s
        hit = err < PIXEL_RADIUS
        if t > MAX_DIS or hit: break

    return objects[index], position, hit

@ti.func
def sample_spherical_map(v: vec3) -> vec2:
    uv  = vec2(atan2(v.z, v.x), asin(v.y))
    uv *= vec2(0.5 / pi, 1 / pi)
    uv += 0.5
    return uv

@ti.func
def sky_color(ray: Ray) -> vec3:
    uv = sample_spherical_map(ray.direction)
    return hdr_map.texture(uv)

@ti.func
def fresnel_schlick(NoI: float, F0: float, roughness: float) -> float:
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
def ray_surface_interaction(ray: Ray, object: SDFObject, position: vec3) -> Ray:
    albedo       = object.material.albedo
    roughness    = object.material.roughness
    metallic     = object.material.metallic
    transmission = object.material.transmission
    ior          = object.material.ior
    
    normal  = calc_normal(object, position)
    outer   = dot(ray.direction, normal) < 0
    normal *= 1 if outer else -1
    
    hemispheric_sample = hemispheric_sampling(normal)
    roughness_sample   = roughness_sampling(hemispheric_sample, normal, roughness)
    
    N   = roughness_sample
    I   = ray.direction
    NoI = dot(N, I)

    eta = ENV_IOR / ior if outer else ior / ENV_IOR
    k   = 1.0 - eta * eta * (1.0 - NoI * NoI)
    F0  = 2.0 * (eta - 1.0) / (eta + 1.0); F0 *= F0
    F   = fresnel_schlick(NoI, F0, roughness)

    if ti.random() < F + metallic or k < 0.0:
        ray.direction = I - 2.0 * NoI * N
        ray.color *= float(dot(ray.direction, normal) > 0.0)
    elif ti.random() < transmission:
        ray.direction = eta * I - (sqrt(k) + eta * NoI) * N
    else:
        ray.direction = hemispheric_sample

    ray.color *= albedo
    ray.origin = position
    
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

        object, position, hit = raycast(ray)

        if not hit:
            ray.color *= sky_color(ray)
            break

        ray = ray_surface_interaction(ray, object, position)

        intensity  = brightness(ray.color)
        ray.color *= object.material.emission
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
    return color

@ti.func
def update_transform(i: int):
    transform = objects[i].transform
    matrix = angle(radians(transform.rotation))
    objects[i].transform.matrix = matrix

@ti.func
def update_all_transform():
    for i in objects: update_transform(i)

@ti.kernel
def init_scene():
    update_all_transform()

@ti.kernel
def sample(
    camera_position: vec3, 
    camera_lookat: vec3, 
    camera_up: vec3):

    camera = Camera()
    camera.lookfrom = camera_position
    camera.lookat   = camera_lookat
    camera.vup      = camera_up
    camera.aspect   = aspect_ratio
    camera.vfov     = camera_vfov
    camera.aperture = camera_aperture
    camera.focus    = camera_focus

    for i, j in image_pixels:
        coord = vec2(i, j) + vec2(ti.random(), ti.random())
        uv = coord * SCREEN_PIXEL_SIZE

        ray = raytrace(get_ray(camera, uv, vec3(1)))
        image_buffer[i, j] += vec4(ray.color, 1.0)

@ti.kernel
def refresh():
    image_buffer.fill(vec4(0))

@ti.kernel
def render():
    for i, j in image_pixels:
        buffer = image_buffer[i, j]
        
        color  = buffer.rgb / buffer.a
        color *= camera_exposure
        color  = ACESFitted(color)
        color  = pow(color, vec3(1.0 / camera_gamma))

        image_pixels[i, j] = clamp(color, 0, 1)

window = ti.ui.Window("Taichi Renderer", image_resolution)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, -0.2, 4)

init_scene(); frame = 0
while window.running:
    camera.track_user_inputs(window, movement_speed=0.03, hold_key=ti.ui.LMB)
    moving = any([window.is_pressed(key) for key in ('w', 'a', 's', 'd', 'q', 'e', 'LMB', ' ')])
    if moving: refresh()

    for i in range(SAMPLE_PER_PIXEL):
        sample(
            camera.curr_position, 
            camera.curr_lookat, 
            camera.curr_up)
        print('frame:', frame, 'sample:', i + 1)
    frame += 1
    render()
    
    canvas.set_image(image_pixels)
    window.show()