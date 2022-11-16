shader_type canvas_item;

uniform vec3 camera_position = vec3(0.0, 0.0, 4.0); // 传入摄像机的位置
uniform mat3 camera_rotation = mat3(1);             // 摄像机的旋转
uniform float camera_aspect = 2.0;                  // 画布长宽比
uniform float camera_vfov = 30.0;                   // 摄像机的纵向视野

// 配置常量
const float TMIN        = 0.001;                    // 光开始传播的起始偏移，避免光线自相交
const float TMAX        = 2000.0;                   // 最大单次光线传播距离
const float PRECISION   = 0.00001;                  // 必须要小于 TMIN，否则光线会自相交产生阴影痤疮
const float MAP_SIZE    = float(0x7fffffff);        // 地图大小

const uint MAX_RAYMARCH = 512U;                     // 最大光线步进次数
const uint MAX_RAYTRACE = 512U;                     // 最大光线追踪次数

const float PHI = 1.61803398874989484820459;        // 黄金比例

const vec3 BLACK = vec3(0.0);

// 光线
struct ray {
    vec3 origin;     // 光的起点
    vec3 direction;  // 光的方向
    vec4 color;      // 光的颜色
};

// 物体材质
struct material {
    vec4 albedo;     // 反照率
    float roughness; // 粗糙度
    float metalness; // 金属度
    vec4 emitting;   // 自发光
    vec3 normal;     // 切线空间法线
};

// 光子击中的记录
struct record {
    bool hit;        // 是否击中
    float t;         // 沿射线前进的距离
    vec3 position;   // 击中的位置
    vec3 normal;     // 击中位置的法线
    vec3 tangent;
    vec3 binormal;
    material mtl;    // 击中的材质
};

// SDF 物体
struct object {
    float sd;        // 到物体表面的距离
    material mtl;    // 物体的材质
};

// 摄像机
struct camera {
    vec3 lookfrom;   // 视点位置
    vec3 lookat;     // 目标位置
    vec3 vup;        // 向上的方向
    float vfov;      // 视野
    float aspect;    // 传感器长宽比
    float aperture;  // 光圈大小
    float focus;     // 对焦距离
};

// 随机发生器
struct random {
    vec3 seed;       // 随机数种子
    float value;     // 上次的随机值
};

// 生成归一化随机数
float noise(inout random r) {
    r.seed = fract(r.seed * vec3(.1031, .1030, .0973));
    r.seed += dot(r.seed, r.seed.yzx + 33.33);
    r.seed.xy = fract((r.seed.xx+r.seed.yz)*r.seed.zy);
    
    const vec2 xy = r.seed.xy * 3333.3 + 3.33;
    r.value = fract(tan(distance(xy*PHI, xy+3.3)*r.seed.z)*xy.x);
    return r.value;
}

// 光子在射线所在的位置
vec3 at(ray r, float t) {
    return r.origin + t * r.direction;
}

// 单位圆内随机取一点
vec2 random_in_unit_disk(inout random seed) {
    float r = mix(0.0, 1.0, noise(seed));
    float a = mix(0.0, TAU, noise(seed));
	return sqrt(r) * vec2(sin(a), cos(a));
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
                        material(vec4(1.0, 1.0, 1.0, 1.0),
                                    1.0,
                                    0.2,
                                    vec4(0),
                                    vec3(0, 0, 1)
                        )
        ),
        object(sphere(p - vec3(0, 0, 0), 0.5),
                        material(vec4(1.0, 1.0, 1.0, 1.0),
                                    1.0,
                                    0.0,
                                    vec4(0, 1, 0, 10.0),
                                    vec3(0, 0, 1)
                        )
        ),
        object(sphere(p - vec3(-1.0, -0.2, 0), 0.3),
                        material(vec4(1.0, 0.0, 0.0, 1.0),
                                    0.9,
                                    0.1,
                                    vec4(0),
                                    vec3(0, 0, 1)
                        )
        ),
        object(sphere(p - vec3(1.0, -0.2, 0), 0.3),
                        material(vec4(0.4, 0.3, 1.0, 1.0),
                                0.0,
                                0.9,
                                vec4(0),
                                vec3(0, 0, 1)
                        )
        ),
        object(box(p - vec3(0, 0, -1), vec3(2, 1, 0.2)),
                        material(vec4(0.0, 1.0, 1.0, 1.0),
                                0.0,
                                0.9,
                                vec4(0),
                                vec3(0, 0, 1)
                        )
        ),
        object(cylinder(p - vec3(0, 0.1, 1), 0.5, 0.2),
                        material(vec4(1.0, 1.0, 0.0, 1.0),
                                0.0,
                                0.9,
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

// 计算地图法线
vec3 normal(vec3 p) {
    vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0005;
    return normalize( e.xyy*map( p + e.xyy ).sd + 
                      e.yyx*map( p + e.yyx ).sd + 
                      e.yxy*map( p + e.yxy ).sd + 
                      e.xxx*map( p + e.xxx ).sd );
}

// 用世界坐标下的法线计算 TBN 矩阵
mat3 TBN(vec3 N) {
    vec3 T = vec3(N.z, 0, -N.x);
    vec3 B = normalize(cross(N, T));
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
            rec.hit = true;
            return rec;
        }
        rec.t += obj.sd;
    }
    // 没有击中物体
    rec.hit = false;
    return rec;
}

