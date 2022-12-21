// Copyright © 2019-2022 HK-SHAO
// MIT Licensed: https://shao.fun/blog/w/taichi-ray-tracing.html

// 摄像机参数
#iUniform float camera_vfov       = 30.0 in {0, 180}                 // 摄像机的纵向视野
#iUniform float camera_focus      = 2.0 in {0, 100}                  // 摄像机的对焦距离
#iUniform float camera_aperture   = 0.002 in {0, 1}                  // 摄像机的光圈大小
#iUniform float camera_exposure   = 0.5 in {0, 1}                    // 摄像机曝光值
#iUniform float camera_gamma      = 2.2 in {0, 10}                   // gamma 矫正值
#iUniform float light_quality     = 100 in {0.01, 256}               // 间接光质量

// 配置常量
#iUniform float TMIN       = 0.001                      // 光开始传播的起始偏移，避免光线自相交
#iUniform float TMAX       = 2000.0                     // 最大单次光线传播距离 (相当于可见范围)
#iUniform float PRECISION  = 0.0001                     // 必须要小于 TMIN，否则光线会自相交产生阴影痤疮
#iUniform float VISIBILITY = 0.001                      // 亮度可见度

#iUniform int MAX_RAYMARCH = 1024                       // 最大光线步进次数
#iUniform int MAX_RAYTRACE = 256                        // 最大光线追踪次数

#iUniform float ENV_IOR    = 1.000277                   // 环境的折射率

// 枚举形状
const int SHAPE_SPHERE     = 0;
const int SHAPE_BOX        = 1;
const int SHAPE_CYLINDER   = 2;

// 数学常量
const float NONE = 0.0;
const float PI   = 3.1415926535897932384626;
const float TAU  = 2.0 * PI;

// 随机发生器
float seed; // 随机数种子

float rand13(vec3 x) {
    uvec3 p = floatBitsToUint(x);
    p = 1103515245U * ((p.xyz >> 1U) ^ (p.yzx));
    uint h32 = 1103515245U * ((p.x ^ p.z) ^ (p.y >> 3U));
    uint n = h32 ^ (h32 >> 16U);
    return float(n) * (1.0 / float(0xffffffffU));
}

float rand11() {
    uvec2 n = floatBitsToUint(seed++) * uvec2(1597334673U, 3812015801U);
    uint q = (n.x ^ n.y) * 1597334673U;
    return float(q) * (1.0 / float(0xffffffffU));
}

vec2  rand21() {
    uvec2 n = floatBitsToUint(seed++) * uvec2(1597334673U, 3812015801U);
    n = (n.x ^ n.y) * uvec2(1597334673U, 3812015801U);
    return vec2(n) * (1.0 / float(0xffffffffU));
}

// 物体材质
struct material {
    vec3  albedo;       // 反照率
    vec3  emission;     // 自发光
    vec3  normal;       // 切线空间法线
    float roughness;    // 粗糙度
    float metallic;     // 金属度
    float transmission; // 透明度
    float ior;          // 折射率
};

// 物体变换
struct transform {
    vec3 position;      // 位置
    vec3 rotation;      // 旋转
    vec3 scale;         // 缩放
};

// SDF 物体
struct object {
    int       shape;    // 形状
    float     dis;      // 距离物体表面
    transform trs;      // 变换
    material  mtl;      // 材质
};

// SDF 球体
float sd_sphere(vec3 p, float s) {
    return length(p) - s;
}

// SDF 盒子
float sd_box(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.02;
}

// SDF 圆柱
float sd_cylinder(vec3 p, vec2 rh) {
    vec2 d = abs(vec2(length(p.xz),p.y)) - rh;
    return min(max(d.x,d.y), 0.0) + length(max(d, 0.0));
}

