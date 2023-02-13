import time
import taichi as ti


from .config import image_resolution
from .fileds import image_pixels
from .renderer import render
from .scene import build_scene
from .camera import smooth, camera_exposure,  camera_focus, camera_aperture, camera_vfov


window = ti.ui.Window("Taichi Renderer", image_resolution)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, -0.2, 4.0)
smooth.init(camera)


build_scene()
prev_time = time.time()

while window.running:
    curr_time = time.time()
    dt = curr_time - prev_time
    prev_time = curr_time

    direction = ti.math.vec2(float(window.is_pressed(ti.ui.RIGHT)) - float(window.is_pressed(ti.ui.LEFT)),
                             float(window.is_pressed(ti.ui.UP)) - float(window.is_pressed(ti.ui.DOWN)))

    refreshing = False
    if window.is_pressed('z'):
        camera_vfov[None] += direction.y * dt * 10
        direction.y = 0
        refreshing = True
        print('vfov', camera_vfov[None])
    elif window.is_pressed('x'):
        camera_aperture[None] += direction.y * dt
        direction.y = 0
        refreshing = True
        print('aperture', camera_aperture[None])
    elif window.is_pressed('c'):
        camera_focus[None] += direction.y * dt
        direction.y = 0
        refreshing = True
        print('focus', camera_focus[None])
    elif window.is_pressed('v'):
        camera_exposure[None] += direction.y * dt * 10
        direction.y = 0
        print('exposure', camera_exposure[None])
    elif window.is_pressed('g'):
        ti.tools.imwrite(image_pixels, 'out/main_' +
                         str(curr_time) + '.out.png')

    if window.is_pressed('Shift'):
        speed = dt * 50
    else:
        speed = dt * 5

    camera.track_user_inputs(window, movement_speed=speed, hold_key=ti.ui.LMB)
    smooth.update(dt, camera, direction)

    render(refreshing)
    canvas.set_image(image_pixels)

    window.show()
