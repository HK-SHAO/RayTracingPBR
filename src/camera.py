import taichi as ti
from taichi.math import pi, vec2, vec3, radians, normalize, cross, tan, clamp
from taichi.ui.utils import euler_to_vec, vec_to_euler

from .dataclass import Ray, Camera
from .config import SCREEN_PIXEL_SIZE
from .util import random_in_unit_disk
from .fileds import u_frame


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

    def init(self, camera: ti.ui.Camera):
        self.position[None] = camera.curr_position
        self.lookat[None] = camera.curr_lookat
        self.up[None] = camera.curr_up

    def update(self, dt: float, camera: ti.ui.Camera, direction: vec2):
        self._update(dt, camera.curr_position,
                     camera.curr_lookat, camera.curr_up)
        self._rotate(dt, camera, direction)

    def _rotate(self, dt: float, camera: ti.ui.Camera, direction: vec2):
        front = (camera.curr_lookat - camera.curr_position).normalized()

        yaw, pitch = vec_to_euler(front)
        yaw -= direction.x * dt
        pitch += direction.y * dt

        # Avoid Gimbal Lock
        pitch = max(-pi*0.5*0.999, min(pi*0.5*0.999, pitch))

        front = euler_to_vec(yaw, pitch)
        camera.lookat(*(camera.curr_position + front))

        if abs(direction.x) > 1e-3:
            self.moving[None] = True

    @ti.kernel
    def _update(self, dt: float, curr_position: vec3, curr_lookat: vec3, curr_up: vec3):
        position = self.position[None]
        lookat = self.lookat[None]
        up = self.up[None]

        position_velocity = self.position_velocity[None]
        lookat_velocity = self.lookat_velocity[None]
        up_velocity = self.up_velocity[None]

        diff_position = (curr_position - position)
        diff_lookat = (curr_lookat - lookat)
        diff_up = (curr_up - up)

        position += diff_position * clamp(position_velocity * dt, 0, 1)
        lookat += diff_lookat * clamp(lookat_velocity * dt, 0, 1)
        up += diff_up * clamp(up_velocity * dt, 0, 1)

        moving = vec3(
            abs(diff_position).max(),
            abs(diff_lookat).max(),
            abs(diff_up).max()
        ).max() > 1e-3

        self.position[None] = position
        self.lookat[None] = lookat
        self.up[None] = up

        self.moving[None] = moving

        u_frame[None] += 1


smooth = SmoothCamera()

camera_gamma = 2.2

aspect_ratio = ti.field(dtype=ti.f32, shape=())
camera_exposure = ti.field(dtype=ti.f32, shape=())
camera_vfov = ti.field(dtype=ti.f32, shape=())
camera_aperture = ti.field(dtype=ti.f32, shape=())
camera_focus = ti.field(dtype=ti.f32, shape=())

aspect_ratio[None] = SCREEN_PIXEL_SIZE.y / SCREEN_PIXEL_SIZE.x
camera_exposure[None] = 1
camera_vfov[None] = 35
camera_aperture[None] = 0.01
camera_focus[None] = 4
