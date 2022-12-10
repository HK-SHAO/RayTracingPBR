shader_type canvas_item;

// 传入统一值
uniform vec3 camera_position    = vec3(0.0, 0.0, 4.0);  // 传入摄像机的位置
uniform mat3 camera_rotation    = mat3(1);              // 摄像机的旋转

uniform float camera_aspect     = 2.0;                  // 画布长宽比
uniform float camera_vfov       = 30.0;                 // 摄像机的纵向视野
uniform float camera_focus      = 2.0;                  // 摄像机的对焦距离
uniform float camera_aperture   = 0.005;                // 摄像机的光圈大小
uniform float camera_exposure   = 1.0;                  // 摄像机曝光值
uniform float camera_gamma      = 0.2;                  // gamma 矫正值
uniform float light_quality     = 0.2;                  // 间接光质量
uniform float frame             = 1.0;                  // 降噪帧

// 传入贴图
uniform sampler2D environment_hdri;                     // 环境 HDRi 贴图
uniform sampler2D noise_map;                            // 噪声采样贴图

// 配置常量
const float TMIN        = 0.001;                        // 光开始传播的起始偏移，避免光线自相交
const float TMAX        = 2000.0;                       // 最大单次光线传播距离
const float PRECISION   = 0.0001;                       // 必须要小于 TMIN，否则光线会自相交产生阴影痤疮
const float MAP_SIZE    = float(0x7fffffff);            // 地图大小
const float VISIBILITY  = 0.001;                        // 亮度可见度

const uint MAX_RAYMARCH = 512U;                         // 最大光线步进次数
const uint MAX_RAYTRACE = 512U;                         // 最大光线追踪次数

const float ENV_IOR = 1.000277;                         // 环境的折射率

// 枚举形状
const int SHAPE_SPHERE      = 0;
const int SHAPE_BOX         = 1;
const int SHAPE_CYLINDER    = 2;

const float NONE = 0.0;

// 光线
struct ray {
    vec3 origin;        // 光的起点
    vec3 direction;     // 光的方向
    vec3 color;         // 光的颜色
};

// 物体材质
struct material {
    vec3 albedo;        // 反照率
    float roughness;    // 粗糙度
    float metallic;     // 金属度
    float transmission; // 透明度
    float ior;          // 折射率
    vec3 emission;      // 自发光
    vec3 normal;        // 切线空间法线
};

// 物体变换
struct transform {
    vec3 position;        // 位置
    vec3 rotation;        // 旋转
    vec3 scale;           // 缩放
};

// SDF 物体
struct object {
    int shape;          // 形状
    float sd;           // 距离物体表面
    transform trs;      // 变换
    material mtl;       // 材质
};

// 光子击中的记录
struct record {
    object obj;         // 物体
    bool hit;           // 是否击中
    float t;            // 沿射线前进的距离
    vec3 position;      // 击中的位置
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
    return sqrt(r) * vec2(sin(a), cos(a));
}

// 从摄像机获取光线
ray get_ray(camera c, vec2 uv, vec3 color, inout random rand) {
    // 根据 VFOV 和显示画布长宽比计算传感器长宽
    float theta = radians(c.vfov);
    float half_height = tan(theta * 0.5);
    float half_width = c.aspect * half_height;
    
    // 以目标位置到摄像机位置为 Z 轴正方向
    vec3 z = normalize(c.lookfrom - c.lookat);
    // 计算出摄像机传感器的 XY 轴正方向
    vec3 x = normalize(cross(c.vup, z));
    vec3 y = cross(z, x);
    
    vec3 hwfx = half_width  * c.focus * x;
    vec3 hhfy = half_height * c.focus * y;
    
    vec3 lower_left_corner = c.lookfrom - hwfx - hhfy - c.focus * z;
    
    vec3 horizontal = 2.0 * hwfx;
    vec3 vertical   = 2.0 * hhfy;
    
    // 模拟光进入镜头光圈
    float lens_radius = c.aperture * 0.5;
    vec2 rud = lens_radius * random_in_unit_disk(rand);
    vec3 offset = x * rud.x + y * rud.y;
    
    // 计算光线起点和方向
    vec3 ro = c.lookfrom + offset;
    vec3 po = lower_left_corner + uv.x * horizontal
                                + uv.y * vertical;
    vec3 rd = normalize(po - ro);
    
    return ray(ro, rd, color);
}

