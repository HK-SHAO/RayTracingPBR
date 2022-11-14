shader_type canvas_item;

//// 配置常量
const float TMIN = 0.001;
const float TMAX = 20.0;
const float PRECISION = 0.0001; // 必须要小于 TMIN，否则光线会自相交产生阴影痤疮
const float MAP_SIZE = 100000.0;

const uint MAX_RAYMARCH = 512U;
const uint MAX_RAYTRACE = 512U;

const float PHI = 1.61803398874989484820459;

//// 光线（射线）
struct ray {
    vec3 origin;
    vec3 direction;
    vec4 color;
};

//// 物体材质
struct material {
    vec3 albedo;
    float roughness;
    float metallic;
};

//// 光子击中的记录
struct record {
    float t; // 沿射线前进的距离，为负代表没有击中
    vec3 position;
    vec3 normal;
    material mtl;
};

//// SDF 物体
struct object {
    float sd;
    material mtl;
};

//// 摄像机
struct camera {
    ////  图像平面位置
    vec3 lower_left_corner;
    vec3 horizontal;
    vec3 vertical;
    //// 视点位置
    vec3 origin;
};

//// 随机发生器
struct random {
    vec2 uv;
    float seed;
    float value;
};

//// 生成归一化随机数（uv 和 seed 均必须归一化）
float noise(inout random r) {
    const vec2 xy = (r.uv + 1.0) * 3333.3;
    r.seed = fract(r.value + r.seed);
    r.value = fract(tan(distance(xy*PHI, xy)*r.seed)*xy.x);
    return r.value;
}

//// 光子在射线所在的位置
vec3 at(ray r, float t) {
    return r.origin + t * r.direction;
}

//// 从摄像机获取光线
ray get_ray(camera c, vec2 uv, vec4 color) {
    //// 视点位置
    vec3 ro = c.origin;
    //// 像素位置
    vec3 po = c.lower_left_corner
            + c.horizontal * uv.x
            + c.vertical   * uv.y;
    //// 光线方向
    vec3 rd = normalize(po - ro);
    return ray(ro, rd, color);
}

//// SDF 球体
float sphere(vec3 p, float s) {
    return length(p) - s;
}

//// SDF 地图
object map(vec3 p) {
    const object objs[] = {
        object(sphere(p - vec3(0, -100.5, 0), 100), material(vec3(1.0), 0.5, 0.5)),
        object(sphere(p - vec3(0, 0, 0), 0.5), material(vec3(1.0, 1.9, 1.0), 1.0, 0.0)),
        object(sphere(p - vec3(-1.0, 0, 0), 0.3), material(vec3(1.0, 0.3, 0.4), 0.9, 0.1)),
        object(sphere(p - vec3(1.0, 0, 0), 0.3), material(vec3(0.4, 0.3, 1.0), 0.1, 0.9))
    };
    
    object o; o.sd = MAP_SIZE;
    for (int i = 0; i < objs.length(); i++) {
        const object oi = objs[i];
        if (oi.sd < o.sd) o = oi;
    }

    return o;
}

//// 计算地图法线
vec3 normal(vec3 p) {
    vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0005;
    return normalize( e.xyy*map( p + e.xyy ).sd + 
                      e.yyx*map( p + e.yyx ).sd + 
                      e.yxy*map( p + e.yxy ).sd + 
                      e.xxx*map( p + e.xxx ).sd );
}

//// 光线步进
record raycast(ray r) {
    record rec; rec.t = TMIN;
    for(uint i = 0U; i < MAX_RAYMARCH && rec.t < TMAX; i++) {
        rec.position = at(r, rec.t);
        object obj = map(rec.position);
        float dis = obj.sd;
        rec.mtl = obj.mtl;
        if(dis < PRECISION) return rec;
        rec.t += dis;
    }
    //// 没有击中物体
    rec.t = -1.0; // 设置为负值标记
    return rec;
}

//// 天空
vec4 sky(ray r) {
    float t = (r.direction.y + 1.0) / 2.0;
    vec4 bottom = vec4(1.0, 1.0, 1.0, 1.0);
    vec4 top = vec4(0.5, 0.7, 1.0, 1.0);
    return mix(top, bottom, t);
}

//// 产生随机单位向量
vec3 random_unit_vector(inout random rand) {
    float a = mix(0.0, TAU, noise(rand));
    float z = mix(-1.0, 1.0, noise(rand));
    float r = sqrt(1.0 - z*z);
    return vec3(r*cos(a), r*sin(a), z);
}

//// 光线散射
ray pbr(ray r, record rec, random rand) {
    rec.normal = normal(rec.position);
    
    r.origin = rec.position;
    
    vec3 reflex = reflect(r.direction, rec.normal);
    vec3 diffuse = normalize(rec.normal + random_unit_vector(rand));
    vec3 direction = mix(reflex, diffuse, rec.mtl.roughness);
    
    r.direction = direction;
    
    // 测试法线
    // rec.mtl.albedo = (rec.normal + 1.0) / 2.0;
    
    const float attenuation = 0.5;
    r.color *= vec4(rec.mtl.albedo, attenuation);
    return r;
}

//// 光线追踪
ray raytrace(ray r, inout random rand) {
    record rec;
    
    for (uint i = 0U; i < MAX_RAYTRACE; i++) {
        record rec = raycast(r);
        if (rec.t < 0.0) {
            r.color *= sky(r);
            break;
        }
        
        r = pbr(r, rec, rand);
    }
    
    return r;
}

//// 片段着色器程序入口
void fragment() {
    //// 计算并修正 UV 坐标系
    vec2 uv = vec2(UV.x, 1.0 - UV.y);
    
    //// 初始化摄像机
    camera cam;
    cam.lower_left_corner = vec3(-2.0, -1.0, 0.0);
    cam.horizontal = vec3(4.0, 0.0, 0.0);
    cam.vertical = vec3(0.0, 2.0, 0.0);
    cam.origin = vec3(0.0, 0.0, -1.0);
    
    //// 初始化随机数发生器
    random rand;
    rand.seed = fract(TIME);
    rand.uv = uv;
    
    //// 获取光线并逆向追踪光线
    ray r = get_ray(cam, uv, vec4(1.0));
        r = raytrace(r, rand);
    
    //// 对光的颜色进行后处理得到像素颜色
    vec3 color = r.color.rgb;
    vec3 back = vec3(0.0);
    color = mix(back, color, r.color.a);
    
    //// 伽马矫正
    color = pow(color, vec3(0.5));
    
    //// 测试随机数
    // color = vec3(noise(rand), noise(rand), noise(rand));
    COLOR = vec4(color, 1.0);
}