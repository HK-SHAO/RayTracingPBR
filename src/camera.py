import taichi as ti
from taichi.math import vec2, vec3, radians, normalize, cross, tan, clamp

from src.dataclass import Ray, Camera
from src.util import random_in_unit_disk


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

    hwfx = half_width * c.focus * x
    hhfy = half_height * c.focus * y

    lower_left_corner = c.lookfrom - hwfx - hhfy - c.focus * z
    horizontal = 2.0 * hwfx
    vertical = 2.0 * hhfy

    ro = c.lookfrom + offset
    po = lower_left_corner + uv.x * horizontal + uv.y * vertical
    rd = normalize(po - ro)

    return Ray(ro, rd, color)


@ti.data_oriented
class SmoothCamera:
    def __init__(self):
        self.position = vec3.field(shape=())
        self.lookat = vec3.field(shape=())
        self.up = vec3.field(shape=())

        self.position_velocity = ti.field(dtype=ti.f32, shape=())
        self.lookat_velocity = ti.field(dtype=ti.f32, shape=())
        self.up_velocity = ti.field(dtype=ti.f32, shape=())
        self.moving = ti.field(dtype=ti.i32, shape=())

        self.position_velocity[None] = 10
        self.lookat_velocity[None] = 10
        self.up_velocity[None] = 10
        self.moving[None] = 0

    def bind(self, camera: ti.ui.Camera):
        self.position[None] = camera.curr_position
        self.lookat[None] = camera.curr_lookat
        self.up[None] = camera.curr_up

    @ti.kernel
    def update(self, dt: float, curr_position: vec3, curr_lookat: vec3, curr_up: vec3):
        position = self.position[None]
        lookat = self.lookat[None]
        up = self.up[None]

        position_velocity = self.position_velocity[None]
        lookat_velocity = self.lookat_velocity[None]
        up_velocity = self.up_velocity[None]

        diff_position = (curr_position - position) * \
            clamp(position_velocity * dt, 0, 1)
        diff_lookat = (curr_lookat - lookat) * \
            clamp(lookat_velocity * dt, 0, 1)
        diff_up = (curr_up - up) * clamp(up_velocity * dt, 0, 1)

        position += diff_position
        lookat += diff_lookat
        up += diff_up

        move_norm_squared = vec3(diff_position.norm_sqr(
        ), diff_lookat.norm_sqr(), diff_up.norm_sqr())

        self.position[None] = position
        self.lookat[None] = lookat
        self.up[None] = up

        self.moving[None] = move_norm_squared.max() > 1e-8


smooth_camera = SmoothCamera()
