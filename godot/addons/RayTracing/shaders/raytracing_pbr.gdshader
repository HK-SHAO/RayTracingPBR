shader_type canvas_item;

// 传入统一值
uniform vec3 camera_position    = vec3(0.0, 0.0, 4.0);  // 传入摄像机的位置
uniform mat3 camera_rotation    = mat3(1);              // 摄像机的旋转
uniform float camera_aspect     = 2.0;                  // 画布长宽比
uniform float camera_vfov       = 30.0;                 // 摄像机的纵向视野
uniform float camera_focus      = 2.0;                  // 摄像机的对焦距离
uniform float camera_aperture   = 0.005;                // 摄像机的光圈大小
uniform float camera_gamma      = 0.2;                  // gamma 矫正值

// 配置常量
const float TMIN        = 0.001;                        // 光开始传播的起始偏移，避免光线自相交
const float TMAX        = 2000.0;                       // 最大单次光线传播距离
const float PRECISION   = 0.00001;                      // 必须要小于 TMIN，否则光线会自相交产生阴影痤疮
const float MAP_SIZE    = float(0x7fffffff);            // 地图大小

const uint MAX_RAYMARCH = 512U;                         // 最大光线步进次数
const uint MAX_RAYTRACE = 512U;                         // 最大光线追踪次数

// 光线
struct ray {
    vec3 origin;        // 光的起点
    vec3 direction;     // 光的方向
    vec4 color;         // 光的颜色
};

// 物体材质
struct material {
    vec3 albedo;        // 反照率
    float roughness;    // 粗糙度
    float metallic;     // 金属度
    float transmission; // 透明度
    vec4 emission;      // 自发光 (RGB, Intensity)
    vec3 normal;        // 切线空间法线
};

// 光子击中的记录
struct record {
    bool hit;           // 是否击中
    float t;            // 沿射线前进的距离 (为负代表在物体内部击中)
    vec3 position;      // 击中的位置
    vec3 normal;        // 击中位置的法线
    material mtl;       // 击中的材质
};

// SDF 物体
struct object {
    float sd;           // 到物体表面的距离
    material mtl;       // 物体的材质
};

// 摄像机
struct camera {
    vec3 lookfrom;      // 视点位置
    vec3 lookat;        // 目标位置
    vec3 vup;           // 向上的方向
    float vfov;         // 视野
    float aspect;       // 传感器长宽比
    float aperture;     // 光圈大小
    float focus;        // 对焦距离
};

// 随机发生器
struct random {
    float seed;         // 随机数种子
    float value;        // 上次的随机值
};

// 对三维向量进行哈希
float hash(vec3 x) {
    uvec3 p = floatBitsToUint(x);
    p = 1103515245U * ((p.xyz >> 1U) ^ (p.yzx));
    uint h32 = 1103515245U * ((p.x ^ p.z) ^ (p.y >> 3U));
    uint n = h32 ^ (h32 >> 16U);
    return float(n) * (1.0 / float(0x7fffffff));
}

// 生成归一化随机数
float noise(inout random r) {
    r.value = fract(sin(r.seed++)*43758.5453123);
    return r.value;
}

// 光子在射线所在的位置
vec3 at(ray r, float t) {
    return r.origin + t * r.direction;
}

// 单位圆内随机取一点
vec2 random_in_unit_disk(inout random seed) {
    float r = noise(seed);
    float a = TAU * noise(seed);
    return r * vec2(sin(a), cos(a));
//    return sqrt(r) * vec2(sin(a), cos(a));
}

