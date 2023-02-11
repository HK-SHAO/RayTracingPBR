import time
import taichi as ti


from src.config import image_resolution
from src.fileds import image_pixels
from src.renderer import render
from src.scene import build_scene
from src.camera import smooth, camera_exposure,  camera_focus, camera_aperture, camera_vfov


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

    camera.track_user_inputs(window, movement_speed=dt*5, hold_key=ti.ui.LMB)
    smooth.update(dt, camera)

    up = int(window.is_pressed(ti.ui.UP))
    down = int(window.is_pressed(ti.ui.DOWN))
    dir = up - down

    if window.is_pressed('z'):
        smooth.moving[None] = True
        camera_vfov[None] += dir * dt * 10
        print('vfov', camera_vfov[None])
    if window.is_pressed('x'):
        smooth.moving[None] = True
        camera_aperture[None] += dir * dt
        print('aperture', camera_aperture[None])
    if window.is_pressed('c'):
        smooth.moving[None] = True
        camera_focus[None] += dir * dt
        print('focus', camera_focus[None])
    if window.is_pressed('v'):
        smooth.moving[None] = True
        camera_exposure[None] += dir * dt
        print('exposure', camera_exposure[None])

    render()
    canvas.set_image(image_pixels)

    if window.is_pressed('c'):
        ti.tools.imwrite(image_pixels, 'out/main_' +
                         str(prev_time) + '.out.png')

    window.show()
