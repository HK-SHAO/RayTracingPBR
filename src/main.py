import taichi as ti


from src.config import image_resolution
from src.fileds import image_pixels
from src.renderer import render
from src.scene import build_scene


window = ti.ui.Window("Taichi Renderer", image_resolution)
canvas = window.get_canvas()
camera = ti.ui.Camera()
camera.position(0, -0.2, 4.0)


build_scene()
frame = 0

while window.running:
    camera.track_user_inputs(window, movement_speed=0.03, hold_key=ti.ui.LMB)
    moving = any([window.is_pressed(key)
                 for key in ('w', 'a', 's', 'd', 'q', 'e', 'LMB', ' ')])
    render(
        camera.curr_position,
        camera.curr_lookat,
        camera.curr_up,
        moving,
        frame)
    canvas.set_image(image_pixels)

    if window.is_pressed('c'):
        ti.tools.imwrite(image_pixels, 'out/main_' +
                         str(frame) + '.out.png')

    window.show()
    frame += 1
