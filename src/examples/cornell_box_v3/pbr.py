import taichi as ti
from taichi.math import vec2, vec3, mix, sin, cos, sqrt, normalize, dot, pi
from config import ENV_IOR
from dataclass import Ray, HitRecord
from sdf import calc_normal


@ti.func
def fresnel_schlick(NoI: float, F0: float, roughness) -> float:
    return mix(mix(pow(abs(1.0 + NoI), 5.0), 1.0, F0), F0, roughness)


@ti.func
def hemispheric_sampling(normal: vec3) -> vec3:
    z = 2.0 * ti.random() - 1.0
    a = ti.random() * 2.0 * pi

    xy = sqrt(1.0 - z*z) * vec2(sin(a), cos(a))

    return normalize(normal + vec3(xy, z))


@ti.func
def roughness_sampling(hemispheric_sample: vec3, normal: vec3, roughness: float) -> vec3:
    alpha = roughness * roughness
    return normalize(mix(normal, hemispheric_sample, alpha))


@ti.func
def ray_surface_interaction(ray: Ray, record: HitRecord) -> Ray:
    albedo = record.object.material.albedo
    roughness = record.object.material.roughness
    metallic = record.object.material.metallic
    transmission = record.object.material.transmission
    ior = record.object.material.ior

    normal = calc_normal(record.object, record.position)
    outer = dot(ray.direction, normal) < 0
    normal *= 1 if outer else -1

    hemispheric_sample = hemispheric_sampling(normal)
    roughness_sample = roughness_sampling(
        hemispheric_sample, normal, roughness)

    N = roughness_sample
    I = ray.direction
    NoI = dot(N, I)

    eta = ENV_IOR / ior if outer else ior / ENV_IOR
    k = 1.0 - eta * eta * (1.0 - NoI * NoI)
    F0 = (eta - 1.0) / (eta + 1.0)
    F0 *= 2.0*F0
    F = fresnel_schlick(NoI, F0, roughness)

    if ti.random() < F + metallic or k < 0.0:
        ray.direction = I - 2.0 * NoI * N
        ray.color *= float(dot(ray.direction, normal) > 0.0)
    elif ti.random() < transmission:
        ray.direction = eta * I - (sqrt(k) + eta * NoI) * N
    else:
        ray.direction = hemispheric_sample

    ray.color *= albedo
    ray.origin = record.position

    return ray