// 天空
vec4 sky(ray r) {
    float t = (r.direction.y + 1.0) / 2.0;
    vec4 bottom = vec4(1.0, 1.0, 1.0, 1.0);
    vec4 top = vec4(0.5, 0.7, 1.0, 1.0);
    return mix(bottom, top, t);
}

// 产生随机单位向量
vec3 random_unit_vector(inout random rand) {
    float a = mix(0.0, TAU, noise(rand));
    float z = mix(-1.0, 1.0, noise(rand));
    float r = sqrt(1.0 - z*z);
    return vec3(r*cos(a), r*sin(a), z);
}

float D_GGX(float a2, float NoH) {
    float d = (NoH * a2 - NoH) * NoH + 1.0;
    return a2 / (PI*d*d);
}

float GGX(float a2, float k) {
    return 2.0*k/(k+sqrt(a2+(1.0-a2)*k*k));
}

vec3 F_Schlick(vec3 specularColor, float VoH) {
    float Fc = pow(1.0 - VoH, 5.0);
    return Fc + (1.0 - Fc) * specularColor;
}

// PBR 材质
ray pbr(ray r, record rec, inout random rand) {
    // 计算 SDF 表面法线
    rec.normal = normal(rec.position);
    // 用 TBN 矩阵将材质切线空间的法线转换到世界坐标
//    rec.normal = normalize(TBN(rec.normal) * rec.mtl.normal);
    
    
    // 暂存一下击中记录的位置和上次光线的方向
    vec3 out_pos = rec.position;
    vec3 out_dir = r.direction;
    vec3 out_color = r.color.rgb;
    
    // BRDF
    vec3 reflex = reflect(r.direction, rec.normal);
    vec3 diffuse = normalize(rec.normal + random_unit_vector(rand));
//    out_dir = mix(reflex, diffuse, rec.mtl.roughness);
    
    if (noise(rand) < rec.mtl.metalness){
        out_dir = reflex;
    } else {
        out_dir = diffuse;
    }
    
    vec3 uSpecular = vec3(1.0);
    vec3 diffuseColor    = rec.mtl.albedo.rgb * (1.0 - rec.mtl.metalness);
    vec3 specularColor   = mix( vec3(0.08 * uSpecular ), rec.mtl.albedo.rgb, rec.mtl.metalness);
    
    vec3 N = rec.normal;
    vec3 L = out_dir;
    vec3 V = -r.direction;
    vec3 H = (L + V) / 2.0;


    float VoH = dot(V, H);
    float NoL = dot(N, L);
    float NoV = dot(N, V);
    float NoH = dot(N, H);
    
    float roughness = rec.mtl.roughness;
    float alpha = roughness*roughness;
    float a2 = alpha*alpha;
    vec3 F = F_Schlick(specularColor, VoH);
    float D = D_GGX(a2, NoH);
    float G = GGX(a2, NoL)*GGX(a2, NoV);
    
    vec3 FD = diffuseColor / PI;
    vec3 FR = F*D*G/(4.0*NoL*NoV);
//    FR = F;
    
    vec3 brdf = FD + FR;
    
    // 计算颜色
    out_color = brdf * r.color.rgb * r.color.a;
    out_color += mix(BLACK, rec.mtl.emitting.rgb, rec.mtl.emitting.a);
    
    // 更新光线
    r.origin = out_pos;
    r.direction = out_dir;
    r.color.rgb = out_color;
    // 让光强衰减一点
    const float attenuation = 0.9;
    r.color.a *= attenuation;
    
    // 测试法线
//    r.color.rgb = rec.normal*0.5 + 0.5;
//    r.color.a = 1.0;

//    r.color.rgb *= vec3(NoV);
//    r.color.a = 1.0;
    
    return r;
}

// 光线追踪
ray raytrace(ray r, inout random rand) {
    record rec;
    
    for (uint i = 0U; i < MAX_RAYTRACE; i++) {
        record rec = raycast(r);
        if (!rec.hit) {
            r.color *= sky(r);
            break;
        }
        
        r = pbr(r, rec, rand);
    }
    
    return r;
}

// 片段着色器程序入口
void fragment() {
    // 计算并修正 UV 坐标系
    vec2 uv = vec2(UV.x, 1.0 - UV.y);
    
    // 左手系
    const vec3 lookfrom = camera_position;
    const vec3 direction = camera_rotation * vec3(0.0, 0.0, -1.0);
    const vec3 lookat = lookfrom + direction;
    
    // 初始化摄像机
    camera cam;
    cam.lookfrom = lookfrom;
    cam.lookat = lookat;
    cam.aspect = camera_aspect;
    cam.vfov = camera_vfov;
    cam.vup = vec3(0.0, 1.0, 0.0);
    cam.focus = 2.0;
    cam.aperture = 0.005;
    
    // 初始化随机数发生器种子
    random rand;
    rand.seed = vec3(uv, fract(TIME));
    
    // 获取光线并逆向追踪光线
    ray r = get_ray(cam, uv, vec4(1.0), rand);
        r = raytrace(r, rand);
    
    // 对光的颜色进行后处理得到像素颜色
    vec3 color = r.color.rgb * r.color.a;
    
    // 伽马矫正
    color = pow(color, vec3(0.3));
    
    // 测试随机数
    // color = vec3(noise(rand), noise(rand), noise(rand));
    COLOR = vec4(color, 1.0);
}