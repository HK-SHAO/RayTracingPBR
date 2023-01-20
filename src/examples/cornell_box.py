import taichi as ti
from taichi.math import *

ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)

image_resolution = (1920 // 4, 1920 // 4)
SAMPLE_PER_PIXEL = 1

image_buffer = ti.Vector.field(4, float, image_resolution)
image_pixels = ti.Vector.field(3, float, image_resolution)

SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)

MIN_DIS      = 0.005
MAX_DIS      = 2000.0
PRECISION    = 0.0001
VISIBILITY   = 0.000001

MAX_RAYMARCH = 512
MAX_RAYTRACE = 128

SHAPE_NONE     = 0
SHAPE_SPHERE   = 1
SHAPE_BOX      = 2
SHAPE_CYLINDER = 3

ENV_IOR = 1.000277

aspect_ratio    = image_resolution[0] / image_resolution[1]
light_quality   = 128.0
camera_exposure = 0.6
camera_vfov     = 43.6
camera_aperture = 0.01
camera_focus    = 4
camera_gamma    = 2.2

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
    distance: float
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
def sd_sphere(p: vec3, r: float) -> float:
    return length(p) - r

@ti.func
def sd_box(p: vec3, b: vec3) -> float:
    q = abs(p) - b
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0)

@ti.func
def sd_cylinder(p: vec3, rh: vec2) -> float:
    d = abs(vec2(length(p.xz), p.y)) - rh
    return min(max(d.x, d.y), 0) + length(max(d, 0))

@ti.func
def signed_distance(obj: SDFObject, pos: vec3) -> float:
    position = obj.transform.position
    rotation = obj.transform.rotation
    scale    = obj.transform.scale

    p = angle(radians(rotation)) @ (pos - position)

    if    obj.type == SHAPE_SPHERE:   obj.distance = sd_sphere(p, scale.x)
    elif  obj.type == SHAPE_BOX:      obj.distance = sd_box(p, scale)
    elif  obj.type == SHAPE_CYLINDER: obj.distance = sd_cylinder(p, scale.xy)
    else: obj.distance = sd_sphere(p, scale.x)

    return obj.distance

WORLD_LIST = [
    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(0, 0, -1), vec3(0, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(0, 1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),
    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(0, -1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(-1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 0, 0)*0.5, vec3(1), 1, 0, 0, 1.530)),
    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(0, 1, 0)*0.5, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(-0.275, -0.3, -0.2), vec3(0, -253, 0), vec3(0.25, 0.5, 0.25)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),
    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(0.275, -0.55, 0.2), vec3(0, -197, 0), vec3(0.25, 0.25, 0.25)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1), 1, 0, 0, 1.530)),

    SDFObject(type=SHAPE_BOX,
                transform=Transform(vec3(0, 0.809, 0), vec3(90, 0, 0), vec3(0.2, 0.2, 0.01)),
                material=Material(vec3(1, 1, 1), vec3(100), 1, 0, 0, 1)),
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
    record = HitRecord(distance=MIN_DIS)
    for _ in range(MAX_RAYMARCH):
        record.position  = ray.at(record.distance)
        record.object    = nearest_object(record.position)
        record.distance += record.object.distance
        record.hit       = record.object.distance < PRECISION
        if record.distance > MAX_DIS or record.hit: break

    return record

@ti.func
def sample_spherical_map(v: vec3) -> vec2:
    uv  = vec2(atan2(v.z, v.x), asin(v.y))
    uv *= vec2(0.5 / pi, 1 / pi)
    uv += 0.5
    return uv

@ti.func
def sky_color(ray) -> vec3:
    return vec3(0)

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
    return color

@ti.kernel
def render(
    camera_position: vec3, 
    camera_lookat: vec3, 
    camera_up: vec3,
    moving: bool):

    camera = Camera()
    camera.lookfrom = camera_position
    camera.lookat   = camera_lookat
    camera.vup      = camera_up
    camera.aspect   = aspect_ratio
    camera.vfov     = camera_vfov
    camera.aperture = camera_aperture
    camera.focus    = camera_focus

    for i, j in image_pixels:
        if moving: image_buffer[i, j] = vec4(0) # ToDo: Reprojection

        for _ in range(SAMPLE_PER_PIXEL):
            coord = vec2(i, j) + vec2(ti.random(), ti.random())
            uv = coord * SCREEN_PIXEL_SIZE

            ray = raytrace(camera.get_ray(uv, vec3(1)))
            image_buffer[i, j] += vec4(ray.color, 1.0)

        buffer = image_buffer[i, j]

        color  = buffer.rgb / buffer.a
        color *= camera_exposure
        color  = ACESFitted(color)
        color  = pow(color, vec3(1.0 / camera_gamma))

        image_pixels[i, j] = color

window = ti.ui.Window("Taichi Renderer", image_resolution)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, 0, 3)

while window.running:
    camera.track_user_inputs(window, movement_speed=0.03, hold_key=ti.ui.LMB)
    moving = any([window.is_pressed(key) for key in ('w', 'a', 's', 'd', 'q', 'e', 'LMB', ' ')])
    render(
        camera.curr_position, 
        camera.curr_lookat, 
        camera.curr_up,
        moving)
    canvas.set_image(image_pixels)
    window.show()