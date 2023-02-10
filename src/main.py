import time
import taichi as ti


from src.config import image_resolution
from src.fileds import image_pixels
from src.renderer import render
from src.scene import build_scene
from src.camera import smooth_camera


window = ti.ui.Window("Taichi Renderer", image_resolution)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, -0.2, 4.0)
smooth_camera.init(camera)


build_scene()
frame = 0
prev_time = time.time()

while window.running:
    dt = time.time() - prev_time
    prev_time = time.time()

    camera.track_user_inputs(window, movement_speed=dt*5, hold_key=ti.ui.LMB)
    smooth_camera.update(dt, camera)

    render(frame)
    canvas.set_image(image_pixels)

    if window.is_pressed('c'):
        ti.tools.imwrite(image_pixels, 'out/main_' +
                         str(frame) + '.out.png')

    window.show()
    frame += 1