// SDF 球体
float sd_sphere(vec3 p, float s) {
    return length(p) - s;
}

// SDF 盒子
float sd_box(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0)) + min(max(q.x, max(q.y, q.z)), 0);
}

// SDF 圆柱
float sd_cylinder(vec3 p, vec2 rh) {
    vec2 d = abs(vec2(length(p.xz),p.y)) - rh;
    return min(max(d.x,d.y), 0.0) + length(max(d, 0.0));
}

// 欧拉角转旋转矩阵
mat3 angle(vec3 a) {
    vec3 s = sin(a), c = cos(a);
    return mat3(vec3( c.z,  s.z,    0),
                vec3(-s.z,  c.z,    0),
                vec3(   0,    0,    1)) *
           mat3(vec3( c.y,    0, -s.y),
                vec3(   0,    1,    0),
                vec3( s.y,    0,  c.y)) *
           mat3(vec3(   1,    0,    0),
                vec3(   0,  c.x,  s.x),
                vec3(   0, -s.x,  c.x));
}

// 计算有向距离 (物体内部距离为负)
float signed_distance(object obj, vec3 pos) {
    vec3 position = obj.trs.position;
    vec3 rotation = obj.trs.rotation;
    vec3 scale    = obj.trs.scale;
    
    vec3 p = pos - position;
    
    // 会重复的将欧拉角转换成旋转矩阵，实际上只用在第一次计算就行了
    // 也有可能被编译器优化掉了
    p *= angle(rotation);
    
    switch(obj.shape) {
        case SHAPE_SPHERE:
            return sd_sphere(p, scale.x);
        case SHAPE_BOX:
            return sd_box(p, scale);
        case SHAPE_CYLINDER:
            return sd_cylinder(p, scale.xy);
        default:
            return sd_sphere(p, scale.x);
    }
}

