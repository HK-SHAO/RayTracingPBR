import taichi as ti
from taichi.math import vec3, mix, sqrt, normalize, dot


from src.config import ENV_IOR
from src.dataclass import Ray, SDFObject
from src.sdf import calc_normal
from src.util import random_in_unit_sphere


@ti.func
def fresnel_schlick(NoI: float, F0: float) -> float:
    return mix(pow(abs(1.0 + NoI), 5.0), 1.0, F0)


@ti.func
def hemispheric_sampling(normal: vec3) -> vec3:
    vector = random_in_unit_sphere()
    return normalize(normal + vector)


@ti.func
def roughness_sampling(hemispheric_sample: vec3, normal: vec3, roughness: float) -> vec3:
    alpha = roughness * roughness
    return normalize(mix(normal, hemispheric_sample, alpha))


@ti.func
def ray_surface_interaction(ray: Ray, object: SDFObject, position: vec3) -> Ray:
    albedo = object.material.albedo
    roughness = object.material.roughness
    metallic = object.material.metallic
    transmission = object.material.transmission
    ior = object.material.ior

    normal = calc_normal(object, position)
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
    F0 = 2.0 * (eta - 1.0) / (eta + 1.0)
    F = fresnel_schlick(NoI, F0*F0)

    if ti.random() < F + metallic or k < 0.0:
        ray.direction = I - 2.0 * NoI * N
        ray.color *= float(dot(ray.direction, normal) > 0.0)
    elif ti.random() < transmission:
        ray.direction = eta * I - (sqrt(k) + eta * NoI) * N
    else:
        ray.direction = hemispheric_sample

    ray.color *= albedo
    ray.origin = position

    return ray
