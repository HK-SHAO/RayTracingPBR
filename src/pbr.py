import taichi as ti
from taichi.math import vec3, mix, sqrt, normalize, dot


from .config import ENV_IOR, MIN_DIS
from .dataclass import Ray, SDFObject
from .util import random_in_unit_sphere, sample_float
from .scene import calc_normal


@ti.func
def fresnel_schlick(NoI: float, F0: float) -> float:
    return mix(pow(abs(1.0 + NoI), 5.0), 1.0, F0)


@ti.func
def hemispheric_sampling(normal: vec3) -> vec3:
    vector = random_in_unit_sphere()
    return normalize(normal + vector)


@ti.func
def ray_surface_interaction(ray: Ray, object: SDFObject) -> Ray:
    albedo = object.material.albedo
    roughness = object.material.roughness
    metallic = object.material.metallic
    transmission = object.material.transmission
    ior = object.material.ior

    normal = calc_normal(object, ray.origin)
    outer = dot(ray.direction, normal) < 0.0
    normal *= 1.0 if outer else -1.0

    alpha = roughness * roughness
    hemispheric_sample = hemispheric_sampling(normal)
    roughness_sample = normalize(mix(normal, hemispheric_sample, alpha))

    N = roughness_sample
    I = ray.direction
    NoI = dot(N, I)

    eta = ENV_IOR / ior if outer else ior / ENV_IOR
    k = 1.0 - eta * eta * (1.0 - NoI * NoI)
    F0 = 2.0 * (eta - 1.0) / (eta + 1.0)
    F = fresnel_schlick(NoI, F0*F0)

    # ToDo: Removing if statements?
    if sample_float() < F + metallic or k < 0.0:
        ray.direction = I - 2.0 * NoI * N
        outer = dot(ray.direction, normal) < 0.0
        ray.direction *= (-1.0 if outer else 1.0)
    elif sample_float() < transmission:
        ray.direction = eta * I - (sqrt(k) + eta * NoI) * N
    else:
        ray.direction = hemispheric_sample

    ray.color *= albedo

    outer = dot(ray.direction, normal) < 0.0
    ray.origin += normal * MIN_DIS * (-1.0 if outer else 1.0)

    return ray