// 地图
const object map[] = {
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(0, -100.5, 0),
                    vec3(0, 0, 0),
                    vec3(100, 0, 0)
        ),
        material(vec3(1.0, 1.0, 1.0)*0.3,   // 基础色
                    1.0, // 粗糙度
                    0.0, // 金属度
                    0.0, // 透明度
                    1.0, // 折射率
                    vec3(1), // 自发光
                    vec3(0, 0, 1) // 切线空间法线
        )
    ),
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(0, 0, 0),
                    vec3(0, 0, 0),
                    vec3(0.5, 0, 0)
        ),
        material(vec3(1.0, 1.0, 1.0),   // 基础色
                    1.0, // 粗糙度
                    0.0, // 金属度
                    0.0, // 透明度
                    1.0, // 折射率
                    vec3(0.1, 1.0, 0.1)*10.0, // 自发光
                    vec3(0, 0, 1) // 切线空间法线
        )
    ),
    object(SHAPE_CYLINDER, NONE,
        transform(  vec3(-1.0, -0.3, 0),
                    vec3(0, 0, 0),
                    vec3(0.3, 0.33, 0)
        ),
        material(vec3(1.0, 0.1, 0.1),   // 基础色
                    0.9, // 粗糙度
                    0.1, // 金属度
                    0.0, // 透明度
                    1.0, // 折射率
                    vec3(1), // 自发光
                    vec3(0, 0, 1) // 切线空间法线
        )
    ),
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(1.0, -0.2, 0),
                    vec3(0, 0, 0),
                    vec3(0.3, 0, 0)
        ),
        material(vec3(0.1, 0.1, 1.0),   // 基础色
                    0.2, // 粗糙度
                    1.0, // 金属度
                    0.0, // 透明度
                    1.0, // 折射率
                    vec3(1), // 自发光
                    vec3(0, 0, 1) // 切线空间法线
        )
    ),
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(0.0, -0.24, 3),
                    vec3(0, 0, 0),
                    vec3(0.3, 0, 0)
        ),
        material(vec3(1.0, 1.0, 1.0)*0.9,   // 基础色
                    0.0, // 粗糙度
                    0.0, // 金属度
                    1.0, // 透明度
                    1.5, // 折射率
                    vec3(1), // 自发光
                    vec3(0, 0, 1) // 切线空间法线
        )
    ),
    object(SHAPE_BOX, NONE,
        transform(  vec3(0, 0, 0),
                    vec3(0, 0, 0),
                    vec3(2, 2, 2)
        ),
        material(vec3(1.0, 1.0, 1.0)*0.99,   // 基础色
                    0.0, // 粗糙度
                    0.0,  // 金属度
                    1.0,  // 透明度
                    1.5,  // 折射率
                    vec3(1), // 自发光
                    vec3(0, 0, 1) // 切线空间法线
        )
    ),
    object(SHAPE_BOX, NONE,
        transform(  vec3(0, 0, 5),
                    vec3(0, 0, 0),
                    vec3(2, 1, 0.2)
        ),
        material(vec3(1.0, 1.0, 1.0),   // 基础色
                    0.0, // 粗糙度
                    1.0,  // 金属度
                    0.0,  // 透明度
                    1.0,  // 折射率
                    vec3(1), // 自发光
                    vec3(0, 0, 1) // 切线空间法线
        )
    )
};

// 找到最近的物体并计算距离
object nearest_object(vec3 p) {
    object o; o.sd = MAP_SIZE;
    for (int i = 0; i < map.length(); i++) {
        object oi = map[i];
        oi.sd = signed_distance(oi, p);
        if (abs(oi.sd) < abs(o.sd)) o = oi;
    }
    return o;
}

// 计算物体法线
vec3 calc_normal(object obj, vec3 p) {
    vec2 e = vec2(1, -1) * 0.5773 * 0.0005;
    return normalize( e.xyy*signed_distance(obj, p + e.xyy) + 
                      e.yyx*signed_distance(obj, p + e.yyx) + 
                      e.yxy*signed_distance(obj, p + e.yxy) + 
                      e.xxx*signed_distance(obj, p + e.xxx) );
}

// 用世界坐标下的法线计算 TBN 矩阵
mat3 TBN(vec3 N) {
    vec3 T, B;
    
    if (N.z < -0.99999) {
        T = vec3(0, -1, 0);
        B = vec3(-1, 0, 0);
    } else {
        float a = 1.0 / (1.0 + N.z);
        float b = -N.x*N.y*a;
        
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
        object obj = nearest_object(rec.position);
        float dis = abs(obj.sd);
        if (dis < PRECISION) {
            rec.obj = obj;
            rec.hit = true;
            return rec;
        }
        rec.t += dis;
    }
    // 没有击中物体
    rec.hit = false;
    return rec;
}

// 球面坐标到笛卡尔坐标
const vec2 inv_atan = vec2(0.5 / PI, 1.0 / PI);
vec2 sample_spherical_map(vec3 v) {
    vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
    uv *= inv_atan;
    uv += 0.5;
    return uv;
}

// 采样天空
vec4 sky(ray r) {
//    float t = 0.5 + 0.5 * r.direction.y;
//    vec4 bottom = vec4(1.0, 1.0, 1.0, 1.0);
//    vec4 top = vec4(0.3, 0.5, 1.0, 3.0);
//    return mix(bottom, top, t);

    // 采样 HDRi 环境贴图
    vec2 uv = sample_spherical_map(r.direction); uv.y = 1.0 - uv.y;
    return texture(environment_hdri, uv);
}

