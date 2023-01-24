import time
import taichi as ti


from config import image_resolution
from scene import image_pixels
from renderer import render


window = ti.ui.Window("Taichi Renderer", image_resolution)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, 0, 3.5*10)

while window.running:
    camera.track_user_inputs(window, movement_speed=0.3, hold_key=ti.ui.LMB)
    moving = any([window.is_pressed(key)
                 for key in ('w', 'a', 's', 'd', 'q', 'e', 'LMB', ' ')])
    render(
        camera.curr_position,
        camera.curr_lookat,
        camera.curr_up,
        moving)
    canvas.set_image(image_pixels)

    if window.is_pressed('g'):
        window.save_image(str(int(time.time() * 1000)) + '.out.png')

    window.show()
