shader_type canvas_item;

uniform vec3 camera_position = vec3(0.0, 0.0, 4.0); // 传入摄像机的位置
uniform mat3 camera_rotation = mat3(1);             // 摄像机的旋转

uniform float camera_fov = 50.;
uniform float camera_lens_radius = 0.1;
uniform float camera_focus_dist = 10.;

// Raytracing in one weekend, chapter 12: Where next? Created by Reinder Nijhoff 2018
// @reindernijhoff
//
// https://www.shadertoy.com/view/XlycWh
//
// These shaders are my implementation of the raytracer described in the (excellent) 
// book "Raytracing in one weekend" [1] by Peter Shirley (@Peter_shirley). I have tried 
// to follow the code from his book as much as possible.
//
// [1] http://in1weekend.blogspot.com/2016/01/ray-tracing-in-one-weekend.html
//

#define MAX_FLOAT 1e10
#define MAX_RECURSION 12

#define LAMBERTIAN 0
#define METAL 1
#define DIELECTRIC 2

//
// Hash functions by Nimitz:
// https://www.shadertoy.com/view/Xt3cDn
//

uint base_hash(uvec2 p) {
    p = 1103515245U*((p >> 1U)^(p.yx));
    uint h32 = 1103515245U*((p.x)^(p.y>>3U));
    return h32 ^ (h32 >> 16U);
}

float hash1(inout float seed) {
    uint n = base_hash(floatBitsToUint(vec2(seed+=.1,seed+=.1)));
    return float(n)/intBitsToFloat(-1);
}

vec2 hash2(inout float seed) {
    uint n = base_hash(floatBitsToUint(vec2(seed+=.1,seed+=.1)));
    uvec2 rz = uvec2(n, n*48271U);
    return vec2(rz.xy & uvec2(0x7fffffff))/float(0x7fffffff);
}

vec3 hash3(inout float seed) {
    uint n = base_hash(floatBitsToUint(vec2(seed+=.1,seed+=.1)));
    uvec3 rz = uvec3(n, n*16807U, n*48271U);
    return vec3(rz & uvec3(0x7fffffff))/float(0x7fffffff);
}

//
// Ray trace helper functions
//

float schlick(float cosine, float ior) {
    float r0 = (1.-ior)/(1.+ior);
    r0 = r0*r0;
    return r0 + (1.-r0)*pow((1.-cosine),5.);
}

bool modified_refract(const in vec3 v, const in vec3 n, const in float ni_over_nt, 
                      out vec3 refracted) {
    float dt = dot(v, n);
    float discriminant = 1. - ni_over_nt*ni_over_nt*(1.-dt*dt);
    if (discriminant > 0.) {
        refracted = ni_over_nt*(v - n*dt) - n*sqrt(discriminant);
        return true;
    } else { 
        return false;
    }
}

vec3 random_in_unit_sphere(in float seed) {
    vec3 h = hash3(seed) * vec3(2.,6.28318530718,1.)-vec3(1,0,0);
    float phi = h.y;
    float r = pow(h.z, 1./3.);
	return r * vec3(sqrt(1.-h.x*h.x)*vec2(sin(phi),cos(phi)),h.x);
}

vec2 random_in_unit_disk(inout float seed) {
    vec2 h = hash2(seed) * vec2(1.,6.28318530718);
    float phi = h.y;
    float r = sqrt(h.x);
	return r * vec2(sin(phi),cos(phi));
}

//
// Ray
//

struct ray {
    vec3 origin, direction;
};

//
// Material
//

struct material {
    int type;
    vec3 albedo;
    float v;
};

//
// Hit record
//

struct hit_record {
    float t;
    vec3 p, normal;
    material mat;
};