// 快速计算五次方
float pow5(float x) {
    float t = x*x; t *= t;
    return t*x;
}

// 计算菲涅尔近似值
float fresnel_schlick(float cosine, float F0) {
    return F0 + (1.0 - F0) * pow5(abs(1.0 - cosine));
}

// 用粗糙度计算菲涅尔近似值
float fresnel_schlick_roughness(float cosine, float F0, float roughness) {
    return F0 + (max(1.0 - roughness, F0) - F0) * pow5(abs(1.0 - cosine));
}

// 以 n 为法线进行半球采样
vec3 hemispheric_sampling(vec3 n, inout random rand) {
    float ra = TAU * noise(rand);
    float rb = noise(rand);
    
    float rz = sqrt(rb);
    vec2 v = vec2(cos(ra), sin(ra));
    vec2 rxy = sqrt(1.0 - rb) * v; 
    
    return TBN(n) * vec3(rxy, rz);
}

// 用粗糙度采样沿向量 n 半球采样
vec3 hemispheric_sampling_roughness(vec3 n, float roughness, inout random rand) {
    float ra = TAU * noise(rand);
    float rb = noise(rand);

    // 光感越大高光越锐利
    float shiny = pow5(roughness);
    
    float rz = sqrt((1.0 - rb) / (1.0 + (shiny - 1.0)*rb));
    vec2 v = vec2(cos(ra), sin(ra));
    vec2 rxy = sqrt(abs(1.0 - rz*rz)) * v;
    
    // WIP: 待优化，这边 TBN 矩阵可以只算一次
    return TBN(n) * vec3(rxy, rz);
}

// 应用 PBR 材质
ray PBR(ray r, inout record rec, inout random rand) {
    // 材质参数
    vec3 albedo = rec.obj.mtl.albedo;
    float roughness = rec.obj.mtl.roughness;
    float metallic = rec.obj.mtl.metallic;
    float transmission = rec.obj.mtl.transmission;
    vec3 normal = rec.obj.mtl.normal;
    float ior = rec.obj.mtl.ior;
    
    // 光线和物体表面参数
    vec3 I = r.direction;
    vec3 V  = -r.direction;
    vec3 P  = rec.position;
    vec3 N  = TBN(normal) * calc_normal(rec.obj, P);
    vec3 C  = r.color;
    vec3 L;
    
    float NoV = dot(N, V);

    // 对透明度的处理可能还有问题
    if (noise(rand) < transmission) {
        // 折射率之比
        float eta = ENV_IOR / ior;
        
        // 如果处于 SDF 物体内部就反过来
        float outer = sign(NoV);
        eta = pow(eta, outer);
        N  *= outer;
        
        float F0 = (eta - 1.0) / (eta + 1.0);
        F0 *= F0; // 让透明材质的反射更明显一些
        float F = fresnel_schlick(NoV, F0);
        N = hemispheric_sampling_roughness(N, roughness, rand);
        
        float NoI = -NoV;
        float k = 1.0 - eta * eta * (1.0 - NoI * NoI);
        
        // k < 0 全反射
        // 为啥是 outer ？
        if (noise(rand) < F + metallic && outer > 0.0 || k < 0.0) {
            L = reflect(I, N); // 为透明材质带来菲涅尔反射
//            r.color.a *= (sign(dot(L, N)) + 1.0) * 0.5;
        } else {
            // TODO: 替换掉 refract 优化效率
//            L = eta * I - (eta * NoI + sqrt(k)) * N;
            L = refract(I, N, eta);
//            L = -L * sign(dot(L, N));
        }
    } else {
        float F = fresnel_schlick_roughness(NoV, 0.04, roughness);
    
        // 反射或者漫反射
        if (noise(rand) < F + metallic) {
            N = hemispheric_sampling_roughness(N, roughness, rand);
            L = reflect(I, N);
        } else {
            // 漫反射
            L = hemispheric_sampling(N, rand);
        }

        // 如果光射到表面下面就直接吸收掉
        r.color *= (sign(dot(L, N)) + 1.0) * 0.5;
    }

    C *= albedo;

    // 更新光的方向和颜色
    r.color = C;
    r.origin = P;
    r.direction = L;
    
    return r;
}