// 从摄像机获取光线
ray get_ray(camera c, vec2 uv, vec4 color, inout random rand) {
    // 根据 VFOV 和显示画布长宽比计算传感器长宽
    float theta = c.vfov * PI / 180.0;
    float half_height = tan(theta / 2.0);
    float half_width = c.aspect * half_height;
    
    // 以目标位置到摄像机位置为 Z 轴正方向
    vec3 z = normalize(c.lookfrom - c.lookat);
    // 计算出摄像机传感器的 XY 轴正方向
    vec3 x = normalize(cross(c.vup, z));
    vec3 y = cross(z, x);
    
    vec3 lower_left_corner = c.lookfrom - half_width  * c.focus*x
                                        - half_height * c.focus*y
                                        -               c.focus*z;
    
    vec3 horizontal = 2.0 * half_width  * c.focus * x;
    vec3 vertical   = 2.0 * half_height * c.focus * y;
    
    // 模拟光进入镜头光圈
    float lens_radius = c.aperture / 2.0;
    vec2 rud = lens_radius * random_in_unit_disk(rand);
    vec3 offset = x * rud.x + y * rud.y;
    
    // 计算光线起点和方向
    vec3 ro = c.lookfrom + offset;
    vec3 po = lower_left_corner + uv.x*horizontal 
                                + uv.y*vertical;
    vec3 rd = normalize(po - ro);
    
    return ray(ro, rd, color);
}

// SDF 球体
float sphere(vec3 p, float s) {
    return length(p) - s;
}

// SDF 盒子
float box(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0);
}

// SDF 圆柱
float cylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz),p.y)) - vec2(r, h);
    return min(max(d.x,d.y), 0.0) + length(max(d, 0.0));
}

// SDF 地图
object map(vec3 p) {
    const object objs[] = {
        object(sphere(p - vec3(0, -100.5, 0), 100),
                        material(vec3(1.0, 1.0, 1.0)*0.3,
                                    1.0,
                                    0.0,
                                    0.0,
                                    vec4(0),
                                    vec3(0, 0, 1)
                        )
        ),
        object(sphere(p - vec3(0, 0, 0), 0.5),
                        material(vec3(1.0, 1.0, 1.0),
                                    1.0,
                                    0.0,
                                    0.0,
                                    vec4(0.1, 1.0, 0.1, 10.0),
                                    vec3(0, 0, 1)
                        )
        ),
        object(sphere(p - vec3(-1.0, -0.2, 0), 0.3),
                        material(vec3(1.0, 0.1, 0.1),
                                    0.9,
                                    0.1,
                                    0.0,
                                    vec4(0),
                                    vec3(0, 0, 1)
                        )
        ),
        object(sphere(p - vec3(1.0, -0.2, 0), 0.3),
                        material(vec3(0.1, 0.1, 1.0),
                                0.3,
                                1.0,
                                0.0,
                                vec4(0),
                                vec3(0, 0, 1)
                        )
        ),
        object(box(p - vec3(0, 0, -1), vec3(2, 1, 0.2)),
                        material(vec3(1.0, 1.0, 1.0),
                                0.1,
                                0.9,
                                0.0,
                                vec4(0),
                                vec3(0, 0, 1)
                        )
        ),
        object(cylinder(p - vec3(0, 0.1, 1), 0.5, 0.2),
                        material(vec3(1.0, 1.0, 0.1),
                                0.0,
                                1.0,
                                0.0,
                                vec4(0),
                                vec3(0, 0, 1)
                        )
        ),
        object(cylinder(p - vec3(0, 0.0, -2), 0.6, 0.5),
                        material(vec3(0.1, 1.0, 0.1),
                                1.0,
                                1.0,
                                0.0,
                                vec4(0),
                                vec3(0, 0, 1)
                        )
        ),
        object(sphere(p - vec3(1.0, -0.2, 2), 0.3),
                        material(vec3(1.0, 1.0, 1.0),
                                0.0,
                                0.0,
                                1.0,
                                vec4(0),
                                vec3(0, 0, 1)
                        )
        )
    };
    
    // 返回距离最近的那个物体
    object o; o.sd = MAP_SIZE;
    for (int i = 0; i < objs.length(); i++) {
        const object oi = objs[i];
        if (oi.sd < o.sd) o = oi;
    }

    return o;
}

