import time
import taichi as ti
from taichi.math import vec2
from taichi.ui import LEFT, RIGHT, UP, DOWN, RELEASE


from .config import image_resolution
from .fileds import image_pixels, diff_pixels, ray_buffer
from .camera import smooth, camera_exposure,  camera_focus, camera_aperture, camera_vfov
from .scene import build_scene
from .renderer import render


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

    direction = vec2(float(window.is_pressed(RIGHT)) - float(window.is_pressed(LEFT)),
                     float(window.is_pressed(UP)) - float(window.is_pressed(DOWN)))

    refreshing = False
    if refreshing:
        pass
    elif window.is_pressed('z'):
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

    for event in window.get_events(RELEASE):
        if event.key == 'g':
            ti.tools.imwrite(image_pixels, 'out/main_' +
                             str(curr_time) + '.png')

    speed = dt * 5 * (10 if window.is_pressed('Shift') else 1)
    camera.track_user_inputs(window, movement_speed=speed, hold_key=ti.ui.LMB)
    smooth.update(dt, camera, direction)

    render(refreshing)

    canvas.set_image(image_pixels)
    # canvas.set_image((diff_pixels.to_numpy() > 1e-3).astype('float32'))
    # canvas.set_image(((ray_buffer.depth).to_numpy() / 3.0).astype('float32'))

    window.show()