bool material_scatter(const in ray r_in, const in hit_record rec, out vec3 attenuation, 
                      out ray scattered, float g_seed) {
	switch (rec.mat.type) {
		case LAMBERTIAN: 
			vec3 rd = normalize(rec.normal + random_in_unit_sphere(g_seed));
	        scattered = ray(rec.p, rd);
	        attenuation = rec.mat.albedo;
	        return true;
		case METAL: 
			vec3 rd = reflect(r_in.direction, rec.normal);
	        scattered = ray(rec.p, normalize(rd + rec.mat.v*random_in_unit_sphere(g_seed)));
	        attenuation = rec.mat.albedo;
	        return true;
		case DIELECTRIC: 
	        vec3 outward_normal, refracted, 
	             reflected = reflect(r_in.direction, rec.normal);
	        float ni_over_nt, reflect_prob, cosine;
	        
	        attenuation = vec3(1);
	        if (dot(r_in.direction, rec.normal) > 0.) {
	            outward_normal = -rec.normal;
	            ni_over_nt = rec.mat.v;
	            cosine = dot(r_in.direction, rec.normal);
	            cosine = sqrt(1. - rec.mat.v*rec.mat.v*(1.-cosine*cosine));
	        } else {
	            outward_normal = rec.normal;
	            ni_over_nt = 1. / rec.mat.v;
	            cosine = -dot(r_in.direction, rec.normal);
	        }
	        
	        if (modified_refract(r_in.direction, outward_normal, ni_over_nt, refracted)) {
		        reflect_prob = schlick(cosine, rec.mat.v);
	        } else {
	            reflect_prob = 1.;
	        }
	        
	        if (hash1(g_seed) < reflect_prob) {
	            scattered = ray(rec.p, reflected);
	        } else {
	            scattered = ray(rec.p, refracted);
	        }
	        return true;
		default:
			return false;
	}
}

//
// Hitable, for now this is always a sphere
//

struct hitable {
    vec3 center;
    float radius;
};

bool hitable_hit(const in hitable hb, const in ray r, const in float t_min, 
                 const in float t_max, inout hit_record rec) {
    // always a sphere
    vec3 oc = r.origin - hb.center;
    float b = dot(oc, r.direction);
    float c = dot(oc, oc) - hb.radius * hb.radius;
    float discriminant = b * b - c;
    if (discriminant < 0.0) return false;

	float s = sqrt(discriminant);
	float t1 = -b - s;
	float t2 = -b + s;
	
	float t = t1 < t_min ? t2 : t1;
    if (t < t_max && t > t_min) {
        rec.t = t;
        rec.p = r.origin + t*r.direction;
        rec.normal = (rec.p - hb.center) / hb.radius;
	    return true;
    } else {
        return false;
    }
}

//
// Color & Scene
//

bool world_hit(const in ray r, const in float t_min, 
               const in float t_max, out hit_record rec) {
    rec.t = t_max;
    bool hit = false;

  	if (hitable_hit(hitable(vec3(0,-1000,-1),1000.),r,t_min,rec.t,rec)) {
		hit=true;rec.mat=material(LAMBERTIAN,vec3(.5),0.);
	}

  	if (hitable_hit(hitable(vec3( 0,1,0),1.),r,t_min,rec.t,rec)) {
		hit=true;rec.mat=material(DIELECTRIC,vec3(0),1.5);
	}
    if (hitable_hit(hitable(vec3(-4,1,0),1.),r,t_min,rec.t,rec)) {
		hit=true;rec.mat=material(LAMBERTIAN,vec3(.4,.2,.1),0.);
	}
	if (hitable_hit(hitable(vec3( 4,1,0),1.),r,t_min,rec.t,rec)) {
		hit=true;rec.mat=material(METAL     ,vec3(.7,.6,.5),0.);
	}
    
    for (int a = -3; a < 3; a++) {
        for (int b = -3; b < 3; b++) {
            float m_seed = float(a) + float(b)/1000.;
            vec3 rand1 = hash3(m_seed);            
            vec3 center = vec3(float(a)+.9*rand1.x,.2,float(b)+.9*rand1.y); 
            float choose_mat = rand1.z;
            
            if (distance(center,vec3(0,1,0)) > 1.1) {
                if (choose_mat < .8) { // diffuse
                    if (hitable_hit(hitable(center,.2),r,t_min,rec.t,rec)) {
                        hit=true;
						rec.mat=material(LAMBERTIAN, hash3(m_seed)* hash3(m_seed),0.);
                    }
                } else if (choose_mat < 0.95) { // metal
                    if (hitable_hit(hitable(center,.2),r,t_min,rec.t,rec)) {
                        hit=true;
						rec.mat=material(METAL, vec3(.7,.6,.5),0.);
                    }
                } else { // glass
                    if (hitable_hit(hitable(center,.2),r,t_min,rec.t,rec)) {
                        hit=true;
						rec.mat=material(DIELECTRIC, vec3(0),1.5);
                    }
                }
            }
        }
    }
    
    return hit;
}

