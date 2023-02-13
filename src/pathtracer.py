import taichi as ti
from taichi.math import vec2, vec3, vec4


from .dataclass import SDFObject, Ray, Camera
from .scene import objects
from .fileds import ray_buffer, image_buffer, image_pixels
from .camera import get_ray, smooth, aspect_ratio, camera_vfov, camera_aperture, camera_focus
from .config import MIN_DIS, MAX_DIS, MAX_RAYMARCH, VISIBILITY, PIXEL_RADIUS, QUALITY_PER_SAMPLE, SCREEN_PIXEL_SIZE, MAX_RAYTRACE
from .util import at, brightness, sample_float, sample_vec2
from .pbr import ray_surface_interaction
from .sdf import nearest_object
from .ibl import sky_color


@ti.func
def raycast(ray: Ray) -> tuple[SDFObject, vec3, bool]:
    w, s, d, cerr = 1.6, 0.0, 0.0, 1e32
    index, t, position, hit = 0, MIN_DIS, vec3(0), False

    for _ in range(MAX_RAYMARCH):
        position = at(ray, t)
        index, distance = nearest_object(position)

        ld, d = d, distance
        if ld + d < s:
            s -= w * s
            t += s
            w *= 0.5
            w += 0.5
            continue
        err = d / t
        if err < cerr:
            cerr = err

        s = w * d
        t += s
        hit = err < PIXEL_RADIUS
        if hit or t > MAX_DIS:
            break

    return objects[index], position, hit


@ti.func
def raytrace(ray: Ray) -> Ray:
    if ray.depth > 0 and sample_float() > QUALITY_PER_SAMPLE:
        ray.color = vec3(0)
        ray.depth *= -1
    else:
        ray.color *= 1.0 / QUALITY_PER_SAMPLE
        object, position, hit = raycast(ray)

        if hit:
            intensity = brightness(ray.color)
            ray.color *= object.material.emission
            visible = brightness(ray.color)

            ray.light = intensity < visible

            if visible < VISIBILITY.x or visible > VISIBILITY.y:
                ray.depth *= -1
            elif not ray.light:
                ray = ray_surface_interaction(ray, object, position)
                ray.depth += 1
        else:
            ray.color *= sky_color(ray)
            ray.light = True

    return ray


@ti.kernel
def sample():
    for i, j in image_pixels:
        ray = ray_buffer[i, j]

        if ray.light == True or ray.depth < 1 or ray.depth > MAX_RAYTRACE:
            # image_buffer[i, j] += vec4(vec3(2.0 / (1.0 + abs(ray.depth) * 2)), 1.0)
            image_buffer[i, j] += vec4(ray.color, 1.0)

            coord = vec2(i, j) + sample_vec2()
            uv = coord * SCREEN_PIXEL_SIZE

            camera = Camera()
            camera.lookfrom = smooth.position[None]
            camera.lookat = smooth.lookat[None]
            camera.vup = smooth.up[None]
            camera.aspect = aspect_ratio[None]
            camera.vfov = camera_vfov[None]
            camera.aperture = camera_aperture[None]
            camera.focus = camera_focus[None]

            ray = get_ray(camera, uv, vec3(1))

        ray = raytrace(ray)
        ray_buffer[i, j] = ray