float brightness(vec3 rgb) {
    return dot(rgb, vec3(0.299, 0.587, 0.114));
}

// 光线追踪
ray raytrace(ray r, inout random rand) {
    for (uint i = 0U; i < MAX_RAYTRACE; i++) {
        // 俄罗斯轮盘赌概率，防止光线过分的反复反射
        float inv_pdf = exp(float(i) * light_quality);
        float roulette_prob = 1.0 - (1.0 / inv_pdf);
    
        // 光被吸收掉或者光线毙掉就不用继续了
        float visible = brightness(r.color);
        if (visible <= VISIBILITY || noise(rand) < roulette_prob) {
            r.color *= roulette_prob;
            break;
        }
        
        // 能量守恒
        r.color *= inv_pdf;
        
        // 与地图求交
        record rec = raycast(r);
        
        // 没击中物体就肯定击中天空
        if (!rec.hit) {
            vec4 color = sky(r) * 2.0;
            r.color *= color.rgb*color.a;
            break;
        }
        
        // 处理自发光
        r.color *= rec.obj.mtl.emission;
        if (brightness(rec.obj.mtl.emission) > 1.0) {
            break;
        }
        
        // 应用 PBR 材质
        r = PBR(r, rec, rand);
    }

    return r;
}

// 一次采样
vec3 sample(camera cam, vec2 uv, vec3 color, inout random rand) {
    // 获取光线并逆向追踪光线
    ray r = get_ray(cam, uv, color, rand);
        r = raytrace(r, rand);
    
    return r.color;
}

// ACES fitted
// from https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl
const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.35458, 0.04823),
    vec3(0.07600, 0.90834, 0.01566),
    vec3(0.02840, 0.13383, 0.83777)
);

// ODT_SAT => XYZ => D60_2_D65 => sRGB
const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.53108, -0.07367),
    vec3(-0.10208,  1.10813, -0.00605),
    vec3(-0.00327, -0.07276,  1.07602)
);

vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}

vec3 ACESFitted(vec3 color) {
    color *= ACESInputMat;
    color = RRTAndODTFit(color); // Apply RRT and ODT
    color *= ACESOutputMat;
    return color;
}

// 片段着色器程序入口
void fragment() {
    // 计算并修正 UV 坐标系 (左手系，以左下角为原点)
    vec2 uv = vec2(UV.x, 1.0 - UV.y);
    
    // 计算摄像机方位和视线
    vec3 lookfrom = camera_position;
    vec3 direction = camera_rotation * vec3(0, 0, -1);
    vec3 lookat = lookfrom + direction;
    
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
    rand.seed  = hash(vec3(uv, TIME)) + texture(noise_map, uv).r;

    // 超采样
    uv += vec2(noise(rand), noise(rand)) * SCREEN_PIXEL_SIZE;
    
    // 对每个光子经过的表面采样一次
    vec3 color = sample(cam, uv, vec3(1), rand);

    // 色调映射 (ACES Tone Mapping)
    color *= camera_exposure;
    color = ACESFitted(color);
    
    // 伽马矫正
    color = pow(color, vec3(camera_gamma));
    
    // 混合历史的帧来降噪
    color = clamp(color, 0, 1);
    vec3 back = texture(SCREEN_TEXTURE, SCREEN_UV).rgb;
    color = mix(back, color, 1.0 / max(1.0, frame));

    // 测试随机数
//    color = vec3(noise(rand), noise(rand), noise(rand));
    COLOR = vec4(color, 1.0);
}