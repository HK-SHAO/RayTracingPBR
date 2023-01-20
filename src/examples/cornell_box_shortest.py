import taichi as ti
from taichi.math import *

ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32)

image_resolution = (512, 512)
image_buffer = ti.Vector.field(4, float, image_resolution)
image_pixels = ti.Vector.field(3, float, image_resolution)
SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)
SAMPLE_PER_PIXEL = 1
MIN_DIS      = 0.05
MAX_DIS      = 2000.0
PRECISION    = 0.001
VISIBILITY   = 0.000001
MAX_RAYMARCH = 512
MAX_RAYTRACE = 3
ENV_IOR = 1.000277
aspect_ratio    = image_resolution[0] / image_resolution[1]
light_quality   = 128.0
camera_exposure = 1
camera_vfov     = 35
camera_aperture = 0.01
camera_focus    = 4
camera_gamma    = 2.2

Ray = ti.types.struct(origin=vec3, direction=vec3, color=vec3)
Camera = ti.types.struct(lookfrom=vec3, lookat=vec3, vup=vec3, vfov=float, aspect=float, aperture=float, focus=float)
Material = ti.types.struct(albedo=vec3, emission=vec3)
Transform = ti.types.struct(position=vec3, rotation=vec3, scale=vec3)
SDFObject = ti.types.struct(distance=float, transform=Transform, material=Material)
HitRecord = ti.types.struct(object=SDFObject, position=vec3, distance=float, hit=bool)

@ti.func
def angle(a: vec3) -> mat3:
    s, c = sin(a), cos(a)
    return mat3(c.z, s.z, 0, -s.z, c.z, 0, 0, 0, 1) @ \
           mat3(c.y, 0, -s.y, 0, 1, 0, s.y, 0, c.y) @ \
           mat3(1, 0, 0, 0, c.x, s.x, 0, -s.x, c.x)

@ti.func
def signed_distance(obj: SDFObject, pos: vec3) -> float:
    p = angle(radians(obj.transform.rotation)) @ (pos - obj.transform.position * 10)
    q = abs(p) - obj.transform.scale * 10
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0) - 0.01

WORLD_LIST = [
    SDFObject(  transform=Transform(vec3(0, 0, -1), vec3(0, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1))),
    SDFObject(  transform=Transform(vec3(0, 1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1))),
    SDFObject(  transform=Transform(vec3(0, -1, 0), vec3(90, 0, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1))),
    SDFObject(  transform=Transform(vec3(-1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(1, 0, 0)*0.5, vec3(1))),
    SDFObject(  transform=Transform(vec3(1, 0, 0), vec3(0, 90, 0), vec3(1, 1, 0.2)),
                material=Material(vec3(0, 1, 0)*0.5, vec3(1))),
    SDFObject(  transform=Transform(vec3(-0.275, -0.3, -0.2), vec3(0, -253, 0), vec3(0.25, 0.5, 0.25)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1))),
    SDFObject(  transform=Transform(vec3(0.275, -0.55, 0.2), vec3(0, -197, 0), vec3(0.25, 0.25, 0.25)),
                material=Material(vec3(1, 1, 1)*0.4, vec3(1))),
    SDFObject(  transform=Transform(vec3(0, 0.809, 0), vec3(90, 0, 0), vec3(0.2, 0.2, 0.01)),
                material=Material(vec3(1, 1, 1), vec3(100)))
]

objects_num = len(WORLD_LIST)
objects = SDFObject.field(shape=objects_num)
for i in range(objects_num): objects[i] = WORLD_LIST[i]

@ti.func
def nearest_object(p: vec3) -> SDFObject:
    o = objects[0]; o.distance = abs(signed_distance(o, p))
    for i in range(1, objects_num):
        oi = objects[i]; oi.distance = abs(signed_distance(oi, p))
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
        record.position  = ray.origin + record.distance * ray.direction
        record.object    = nearest_object(record.position)
        record.distance += record.object.distance
        record.hit       = record.object.distance < PRECISION
        if record.distance > MAX_DIS or record.hit: break
    return record

@ti.func
def hemispheric_sampling(normal: vec3) -> vec3:
    z = 2.0 * ti.random() - 1.0
    a = ti.random() * 2.0 * pi
    xy = sqrt(1.0 - z*z) * vec2(sin(a), cos(a))
    return normalize(normal + vec3(xy, z))

@ti.func
def brightness(rgb: vec3) -> float:
    return dot(rgb, vec3(0.299, 0.587, 0.114))

@ti.func
def raytrace(ray: Ray) -> Ray:
    for i in range(MAX_RAYTRACE):
        inv_pdf = exp(float(i) / light_quality)
        roulette_prob = 1.0 - (1.0 / inv_pdf)
        
        if ti.random() < roulette_prob: ray.color *= roulette_prob; break

        record = raycast(ray)
        if not record.hit: ray.color = vec3(0); break

        normal  = calc_normal(record.object, record.position)
        ray.direction = hemispheric_sampling(normal)

        ray.color *= record.object.material.albedo
        ray.origin = record.position

        intensity  = brightness(ray.color)
        ray.color *= record.object.material.emission
        visible    = brightness(ray.color)

        if intensity < visible or visible < VISIBILITY: break

    return ray

@ti.kernel
def render(camera_position: vec3, camera_lookat: vec3, camera_up: vec3, moving: bool):
    for i, j in image_pixels:
        if moving: image_buffer[i, j] = vec4(0) # ToDo: Reprojection

        for _ in range(SAMPLE_PER_PIXEL):
            coord = vec2(i, j) + vec2(ti.random(), ti.random())
            uv = coord * SCREEN_PIXEL_SIZE

            theta = radians(camera_vfov)
            half_height = tan(theta * 0.5)
            half_width = aspect_ratio * half_height

            z = normalize(camera_position - camera_lookat)
            x = normalize(cross(camera_up, z))
            y = cross(z, x)

            lens_radius = camera_aperture * 0.5
            a = ti.random() * 2 * pi
            rud = lens_radius * (sqrt(ti.random()) * vec2(sin(a), cos(a)))
            offset = x * rud.x + y * rud.y
            
            hwfx = half_width  * camera_focus * x
            hhfy = half_height * camera_focus * y

            lower_left_corner = camera_position - hwfx - hhfy - camera_focus * z
            horizontal = 2.0 * hwfx
            vertical   = 2.0 * hhfy

            ro = camera_position + offset
            po = lower_left_corner + uv.x * horizontal + uv.y * vertical
            rd = normalize(po - ro)

            ray = raytrace(Ray(ro, rd, vec3(1)))
            image_buffer[i, j] += vec4(ray.color, 1.0)

        buffer = image_buffer[i, j]

        color  = buffer.rgb / buffer.a
        color *= camera_exposure
        color = mat3(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777)  @ color
        color = (color * (color + 0.0245786) - 0.000090537) / (color * (0.983729 * color + 0.4329510) + 0.238081)
        color = mat3(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602) @ color
        color  = pow(color, vec3(1.0 / camera_gamma))

        image_pixels[i, j] = color

window = ti.ui.Window("Taichi Renderer", image_resolution)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, 0, 3.5*10)

while window.running:
    camera.track_user_inputs(window, movement_speed=0.3, hold_key=ti.ui.LMB)
    moving = any([window.is_pressed(key) for key in ('w', 'a', 's', 'd', 'q', 'e', 'LMB', ' ')])
    render(camera.curr_position, camera.curr_lookat, camera.curr_up, moving)
    canvas.set_image(image_pixels)

    window.show()