vec3 color(in ray r, float g_seed) {
    vec3 col = vec3(1);  
	hit_record rec;
    
    for (int i=0; i<MAX_RECURSION; i++) {
    	if (world_hit(r, 0.001, MAX_FLOAT, rec)) {
            ray scattered;
            vec3 attenuation;
            if (material_scatter(r, rec, attenuation, scattered, g_seed)) {
                col *= attenuation;
                r = scattered;
            } else {
                return vec3(0);
            }
	    } else {
            float t = .5*r.direction.y + .5;
            col *= mix(vec3(1),vec3(.5,.7,1), t);
            return col;
    	}
    }
    return vec3(0);
}

//
// Camera
//

struct camera {
    vec3 origin, lower_left_corner, horizontal, vertical, u, v, w;
    float lens_radius;
};

camera camera_const(const in vec3 lookfrom, const in vec3 lookat, const in vec3 vup, 
                    const in float vfov, const in float aspect, const in float aperture, 
                    const in float focus_dist) {
    camera cam;    
    cam.lens_radius = aperture / 2.;
    float theta = vfov*3.14159265359/180.;
    float half_height = tan(theta/2.);
    float half_width = aspect * half_height;
    cam.origin = lookfrom;
    cam.w = normalize(lookfrom - lookat);
    cam.u = normalize(cross(vup, cam.w));
    cam.v = cross(cam.w, cam.u);
    cam.lower_left_corner = cam.origin  - half_width*focus_dist*cam.u -half_height*focus_dist*cam.v - focus_dist*cam.w;
    cam.horizontal = 2.*half_width*focus_dist*cam.u;
    cam.vertical = 2.*half_height*focus_dist*cam.v;
    return cam;
}
    
ray camera_get_ray(camera c, vec2 uv, float g_seed) {
    vec2 rd = c.lens_radius*random_in_unit_disk(g_seed);
    vec3 offset = c.u * rd.x + c.v * rd.y;
    return ray(c.origin + offset, 
               normalize(c.lower_left_corner + uv.x*c.horizontal + uv.y*c.vertical - c.origin - offset));
}

//
// Main
//


void fragment() {
	vec2 fragCoord = FRAGCOORD.xy;
	vec2 resolution = 1. / SCREEN_PIXEL_SIZE.xy;
	
	float g_seed = TIME + float(base_hash(floatBitsToUint(fragCoord)))/float(0xffffffff);
	
	// camera
	float lens_radius = camera_lens_radius;
	float fov = camera_fov;
	float focus_dist = camera_focus_dist;
	
	vec3 ro = camera_position;
	mat3 ca = camera_rotation;

	vec3 lookfrom = ro;
	vec3 lookat = ro + ca * vec3(0., 0., -1.);
	
	float aspect = resolution.x/resolution.y;
	camera cam = camera_const(lookfrom,
		lookat, vec3(0,-1,0), fov, aspect, lens_radius, focus_dist);
	
	vec2 uv = (fragCoord + hash2(g_seed))/resolution.xy;
	uv.x = 1. - uv.x;
	
	ray r = camera_get_ray(cam, uv, g_seed);
	vec3 col = color(r, g_seed);
	
//	const float N = 100.;
//	for (float i = 1.111; i < N; i++){
//		g_seed += 10.0*i + sin(i);
//		uv = (fragCoord + hash2(g_seed))/resolution.xy;
//		uv.x = 1. - uv.x;
//		r = camera_get_ray(cam, uv, g_seed);
//		col += color(r, g_seed);
//	}
//	col = col / N;

	vec4 tot = vec4(0.0);

	tot = vec4(col, 1.0);
	
	COLOR = tot;
}