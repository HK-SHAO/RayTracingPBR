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
    dt = time.time() - prev_time
    prev_time = time.time()

    direction = ti.math.vec2(float(window.is_pressed(ti.ui.RIGHT)) - float(window.is_pressed(ti.ui.LEFT)),
                             float(window.is_pressed(ti.ui.UP)) - float(window.is_pressed(ti.ui.DOWN)))

    refreshing = False
    if window.is_pressed('z'):
        refreshing = True
        camera_vfov[None] += direction.y * dt * 10
        direction = ti.math.vec2(0)
        print('vfov', camera_vfov[None])
    if window.is_pressed('x'):
        refreshing = True
        camera_aperture[None] += direction.y * dt
        direction = ti.math.vec2(0)
        print('aperture', camera_aperture[None])
    if window.is_pressed('c'):
        refreshing = True
        camera_focus[None] += direction.y * dt
        direction = ti.math.vec2(0)
        print('focus', camera_focus[None])
    if window.is_pressed('v'):
        refreshing = True
        camera_exposure[None] += direction.y * dt
        direction = ti.math.vec2(0)
        print('exposure', camera_exposure[None])

    camera.track_user_inputs(window, movement_speed=dt*5, hold_key=ti.ui.LMB)
    smooth.update(dt, camera, direction)

    render(refreshing)
    canvas.set_image(image_pixels)

    if window.is_pressed('c'):
        ti.tools.imwrite(image_pixels, 'out/main_' +
                         str(prev_time) + '.out.png')

    window.show()