// 地图列表
const object[] map = object[] (
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(0, -100.5, 0),
                    vec3(0, 0, 0),
                    vec3(100, 0, 0)
        ),
        material(   vec3(1.0, 1.0, 1.0)*0.1,   // 基础色
                    vec3(1), // 自发光
                    vec3(0, 0, 1), // 切线空间法线
                    0.9, // 粗糙度
                    0.0, // 金属度
                    0.0, // 透明度
                    1.0  // 折射率
        )
    ),
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(0, 0, 0),
                    vec3(0, 0, 0),
                    vec3(0.5, 0, 0)
        ),
        material(   vec3(1.0, 1.0, 1.0),   // 基础色
                    vec3(0.1, 1.0, 0.1)*10.0, // 自发光
                    vec3(0, 0, 1), // 切线空间法线
                    1.0, // 粗糙度
                    0.0, // 金属度
                    0.0, // 透明度
                    1.0  // 折射率
        )
    ),
    object(SHAPE_CYLINDER, NONE,
        transform(  vec3(-1.0, -0.3, 0),
                    vec3(0, 0, 0),
                    vec3(0.3, 0.33, 0)
        ),
        material(   vec3(1.0, 0.1, 0.1),   // 基础色
                    vec3(1), // 自发光
                    vec3(0, 0, 1), // 切线空间法线
                    0.9, // 粗糙度
                    0.1, // 金属度
                    0.0, // 透明度
                    1.0  // 折射率
        )
    ),
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(1.0, -0.2, 0),
                    vec3(0, 0, 0),
                    vec3(0.3, 0, 0)
        ),
        material(   vec3(0.1, 0.1, 1.0),   // 基础色
                    vec3(1), // 自发光
                    vec3(0, 0, 1), // 切线空间法线
                    0.2, // 粗糙度
                    1.0, // 金属度
                    0.0, // 透明度
                    1.0  // 折射率
        )
    ),
    object(SHAPE_SPHERE, NONE,
        transform(  vec3(0.0, -0.24, 2),
                    vec3(0, 0, 0),
                    vec3(0.3, 0, 0)
        ),
        material(   vec3(1.0, 1.0, 1.0)*0.9,   // 基础色
                    vec3(1), // 自发光
                    vec3(0, 0, 1), // 切线空间法线
                    0.0, // 粗糙度
                    0.0, // 金属度
                    1.0, // 透明度
                    1.5  // 折射率
        )
    ),
    object(SHAPE_BOX, NONE,
        transform(  vec3(0, 0, 5),
                    vec3(0, 0, 0),
                    vec3(2, 1, 0.2)
        ),
        material(   vec3(1.0, 1.0, 0.1)*0.9,   // 基础色
                    vec3(1), // 自发光
                    vec3(0, 0, 1), // 切线空间法线
                    0.0,  // 粗糙度
                    1.0,  // 金属度
                    0.0,  // 透明度
                    1.0   // 折射率
        )
    ),
    object(SHAPE_BOX, NONE,
        transform(  vec3(0, 0, -1),
                    vec3(0, 0, 0),
                    vec3(2, 1, 0.2)
        ),
        material(vec3(1.0, 1.0, 1.0)*0.9,   // 基础色
                    vec3(1), // 自发光
                    vec3(0, 0, 1), // 切线空间法线
                    0.0,  // 粗糙度
                    1.0,  // 金属度
                    0.0,  // 透明度
                    1.0   // 折射率
        )
    )
);

// Free Camera

const ivec2 MEMORY_BOUNDARY = ivec2(4, 3);

const ivec2 POSITION = ivec2(0, 0);
const ivec2 MOVING = ivec2(0, 1);

const ivec2 VMOUSE = ivec2(1, 0);
const ivec2 PMOUSE = ivec2(1, 1);

const ivec2 TARGET = ivec2(2, 0);
const ivec2 TMOUSE = ivec2(2, 1);

const ivec2 RESOLUTION = ivec2(3, 0);
const ivec2 SPACE = ivec2(3, 1);

mat3 CameraRotation(vec2 m) {
    m.y = clamp(-m.y, -PI*0.5+0.01, PI*0.5-0.01);
    vec2 s = sin(m), c = cos(m);
    
    mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, c.y, s.y, 0.0, -s.y, c.y);
    mat3 rotY = mat3(c.x, 0.0, -s.x, 0.0, 1.0, 0.0, s.x, 0.0, c.x);
    
    return rotY * rotX;
}