// 计算地图法线 (这里还可以优化，因为计算法线不应该再次寻找最近物体)
vec3 calc_normal(vec3 p) {
    vec2 e = vec2(1, -1) * 0.5773 * 0.0005;
    return normalize( e.xyy*map( p + e.xyy ).sd + 
                      e.yyx*map( p + e.yyx ).sd + 
                      e.yxy*map( p + e.yxy ).sd + 
                      e.xxx*map( p + e.xxx ).sd );
}

// 用世界坐标下的法线计算 TBN 矩阵
mat3 TBN(vec3 N) {
    vec3 T, B;
    
    if (N.z < -0.999999) {
        T = vec3(0, -1, 0);
        B = vec3(-1, 0, 0);
    } else {
        const float a = 1.0 / (1.0 + N.z);
        const float b = -N.x*N.y*a;
        
        T = vec3(1.0 - N.x*N.x*a, b, -N.x);
        B = vec3(b, 1.0 - N.y*N.y*a, -N.y);
    }
    
    return mat3(T, B, N);
}

// 光线步进
record raycast(ray r) {
    record rec; rec.t = TMIN;
    for(uint i = 0U; i < MAX_RAYMARCH && rec.t < TMAX; i++) {
        rec.position = at(r, rec.t);
        object obj = map(rec.position);
        if (abs(obj.sd) < PRECISION) {
            rec.mtl = obj.mtl;
            rec.t *= sign(obj.sd);
            rec.hit = true;
            return rec;
        }
        rec.t += abs(obj.sd);
    }
    // 没有击中物体
    rec.hit = false;
    return rec;
}

// 天空
vec4 sky(ray r) {
    float t = 0.5 + 0.5 * r.direction.y;
    vec4 bottom = vec4(1.0, 1.0, 1.0, 1.0);
    vec4 top = vec4(0.5, 0.7, 1.0, 1.0);
    return mix(bottom, top, t);
}

// 用粗糙度计算菲涅尔近似值
float fresnel_schlick_roughness(float cosTheta, float F0, float roughness) {
    return F0 + (max((1. - roughness), F0) - F0) * pow(abs(1. - cosTheta), 5U);
}

// 以 n 为法线进行半球采样
vec3 hemispheric_sampling(vec3 n, inout random rand) {
    float ra = TAU * noise(rand);
    float rb = noise(rand);
    
    vec2 v = vec2(cos(ra), sin(ra));
    vec2 rxy = sqrt(rb) * v; 
    float rz = sqrt(1.0 - rb);
    
    return TBN(n) * vec3(rxy, rz);
}

// 用粗糙度采样沿向量 n 采样
vec3 hemispheric_sampling_roughness(vec3 n, float roughness, inout random rand) {
    float ra = TAU * noise(rand);
    float rb = noise(rand);

    // 光感越大高光越锐利
    float shiny = pow(roughness, 4U);
    
    float rz = sqrt((1.0 - rb) / (1.0 + (shiny - 1.0)*rb));
    vec2 v = vec2(cos(ra), sin(ra));
    vec2 rxy = sqrt(abs(1.0 - rz*rz)) * v;
    
    return TBN(n) * vec3(rxy, rz);
}

// 应用 PBR 材质
ray PBR(ray r, inout record rec, inout random rand) {
    // 材质参数
    vec3 albedo = rec.mtl.albedo;
    float roughness = rec.mtl.roughness;
    float metallic = rec.mtl.metallic;
    float transmission = rec.mtl.transmission;
    vec3 normal = rec.mtl.normal;
    
    // 光线和物体表面参数
    vec3 V  = -r.direction;
    vec3 P  = rec.position;
    vec3 N  = TBN(normal) * calc_normal(P);
    vec3 C  = r.color.rgb;
    vec3 L;
    
    rec.normal = N;
    
    float F = fresnel_schlick_roughness(max(0., dot(N, V)), 0.04, roughness);

    // 反射或者漫反射
    if (noise(rand) < F + metallic) {
        // 不知道为啥这样，反正金属度效果就是好一些 (lll￢ω￢)
        if (noise(rand) < metallic) {
            C *= albedo; 
        } 
        N = hemispheric_sampling_roughness(N, roughness, rand);
        L = reflect(r.direction, N);
    } else {
        // 漫反射
        C *= albedo;
        L = hemispheric_sampling(N, rand);
    }

    // 对透明度的处理还有问题
    bool glass = false;
    if (noise(rand) < transmission) {
        glass = true;
        
        // 透射和折射
        C *= albedo;
        float ior = 1.0 / 1.5;
        if (rec.t < 0.0) {
            ior = 1.0 / ior;
            N = -N;
        }
        L = refract(r.direction, N, ior);
    }

    // 如果光射到表面下面就直接吸收掉
    if (dot(L, N) < 0.0 && !glass) {
        r.color.a = 0.0;
    }

    // 更新光的方向和颜色
    r.color.rgb = C;
    r.origin = P;
    r.direction = L;
    
    return r;
}

