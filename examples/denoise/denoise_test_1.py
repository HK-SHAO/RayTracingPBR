import taichi as ti
from taichi.math import *
import numpy as np


image_resolution = (1920 * 4 // 10, 1080 * 4 // 10)
VISIBILITY = vec2(1e-4, 1e4)
SCREEN_PIXEL_SIZE = 1.0 / vec2(image_resolution)

ti.init(arch=ti.gpu, default_ip=ti.i32, default_fp=ti.f32, debug=False)


@ti.data_oriented
class Image:
    def __init__(self, path: str):
        img = ti.tools.imread(path).astype(np.float32)
        self.img = vec3.field(shape=img.shape[:2])
        self.img.from_numpy(img / 255)

    @ti.kernel
    def process(self, exposure: float, gamma: float):
        for i, j in self.img:
            color = self.img[i, j] * exposure
            color = pow(color, vec3(gamma))
            self.img[i, j] = color

    @ti.func
    def texture(self, uv: vec2) -> vec3:
        x = int(uv.x * self.img.shape[0])
        y = int(uv.y * self.img.shape[1])
        return self.img[x, y]


hdr_map = Image('assets/Tokyo_BigSight_3k.hdr')
hdr_map.process(exposure=1.2, gamma=2.2)


@ti.func
def sample_vec2() -> vec2:
    x = ti.random()
    y = ti.random()
    return vec2(x, y)


@ti.func
def brightness(rgb: vec3) -> float:
    return dot(rgb, vec3(0.299, 0.587, 0.114))


sample_buffer = ti.Vector.field(3, float)
image_buffer = ti.Vector.field(4, float)
image_pixels = ti.Vector.field(3, float)
denoise_pixels = ti.Vector.field(3, float)

ti.root.dense(ti.ij, image_resolution).place(sample_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_buffer)
ti.root.dense(ti.ij, image_resolution).place(image_pixels)
ti.root.dense(ti.ij, image_resolution).place(denoise_pixels)


@ti.kernel
def sample(field: ti.template()):
    for i, j in field:
        coord = vec2(i, j) + sample_vec2()
        uv = coord * SCREEN_PIXEL_SIZE
        field[i, j] = hdr_map.texture(uv)


@ti.kernel
def sum(sum: ti.template(), sample: ti.template()):
    for i, j in sum:
        sum[i, j] += vec4(sample[i, j], 1.0)


@ti.kernel
def noise(field: ti.template(), t: float):
    for i, j in field:
        color = field[i, j]
        if ti.random() > t:
            color *= 0.0
        else:
            color *= 1.0 / t
        field[i, j] = color


@ti.kernel  # from https://www.shadertoy.com/view/7tKGzD
def denoise(pixels_in: ti.template(), pixels_out: ti.template(), threshold: float):
    for i, j in pixels_in:
        pixel1 = pixels_in[i, j]
        pixel2 = pixels_out[i, j]
        col = mix(pixel1, pixel2, 0.2)

        if brightness(pixel1) < threshold:
            sur0 = pixels_out[clamp(i+1, 0, pixels_out.shape[0]-1), j]
            sur1 = pixels_out[clamp(i-1, 0, pixels_out.shape[0]-1), j]
            sur2 = pixels_out[i, clamp(j+1, 0, pixels_out.shape[1]-1)]
            sur3 = pixels_out[i, clamp(j+1, 0, pixels_out.shape[1]-1)]

            sum = vec3(0.0)
            counter = 0.0

            if brightness(sur0) > threshold:
                sum += sur0
                counter += 1.0
            if brightness(sur1) > threshold:
                sum += sur1
                counter += 1.0
            if brightness(sur2) > threshold:
                sum += sur2
                counter += 1.0
            if brightness(sur3) > threshold:
                sum += sur3
                counter += 1.0

            sum /= counter
            col = sum

        pixels_out[i, j] = col


@ti.kernel
def render():
    for i, j in image_pixels:
        buffer = image_buffer[i, j]
        image_pixels[i, j] = buffer.rgb / buffer.a


def main():
    window = ti.ui.Window("Taichi Renderer", image_resolution)
    canvas = window.get_canvas()

    spp = 100
    once = 100

    t = 0

    while window.running:
        t += 1
        if spp > 0:
            spp -= 1
            sample(sample_buffer)
            noise(sample_buffer, 0.5)
            sum(image_buffer, sample_buffer)
        if once > 0:
            once -= 1
            render()
            noise(image_pixels, 0.5)
            denoise(image_pixels, denoise_pixels, VISIBILITY.x)

        if (t // 200) % 2 == 0:
            canvas.set_image(image_pixels)
        else:
            canvas.set_image(denoise_pixels)

        if window.is_pressed('g'):
            ti.tools.imwrite(image_pixels, 'out/noise_image_pixels.png')
            ti.tools.imwrite(denoise_pixels, 'out/noise_denoise_pixels.png')
        window.show()


if __name__ == '__main__':
    main()