// 光线追踪
ray raytrace(ray r, inout random rand) {
    for (uint i = 0U; i < MAX_RAYTRACE; i++) {
        record rec = raycast(r);
        
        // 没击中物体就肯定击中天空
        if (!rec.hit) {
            r.color *= sky(r);
//            r.color *= 0.0;
            break;
        }
        
        r = PBR(r, rec, rand);
        
//        r.color.rgb = 0.5 + 0.5*rec.normal;
//        r.color.a = 1.0;
//        break;
        
        // 光被吸收完了就不用继续了
        if (r.color.a <= 0.0) {
            break;
        }
        
        // 处理自发光
        if (abs(rec.mtl.emission.a) > 0.0) {
            r.color.rgb *= rec.mtl.emission.rgb*rec.mtl.emission.a;
            break;
        }
    }

    return r;
}

// 一次采样
vec3 sample(camera cam, vec2 uv, vec4 color, inout random rand) {
    // 获取光线并逆向追踪光线
    ray r = get_ray(cam, uv, color, rand);
        r = raytrace(r, rand);
    
    // 对光的颜色进行后处理得到像素颜色
    return r.color.rgb * r.color.a;
}

// HDR 映射色彩
vec3 HDR(vec3 color) {
    return vec3(1) - exp(-color);
}

// 片段着色器程序入口
void fragment() {
    // 计算并修正 UV 坐标系 (左手系，以左下角为原点)
    const vec2 uv = vec2(UV.x, 1.0 - UV.y);
    
    // 计算摄像机方位和视线
    const vec3 lookfrom = camera_position;
    const vec3 direction = camera_rotation * vec3(0, 0, -1);
    const vec3 lookat = lookfrom + direction;
    
    // 初始化摄像机
    camera cam;
    cam.lookfrom = lookfrom;
    cam.lookat = lookat;
    cam.aspect = camera_aspect;
    cam.vfov = camera_vfov;
    cam.vup = vec3(0, 1, 0);
    cam.focus = camera_focus;
    cam.aperture = camera_aperture;
    
    // 用 UV 和时间初始化随机数发生器种子
    random rand;
    rand.seed  = hash(vec3(uv, TIME));
    
    // 对每个光子经过的表面采样一次
    vec3 color = sample(cam, uv, vec4(1), rand);
    
//    vec2 oz = vec2(1, 0);
//    vec3 R = sample(cam, uv, oz.xyyx, rand);
//    vec3 G = sample(cam, uv, oz.yxyx, rand);
//    vec3 B = sample(cam, uv, oz.yyxx, rand);
//
//    color = (R + G + B) / 3.0;
    
    // 单帧内多重采样
//    const uint N = 10U;
//    for (uint i = 0U; i < N; i++) {
//        color += sample(cam, uv, vec4(1), rand);
//    }
//    color = color / float(N + 1U);
    
    // HDR 映射色彩
    color = HDR(color);
    // 伽马矫正
    color = pow(color, vec3(camera_gamma));
    
    // 测试随机数
//    color = vec3(noise(rand), noise(rand), noise(rand));
    COLOR = vec4(color, 1.0);
}